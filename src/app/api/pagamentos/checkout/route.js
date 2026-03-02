// src/app/api/pagamentos/checkout/route.js
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { ok, fail, codeFromStatus } from '@/lib/api/response';
import { ENV } from '@/lib/env';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';
import { rateLimitOrThrow } from '@/lib/security/rateLimit';
import { getOrCreateRequestId } from '@/lib/security/requestId';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const toCents = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const onlyDigits = (value) => String(value || '').replace(/\D/g, '');

const BodySchema = z.object({
  descricao: z.string().min(1).max(120).optional(),
  valor: z.union([z.string(), z.number()]),
  customer: z
    .object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      document: z.string().optional(),
    })
    .optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().optional(),
  customerDoc: z.string().optional(),
  deviceId: z.string().optional(),
  dispositivoId: z.string().optional(),
  device: z.string().optional(),
  mikId: z.string().optional(),
  mikID: z.string().optional(),
  mikrotikId: z.string().optional(),
  routerId: z.string().optional(),
  clienteIp: z.string().optional(),
  clienteMac: z.string().optional(),
  metadata: z.any().optional(),
  orderId: z.string().optional(),
  externalId: z.string().optional(),
  expiresIn: z.union([z.string(), z.number()]).optional(),
  expires_in: z.union([z.string(), z.number()]).optional(),
});

function sanitizeId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || /^\$\(.+\)$/.test(trimmed)) return null;
  return trimmed;
}

export async function POST(req) {
  const started = Date.now();
  const requestId = getOrCreateRequestId(req);

  const limited = await rateLimitOrThrow(req, {
    name: 'pagamentos_checkout',
    limit: 30,
    windowMs: 60_000,
    requestId,
  });
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      logger.warn({ route: 'api_pagamentos_checkout', requestId, issues: parsed.error.issues }, '[CHECKOUT] Payload inválido');
      recordApiMetric('checkout_pix', { durationMs: Date.now() - started, ok: false });
      return fail('BAD_REQUEST', { requestId });
    }

    const data = parsed.data;
    const descricao = data.descricao || 'Acesso Wi-Fi';
    const valorCent = toCents(data.valor);
    if (valorCent == null || valorCent <= 0) {
      recordApiMetric('checkout_pix', { durationMs: Date.now() - started, ok: false });
      return fail('BAD_REQUEST', { requestId });
    }

    const customerIn = data.customer || {
      name: data.customerName || 'Cliente',
      email: data.customerEmail || 'cliente@lopesul.com.br',
      document: data.customerDoc,
    };

    const document = onlyDigits(customerIn?.document);
    if (!(document && (document.length === 11 || document.length === 14))) {
      recordApiMetric('checkout_pix', { durationMs: Date.now() - started, ok: false });
      return fail('BAD_REQUEST', { requestId });
    }

    const customer = {
      name: customerIn?.name || 'Cliente',
      email: customerIn?.email || 'cliente@lopesul.com.br',
      document,
    };

    const deviceId = sanitizeId(data.deviceId) || sanitizeId(data.dispositivoId) || sanitizeId(data.device);
    const mikId =
      sanitizeId(data.mikId) ||
      sanitizeId(data.mikID) ||
      sanitizeId(data.mikrotikId) ||
      sanitizeId(data.routerId);

    if (!deviceId && !mikId) {
      recordApiMetric('checkout_pix', { durationMs: Date.now() - started, ok: false });
      return fail('BAD_REQUEST', { requestId });
    }

    const orderId = data.orderId || data.externalId || randomUUID();
    const expiresIn =
      Number.isFinite(Number(data.expiresIn))
        ? Number(data.expiresIn)
        : Number.isFinite(Number(data.expires_in))
          ? Number(data.expires_in)
          : 1800;

    const headers = req.headers;
    const host = headers.get('host');
    const protocol = headers.get('x-forwarded-proto') || (host && host.includes('localhost') ? 'http' : 'https');
    const baseUrl = ENV.APP_URL || `${protocol}://${host}`;
    const pixUrl = `${baseUrl}/api/payments/pix`;

    let clienteIp = data.clienteIp || null;
    if (!clienteIp || clienteIp === '$(ip)') {
      clienteIp =
        headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        headers.get('x-real-ip') ||
        headers.get('cf-connecting-ip') ||
        null;
    }

    const pixPayload = {
      valor: body?.valor,
      descricao,
      customer,
      expires_in: expiresIn,
      clienteIp,
      deviceMac: data?.clienteMac && data?.clienteMac !== '$(mac)' ? data.clienteMac : null,
      deviceId,
      mikId,
      metadata: {
        origem: 'checkout-endpoint',
        deviceId,
        mikId,
        ...(data.metadata || {}),
      },
      orderId,
    };

    let deviceMac = pixPayload.deviceMac;
    if (!deviceMac && clienteIp && (deviceId || mikId)) {
      try {
        const params = new URLSearchParams({ ip: clienteIp });
        if (deviceId) params.set('deviceId', deviceId);
        else if (mikId) params.set('mikId', mikId);

        const arpRes = await fetch(`${baseUrl}/api/mikrotik/arp?${params.toString()}`, {
          cache: 'no-store',
          headers: { 'x-request-id': requestId },
        }).catch(() => null);

        if (arpRes?.ok) {
          const arpData = await arpRes.json().catch(() => ({}));
          deviceMac = arpData?.data?.mac || arpData?.mac || null;
          if (deviceMac) {
            deviceMac = String(deviceMac).trim().toUpperCase();
          }
        }
      } catch {
        // keep flow
      }
    }

    pixPayload.deviceMac = deviceMac;

    const upstream = await fetch(pixUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': requestId,
      },
      body: JSON.stringify(pixPayload),
    });

    const upstreamJson = await upstream.json().catch(() => ({}));
    const upstreamData = upstreamJson?.data || upstreamJson;

    if (!upstream.ok) {
      logger.error({ route: 'api_pagamentos_checkout', requestId, status: upstream.status }, '[CHECKOUT] Erro PIX interno');
      recordApiMetric('checkout_pix', { durationMs: Date.now() - started, ok: false });
      return fail(codeFromStatus(upstream.status), { requestId, status: upstream.status });
    }

    recordApiMetric('checkout_pix', { durationMs: Date.now() - started, ok: true });
    return ok(
      {
        externalId: upstreamData?.orderId || orderId,
        copiaECola: upstreamData?.pix?.qr_code || null,
        payloadPix: upstreamData?.pix?.qr_code || null,
        expiresIn: upstreamData?.pix?.expires_in ?? expiresIn,
      },
      { requestId }
    );
  } catch (err) {
    logger.error({ err, requestId, route: 'api_pagamentos_checkout' }, '[CHECKOUT] Erro');
    recordApiMetric('checkout_pix', { durationMs: Date.now() - started, ok: false });
    return fail('INTERNAL_ERROR', { requestId });
  }
}

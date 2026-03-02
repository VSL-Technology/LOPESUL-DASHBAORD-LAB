// src/app/api/payments/pix/route.js
import { z } from 'zod';
import { ok, fail, codeFromStatus } from '@/lib/api/response';
import { emitirTokenCliente } from '@/lib/clientToken';
import { findDeviceRecord } from '@/lib/device-router';
import { ENV } from '@/lib/env';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { rateLimitOrThrow } from '@/lib/security/rateLimit';
import { getOrCreateRequestId } from '@/lib/security/requestId';

const toCents = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const onlyDigits = (value) => String(value || '').replace(/\D/g, '');

const PixRequestSchema = z
  .object({
    clienteIp: z.string().min(7).max(50),
    deviceMac: z.string().min(11).max(50),
  })
  .passthrough();

function sanitizeId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || /^\$\(.+\)$/.test(trimmed)) return null;
  return trimmed;
}

export async function POST(req) {
  const requestId = getOrCreateRequestId(req);

  const limited = await rateLimitOrThrow(req, {
    name: 'payments_pix',
    limit: 30,
    windowMs: 60_000,
    requestId,
  });
  if (limited) return limited;

  try {
    const parsedBody = await req.json().catch(() => ({}));
    const parsed = PixRequestSchema.safeParse(parsedBody);
    if (!parsed.success) {
      logger.warn({ route: 'api_payments_pix', requestId, issues: parsed.error.issues }, '[PIX] Payload inválido');
      return fail('BAD_REQUEST', { requestId });
    }

    const body = parsed.data;
    const { clienteIp, deviceMac } = body;

    const amountInCents = toCents(body.valor);
    if (!amountInCents || amountInCents < 1) {
      return fail('BAD_REQUEST', { requestId });
    }

    const descricao = body.descricao || 'Acesso Wi-Fi';
    const deviceIdRaw = sanitizeId(body.deviceId) || sanitizeId(body.dispositivoId) || sanitizeId(body.device);
    const mikIdRaw = sanitizeId(body.mikId) || sanitizeId(body.mikID) || sanitizeId(body.mikrotikId) || sanitizeId(body.routerId);

    if (!deviceIdRaw && !mikIdRaw) {
      return fail('BAD_REQUEST', { requestId });
    }

    const deviceRecord = await findDeviceRecord({ deviceId: deviceIdRaw, mikId: mikIdRaw });
    if (!deviceRecord) {
      return fail('NOT_FOUND', { requestId, status: 404 });
    }

    const customerIn = body.customer || {
      name: body.customerName || 'Cliente',
      email: body.customerEmail || 'cliente@lopesul.com.br',
      document: body.customerDoc,
    };

    const document = onlyDigits(customerIn.document);
    if (!(document && (document.length === 11 || document.length === 14))) {
      return fail('BAD_REQUEST', { requestId });
    }

    const customer = {
      name: customerIn.name || 'Cliente',
      email: customerIn.email || 'cliente@lopesul.com.br',
      document,
      type: document.length === 14 ? 'corporation' : 'individual',
      phones: {
        mobile_phone: {
          country_code: '55',
          area_code: '11',
          number: '999999999',
        },
      },
    };

    const secretKey = ENV.PAGARME_SECRET_KEY;
    const basicAuth = Buffer.from(`${secretKey}:`).toString('base64');

    const payload = {
      items: [{ amount: amountInCents, description: descricao, quantity: 1 }],
      customer,
      payments: [{ payment_method: 'pix', pix: { expires_in: body.expires_in ?? 1800 } }],
    };

    const pagarmeResp = await fetch('https://api.pagar.me/core/v5/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
        'x-request-id': requestId,
      },
      body: JSON.stringify(payload),
    });

    const result = await pagarmeResp.json().catch(() => ({}));

    if (!pagarmeResp.ok) {
      logger.error(
        { route: 'api_payments_pix', requestId, status: pagarmeResp.status },
        '[PIX] Erro da API Pagar.me'
      );
      return fail(codeFromStatus(pagarmeResp.status), {
        requestId,
        status: pagarmeResp.status,
      });
    }

    const lastTransaction = result.charges?.[0]?.last_transaction || {};
    const qrText =
      lastTransaction?.qr_code ||
      lastTransaction?.qr_code_emv ||
      lastTransaction?.qr_code_text ||
      lastTransaction?.emv ||
      lastTransaction?.payload ||
      null;

    const pixOut = { ...lastTransaction };
    if (!pixOut.qr_code && qrText) pixOut.qr_code = qrText;

    let clientToken = null;

    try {
      const pedidoData = {
        code: result.code || result.id,
        amount: amountInCents,
        method: 'PIX',
        status: 'PENDING',
        description: descricao,
        customerName: customer.name,
        customerEmail: customer.email,
        customerDoc: customer.document,
        metadata: {
          pagarmeOrderId: result.id,
          pagarmeOrderCode: result.code,
          deviceId: deviceRecord.id,
          mikId: deviceRecord.mikId ?? mikIdRaw ?? null,
        },
      };

      const normalizedIp = clienteIp.trim();
      if (normalizedIp) pedidoData.ip = normalizedIp;
      const normalizedMac = deviceMac.trim().toUpperCase();
      if (normalizedMac) pedidoData.deviceMac = normalizedMac;

      pedidoData.deviceId = deviceRecord.id;
      pedidoData.deviceIdentifier = deviceRecord.mikId || mikIdRaw || deviceIdRaw;

      const savedPedido = await prisma.pedido.create({ data: pedidoData });

      try {
        const createdToken = await emitirTokenCliente({
          pedidoId: savedPedido.id,
          deviceId: savedPedido.deviceId ?? null,
          ip: savedPedido.ip ?? null,
          mac: savedPedido.deviceMac ?? null,
        });
        clientToken = createdToken?.token || null;
      } catch (tokenErr) {
        logger.error({ tokenErr, requestId, route: 'api_payments_pix' }, '[PIX] Erro gerando client token');
      }
    } catch (dbError) {
      logger.error({ dbError, requestId, route: 'api_payments_pix' }, '[PIX] Error saving to database');
    }

    return ok(
      {
        orderId: result.id,
        pix: pixOut,
        clientToken,
      },
      { requestId }
    );
  } catch (err) {
    logger.error({ err, requestId, route: 'api_payments_pix' }, '[PIX] Erro inesperado');
    return fail('INTERNAL_ERROR', { requestId });
  }
}

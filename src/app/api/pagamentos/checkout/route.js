// src/app/api/pagamentos/checkout/route.js
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { recordApiMetric } from "@/lib/metrics/index";
import { ENV } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toCents = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const onlyDigits = (s) => String(s || "").replace(/\D/g, "");

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

export async function POST(req) {
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, "[CHECKOUT] Payload inválido");
      recordApiMetric("checkout_pix", { durationMs: Date.now() - started, ok: false });
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }
    const data = parsed.data;

    const descricao = data?.descricao || "Acesso Wi-Fi";
    const valorCent = toCents(data?.valor);

    if (valorCent == null || valorCent <= 0) {
      return NextResponse.json({ error: "valor (reais) inválido" }, { status: 400 });
    }

    // --- customer/document ---
    const customerIn = data?.customer || {
      name: data?.customerName || "Cliente",
      email: data?.customerEmail || "cliente@lopesul.com.br",
      document: data?.customerDoc,
    };
    const document = onlyDigits(customerIn?.document);
    if (!(document && (document.length === 11 || document.length === 14))) {
      return NextResponse.json(
        { error: "customer.document (CPF 11 dígitos ou CNPJ 14 dígitos) é obrigatório" },
        { status: 400 }
      );
    }
    const customer = {
      name: customerIn?.name || "Cliente",
      email: customerIn?.email || "cliente@lopesul.com.br",
      document,
    };

    const sanitizeId = (value) => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      if (!trimmed || /^\$\(.+\)$/.test(trimmed)) return null;
      return trimmed;
    };
    const deviceId = sanitizeId(data?.deviceId) ||
      sanitizeId(data?.dispositivoId) ||
      sanitizeId(data?.device);
    const mikId = sanitizeId(data?.mikId) ||
      sanitizeId(data?.mikID) ||
      sanitizeId(data?.mikrotikId) ||
      sanitizeId(data?.routerId);

    if (!deviceId && !mikId) {
      return NextResponse.json(
        { error: "deviceId ou mikId são obrigatórios para identificar o Mikrotik." },
        { status: 400 }
      );
    }

    // --- idempotency ---
    const orderId = data?.orderId || data?.externalId || randomUUID();

    // --- expires_in opcional ---
    const expiresIn =
      Number.isFinite(Number(data?.expiresIn))
        ? Number(data?.expiresIn)
        : Number.isFinite(Number(data?.expires_in))
        ? Number(data?.expires_in)
        : 1800; // padrão 30min

    // --- Construção da URL base (CORRIGIDO) ---
    const headers = req.headers;
    const host = headers.get('host');
    const protocol = headers.get('x-forwarded-proto') || 
                    (host && host.includes('localhost') ? 'http' : 'https');
    
    // URL base mais robusta
    const baseUrl = ENV.APP_URL || `${protocol}://${host}`;
    const pixUrl = `${baseUrl}/api/payments/pix`;

    logger.debug({ pixUrl }, "[CHECKOUT] URL resolvida");

    // Detectar IP do cliente automaticamente se não vier nos parâmetros
    let clienteIp = data?.clienteIp || null;
    if (!clienteIp || clienteIp === '$(ip)') {
      // Tentar detectar via headers HTTP
      clienteIp = headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                  headers.get('x-real-ip') ||
                  headers.get('cf-connecting-ip') ||
                  null;
      logger.info({ clienteIp }, "[CHECKOUT] IP detectado via header");
    }
    
    const pixPayload = {
      valor: body?.valor,          // VALOR EM REAIS (não centavos)
      descricao,
      customer,
      expires_in: expiresIn,
      clienteIp,
      deviceMac: data?.clienteMac && data?.clienteMac !== '$(mac)' ? data?.clienteMac : null,
      deviceId,
      mikId,
      metadata: {
        origem: "checkout-endpoint",
        deviceId,
        mikId,
        ...(data?.metadata || {}),
      },
      orderId,
    };
    
    // Descobrir MAC automaticamente se temos IP mas não temos MAC
    let deviceMac = pixPayload.deviceMac;
    if (!deviceMac && clienteIp && (deviceId || mikId)) {
      try {
        logger.info({ clienteIp }, "[CHECKOUT] Tentando descobrir MAC via IP");

        // Usa o endpoint interno que já fala com o Relay e parseia a ARP table
        const params = new URLSearchParams({ ip: clienteIp });
        if (deviceId) params.set('deviceId', deviceId);
        else if (mikId) params.set('mikId', mikId);

        const arpRes = await fetch(`${baseUrl}/api/mikrotik/arp?${params.toString()}`, {
          cache: 'no-store',
        }).catch(() => null);

        if (arpRes?.ok) {
          const data = await arpRes.json().catch(() => ({}));
          if (data?.mac) {
            deviceMac = String(data.mac).trim().toUpperCase();
            logger.info({ deviceMac }, "[CHECKOUT] MAC descoberto via API interna");
          } else {
            logger.warn({ payload: data }, "[CHECKOUT] /api/mikrotik/arp sem MAC");
          }
        } else if (arpRes) {
          logger.warn({ status: arpRes.status }, "[CHECKOUT] /api/mikrotik/arp falhou");
        }
      } catch (err) {
        logger.warn({ error: err?.message }, "[CHECKOUT] Falha ao descobrir MAC");
      }
    }
    
    // Atualizar deviceMac no payload
    pixPayload.deviceMac = deviceMac;
    
    logger.info({ clienteIp: pixPayload.clienteIp, deviceMac: pixPayload.deviceMac }, '[CHECKOUT] Sending to PIX');

    const upstream = await fetch(pixUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pixPayload),
    });

    const j = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      logger.error({ response: j, status: upstream.status }, "[CHECKOUT] Erro PIX interno");
      recordApiMetric("checkout_pix", { durationMs: Date.now() - started, ok: false });
      return NextResponse.json(
        { error: j?.error || `HTTP ${upstream.status}` },
        { status: upstream.status }
      );
    }

    recordApiMetric("checkout_pix", { durationMs: Date.now() - started, ok: true });
    return NextResponse.json({
      externalId: j?.orderId || orderId,
      copiaECola: j?.pix?.qr_code || null,
      payloadPix: j?.pix?.qr_code || null,
      expiresIn: j?.pix?.expires_in ?? expiresIn,
    });
  } catch (e) {
    logger.error({ error: e?.message || e }, "[CHECKOUT] Erro");
    recordApiMetric("checkout_pix", { durationMs: Date.now() - started, ok: false });
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}

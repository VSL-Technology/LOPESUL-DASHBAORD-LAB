// src/app/api/payments/pix/route.js
import { z } from "zod";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { emitirTokenCliente } from "@/lib/clientToken";
import { ENV } from "@/lib/env";
import { findDeviceRecord } from "@/lib/device-router";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/security/requestUtils";
import { enforceRateLimit } from "@/lib/security/rateLimiter";

const toCents = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const onlyDigits = (s) => String(s || "").replace(/\D/g, "");

const PixRequestSchema = z
  .object({
    clienteIp: z.string().min(7).max(50),
    deviceMac: z.string().min(11).max(50),
  })
  .passthrough();

export async function POST(req) {
  try {
    const clientIpAddr = getClientIp(req);
    const rateOk = enforceRateLimit(`pix:${clientIpAddr}`, {
      windowMs: 60_000,
      max: 5,
    });

    if (!rateOk) {
      logger.warn({ clientIp: clientIpAddr }, "[PIX] Rate limit estourado");
      return NextResponse.json(
        { error: "Muitas requisições. Tente novamente em instantes." },
        { status: 429 }
      );
    }

    const json = await req.json();
    const parsed = PixRequestSchema.safeParse(json);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, "[PIX] Payload inválido");
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }
    const body = parsed.data;
    const { clienteIp, deviceMac } = body;

    // --- validação de valor ---
    const amountInCents = toCents(body.valor);
    if (!amountInCents || amountInCents < 1) {
      return NextResponse.json({ error: "valor inválido" }, { status: 400 });
    }

    const descricao = body.descricao || "Acesso Wi-Fi";
    const sanitizeId = (value) => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      if (!trimmed || /^\$\(.+\)$/.test(trimmed)) return null;
      return trimmed;
    };
    const deviceIdRaw =
      sanitizeId(body.deviceId) ||
      sanitizeId(body.dispositivoId) ||
      sanitizeId(body.device);
    const mikIdRaw =
      sanitizeId(body.mikId) ||
      sanitizeId(body.mikID) ||
      sanitizeId(body.mikrotikId) ||
      sanitizeId(body.routerId);

    if (!deviceIdRaw && !mikIdRaw) {
      return NextResponse.json(
        { error: "deviceId ou mikId são obrigatórios para identificar o Mikrotik." },
        { status: 400 }
      );
    }

    const deviceRecord = await findDeviceRecord({ deviceId: deviceIdRaw, mikId: mikIdRaw });
    if (!deviceRecord) {
      return NextResponse.json(
        { error: "Dispositivo não encontrado para o identificador informado." },
        { status: 404 }
      );
    }

    // --- validação do cliente ---
    const customerIn = body.customer || {
      name: body.customerName || "Cliente",
      email: body.customerEmail || "cliente@lopesul.com.br",
      document: body.customerDoc,
    };

    const document = onlyDigits(customerIn.document);
    if (!(document && (document.length === 11 || document.length === 14))) {
      return NextResponse.json(
        {
          error: "customer.document (CPF 11 dígitos ou CNPJ 14 dígitos) é obrigatório"
        },
        { status: 400 }
      );
    }

    const customer = {
      name: customerIn.name || "Cliente",
      email: customerIn.email || "cliente@lopesul.com.br",
      document,
      type: document.length === 14 ? "corporation" : "individual",
      phones: {
        mobile_phone: {
          country_code: "55",
          area_code: "11",
          number: "999999999"
        }
      }
    };

    // --- chave secreta Pagar.me ---
    const secretKey = ENV.PAGARME_SECRET_KEY;
    const basicAuth = Buffer.from(`${secretKey}:`).toString("base64");

    // --- payload para a API Pagar.me ---
    const payload = {
      items: [
        { amount: amountInCents, description: descricao, quantity: 1 }
      ],
      customer,
      payments: [
        { payment_method: "pix", pix: { expires_in: body.expires_in ?? 1800 } }
      ]
    };

    const pagarmeResp = await fetch("https://api.pagar.me/core/v5/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await pagarmeResp.json().catch(() => ({}));

    if (!pagarmeResp.ok) {
      logger.error(
        {
          status: pagarmeResp.status,
          response: result,
        },
        "[PIX] Erro da API Pagar.me"
      );
      return NextResponse.json(
        { error: result?.message || "Erro ao criar Pix", detail: result },
        { status: pagarmeResp.status }
      );
    }

    const lastTransaction = result.charges?.[0]?.last_transaction || {};

    // Normaliza campos de QR Code (Pagar.me varia entre qr_code, qr_code_emv, qr_code_text, emv, payload)
    const qrText =
      lastTransaction?.qr_code ||
      lastTransaction?.qr_code_emv ||
      lastTransaction?.qr_code_text ||
      lastTransaction?.emv ||
      lastTransaction?.payload ||
      null;

    if (lastTransaction.status === "failed") {
      logger.error(
        {
          response: lastTransaction.gateway_response,
        },
        "[PIX] Transação falhou"
      );
    }

    // Garante que pix.qr_code exista para os consumidores atuais
    const pixOut = { ...lastTransaction };
    if (!pixOut.qr_code && qrText) pixOut.qr_code = qrText;

    // --- Salva o pagamento no banco de dados ---
    try {
      // IMPORTANTE: Pagar.me retorna tanto 'id' (or_xxx) quanto 'code' (ABCDEF123)
      // Webhook pode enviar qualquer um dos dois, então salvamos o CODE no campo code
      const pedidoData = {
        code: result.code || result.id, // Usa CODE se existir, senão ID
        amount: amountInCents,
        method: "PIX",
        status: "PENDING",
        description: descricao,
        customerName: customer.name,
        customerEmail: customer.email,
        customerDoc: customer.document,
      metadata: {
        pagarmeOrderId: result.id,
        pagarmeOrderCode: result.code,
        deviceId: deviceRecord.id,
        mikId: deviceRecord.mikId ?? mikIdRaw ?? null,
      }
      };

      // Adiciona IP e MAC somente se forem válidos
      const normalizedIp = clienteIp.trim();
      if (normalizedIp) {
        pedidoData.ip = normalizedIp;
      }
      const normalizedMac = deviceMac.trim().toUpperCase();
      if (normalizedMac) {
        pedidoData.deviceMac = normalizedMac;
      }

      pedidoData.deviceId = deviceRecord.id;
      pedidoData.deviceIdentifier = deviceRecord.mikId || mikIdRaw || deviceIdRaw;

      logger.info(
        {
          code: result.id,
          ip: pedidoData.ip,
          mac: pedidoData.deviceMac,
        },
        "[PIX] Saving to DB"
      );

      const savedPedido = await prisma.pedido.create({ data: pedidoData });
      logger.info({ id: result.id }, "[PIX] Saved payment to database");
      logger.info(
        {
          ip: savedPedido.ip,
          mac: savedPedido.deviceMac,
        },
        "[PIX] Saved data verification"
      );

      // --- Gera token do cliente ligado ao pedido (para reconexão inteligente) ---
      try {
        const clientToken = await emitirTokenCliente({
          pedidoId: savedPedido.id,
          deviceId: savedPedido.deviceId ?? null,
          ip: savedPedido.ip ?? null,
          mac: savedPedido.deviceMac ?? null,
        });
        // anexa o token ao resultado que vamos devolver ao frontend
        result._clientToken = clientToken?.token || null;
      } catch (tErr) {
        logger.error({ error: tErr }, "[PIX] Erro gerando client token");
      }
    } catch (dbError) {
      logger.error({ error: dbError }, "[PIX] Error saving to database");
    }

    return NextResponse.json({
      orderId: result.id,
      pix: pixOut,
      clientToken: result._clientToken || null
    });
  } catch (e) {
    logger.error({ error: e?.message || e }, "[PIX] Erro inesperado");
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

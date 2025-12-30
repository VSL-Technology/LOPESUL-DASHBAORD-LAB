// src/app/api/webhook/pagarme/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
// Backend must NOT call Mikrotik directly. Relay is the single actor that
// performs operational actions. We only mark orders as paid and emit a
// release request event (audit) for the Relay to process.
import { requireDeviceRouter } from "@/lib/device-router";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/security/requestUtils";
import { enforceRateLimit } from "@/lib/security/rateLimiter";
import { verifyPagarmeSignature } from "@/lib/security/pagarmeWebhook";
import { auditLog } from '@/lib/auditLogger';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Map de status (order/charge -> nosso enum) */
function mapStatus({ type, orderStatus, chargeStatus }) {
  const t = String(type || "").toLowerCase();
  const o = String(orderStatus || "").toLowerCase();
  const c = String(chargeStatus || "").toLowerCase();

  if (t.includes("paid") || o === "paid" || c === "paid" || c === "succeeded")
    return "PAID";
  if (t.includes("canceled") || o === "canceled" || c === "canceled")
    return "CANCELED";
  if (t.includes("failed") || o === "failed" || c === "failed")
    return "FAILED";
  if (o === "expired" || c === "expired") return "EXPIRED";
  if (c === "authorized") return "AUTHORIZED";
  // pending/processing/created
  return "PENDING";
}

function normalizeStatus(status) {
  return String(status || "").toUpperCase();
}

function shouldUpdateStatus(current, next) {
  const curr = normalizeStatus(current);
  const nxt = normalizeStatus(next);
  if (!nxt) return false;
  if (curr === nxt) return false;
  const terminal = new Set(["FAILED", "CANCELED", "EXPIRED"]);
  if (terminal.has(curr) && curr !== nxt) return false;
  if (curr === "PAID" && nxt !== "PAID") return false;
  if (nxt === "PAID" && terminal.has(curr)) return false;
  return true;
}

/** Extratores tolerantes a variações de payload */
function extractBasics(evt) {
  const type = evt?.type || evt?.event || ""; // ex: 'charge.paid' | 'order.paid'
  const data = evt?.data || evt?.payload || evt || {};
  const order =
    data?.order ||
    (data?.object === "order" ? data : undefined) ||
    data;

  const orderCode = order?.code || order?.id || null;
  const orderStatus = order?.status || null;

  const charges = Array.isArray(order?.charges) ? order.charges : [];
  const charge =
    charges[0] ||
    data?.charge ||
    null;

  const chargeId = charge?.id || null;
  const chargeStatus = charge?.status || null;
  const method = (charge?.payment_method || "").toUpperCase();

  const trx = charge?.last_transaction || charge?.transaction || {};
  const qrText =
    trx?.qr_code_emv ||
    trx?.qr_code_text ||
    trx?.qr_code ||
    trx?.emv ||
    trx?.payload ||
    null;
  const qrUrl = trx?.qr_code_url || trx?.qrcode || null;

  return {
    type,
    orderCode,
    orderStatus,
    chargeId,
    chargeStatus,
    method,
    qrText,
    qrUrl,
    rawOrder: order,
    rawCharge: charge,
  };
}

/** Marca pedido como pago e libera no Mikrotik correto (multi-roteador) */
async function markPaidAndRelease(orderCode, ctx = {}) {
  let pedido = await prisma.pedido.findFirst({
    where: { code: orderCode },
    include: { device: true },
  });

  if (!pedido) {
    pedido = await prisma.pedido.findFirst({
      where: {
        metadata: {
          path: ["pagarmeOrderCode"],
          equals: orderCode,
        },
      },
      include: { device: true },
    });
  }

  if (!pedido) {
    logger.warn({ orderCode }, "[WEBHOOK] Pedido não encontrado para liberação");
    return;
  }

  logger.info(
    {
      orderCode,
      pedidoId: pedido.id,
      status: pedido.status,
      deviceId: pedido.deviceId,
      deviceIdentifier: pedido.deviceIdentifier,
    },
    "[WEBHOOK] Pedido encontrado para liberação"
  );

  const currentStatus = normalizeStatus(pedido.status);
  if (["FAILED", "CANCELED", "EXPIRED"].includes(currentStatus)) {
    logger.warn(
      { orderCode, status: currentStatus },
      "[WEBHOOK] Pedido em status terminal, ignorando liberação"
    );
    return;
  }

  if (currentStatus !== "PAID") {
    pedido = await prisma.pedido.update({
      where: { id: pedido.id },
      data: { status: "PAID" },
    });
    logger.info({ orderCode }, "[WEBHOOK] Status atualizado para PAID");
  } else {
    logger.info({ orderCode }, "[WEBHOOK] Pedido já estava em PAID");
  }

  let { ip, deviceMac } = pedido;
  if (!ip || !deviceMac) {
    logger.warn(
      { orderCode, hasIp: Boolean(ip), hasMac: Boolean(deviceMac) },
      "[WEBHOOK] Pedido sem IP/MAC completos; seguindo assim mesmo"
    );
  }

  if (!ip && !deviceMac) {
    logger.error({ orderCode }, "[WEBHOOK] Sem IP e MAC para liberar acesso");
    return;
  }

  const lookupDeviceId = pedido.deviceId;
  const lookupMikId = pedido.device?.mikId || pedido.deviceIdentifier;
  logger.info(
    { orderCode, lookupDeviceId, lookupMikId },
    "[WEBHOOK] Buscando roteador para liberação"
  );

  let routerInfo;
  try {
    routerInfo = await requireDeviceRouter({
      deviceId: lookupDeviceId,
      mikId: lookupMikId,
    });
  } catch (err) {
    logger.error(
      {
        orderCode,
        error: err?.code || err?.message || err,
        deviceId: pedido.deviceId,
        deviceIdentifier: pedido.deviceIdentifier,
      },
      "[WEBHOOK] Dispositivo não encontrado ou sem credenciais"
    );
    return;
  }

  if (!routerInfo || !routerInfo.router || !routerInfo.router.host) {
    logger.error({ orderCode }, "[WEBHOOK] Router inválido ou sem host");
    return;
  }

  try {
    // Record a release request for the Relay to act upon. The Relay will be
    // responsible for executing the Mikrotik commands, retries, validations
    // and creating/updating sessions.
    try {
      const mikrotikId = routerInfo.router?.host || routerInfo.router?.id || null;
      await auditLog({
        requestId: ctx.hookId || ctx.basics?.chargeId || ctx.basics?.orderCode || null,
        event: 'WEBHOOK_RELEASE_REQUESTED',
        entityId: pedido.id,
        ip: ctx.clientIp || null,
        result: 'PENDING',
        metadata: {
          orderCode: pedido.code,
          pedidoId: pedido.id,
          ip: ip || null,
          mac: deviceMac || null,
          router: mikrotikId,
          note: 'Requested by payment webhook',
        },
      });
    } catch (e) {
      logger.error({ orderCode, error: e?.message || e }, "[WEBHOOK] Falha ao registrar pedido de liberação");
    }
  } catch (e) {
    logger.error({ orderCode, error: e?.message || e }, "[WEBHOOK] Erro ao processar liberação");
    throw e;
  }
}

export async function POST(req) {
  const requestId = req.headers.get('x-request-id') || '';
  const clientIp = getClientIp(req);
  const rateOk = enforceRateLimit(`webhook:${clientIp}`, {
    windowMs: 60_000,
    max: 20,
  });

  if (!rateOk) {
    logger.warn({ clientIp }, "[WEBHOOK] Rate limit estourado");
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-hub-signature") ||
      req.headers.get("x-postbacks-signature") ||
      req.headers.get("x-pagarme-signature") ||
      null;

    if (!verifyPagarmeSignature(rawBody, signature)) {
      await auditLog({
        requestId,
        event: 'PAYMENT_WEBHOOK',
        ip: clientIp,
        result: 'BLOCKED',
        metadata: { reason: 'INVALID_SIGNATURE' },
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let evt;
    try {
      evt = JSON.parse(rawBody);
    } catch (err) {
      logger.error({ error: err?.message || err }, "[WEBHOOK] Body JSON inválido");
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const hookId =
      evt?.id ||
      evt?.hook_id ||
      evt?.webhook_id ||
      evt?.data?.webhook_id ||
      evt?.data?.id ||
      evt?.data?.code ||
      null;

    if (!hookId) {
      logger.warn({}, "[WEBHOOK] Hook ID ausente no payload");
      return NextResponse.json({ error: "Missing hook id" }, { status: 400 });
    }

    const existingLog = await prisma.webhookLog
      .findUnique({ where: { id: hookId } })
      .catch(() => null);
    if (existingLog) {
      logger.info({ hookId }, "[WEBHOOK] Evento duplicado ignorado");
      await auditLog({
        requestId,
        event: 'PAYMENT_WEBHOOK',
        entityId: hookId,
        ip: clientIp,
        result: 'BLOCKED',
        metadata: { reason: 'DUPLICATE' },
      });
      return NextResponse.json({ ok: true, duplicate: true });
    }

    const basics = extractBasics(evt);
    logger.info(
      { hookId, type: basics.type, orderCode: basics.orderCode, chargeId: basics.chargeId },
      "[WEBHOOK] Evento recebido"
    );

    // Audit received webhook (minimal metadata)
    try {
      await auditLog({
        requestId,
        event: 'PIX_WEBHOOK_RECEIVED',
        entityId: hookId || basics.chargeId || basics.orderCode || null,
        ip: clientIp,
        result: 'RECEIVED',
        metadata: {
          type: basics.type,
          orderCode: basics.orderCode,
          chargeId: basics.chargeId,
        },
      });
    } catch (e) {
      // degrade gracefully
    }

    const mapped = mapStatus({
      type: basics.type,
      orderStatus: basics.orderStatus,
      chargeStatus: basics.chargeStatus,
    });

    try {
      await prisma.webhookLog.create({
        data: {
          id: hookId,
          event: basics.type,
          orderCode: basics.orderCode,
          payload: evt,
        },
      });
    } catch (logErr) {
      if (logErr?.code === "P2002") {
        logger.info({ hookId }, "[WEBHOOK] Evento duplicado (log)");
        return NextResponse.json({ ok: true, duplicate: true });
      }
      logger.error({ hookId, error: logErr?.message || logErr }, "[WEBHOOK] Erro ao salvar log");
      return NextResponse.json({ error: "Log failure" }, { status: 500 });
    }

    if (basics.orderCode && mapped) {
      let pedidoExistente = await prisma.pedido.findFirst({
        where: { code: basics.orderCode },
      });

      if (!pedidoExistente) {
        pedidoExistente = await prisma.pedido.findFirst({
          where: {
            metadata: {
              path: ["pagarmeOrderCode"],
              equals: basics.orderCode,
            },
          },
        });
      }

      if (pedidoExistente) {
        if (shouldUpdateStatus(pedidoExistente.status, mapped)) {
          await prisma.pedido.update({
            where: { id: pedidoExistente.id },
            data: { status: mapped },
          });
          logger.info(
            { orderCode: basics.orderCode, status: mapped },
            "[WEBHOOK] Pedido atualizado"
          );
        } else {
          logger.info(
            { orderCode: basics.orderCode, current: pedidoExistente.status, incoming: mapped },
            "[WEBHOOK] Transição de status ignorada"
          );
        }
      } else {
        logger.warn({ orderCode: basics.orderCode }, "[WEBHOOK] Pedido não encontrado");
      }
    }

    if (basics.chargeId && mapped) {
      const existingCharge = await prisma.charge.findFirst({
        where: { providerId: basics.chargeId },
        select: { id: true },
      });

      const common = {
        status: mapped,
        method: basics.method === "PIX" ? "PIX" : basics.method || "CARD",
        qrCode: basics.qrText ?? undefined,
        qrCodeUrl: basics.qrUrl ?? undefined,
        raw: evt,
      };

      if (existingCharge) {
        await prisma.charge.update({
          where: { id: existingCharge.id },
          data: common,
        });
        logger.info({ chargeId: basics.chargeId }, "[WEBHOOK] Charge atualizada");
      } else if (basics.orderCode) {
        const pedido = await prisma.pedido.findFirst({
          where: { code: basics.orderCode },
          select: { id: true },
        });
        if (pedido) {
          await prisma.charge.create({
            data: {
              providerId: basics.chargeId,
              ...common,
              pedido: { connect: { id: pedido.id } },
            },
          });
          logger.info({ chargeId: basics.chargeId }, "[WEBHOOK] Charge criada");
        } else {
          logger.warn(
            { chargeId: basics.chargeId, orderCode: basics.orderCode },
            "[WEBHOOK] Pedido não encontrado para criar Charge"
          );
        }
      } else {
        logger.warn(
          { chargeId: basics.chargeId },
          "[WEBHOOK] Sem orderCode para criar Charge"
        );
      }
    }

    if (mapped === "PAID" && basics.orderCode) {
      try {
        await markPaidAndRelease(basics.orderCode, { hookId, basics, clientIp });
        logger.info({ orderCode: basics.orderCode }, "[WEBHOOK] Liberação concluída");
        await auditLog({
          requestId,
          event: 'PAYMENT_CONFIRMED',
          entityId: basics.orderCode,
          ip: clientIp,
          result: 'SUCCESS',
          metadata: {
            provider: 'pagarme',
            orderCode: basics.orderCode,
          },
        });
      } catch (releaseErr) {
        logger.error(
          { orderCode: basics.orderCode, error: releaseErr?.message || releaseErr },
          "[WEBHOOK] Erro ao liberar acesso"
        );
        await auditLog({
          requestId,
          event: 'PAYMENT_CONFIRMED',
          entityId: basics.orderCode,
          ip: clientIp,
          result: 'FAIL',
          metadata: { error: String(releaseErr?.message || releaseErr) },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ error: err?.message || err }, "[WEBHOOK] Erro inesperado");
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}

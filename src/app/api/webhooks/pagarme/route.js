// src/app/api/webhook/pagarme/route.js
import crypto from "node:crypto";
import { ok, fail } from '@/lib/api/response';
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
import { liberarCliente } from '@/lib/mikrotik';
import { getOrCreateRequestId } from '@/lib/security/requestId';

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

function extractEventId(evt, basics) {
  return (
    evt?.data?.id ||
    evt?.event?.id ||
    evt?.id ||
    evt?.hook_id ||
    evt?.webhook_id ||
    basics?.chargeId ||
    basics?.orderCode ||
    null
  );
}

function hashPayload(rawBody) {
  return crypto.createHash("sha256").update(String(rawBody || "")).digest("hex");
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
  const requestId = getOrCreateRequestId(req);
  const clientIp = getClientIp(req);
  const rateOk = await enforceRateLimit(`webhook:${clientIp}`, {
    windowMs: 60_000,
    max: 20,
  });

  if (!rateOk) {
    logger.warn({ clientIp }, "[WEBHOOK] Rate limit estourado");
    return fail('RATE_LIMITED', { requestId, status: 429 });
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
      return fail('UNAUTHORIZED', { requestId, status: 401 });
    }

    let evt;
    try {
      evt = JSON.parse(rawBody);
    } catch (err) {
      logger.error({ error: err?.message || err }, "[WEBHOOK] Body JSON inválido");
      return fail('BAD_REQUEST', { requestId, status: 400 });
    }

    const hookId =
      evt?.id ||
      evt?.hook_id ||
      evt?.webhook_id ||
      evt?.data?.webhook_id ||
      evt?.data?.id ||
      evt?.data?.code ||
      null;

    const basics = extractBasics(evt);
    const eventId = extractEventId(evt, basics);
    if (!eventId) {
      logger.warn({}, "[WEBHOOK] Event ID ausente no payload");
      return fail('BAD_REQUEST', { requestId, status: 400 });
    }
    const eventType = basics.type || null;
    const uniqueKey = `pagarme:${eventId}`;
    const payloadHash = hashPayload(rawBody);

    // IDEMPOTÊNCIA: a criação do WebhookEvent usa uniqueKey com @unique no banco.
    // Se o Pagar.me reenviar o mesmo evento (mesmo eventId), o CREATE lança P2002
    // e retornamos 200 imediatamente sem reprocessar — evitando dupla liberação de acesso.
    // Os índices em WebhookEvent(eventId) e WebhookEvent(processedAt) (migration
    // add-critical-indexes) garantem performance nessas buscas.
    let webhookEvent;
    try {
      webhookEvent = await prisma.webhookEvent.create({
        data: {
          provider: "pagarme",
          eventId: String(eventId),
          eventType,
          uniqueKey,
          payloadHash,
        },
      });
    } catch (createErr) {
      if (createErr?.code === "P2002") {
        logger.info({ uniqueKey }, "[WEBHOOK] Evento duplicado ignorado (WebhookEvent)");
        return ok({ duplicate: true }, { requestId, status: 200 });
      }
      logger.error(
        { uniqueKey, error: createErr?.message || createErr },
        "[WEBHOOK] Falha ao registrar idempotência"
      );
      return fail('INTERNAL_ERROR', { requestId, status: 500 });
    }

    logger.info(
      {
        hookId,
        eventId,
        type: basics.type,
        orderCode: basics.orderCode,
        chargeId: basics.chargeId,
      },
      "[WEBHOOK] Evento recebido"
    );

    try {
      // Audit received webhook (minimal metadata)
      try {
        await auditLog({
          requestId,
          event: 'PIX_WEBHOOK_RECEIVED',
          entityId: hookId || basics.chargeId || basics.orderCode || eventId || null,
          ip: clientIp,
          result: 'RECEIVED',
          metadata: {
            type: basics.type,
            orderCode: basics.orderCode,
            chargeId: basics.chargeId,
            eventId,
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
            event: basics.type,
            orderCode: basics.orderCode,
            payload: evt,
          },
        });
      } catch (logErr) {
        logger.error({ hookId, eventId, error: logErr?.message || logErr }, "[WEBHOOK] Erro ao salvar log");
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

      if (mapped === "PAID" && basics.method === "PIX" && basics.orderCode) {
        try {
          const pedidoParaLiberar = await prisma.pedido.findFirst({
            where: { code: basics.orderCode },
            select: { ip: true },
          });

          const ipCliente = String(pedidoParaLiberar?.ip || '').trim();
          if (ipCliente) {
            await liberarCliente(ipCliente);
            logger.info(
              { orderCode: basics.orderCode, ip: ipCliente },
              "[WEBHOOK] Cliente liberado automaticamente via PIX"
            );
          } else {
            logger.warn(
              { orderCode: basics.orderCode },
              "[WEBHOOK] Pedido sem IP para liberação automática"
            );
          }
        } catch (autoReleaseErr) {
          logger.error(
            { orderCode: basics.orderCode, error: autoReleaseErr?.message || autoReleaseErr },
            "[WEBHOOK] Falha ao liberar cliente automático"
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
              eventId,
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
            metadata: { error: String(releaseErr?.message || releaseErr), eventId },
          });
        }
      }

      await prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
        },
      });

      return ok({ processed: true }, { requestId });
    } catch (processingErr) {
      logger.error(
        { eventId, uniqueKey, error: processingErr?.message || processingErr },
        "[WEBHOOK] Falha durante processamento"
      );
      await prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          status: "FAILED",
        },
      }).catch((updateErr) => {
        logger.error(
          { eventId, uniqueKey, error: updateErr?.message || updateErr },
          "[WEBHOOK] Falha ao atualizar status FAILED"
        );
      });

      return fail('INTERNAL_ERROR', { requestId, status: 500 });
    }
  } catch (err) {
    logger.error({ err, requestId, route: 'api_webhooks_pagarme' }, "[WEBHOOK] Erro inesperado");
    return fail('INTERNAL_ERROR', { requestId, status: 500 });
  }
}

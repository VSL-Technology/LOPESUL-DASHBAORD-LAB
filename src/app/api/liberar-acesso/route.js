// src/app/api/liberar-acesso/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { liberarAcesso } from '@/lib/mikrotik';
import { requireDeviceRouter } from '@/lib/device-router';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';
import { auditLog } from '@/lib/auditLogger';
import { getClientIp } from '@/lib/security/requestUtils';

/* ===== helpers ===== */
function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders,
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

const MAC_RE = /^([0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/i;
const IPV4_RE =
  /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

function normMac(s) {
  if (!s) return null;
  const up = String(s).trim().toUpperCase();
  const mac = up.replace(/-/g, ':');
  return MAC_RE.test(mac) ? mac : null;
}
function normIp(s) {
  if (!s) return null;
  const ip = String(s).trim();
  return IPV4_RE.test(ip) ? ip : null;
}

const BodySchema = z.object({
  externalId: z.string().trim().optional().nullable(),
  pagamentoId: z.string().trim().optional().nullable(),
  txid: z.string().trim().optional().nullable(),
  ip: z.string().trim().optional().nullable(),
  mac: z.string().trim().optional().nullable(),
  linkOrig: z.string().trim().optional().nullable(),
  deviceId: z.string().trim().optional().nullable(),
  mikId: z.string().trim().optional().nullable(),
});

export async function POST(req) {
  const started = Date.now();
  const requestId = req.headers.get('x-request-id') || '';
  const ipReq = getClientIp(req);
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, '[liberar-acesso] invalid payload');
      return json({ ok: false, error: 'Payload inválido' }, 400);
    }
    const { externalId, pagamentoId, txid, ip, mac, linkOrig, deviceId, mikId } = parsed.data;

    // Audit: tentativa de liberação (registro inicial, não bloqueante)
    try {
      await auditLog({
        requestId,
        event: 'MIKROTIK_RELEASE_ATTEMPT',
        actorId: null,
        ip: ipReq,
        result: 'ATTEMPT',
        metadata: { orderCode: externalId || pagamentoId || txid || null },
      });
    } catch (e) {
      // degrade silently
    }

    const sanitizeId = (value) => {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      if (!trimmed || /^\$\(.+\)$/.test(trimmed)) return null;
      return trimmed;
    };
    const bodyDeviceId = sanitizeId(deviceId || undefined);
    const bodyMikId = sanitizeId(mikId || undefined);

    if (!externalId && !pagamentoId && !txid) {
      return json(
        { ok: false, error: 'Informe externalId (code), pagamentoId ou txid.' },
        400,
      );
    }

    // ============ localizar pedido ============
    let pedido = null;

    if (externalId) {
      // externalId == code (teu schema)
      pedido = await prisma.pedido.findUnique({
        where: { code: externalId },
        include: { device: true },
      });
    }
    if (!pedido && pagamentoId) {
      pedido = await prisma.pedido.findUnique({
        where: { id: pagamentoId },
        include: { device: true },
      });
    }
    if (!pedido && txid) {
      const charge = await prisma.charge.findFirst({
        where: { providerId: txid },
        select: { pedidoId: true },
      });
      if (charge?.pedidoId) {
        pedido = await prisma.pedido.findUnique({
          where: { id: charge.pedidoId },
          include: { device: true },
        });
      }
    }

    if (!pedido) {
      logger.warn({ externalId, pagamentoId, txid }, '[liberar-acesso] Pedido não encontrado');
      // Auditar pedido inválido
      try {
        await auditLog({
          requestId,
          event: 'MIKROTIK_RELEASE_FAIL',
          actorId: null,
          ip: ipReq,
          entityId: null,
          result: 'FAIL',
          metadata: { reason: 'INVALID_ORDER', orderCode: externalId || pagamentoId || txid || null },
        });
      } catch (e) {
        // ignore
      }

      return json({ ok: false, error: 'Pagamento/Pedido não encontrado.' }, 404);
    }

    // ============ marca como PAID (idempotente) ============
    if (pedido.status !== 'PAID') {
      try {
        pedido = await prisma.pedido.update({
          where: { id: pedido.id },
          data: { status: 'PAID' },
        });
      } catch {
        // se enum/coluna diverge, não travar o fluxo
      }
    }

    // ============ decidir IP/MAC e validar ============
    const ipFinal = normIp(ip || pedido.ip || null);
    const macFinal = normMac(mac || pedido.deviceMac || null);

    if (!ipFinal && !macFinal) {
      logger.warn({ pedidoId: pedido.id }, '[liberar-acesso] Sem IP/MAC válidos');
      return json(
        {
          ok: false,
          error: 'Sem IP/MAC válidos (nem no payload, nem no Pedido).',
          pedidoId: pedido.id,
          code: pedido.code,
        },
        400,
      );
    }

    const deviceLookup = {
      deviceId: bodyDeviceId || pedido.deviceId,
      mikId: bodyMikId || pedido.device?.mikId || pedido.deviceIdentifier,
    };

    let routerInfo;
    try {
      routerInfo = await requireDeviceRouter(deviceLookup);
    } catch (err) {
      return json(
        {
          ok: false,
          error: err?.code || 'device_not_found',
          detail: err?.message,
        },
        400
      );
    }

    // comentário curto e rastreável
    const comment = `pedido:${pedido.id}`.slice(0, 64);

    logger.info(
      {
        pedidoId: pedido.id,
        code: pedido.code,
        ip: ipFinal,
        mac: macFinal,
        deviceId: pedido.deviceId,
        routerHost: routerInfo.router.host,
      },
      '[liberar-acesso] Liberando acesso via device-router'
    );

    let mk;
    if (ipFinal || macFinal) {
      try {
        mk = await liberarAcesso({
          ip: ipFinal || undefined,
          mac: macFinal || undefined,
          comment,
          router: routerInfo.router,
        });
      } catch (e) {
        // se falhar a liberação, reporta 502 mas mantém pedido atualizado
        logger.error({ error: e?.message || e, pedidoId: pedido.id }, '[liberar-acesso] falha liberarCliente');
        return json(
          {
            ok: false,
            error: e?.message || 'falha liberarCliente',
            pedidoId: pedido.id,
            code: pedido.code,
            status: pedido.status,
          },
          502
        );
      }
    } else {
      mk = { ok: true, note: 'sem ip/mac válidos; apenas status atualizado' };
    }

    // Criar ou atualizar sessão ativa após liberar acesso com sucesso
    // (mesmo comportamento do webhook)
    let sessaoId = null;
    if (mk.ok && (ipFinal || macFinal)) {
      try {
        // Buscar roteador pelo host/user se disponível
        let roteadorId = null;
        if (routerInfo.router?.host) {
          const roteador = await prisma.roteador.findFirst({
            where: {
              ipLan: routerInfo.router.host,
              usuario: routerInfo.router.user,
            },
          });
          if (roteador) {
            roteadorId = roteador.id;
          }
        }

        // Calcular expiração baseado no plano do pedido
        const { calcularMinutosPlano } = await import('@/lib/plan-duration');
        const minutos = calcularMinutosPlano(pedido.description || pedido);
        const now = new Date();
        const expiraEm = new Date(now.getTime() + minutos * 60 * 1000);

        const ipClienteFinal = ipFinal || `sem-ip-${pedido.id}`.slice(0, 255);

        // Usar upsert para evitar erro de constraint única se já existir sessão com esse IP
        // (mesmo comportamento do webhook)
        const sessao = await prisma.sessaoAtiva.upsert({
          where: {
            ipCliente: ipClienteFinal,
          },
          update: {
            macCliente: macFinal || null,
            plano: pedido.description || 'Acesso',
            expiraEm,
            ativo: true,
            pedidoId: pedido.id,
            roteadorId: roteadorId || undefined,
          },
          create: {
            ipCliente: ipClienteFinal,
            macCliente: macFinal || null,
            plano: pedido.description || 'Acesso',
            inicioEm: now,
            expiraEm,
            ativo: true,
            pedidoId: pedido.id,
            roteadorId,
          },
        });

        sessaoId = sessao.id;
        logger.info({ sessaoId }, '[liberar-acesso] Sessão ativa criada/atualizada');
      } catch (sessaoErr) {
        logger.error({ error: sessaoErr?.message || sessaoErr }, '[liberar-acesso] Erro ao criar/atualizar sessão ativa');
        // Não falha a liberação se não conseguir criar sessão
      }
    }

    // Audit success/failure of the liberation attempt with clear events
    try {
      const mikrotikId = routerInfo?.router?.host || routerInfo?.router?.id || null;
      if (mk.ok) {
        await auditLog({
          requestId,
          event: 'MIKROTIK_RELEASE_SUCCESS',
          entityId: pedido.id,
          ip: ipReq,
          actorId: null,
          result: 'SUCCESS',
          metadata: { orderCode: pedido.code, mikrotikId, sessaoId, mikrotikOk: true, note: mk?.note || null },
        });
      } else {
        await auditLog({
          requestId,
          event: 'MIKROTIK_RELEASE_FAIL',
          entityId: pedido.id,
          ip: ipReq,
          actorId: null,
          result: 'FAIL',
          metadata: { orderCode: pedido.code, mikrotikId, sessaoId, mikrotikOk: false, reason: mk?.note || 'liberacao_failed' },
        });
      }
    } catch (e) {
      // degrade gracefully
    }

    recordApiMetric('liberar_acesso', { durationMs: Date.now() - started, ok: true });
    return json(
      {
        ok: mk.ok,
        pedidoId: pedido.id,
        code: pedido.code,
        status: pedido.status,
        mikrotik: mk,
        sessaoId,
        redirect: linkOrig || null,
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (e) {
    logger.error({ error: e?.message || e }, 'POST /api/liberar-acesso error');
    recordApiMetric('liberar_acesso', { durationMs: Date.now() - started, ok: false });
    try {
      await auditLog({
        requestId: req.headers.get('x-request-id') || '',
        event: 'MIKROTIK_RELEASE_FAIL',
        entityId: null,
        ip: getClientIp(req),
        result: 'FAIL',
        metadata: { reason: 'UNHANDLED_ERROR', error: String(e?.message || e) },
      });
    } catch (er) {
      // ignore
    }
    return json({ ok: false, error: 'Falha ao liberar acesso' }, 500);
  }
}

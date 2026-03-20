// src/app/api/liberar-acesso/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { ok, fail, codeFromStatus } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/requireAuth';
import { auditLog } from '@/lib/auditLogger';
import { requireDeviceRouter } from '@/lib/device-router';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';
import { liberarAcesso } from '@/lib/mikrotik';
import prisma from '@/lib/prisma';
import { rateLimitOrThrow } from '@/lib/security/rateLimit';
import { getOrCreateRequestId } from '@/lib/security/requestId';
import { getClientIp } from '@/lib/security/requestUtils';

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

const MAC_RE = /^([0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/i;
const IPV4_RE = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

function normMac(value) {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase().replace(/-/g, ':');
  return MAC_RE.test(normalized) ? normalized : null;
}

function normIp(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  return IPV4_RE.test(normalized) ? normalized : null;
}

function sanitizeId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || /^\$\(.+\)$/.test(trimmed)) return null;
  return trimmed;
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

async function resolvePedido({ externalId, pagamentoId, txid }) {
  let pedido = null;

  if (externalId) {
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

  return pedido;
}

export async function POST(req) {
  const started = Date.now();
  const requestId = getOrCreateRequestId(req);
  const ipReq = getClientIp(req);

  const auth = await requireAuth(req, { role: 'MASTER', requestId });
  if (auth?.error) return auth.response || fail('UNAUTHORIZED', { requestId, status: auth.error });

  const limited = await rateLimitOrThrow(req, {
    name: 'liberar_acesso',
    limit: 10,
    windowMs: 60_000,
    requestId,
  });
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      logger.warn({ route: 'api_liberar_acesso', requestId, issues: parsed.error.issues }, '[liberar-acesso] invalid payload');
      recordApiMetric('liberar_acesso', { durationMs: Date.now() - started, ok: false });
      return fail('BAD_REQUEST', { requestId });
    }

    const {
      externalId,
      pagamentoId,
      txid,
      ip,
      mac,
      linkOrig,
      deviceId,
      mikId,
    } = parsed.data;

    if (!externalId && !pagamentoId && !txid) {
      recordApiMetric('liberar_acesso', { durationMs: Date.now() - started, ok: false });
      return fail('BAD_REQUEST', { requestId });
    }

    try {
      await auditLog({
        requestId,
        event: 'MIKROTIK_RELEASE_ATTEMPT',
        actorId: null,
        ip: ipReq,
        result: 'ATTEMPT',
        metadata: { orderCode: externalId || pagamentoId || txid || null },
      });
    } catch {
      // degrade silently
    }

    const pedido = await resolvePedido({ externalId, pagamentoId, txid });
    if (!pedido) {
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
      } catch {
        // degrade silently
      }

      recordApiMetric('liberar_acesso', { durationMs: Date.now() - started, ok: false });
      return fail('NOT_FOUND', { requestId, status: 404 });
    }

    let pedidoAtual = pedido;
    if (pedidoAtual.status !== 'PAID') {
      try {
        pedidoAtual = await prisma.pedido.update({
          where: { id: pedidoAtual.id },
          data: { status: 'PAID' },
        });
      } catch {
        // keep processing even if status update fails
      }
    }

    const ipFinal = normIp(ip || pedidoAtual.ip || null);
    const macFinal = normMac(mac || pedidoAtual.deviceMac || null);

    if (!ipFinal && !macFinal) {
      recordApiMetric('liberar_acesso', { durationMs: Date.now() - started, ok: false });
      return fail('BAD_REQUEST', { requestId });
    }

    const lookup = {
      deviceId: sanitizeId(deviceId) || pedidoAtual.deviceId,
      mikId: sanitizeId(mikId) || pedidoAtual.device?.mikId || pedidoAtual.deviceIdentifier,
    };

    let routerInfo;
    try {
      routerInfo = await requireDeviceRouter(lookup);
    } catch (err) {
      const status = err?.code === 'device_not_found' ? 404 : 400;
      recordApiMetric('liberar_acesso', { durationMs: Date.now() - started, ok: false });
      return fail(codeFromStatus(status), {
        requestId,
        status,
        meta: { code: err?.code || 'device_resolution_failed' },
      });
    }

    const comment = `pedido:${pedidoAtual.id}`.slice(0, 64);

    let mk;
    if (ipFinal || macFinal) {
      try {
        mk = await liberarAcesso({
          ip: ipFinal || undefined,
          mac: macFinal || undefined,
          comment,
          router: routerInfo.router,
        });
      } catch (err) {
        logger.error({ err, requestId, route: 'api_liberar_acesso' }, '[liberar-acesso] falha liberarCliente');
        recordApiMetric('liberar_acesso', { durationMs: Date.now() - started, ok: false });
        return fail('UPSTREAM_RELAY_DOWN', { requestId, status: 502 });
      }
    } else {
      mk = { ok: true, note: 'sem ip/mac válidos; apenas status atualizado' };
    }

    let sessaoId = null;
    if (mk.ok && (ipFinal || macFinal)) {
      try {
        let roteadorId = null;
        if (routerInfo.router?.host) {
          const roteador = await prisma.roteador.findFirst({
            where: {
              ipLan: routerInfo.router.host,
              usuario: routerInfo.router.user,
            },
          });
          roteadorId = roteador?.id || null;
        }

        const { calcularMinutosPlano } = await import('@/lib/plan-duration');
        const minutos = calcularMinutosPlano(pedidoAtual.description || pedidoAtual);
        const now = new Date();
        const expiraEm = new Date(now.getTime() + minutos * 60 * 1000);
        const ipClienteFinal = ipFinal || `sem-ip-${pedidoAtual.id}`.slice(0, 255);

        const sessao = await prisma.sessaoAtiva.upsert({
          where: { ipCliente: ipClienteFinal },
          update: {
            macCliente: macFinal || null,
            plano: pedidoAtual.description || 'Acesso',
            expiraEm,
            ativo: true,
            pedidoId: pedidoAtual.id,
            roteadorId: roteadorId || undefined,
          },
          create: {
            ipCliente: ipClienteFinal,
            macCliente: macFinal || null,
            plano: pedidoAtual.description || 'Acesso',
            inicioEm: now,
            expiraEm,
            ativo: true,
            pedidoId: pedidoAtual.id,
            roteadorId,
          },
        });

        sessaoId = sessao.id;
      } catch (err) {
        logger.error({ err, requestId, route: 'api_liberar_acesso' }, '[liberar-acesso] erro ao criar/atualizar sessão ativa');
      }
    }

    try {
      const mikrotikId = routerInfo?.router?.host || routerInfo?.router?.id || null;
      await auditLog({
        requestId,
        event: mk.ok ? 'MIKROTIK_RELEASE_SUCCESS' : 'MIKROTIK_RELEASE_FAIL',
        entityId: pedidoAtual.id,
        ip: ipReq,
        actorId: null,
        result: mk.ok ? 'SUCCESS' : 'FAIL',
        metadata: {
          orderCode: pedidoAtual.code,
          mikrotikId,
          sessaoId,
          mikrotikOk: Boolean(mk.ok),
          reason: mk?.note || null,
        },
      });
    } catch {
      // degrade silently
    }

    recordApiMetric('liberar_acesso', { durationMs: Date.now() - started, ok: true });
    return ok(
      {
        autorizado: Boolean(mk.ok),
        pedidoId: pedidoAtual.id,
        code: pedidoAtual.code,
        status: pedidoAtual.status,
        mikrotik: mk,
        sessaoId,
        redirect: linkOrig || null,
      },
      { requestId }
    );
  } catch (err) {
    logger.error({ err, requestId, route: 'api_liberar_acesso' }, 'POST /api/liberar-acesso error');
    recordApiMetric('liberar_acesso', { durationMs: Date.now() - started, ok: false });

    try {
      await auditLog({
        requestId,
        event: 'MIKROTIK_RELEASE_FAIL',
        entityId: null,
        ip: ipReq,
        result: 'FAIL',
        metadata: { reason: 'UNHANDLED_ERROR' },
      });
    } catch {
      // ignore
    }

    return fail('INTERNAL_ERROR', { requestId });
  }
}

// src/app/api/status-dispositivos/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { ok, fail } from '@/lib/api/response';
import { getRequestAuth } from '@/lib/auth/context';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';
import prisma from '@/lib/prisma';
import { relayIdentityStatus } from '@/lib/relayClient';
import { checkInternalAuth } from '@/lib/security/internalAuth';
import { rateLimitOrThrow } from '@/lib/security/rateLimit';
import { getOrCreateRequestId } from '@/lib/security/requestId';

const RELAY_FALLBACK = {
  state: 'DEGRADED',
  retryInMs: 10000,
  messageCode: 'RELAY_UNAVAILABLE',
};

const RELAY_NOT_CONFIGURED = {
  state: 'DEGRADED',
  retryInMs: null,
  messageCode: 'RELAY_NOT_CONFIGURED',
};

function hasRelayConfig() {
  const base = process.env.RELAY_BASE_URL || process.env.RELAY_URL || process.env.RELAY_BASE;
  const token = process.env.RELAY_TOKEN || process.env.RELAY_API_TOKEN;
  const secret = process.env.RELAY_API_SECRET;
  return Boolean(base && token && secret);
}

async function safeQuery(fn, fallback, meta = {}) {
  try {
    return await fn();
  } catch (err) {
    logger.warn(
      { err: err?.message || err, ...meta },
      '[status-dispositivos] database query failed, using fallback'
    );
    return fallback;
  }
}

async function fetchStatusFromRelay(identity, requestId, extra = {}) {
  if (!identity) {
    return { identity: null, ...RELAY_FALLBACK, online: false, ...extra };
  }

  try {
    const status = await relayIdentityStatus(identity, { requestId });
    return {
      identity,
      ...extra,
      ...status,
      // online é determinado pela resposta do relay (ok: true), não pelo estado
      // NO_PENDING_PAYMENT significa que o roteador está ativo mas sem clientes
      online: status.online ?? false,
    };
  } catch {
    return {
      identity,
      ...extra,
      ...RELAY_FALLBACK,
      online: false,
    };
  }
}

export async function GET(req) {
  const started = Date.now();
  const requestId = getOrCreateRequestId(req);

  const internalOk = checkInternalAuth(req);
  if (!internalOk) {
    const auth = await getRequestAuth();
    if (!auth?.session) {
      logger.warn({ route: 'api_status_dispositivos', requestId }, '[status-dispositivos] unauthorized');
      recordApiMetric('status_dispositivos', { durationMs: Date.now() - started, ok: false });
      return fail('UNAUTHORIZED', { requestId });
    }
  }

  const limited = await rateLimitOrThrow(req, {
    name: 'status_dispositivos_get',
    limit: 120,
    windowMs: 60_000,
    requestId,
  });
  if (limited) return limited;

  try {
    const roteadores = await safeQuery(
      () =>
        prisma.roteador.findMany({
          select: {
            id: true,
            nome: true,
            identity: true,
            ipLan: true,
          },
        }),
      [],
      { model: 'Roteador', requestId }
    );

    const dispositivos = await safeQuery(
      () =>
        prisma.dispositivo.findMany({
          select: {
            id: true,
            ip: true,
            mikId: true,
          },
        }),
      [],
      { model: 'Dispositivo', requestId }
    );

    if (!hasRelayConfig()) {
      const payload = {
        mikrotik: {
          online: false,
          nome: null,
          identity: null,
          ip: null,
          state: RELAY_NOT_CONFIGURED.state,
          messageCode: RELAY_NOT_CONFIGURED.messageCode,
          retryInMs: RELAY_NOT_CONFIGURED.retryInMs,
          total: roteadores.length,
          todos: [],
        },
        starlink: {
          online: false,
          nome: null,
          ip: null,
          state: RELAY_NOT_CONFIGURED.state,
          messageCode: RELAY_NOT_CONFIGURED.messageCode,
          retryInMs: RELAY_NOT_CONFIGURED.retryInMs,
          total: dispositivos.length,
          todos: [],
        },
      };

      recordApiMetric('status_dispositivos', { durationMs: Date.now() - started, ok: true });
      return ok(payload, { requestId });
    }

    const mikrotiksStatus = await Promise.all(
      roteadores.map((router) =>
        fetchStatusFromRelay(router.identity || null, requestId, {
          id: router.id,
          nome: router.nome,
          ip: router.ipLan,
          messageCode: router.identity ? undefined : 'MISSING_ROUTER_IDENTITY',
        })
      )
    );

    const starlinksStatus = await Promise.all(
      dispositivos.map((device) =>
        fetchStatusFromRelay(device.mikId || device.ip || device.id, requestId, {
          id: device.id,
          nome: device.mikId || device.ip || 'N/A',
          ip: device.ip,
        })
      )
    );

    const mikrotikOnline = mikrotiksStatus.find((item) => item.online);
    const starlinkOnline = starlinksStatus.find((item) => item.online);

    const payload = {
      mikrotik: {
        online: Boolean(mikrotikOnline),
        nome: mikrotikOnline?.nome || null,
        identity: mikrotikOnline?.identity || null,
        ip: mikrotikOnline?.ip || null,
        state: mikrotikOnline?.state || null,
        messageCode: mikrotikOnline?.messageCode || null,
        retryInMs: mikrotikOnline?.retryInMs ?? null,
        total: mikrotiksStatus.length,
        todos: mikrotiksStatus,
      },
      starlink: {
        online: Boolean(starlinkOnline),
        nome: starlinkOnline?.nome || null,
        ip: starlinkOnline?.ip || null,
        state: starlinkOnline?.state || null,
        messageCode: starlinkOnline?.messageCode || null,
        retryInMs: starlinkOnline?.retryInMs ?? null,
        total: starlinksStatus.length,
        todos: starlinksStatus,
      },
    };

    recordApiMetric('status_dispositivos', { durationMs: Date.now() - started, ok: true });
    return ok(payload, { requestId });
  } catch (err) {
    logger.error({ err, requestId, route: 'api_status_dispositivos' }, 'GET /api/status-dispositivos');
    recordApiMetric('status_dispositivos', { durationMs: Date.now() - started, ok: false });
    return fail('INTERNAL_ERROR', { requestId });
  }
}

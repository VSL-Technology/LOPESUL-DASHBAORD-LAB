// src/app/api/status-dispositivos/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';
import { checkInternalAuth } from '@/lib/security/internalAuth';
import { getRequestAuth } from '@/lib/auth/context';
import { relayIdentityStatus } from '@/lib/relayClient';

const RELAY_FALLBACK = {
  state: 'DEGRADED',
  retryInMs: 10000,
  messageCode: 'RELAY_UNAVAILABLE',
};

async function fetchStatusFromRelay(identity, extra = {}) {
  if (!identity) {
    return { identity: null, ...RELAY_FALLBACK, online: false, ...extra };
  }
  try {
    const status = await relayIdentityStatus(identity);
    return {
      identity,
      ...extra,
      ...status,
      online: status.state === 'OK',
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
  const internalOk = checkInternalAuth(req);
  let auth = null;
  if (!internalOk) {
    auth = await getRequestAuth();
    if (!auth?.session) {
      logger.warn({}, '[status-dispositivos] unauthorized');
      recordApiMetric('status_dispositivos', { durationMs: Date.now() - started, ok: false });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  try {
    // Buscar todos os roteadores (Mikrotiks)
    const roteadores = await prisma.roteador.findMany({
      select: {
        id: true,
        nome: true,
        identity: true,
        ipLan: true,
      },
    });

    // Buscar todos os dispositivos (Starlinks)
    const dispositivos = await prisma.dispositivo.findMany({
      select: {
        id: true,
        ip: true,
        mikId: true,
      },
    });

    // Verificar status de todos os Mikrotiks via Relay (fonte da verdade)
    const mikrotiksStatus = await Promise.all(
      roteadores.map((r) =>
        fetchStatusFromRelay(r.identity || null, {
          id: r.id,
          nome: r.nome,
          ip: r.ipLan,
          messageCode: r.identity ? undefined : 'MISSING_ROUTER_IDENTITY',
        })
      )
    );

    // Verificar status de todos os dispositivos/Starlinks via Relay
    const starlinksStatus = await Promise.all(
      dispositivos.map((d) =>
        fetchStatusFromRelay(d.mikId || d.ip || d.id, {
          id: d.id,
          nome: d.mikId || d.ip || 'N/A',
          ip: d.ip,
        })
      )
    );

    // Encontrar o primeiro online de cada tipo
    const mikrotikOnline = mikrotiksStatus.find((m) => m.online);
    const starlinkOnline = starlinksStatus.find((s) => s.online);

    const body = {
      mikrotik: {
        online: !!mikrotikOnline,
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
        online: !!starlinkOnline,
        nome: starlinkOnline?.nome || null,
        ip: starlinkOnline?.ip || null,
        state: starlinkOnline?.state || null,
        messageCode: starlinkOnline?.messageCode || null,
        retryInMs: starlinkOnline?.retryInMs ?? null,
        total: starlinksStatus.length,
        todos: starlinksStatus,
      },
    };
    logger.debug({ mikrotikOnline: Boolean(mikrotikOnline), starlinkOnline: Boolean(starlinkOnline) }, '[status-dispositivos]');
    recordApiMetric('status_dispositivos', { durationMs: Date.now() - started, ok: true });
    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    logger.error({ error: e?.message || e }, 'GET /api/status-dispositivos');
    recordApiMetric('status_dispositivos', { durationMs: Date.now() - started, ok: false });
    return NextResponse.json({
      mikrotik: { online: false, nome: null, identity: null, ip: null, total: 0, todos: [] },
      starlink: { online: false, nome: null, ip: null, via: null, total: 0, todos: [] },
      error: String(e?.message || e),
    }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}

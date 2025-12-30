// src/app/api/dispositivos/status/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRelayBase } from '@/lib/relay';
import { relayIdentityStatus } from '@/lib/relayClient';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';

const MAX_HOSTS = 1000;
const RELAY_FALLBACK = {
  state: 'DEGRADED',
  retryInMs: 10000,
  messageCode: 'RELAY_UNAVAILABLE',
};

function uniq(list) {
  return Array.from(new Set(list.filter(Boolean)));
}

async function safe(fn, fallback) {
  try { return await fn(); } catch { return fallback; }
}

function identityFromDispositivo(d) {
  return d?.mikId || d?.ip || d?.id || null;
}

async function fetchStatus(identity) {
  if (!identity) return { identity: null, ...RELAY_FALLBACK, online: false };
  try {
    const st = await relayIdentityStatus(identity);
    return { identity, ...st, online: st.state === 'OK' };
  } catch {
    return { identity, ...RELAY_FALLBACK, online: false };
  }
}

export async function GET() {
  const started = Date.now();
  try {
    const dispositivos = await safe(
      () => prisma.dispositivo.findMany({ take: MAX_HOSTS }),
      []
    );

    const identities = uniq(dispositivos.map(identityFromDispositivo)).slice(0, MAX_HOSTS);
    const statuses = await Promise.all(identities.map((id) => fetchStatus(id)));
    const okStatus = statuses.find((s) => s.online) || null;
    const baseRelay = (() => {
      try { return getRelayBase(); } catch { return null; }
    })();

    const resp = {
      mikrotik: {
        online: Boolean(okStatus),
        identity: okStatus?.identity || null,
        state: okStatus?.state || null,
        messageCode: okStatus?.messageCode || null,
        retryInMs: okStatus?.retryInMs ?? null,
        total: statuses.length,
        todos: statuses,
      },
      starlink: {
        online: Boolean(okStatus),
        identity: okStatus?.identity || null,
        state: okStatus?.state || null,
        messageCode: okStatus?.messageCode || null,
        retryInMs: okStatus?.retryInMs ?? null,
        total: statuses.length,
        todos: statuses,
      },
      relay: {
        online: Boolean(baseRelay),
        base: baseRelay,
      },
      meta: {
        totalHosts: identities.length,
        ts: Date.now(),
      },
    };

    logger.debug(resp.meta, '[dispositivos] status aggregated');
    recordApiMetric('dispositivos_overview', {
      durationMs: Date.now() - started,
      ok: true,
    });

    return NextResponse.json(resp, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    logger.error({ error: e?.message || e }, 'GET /api/dispositivos');
    recordApiMetric('dispositivos_overview', {
      durationMs: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      {
        mikrotik: { online: false },
        starlink: { online: false },
        relay: { online: false, base: getRelayBase() || null },
        meta: { totalHosts: 0, ts: Date.now() },
      },
      { status: 500 }
    );
  }
}

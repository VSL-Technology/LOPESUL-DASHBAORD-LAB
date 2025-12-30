// src/app/api/mikrotik/status/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { relayIdentityStatus } from '@/lib/relayClient';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';

const RELAY_FALLBACK = {
  state: 'DEGRADED',
  retryInMs: 10000,
  messageCode: 'RELAY_UNAVAILABLE',
};

export async function GET() {
  const started = Date.now();
  const identity =
    process.env.MIKROTIK_IDENTITY ||
    process.env.MIKROTIK_HOST ||
    process.env.MIKROTIK_USER ||
    'default-router';

  try {
    const status = await relayIdentityStatus(identity);

    const body = {
      ok: status.state === 'OK',
      mikrotik: status.state === 'OK' ? 'online' : 'offline',
      starlink: status.state === 'OK' ? 'online' : 'offline',
      identity,
      state: status.state,
      messageCode: status.messageCode,
      retryInMs: status.retryInMs,
      flags: {
        hasLink: status.state === 'OK',
        pingSuccess: status.state === 'OK',
      },
    };

    logger.debug(body, '[mikrotik/status] status result');
    recordApiMetric('mikrotik_status', { durationMs: Date.now() - started, ok: true });

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    logger.error({ error: e?.message || e }, 'GET /api/mikrotik/status');
    recordApiMetric('mikrotik_status', { durationMs: Date.now() - started, ok: false });
    return NextResponse.json(
      {
        ok: true,
        mikrotik: 'offline',
        starlink: 'offline',
        identity,
        ...RELAY_FALLBACK,
        error: String(e?.message || e),
        flags: { hasLink: false, pingSuccess: false },
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

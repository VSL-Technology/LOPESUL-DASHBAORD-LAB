// src/app/api/db-health/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function GET() {
  const started = Date.now();
  let ok = false;
  try {
    const rows = await prisma.$queryRaw`
      SELECT
        NOW()                               AS now_db,
        NOW() AT TIME ZONE 'UTC'            AS now_utc,
        current_setting('TimeZone', true)   AS db_timezone
    `;
    const latencyMs = Date.now() - started;
    const row = Array.isArray(rows) && rows[0] ? rows[0] : {};
    ok = true;
    return json({
      ok: true,
      db: 'connected',
      latency_ms: latencyMs,
      now_db: row.now_db ?? null,
      now_utc: row.now_utc ?? null,
      db_timezone: row.db_timezone ?? null,
    });
  } catch (err) {
    logger.error({ error: err?.message }, '[db-health] Falha ao consultar banco');
    const latencyMs = Date.now() - started;
    return json(
      {
        ok: false,
        db: 'error',
        latency_ms: latencyMs,
        code: 'db_unavailable',
      },
      500
    );
  } finally {
    recordApiMetric('db_health', { durationMs: Date.now() - started, ok });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-store',
    },
  });
}

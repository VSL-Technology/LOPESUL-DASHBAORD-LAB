// app/api/hotspot/active/route.ts
import { NextResponse } from 'next/server';
import { relayFetch } from '@/lib/relay';
import { checkInternalAuth } from '@/lib/security/internalAuth';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';

export async function GET(req: Request) {
  const started = Date.now();
  if (!checkInternalAuth(req)) {
    logger.warn({}, '[hotspot/active] unauthorized');
    recordApiMetric('hotspot_active', { durationMs: Date.now() - started, ok: false });
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const r = await relayFetch('/hotspot/active');
    const j = await r.json();
    recordApiMetric('hotspot_active', { durationMs: Date.now() - started, ok: r.ok });
    return NextResponse.json(j, { status: r.status });
  } catch (err) {
    logger.error({ error: err?.message || err }, '[hotspot/active] relay unreachable');
    recordApiMetric('hotspot_active', { durationMs: Date.now() - started, ok: false });
    return NextResponse.json({ ok:false, error:'relay_unreachable' }, { status: 502 });
  }
}

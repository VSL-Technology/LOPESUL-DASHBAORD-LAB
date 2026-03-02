// app/api/hotspot/active/route.ts
import { NextResponse } from 'next/server';
import { relayFetchSigned } from '@/lib/relayFetchSigned';
import { checkInternalAuth } from '@/lib/security/internalAuth';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';
import { getOrCreateRequestId } from '@/lib/security/requestId';

export async function GET(req: Request) {
  const started = Date.now();
  const requestId = getOrCreateRequestId(req);
  if (!checkInternalAuth(req)) {
    logger.warn({}, '[hotspot/active] unauthorized');
    recordApiMetric('hotspot_active', { durationMs: Date.now() - started, ok: false });
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const out = await relayFetchSigned({
      method: 'GET',
      originalUrl: '/hotspot/active',
      token: process.env.RELAY_TOKEN_TOOLS || process.env.RELAY_TOKEN || '',
      apiSecret: process.env.RELAY_API_SECRET || '',
      headers: { 'x-request-id': requestId },
    });
    recordApiMetric('hotspot_active', { durationMs: Date.now() - started, ok: out.ok });
    return NextResponse.json(out.data ?? {}, { status: out.status || 200 });
  } catch (err) {
    if (err?.status) {
      return NextResponse.json(err?.data || { ok: false, error: 'relay_error' }, { status: err.status });
    }
    logger.error({ error: err?.message || err }, '[hotspot/active] relay unreachable');
    recordApiMetric('hotspot_active', { durationMs: Date.now() - started, ok: false });
    return NextResponse.json({ ok:false, error:'relay_unreachable' }, { status: 502 });
  }
}

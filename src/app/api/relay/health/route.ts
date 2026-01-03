import { NextResponse } from 'next/server';
import { relayFetchSigned } from '@/lib/relayFetchSigned';
import { checkInternalAuth } from '@/lib/security/internalAuth';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function resolveRelayToken() {
  return (
    process.env.RELAY_TOKEN_HEALTH ||
    process.env.RELAY_TOKEN_TOOLS ||
    process.env.RELAY_TOKEN_EXEC ||
    process.env.RELAY_TOKEN ||
    ''
  );
}

export async function GET(req: Request) {
  const started = Date.now();
  if (!checkInternalAuth(req)) {
    logger.warn({}, '[relay/health] unauthorized');
    recordApiMetric('relay_health', { durationMs: Date.now() - started, ok: false });
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const token = resolveRelayToken();
  if (!token) {
    logger.error({}, '[relay/health] missing relay token');
    recordApiMetric('relay_health', { durationMs: Date.now() - started, ok: false });
    return NextResponse.json({ ok: false, error: 'relay_config_missing' }, { status: 500 });
  }

  try {
    const resp = await relayFetchSigned({
      method: 'GET',
      originalUrl: '/relay/health',
      token,
    });
    recordApiMetric('relay_health', { durationMs: Date.now() - started, ok: resp.ok });
    return NextResponse.json(resp.data ?? resp, {
      status: resp.status || (resp.ok ? 200 : 502),
    });
  } catch (err: any) {
    const status = err?.status || 502;
    const payload = err?.data || { ok: false, error: err?.message || 'relay_unreachable' };
    logger.error({ error: err?.message || err, status }, '[relay/health] relay unreachable');
    recordApiMetric('relay_health', { durationMs: Date.now() - started, ok: false });
    return NextResponse.json(payload, { status });
  }
}

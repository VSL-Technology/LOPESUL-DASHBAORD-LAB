import { relayFetchSigned } from '@/lib/relayFetchSigned';
import { checkInternalAuth } from '@/lib/security/internalAuth';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';

export const dynamic = 'force-dynamic';

function resolveRelayBaseUrl() {
  const base = process.env.RELAY_BASE_URL || process.env.RELAY_URL || process.env.RELAY_BASE || '';
  return base.replace(/\/+$/, '');
}

export async function GET(req: Request) {
  const started = Date.now();
  if (!checkInternalAuth(req)) {
    logger.warn({}, '[relay/ping] unauthorized');
    recordApiMetric('relay_ping', { durationMs: Date.now() - started, ok: false });
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const relayBaseUrl = resolveRelayBaseUrl();
  const relayToken = process.env.RELAY_TOKEN_TOOLS || '';
  const apiSecret = process.env.RELAY_API_SECRET || '';

  if (!relayBaseUrl || !relayToken || !apiSecret) {
    logger.error(
      { hasBase: !!relayBaseUrl, hasToken: !!relayToken, hasSecret: !!apiSecret },
      '[relay/ping] missing relay config'
    );
    recordApiMetric('relay_ping', { durationMs: Date.now() - started, ok: false });
    return new Response(JSON.stringify({ ok: false, error: 'relay_config_missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
  try {
    const resp = await relayFetchSigned({
      method: 'GET',
      originalUrl: '/relay/ping',
      baseUrl: relayBaseUrl,
      token: relayToken,
      apiSecret,
    });
    recordApiMetric('relay_ping', { durationMs: Date.now() - started, ok: resp.ok });
    return new Response(JSON.stringify(resp.data ?? resp), {
      status: resp.status || (resp.ok ? 200 : 502),
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (e: any) {
    const status = e?.status || 502;
    const payload = e?.data || { ok: false, error: e?.message || 'relay_unreachable' };
    logger.error({ error: e?.message || e, status }, '[relay/ping] error');
    recordApiMetric('relay_ping', { durationMs: Date.now() - started, ok: false });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

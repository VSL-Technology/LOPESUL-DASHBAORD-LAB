import { relayFetch } from '@/lib/relayFetch';
import { checkInternalAuth } from '@/lib/security/internalAuth';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';

export const dynamic = 'force-dynamic';

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
  try {
    const r = await relayFetch('/relay/ping', { tokenEnv: 'RELAY_TOKEN_TOOLS', timeoutMs: 5000 } as any);
    recordApiMetric('relay_ping', { durationMs: Date.now() - started, ok: r.ok });
    return new Response(JSON.stringify(r.json), {
      status: r.status || (r.ok ? 200 : 502),
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (e: any) {
    logger.error({ error: e?.message || e }, '[relay/ping] error');
    recordApiMetric('relay_ping', { durationMs: Date.now() - started, ok: false });
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'relay_unreachable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

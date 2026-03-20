import { ok, fail, codeFromStatus } from '@/lib/api/response';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';
import { relayFetchSigned } from '@/lib/relayFetchSigned';
import { checkInternalAuth } from '@/lib/security/internalAuth';
import { rateLimitOrThrow } from '@/lib/security/rateLimit';
import { getOrCreateRequestId } from '@/lib/security/requestId';

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
  const requestId = getOrCreateRequestId(req);

  if (!checkInternalAuth(req)) {
    logger.warn({ route: 'api_relay_health', requestId }, '[relay/health] unauthorized');
    recordApiMetric('relay_health', { durationMs: Date.now() - started, ok: false });
    return fail('UNAUTHORIZED', { requestId });
  }

  const limited = await rateLimitOrThrow(req, {
    name: 'relay_health_get',
    limit: 120,
    windowMs: 60_000,
    requestId,
  });
  if (limited) return limited;

  const token = resolveRelayToken();
  if (!token) {
    logger.error({ route: 'api_relay_health', requestId }, '[relay/health] missing relay token');
    recordApiMetric('relay_health', { durationMs: Date.now() - started, ok: false });
    return fail('INTERNAL_ERROR', { requestId });
  }

  try {
    const resp = await relayFetchSigned({
      method: 'GET',
      originalUrl: '/relay/health',
      token,
      requestId,
    });

    recordApiMetric('relay_health', { durationMs: Date.now() - started, ok: resp.ok });
    return ok(resp.data ?? resp, { requestId, status: resp.status || (resp.ok ? 200 : 502) });
  } catch (err: any) {
    const status = Number(err?.status || 502);
    logger.error({ err, requestId, route: 'api_relay_health', status }, '[relay/health] relay unreachable');
    recordApiMetric('relay_health', { durationMs: Date.now() - started, ok: false });
    return fail(codeFromStatus(status), { requestId, status });
  }
}

import { ok, fail } from '@/lib/api/response';
import { logger } from '@/lib/logger';
import { runReadyChecks } from '@/lib/ops/healthChecks';
import { getOrCreateRequestId } from '@/lib/security/requestId';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const requestId = getOrCreateRequestId(req);

  try {
    const payload = await runReadyChecks({ requestId });
    if (payload.status === 'ok') {
      return ok(payload, { requestId, status: 200 });
    }

    const code = payload?.checks?.db?.ok ? 'UPSTREAM_RELAY_DOWN' : 'DB_DOWN';
    return fail(code, {
      requestId,
      status: 503,
      meta: payload,
    });
  } catch (err) {
    logger.error({ err, requestId, route: 'api_health' }, '[health] failed');
    return fail('INTERNAL_ERROR', { requestId });
  }
}

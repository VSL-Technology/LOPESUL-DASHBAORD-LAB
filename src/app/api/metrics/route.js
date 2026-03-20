import { ok, fail } from '@/lib/api/response';
import { getApiMetrics } from '@/lib/metrics/index';
import { checkInternalAuth } from '@/lib/security/internalAuth';
import { rateLimitOrThrow } from '@/lib/security/rateLimit';
import { getOrCreateRequestId } from '@/lib/security/requestId';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const requestId = getOrCreateRequestId(req);

  if (!checkInternalAuth(req)) {
    return fail('UNAUTHORIZED', { requestId });
  }

  const limited = await rateLimitOrThrow(req, {
    name: 'metrics_get',
    limit: 120,
    windowMs: 60_000,
    requestId,
  });
  if (limited) return limited;

  return ok(getApiMetrics(), { requestId });
}

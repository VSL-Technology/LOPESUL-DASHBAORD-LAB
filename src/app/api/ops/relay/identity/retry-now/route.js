// Ops endpoint: força retry-now no Relay. Admin apenas.
import { ok, fail } from '@/lib/api/response';
import { requireMutationAuth } from '@/lib/auth/requireMutationAuth';
import { logger } from '@/lib/logger';
import { relayProxyFetch } from '@/lib/relayProxy';
import { rateLimitOrThrow } from '@/lib/security/rateLimit';
import { getOrCreateRequestId } from '@/lib/security/requestId';

const RATE_LIMIT_WINDOW_MS = 30_000;
const RATE_LIMIT_MAX = 5;
const rateMap = new Map();

function rateLimit(key) {
  const now = Date.now();
  const entry = rateMap.get(key) || { count: 0, reset: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + RATE_LIMIT_WINDOW_MS;
  }
  entry.count += 1;
  rateMap.set(key, entry);
  return entry.count <= RATE_LIMIT_MAX;
}

export async function POST(req) {
  const requestId = getOrCreateRequestId(req);
  const auth = await requireMutationAuth(req, { role: 'MASTER', requestId });
  if (auth instanceof Response) return auth;

  const limited = await rateLimitOrThrow(req, {
    name: 'ops_relay_identity_retry_now',
    limit: 10,
    windowMs: 60_000,
    requestId,
  });
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const sid = String(body?.sid || '').trim();
    if (!sid) return fail('BAD_REQUEST', { requestId });

    const key = auth.session?.sub || req.headers.get('x-forwarded-for') || 'anon';
    if (!rateLimit(`ops-retry:${key}`)) {
      return fail('RATE_LIMITED', { requestId, status: 429 });
    }

    const relayInternalToken = process.env.RELAY_INTERNAL_TOKEN;
    if (!relayInternalToken) {
      return fail('INTERNAL_ERROR', { requestId, status: 500 });
    }

    const r = await relayProxyFetch('/relay/identity/retry-now', {
      method: 'POST',
      headers: {
        'X-Relay-Internal': relayInternalToken,
      },
      body: { sid },
      requestId,
    });

    logger.info(
      {
        route: 'api_ops_relay_identity_retry_now',
        requestId,
        userId: auth.session?.sub || null,
        sid,
        relayStatus: r.status,
        relayOk: r.ok,
      },
      '[ops/retry-now]'
    );

    if (!r.ok || !r.json?.ok) {
      return fail('UPSTREAM_RELAY_DOWN', { requestId, status: 502 });
    }

    return ok(r.json, { requestId });
  } catch (err) {
    logger.error({ err, requestId, route: 'api_ops_relay_identity_retry_now' }, '[ops/retry-now] unexpected error');
    return fail('INTERNAL_ERROR', { requestId });
  }
}

import { fail } from '@/lib/api/response';
import { verifySession } from '@/lib/auth/session';
import { getOrCreateRequestId } from '@/lib/security/requestId';

const buckets = new Map();
const MAX_BUCKETS = 20_000;

function readSessionCookie(req) {
  const fromNextCookies = req?.cookies?.get?.('session')?.value;
  if (fromNextCookies) return fromNextCookies;

  const cookieHeader = req?.headers?.get?.('cookie') || '';
  if (!cookieHeader) return null;

  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey !== 'session') continue;
    const rawValue = rest.join('=');
    if (!rawValue) return null;
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

function getClientIp(req) {
  const forwarded = req?.headers?.get?.('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  const direct =
    req?.ip ||
    req?.headers?.get?.('x-real-ip') ||
    req?.headers?.get?.('cf-connecting-ip') ||
    'unknown';

  return String(direct || 'unknown');
}

function resolveActorKey(req) {
  const token = readSessionCookie(req);
  if (token) {
    const session = verifySession(token);
    if (session?.sub) {
      return `user:${String(session.sub)}`;
    }
  }

  return `ip:${getClientIp(req)}`;
}

function maybePrune(nowMs) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, value] of buckets.entries()) {
    if (!value || value.resetAt <= nowMs) {
      buckets.delete(key);
    }
  }
}

function buildRateLimitResponse(retryAfterMs, requestId) {
  const retrySeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  const response = fail('RATE_LIMITED', {
    requestId,
    meta: { retryAfterMs },
  });
  response.headers.set('Retry-After', String(retrySeconds));
  return response;
}

export async function rateLimitOrThrow(req, options = {}) {
  const name = String(options?.name || 'default').trim() || 'default';
  const limit = Number(options?.limit || 0);
  const windowMs = Number(options?.windowMs || 0);

  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(`Invalid rate limit for "${name}"`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error(`Invalid rate limit window for "${name}"`);
  }

  const now = Date.now();
  maybePrune(now);

  const actor = resolveActorKey(req);
  const key = `${name}:${actor}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return null;
  }

  if (current.count >= limit) {
    const retryAfterMs = Math.max(1, current.resetAt - now);
    const requestId = String(options?.requestId || getOrCreateRequestId(req));
    return buildRateLimitResponse(retryAfterMs, requestId);
  }

  current.count += 1;
  buckets.set(key, current);
  return null;
}

export async function withRateLimit(req, config, handler) {
  const limited = await rateLimitOrThrow(req, config);
  if (limited) return limited;
  return handler();
}

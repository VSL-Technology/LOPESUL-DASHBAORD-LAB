// src/lib/security/rateLimit.js
// Wrapper de compatibilidade — delega para src/lib/rateLimit.ts (Redis ou in-memory).
// Mantém as assinaturas rateLimitOrThrow(req, options) e withRateLimit(req, config, handler)
// para não alterar os call sites existentes.
import { fail } from '@/lib/api/response';
import { verifySession } from '@/lib/auth/session';
import { getOrCreateRequestId } from '@/lib/security/requestId';
import { rateLimitMs } from '@/lib/rateLimit';

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
    if (session?.sub) return `user:${String(session.sub)}`;
  }
  return `ip:${getClientIp(req)}`;
}

function buildRateLimitResponse(retryAfterMs, requestId) {
  const retrySeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  const response = fail('RATE_LIMITED', { requestId, meta: { retryAfterMs } });
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

  const actor = resolveActorKey(req);
  const key = `${name}:${actor}`;

  const result = await rateLimitMs({ key, limit, windowMs });

  if (!result.allowed) {
    const requestId = String(options?.requestId || getOrCreateRequestId(req));
    return buildRateLimitResponse(result.resetIn * 1000, requestId);
  }

  return null;
}

export async function withRateLimit(req, config, handler) {
  const limited = await rateLimitOrThrow(req, config);
  if (limited) return limited;
  return handler();
}

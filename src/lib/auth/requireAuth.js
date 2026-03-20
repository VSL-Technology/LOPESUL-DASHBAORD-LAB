import { fail } from '@/lib/api/response';
import { verifySession } from '@/lib/auth/session';
import { getOrCreateRequestId } from '@/lib/security/requestId';

const ROLE_RANK = {
  READER: 1,
  MASTER: 2,
};

function normalizeRole(role) {
  const value = String(role || '').toUpperCase();
  if (value === 'MASTER' || value === 'ADMIN') return 'MASTER';
  return 'READER';
}

function readSessionCookie(request) {
  const fromNextCookies = request?.cookies?.get?.('session')?.value;
  if (fromNextCookies) return fromNextCookies;

  const cookieHeader = request?.headers?.get?.('cookie') || '';
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

export async function requireAuth(request, options = {}) {
  const requestId = String(options?.requestId || getOrCreateRequestId(request));
  const token = readSessionCookie(request);
  if (!token) {
    return {
      error: 401,
      requestId,
      response: fail('UNAUTHORIZED', { requestId }),
    };
  }

  const session = verifySession(token);
  if (!session) {
    return {
      error: 401,
      requestId,
      response: fail('UNAUTHORIZED', { requestId }),
    };
  }

  const requiredRole = options?.role ? normalizeRole(options.role) : null;
  if (requiredRole) {
    const currentRole = normalizeRole(session.role);
    if ((ROLE_RANK[currentRole] || 0) < (ROLE_RANK[requiredRole] || 0)) {
      return {
        error: 403,
        requestId,
        response: fail('FORBIDDEN', { requestId }),
      };
    }
  }

  return session;
}

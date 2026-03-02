import { fail } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/requireAuth';
import { ALLOWED_ORIGIN } from '@/lib/security/originPolicy';
import { publicMutationAllowlist } from '@/lib/security/publicMutationAllowlist';
import { getOrCreateRequestId } from '@/lib/security/requestId';
import { getRequestOrigin } from '@/lib/security/httpGuards';

function resolvePath(req) {
  const fromNextUrl = req?.nextUrl?.pathname;
  if (fromNextUrl) return fromNextUrl;
  const fromUrl = req?.url;
  if (!fromUrl) return '';
  try {
    return new URL(fromUrl).pathname;
  } catch {
    return '';
  }
}

export async function requireMutationAuth(req, options = {}) {
  const requestId = String(options?.requestId || getOrCreateRequestId(req));
  const allowPublic = Boolean(options?.allowPublic);
  const role = options?.role || 'MASTER';
  const path = resolvePath(req);

  if (allowPublic || publicMutationAllowlist.has(path)) {
    return { ok: true, session: null, requestId };
  }

  const origin = getRequestOrigin(req);
  if (origin && origin !== String(ALLOWED_ORIGIN || '').trim()) {
    return fail('FORBIDDEN', {
      requestId,
      meta: { reason: 'FORBIDDEN_ORIGIN' },
    });
  }

  const auth = await requireAuth(req, { role, requestId });
  if (auth?.error) {
    return auth.response || fail(auth.error === 403 ? 'FORBIDDEN' : 'UNAUTHORIZED', { requestId });
  }

  return { ok: true, session: auth, requestId };
}

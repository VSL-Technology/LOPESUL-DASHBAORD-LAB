import { cookies } from 'next/headers';
import { ok, fail } from '@/lib/api/response';
import { requireMutationAuth } from '@/lib/auth/requireMutationAuth';
import prisma from '@/lib/prisma';
import { relayEnsureHotspotUser } from '@/lib/relayHotspot';
import { logger } from '@/lib/logger';
import { rateLimitOrThrow } from '@/lib/security/rateLimit';
import { getOrCreateRequestId } from '@/lib/security/requestId';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const requestId = getOrCreateRequestId(req);
  const auth = await requireMutationAuth(req, { role: 'MASTER', requestId });
  if (auth instanceof Response) return auth;

  const limited = await rateLimitOrThrow(req, {
    name: 'hotspot_autorizar',
    limit: 10,
    windowMs: 60_000,
    requestId,
  });
  if (limited) return limited;

  const cookieStore = await cookies();
  const token = cookieStore.get('lps_token')?.value;
  if (!token) return fail('UNAUTHORIZED', { requestId });

  const sessao = await prisma.sessaoPagamento.findUnique({ where: { token } });
  if (!sessao) return fail('NOT_FOUND', { requestId, status: 404 });
  if (sessao.status !== 'PAID') return fail('BAD_REQUEST', { requestId, status: 409 });
  if (!sessao.planoMinutos) return fail('BAD_REQUEST', { requestId });

  try {
    const out = await relayEnsureHotspotUser({
      identity: sessao.identity,
      token: sessao.token,
      minutes: sessao.planoMinutos,
    });

    return ok(
      {
        username: out.username,
        password: out.password,
        mocked: Boolean(out.mocked),
      },
      { requestId }
    );
  } catch (err) {
    logger.error({ err, requestId, route: 'api_hotspot_autorizar' }, '[hotspot/autorizar] erro inesperado');
    return fail('INTERNAL_ERROR', { requestId });
  }
}

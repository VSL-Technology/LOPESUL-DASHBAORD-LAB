import { cookies } from 'next/headers';
import { ok, fail } from '@/lib/api/response';
import { assertPlanId, PLANS } from '@/lib/plans';
import prisma from '@/lib/prisma';
import { rateLimitOrThrow } from '@/lib/security/rateLimit';
import { getOrCreateRequestId } from '@/lib/security/requestId';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const requestId = getOrCreateRequestId(req);

  const limited = await rateLimitOrThrow(req, {
    name: 'pix_criar',
    limit: 30,
    windowMs: 60_000,
    requestId,
  });
  if (limited) return limited;

  const cookieStore = await cookies();
  const token = cookieStore.get('lps_token')?.value;
  if (!token) return fail('UNAUTHORIZED', { requestId });

  const body = await req.json().catch(() => ({}));
  const { planId } = body || {};

  try {
    assertPlanId(planId);
  } catch {
    return fail('BAD_REQUEST', { requestId });
  }

  const sessao = await prisma.sessaoPagamento.findUnique({ where: { token } });
  if (!sessao) return fail('NOT_FOUND', { requestId, status: 404 });

  const pix = {
    chargeId: `stub_charge_${Date.now()}`,
    orderId: `stub_order_${Date.now()}`,
    qrCode: 'STUB_QR_CODE_DATA',
    pixCopiaECola: 'STUB_PIX_COPIA_E_COLA',
  };

  await prisma.sessaoPagamento.update({
    where: { token },
    data: {
      planoId: planId,
      planoMinutos: PLANS[planId].minutes,
      chargeId: pix.chargeId,
      orderId: pix.orderId,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });

  return ok(pix, { requestId });
}

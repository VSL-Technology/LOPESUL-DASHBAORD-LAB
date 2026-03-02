import { ok } from '@/lib/api/response';
import { getOrCreateRequestId } from '@/lib/security/requestId';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const requestId = getOrCreateRequestId(req);
  return ok({ status: 'alive' }, { requestId });
}

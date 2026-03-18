import { verifyRelayRequest } from '@/lib/security/verifyRelayHmac';

export async function GET(req: Request) {
  const authorized = await verifyRelayRequest(req);

  if (!authorized) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return Response.json({
    status: 'ok',
    scope: 'internal',
    relay: true,
  });
}

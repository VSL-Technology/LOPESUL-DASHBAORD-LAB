import { checkInternalAuth } from '@/lib/security/internalAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!checkInternalAuth(req)) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const body = JSON.stringify({ ok: true, app: 'backend', ts: Date.now() });
  return new Response(body, {
    headers: { 'content-type': 'application/json' },
  });
}

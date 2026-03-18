import { relaySignedCall } from '@/lib/relayClient';

export async function GET() {
  try {
    const relay = await relaySignedCall('/relay/health');
    return Response.json({ ok: true, relay });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'relay error';
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

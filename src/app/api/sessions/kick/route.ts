import { NextResponse } from 'next/server';
import { relayServerRequest } from '@/lib/relayServerClient';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const sessionId = body?.sessionId;
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: 'sessionId_required' }, { status: 400 });
    }

    const result = await relayServerRequest('/session/kick', {
      method: 'POST',
      body: { sessionId },
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    logger.error({ err: error?.message || error }, '[sessions.kick] error');
    return NextResponse.json({ ok: false, error: 'relay_error' }, { status: 500 });
  }
}

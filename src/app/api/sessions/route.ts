import { NextResponse } from 'next/server';
import { relayServerRequest } from '@/lib/relayServerClient';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const result = await relayServerRequest('/session/active');
    const sessions = Array.isArray(result?.sessions) ? result.sessions : [];
    return NextResponse.json({ ok: true, sessions });
  } catch (error) {
    logger.error({ err: error?.message || error }, '[sessions] fetch error');
    return NextResponse.json({ ok: false, error: 'relay_error' }, { status: 500 });
  }
}

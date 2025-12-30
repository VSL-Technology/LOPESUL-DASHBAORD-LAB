import { NextResponse } from 'next/server';
import { checkInternalAuth } from '@/lib/security/internalAuth';
import { getApiMetrics } from '@/lib/metrics/index';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!checkInternalAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(getApiMetrics(), {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}

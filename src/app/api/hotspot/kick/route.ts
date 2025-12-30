// app/api/hotspot/kick/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { relayFetch } from '@/lib/relay';
import { checkInternalAuth } from '@/lib/security/internalAuth';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';

const BodySchema = z.object({
  id: z.string().trim().min(1, 'id obrigatório'),
});

export async function POST(req: Request) {
  const started = Date.now();
  if (!checkInternalAuth(req)) {
    logger.warn({}, '[hotspot/kick] unauthorized');
    recordApiMetric('hotspot_kick', { durationMs: Date.now() - started, ok: false });
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, '[hotspot/kick] invalid payload');
      recordApiMetric('hotspot_kick', { durationMs: Date.now() - started, ok: false });
      return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
    }
    const r = await relayFetch('/hotspot/kick', {
      method: 'POST',
      body: JSON.stringify({ id: parsed.data.id }),
    });
    const j = await r.json();
    recordApiMetric('hotspot_kick', { durationMs: Date.now() - started, ok: r.ok });
    return NextResponse.json(j, { status: r.status });
  } catch {
    recordApiMetric('hotspot_kick', { durationMs: Date.now() - started, ok: false });
    return NextResponse.json({ ok:false, error:'relay_unreachable' }, { status: 502 });
  }
}

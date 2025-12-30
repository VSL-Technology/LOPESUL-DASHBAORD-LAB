// app/api/hotspot/kick/by-user/route.ts
import { z } from 'zod';
import { relayFetch } from '@/lib/relay';
import { checkInternalAuth } from '@/lib/security/internalAuth';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: cors(),
  });
}

const BodySchema = z.object({
  user: z.string().trim().min(2, 'missing user'),
});

export async function POST(req: Request) {
  const started = Date.now();
  if (!checkInternalAuth(req)) {
    logger.warn({}, '[hotspot/kick/by-user] unauthorized');
    recordApiMetric('hotspot_kick_user', { durationMs: Date.now() - started, ok: false });
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);

  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, '[hotspot/kick/by-user] invalid payload');
    recordApiMetric('hotspot_kick_user', { durationMs: Date.now() - started, ok: false });
    return json({ ok: false, error: 'missing user' }, 400);
  }

  try {
    const r = await relayFetch('/hotspot/kick/by-user', {
      method: 'POST',
      body: JSON.stringify({ user: parsed.data.user }),
    });
    const j = await r.json().catch(() => ({}));
    recordApiMetric('hotspot_kick_user', { durationMs: Date.now() - started, ok: r.ok });
    return json(j, r.status);
  } catch {
    recordApiMetric('hotspot_kick_user', { durationMs: Date.now() - started, ok: false });
    return json({ ok: false, error: 'relay_unreachable' }, 502);
  }
}

/* helpers */
function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}
function json(payload: any, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: cors() });
}

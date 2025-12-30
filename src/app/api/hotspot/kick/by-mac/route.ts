// app/api/hotspot/kick/by-mac/route.ts
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
  mac: z.string().trim().regex(/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/, 'invalid mac'),
});

export async function POST(req: Request) {
  const started = Date.now();
  if (!checkInternalAuth(req)) {
    logger.warn({}, '[hotspot/kick/by-mac] unauthorized');
    recordApiMetric('hotspot_kick_mac', { durationMs: Date.now() - started, ok: false });
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);

  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, '[hotspot/kick/by-mac] invalid payload');
    recordApiMetric('hotspot_kick_mac', { durationMs: Date.now() - started, ok: false });
    return json({ ok: false, error: 'invalid mac' }, 400);
  }

  try {
    const r = await relayFetch('/hotspot/kick/by-mac', {
      method: 'POST',
      body: JSON.stringify({ mac: parsed.data.mac }),
    });
    const j = await r.json().catch(() => ({}));
    recordApiMetric('hotspot_kick_mac', { durationMs: Date.now() - started, ok: r.ok });
    return json(j, r.status);
  } catch {
    recordApiMetric('hotspot_kick_mac', { durationMs: Date.now() - started, ok: false });
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

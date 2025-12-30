// app/api/relay/exec/route.ts
import { z } from 'zod';
import { relayFetch } from '@/lib/relayFetch';
import { requireDeviceRouter } from '@/lib/device-router';
import { checkInternalAuth } from '@/lib/security/internalAuth';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// CORS (preflight)
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

const BodySchema = z.object({
  command: z.string().min(2),
  deviceId: z.string().trim().optional().nullable(),
  dispositivoId: z.string().trim().optional().nullable(),
  mikId: z.string().trim().optional().nullable(),
  routerId: z.string().trim().optional().nullable(),
});

export async function POST(req: Request) {
  const started = Date.now();
  if (!checkInternalAuth(req)) {
    logger.warn({}, '[relay/exec] unauthorized');
    recordApiMetric('relay_exec', { durationMs: Date.now() - started, ok: false });
    return corsJson({ ok: false, error: 'Unauthorized' }, 401);
  }
  const body = await req.json().catch(() => ({} as any));
  const parsed = BodySchema.safeParse(body);

  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, '[relay/exec] invalid payload');
    recordApiMetric('relay_exec', { durationMs: Date.now() - started, ok: false });
    return corsJson({ ok: false, error: 'missing command' }, 400);
  }
  const { command, deviceId, dispositivoId, mikId, routerId } = parsed.data;

  const asString = (value: any) => {
    if (typeof value === 'string') return value;
    if (value == null) return null;
    return String(value);
  };
  const deviceInput = {
    deviceId: asString(deviceId ?? dispositivoId),
    mikId: asString(mikId ?? routerId),
  };

  let routerInfo;
  try {
    routerInfo = await requireDeviceRouter(deviceInput);
  } catch (err: any) {
    return corsJson(
      { ok: false, error: err?.code || 'device_not_found', detail: err?.message },
      err?.code === 'device_not_found' ? 404 : 400,
    );
  }

  try {
    const r = await relayFetch(
      '/relay/exec',
      {
        tokenEnv: 'RELAY_TOKEN_EXEC',
        body: {
          host: routerInfo.router.host,
          user: routerInfo.router.user,
          pass: routerInfo.router.pass,
          port: routerInfo.router.port,
          command,
        },
        timeoutMs: 5000,
      } as any
    );

    recordApiMetric('relay_exec', { durationMs: Date.now() - started, ok: r.ok });
    return corsJson(r.json, r.status || (r.ok ? 200 : 502));
  } catch (err) {
    logger.error({ error: err?.message || err }, '[relay/exec] relay unreachable');
    recordApiMetric('relay_exec', { durationMs: Date.now() - started, ok: false });
    return corsJson({ ok: false, error: 'relay_unreachable' }, 502);
  }
}

/** Helper p/ JSON + CORS */
function corsJson(payload: any, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

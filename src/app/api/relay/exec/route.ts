// app/api/relay/exec/route.ts
import { z } from 'zod';
import { relayFetchSigned } from '@/lib/relayFetchSigned';
import { requireDeviceRouter } from '@/lib/device-router';
import { checkInternalAuth } from '@/lib/security/internalAuth';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function resolveRelayBaseUrl() {
  const base = process.env.RELAY_BASE_URL || process.env.RELAY_URL || process.env.RELAY_BASE || '';
  return base.replace(/\/+$/, '');
}

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

  const relayBaseUrl = resolveRelayBaseUrl();
  const relayToken = process.env.RELAY_TOKEN_EXEC || '';
  const apiSecret = process.env.RELAY_API_SECRET || '';

  if (!relayBaseUrl || !relayToken || !apiSecret) {
    logger.error(
      { hasBase: !!relayBaseUrl, hasToken: !!relayToken, hasSecret: !!apiSecret },
      '[relay/exec] missing relay config'
    );
    recordApiMetric('relay_exec', { durationMs: Date.now() - started, ok: false });
    return corsJson({ ok: false, error: 'relay_config_missing' }, 500);
  }

  try {
    const resp = await relayFetchSigned({
      method: 'POST',
      originalUrl: '/relay/exec',
      body: {
        host: routerInfo.router.host,
        user: routerInfo.router.user,
        pass: routerInfo.router.pass,
        port: routerInfo.router.port,
        command,
      },
      baseUrl: relayBaseUrl,
      token: relayToken,
      apiSecret,
    });

    recordApiMetric('relay_exec', { durationMs: Date.now() - started, ok: resp.ok });
    return corsJson(resp.data ?? resp, resp.status || (resp.ok ? 200 : 502));
  } catch (err: any) {
    const status = err?.status || 502;
    const payload = err?.data || { ok: false, error: err?.message || 'relay_unreachable' };
    logger.error({ error: err?.message || err, status }, '[relay/exec] relay unreachable');
    recordApiMetric('relay_exec', { durationMs: Date.now() - started, ok: false });
    return corsJson(payload, status);
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

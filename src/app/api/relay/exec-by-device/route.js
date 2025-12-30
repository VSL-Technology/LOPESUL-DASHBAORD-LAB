import { z } from 'zod';
import { relayFetch } from '@/lib/relayFetch';
import { requireDeviceRouter } from '@/lib/device-router';
import { checkInternalAuth } from '@/lib/security/internalAuth';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
  command: z.string().trim().optional().nullable(),
  sentences: z.array(z.any()).optional().nullable(),
  deviceId: z.string().trim().optional().nullable(),
  mikId: z.string().trim().optional().nullable(),
});

export async function POST(req) {
  const started = Date.now();
  if (!checkInternalAuth(req)) {
    logger.warn({}, '[relay/exec-by-device] unauthorized');
    recordApiMetric('relay_exec_device', { durationMs: Date.now() - started, ok: false });
    return corsJson({ ok: false, error: 'Unauthorized' }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);

  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, '[relay/exec-by-device] invalid payload');
    recordApiMetric('relay_exec_device', { durationMs: Date.now() - started, ok: false });
    return corsJson({ ok: false, error: 'invalid payload' }, 400);
  }
  const command = typeof parsed.data.command === 'string' ? parsed.data.command.trim() : '';
  const sentences = Array.isArray(parsed.data.sentences) ? parsed.data.sentences : null;

  if (!command && (!sentences || sentences.length === 0)) {
    return corsJson({ ok: false, error: 'missing command' }, 400);
  }

  const asString = (value) => {
    if (typeof value === 'string') return value;
    if (value == null) return null;
    return String(value);
  };

  let routerInfo;
  try {
    routerInfo = await requireDeviceRouter({
      deviceId: asString(parsed.data.deviceId),
      mikId: asString(parsed.data.mikId),
    });
  } catch (err) {
    return corsJson(
      { ok: false, error: err?.code || 'device_not_found', detail: err?.message },
      err?.code === 'device_not_found' ? 404 : 400,
    );
  }

  const payload = {
    host: routerInfo.router.host,
    user: routerInfo.router.user,
    pass: routerInfo.router.pass,
    port: routerInfo.router.port,
  };

  if (sentences && sentences.length) {
    payload.sentences = sentences;
  } else {
    payload.command = command;
  }

  try {
    const r = await relayFetch('/relay/exec-by-device', {
      tokenEnv: 'RELAY_TOKEN_EXEC',
      body: payload,
      timeoutMs: 5000,
    });
    recordApiMetric('relay_exec_device', { durationMs: Date.now() - started, ok: r.ok });
    return corsJson(r.json, r.status || (r.ok ? 200 : 502));
  } catch (err) {
    logger.error({ error: err?.message || err }, '[relay/exec-by-device] relay unreachable');
    recordApiMetric('relay_exec_device', { durationMs: Date.now() - started, ok: false });
    return corsJson(
      { ok: false, error: 'relay_unreachable' },
      502,
    );
  }
}

function corsJson(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

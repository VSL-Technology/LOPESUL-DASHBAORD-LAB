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

  const relayBaseUrl = resolveRelayBaseUrl();
  const relayToken = process.env.RELAY_TOKEN_EXEC || '';
  const apiSecret = process.env.RELAY_API_SECRET || '';

  if (!relayBaseUrl || !relayToken || !apiSecret) {
    logger.error(
      { hasBase: !!relayBaseUrl, hasToken: !!relayToken, hasSecret: !!apiSecret },
      '[relay/exec-by-device] missing relay config',
    );
    recordApiMetric('relay_exec_device', { durationMs: Date.now() - started, ok: false });
    return corsJson({ ok: false, error: 'relay_config_missing' }, 500);
  }

  try {
    const resp = await relayFetchSigned({
      method: 'POST',
      originalUrl: '/relay/exec-by-device',
      body: payload,
      baseUrl: relayBaseUrl,
      token: relayToken,
      apiSecret,
    });

    recordApiMetric('relay_exec_device', { durationMs: Date.now() - started, ok: resp.ok });
    return corsJson(resp.data ?? resp, resp.status || (resp.ok ? 200 : 502));
  } catch (err) {
    const status = err?.status || 502;
    const payloadErr = err?.data || { ok: false, error: err?.message || 'relay_unreachable' };
    logger.error({ error: err?.message || err, status }, '[relay/exec-by-device] relay unreachable');
    recordApiMetric('relay_exec_device', { durationMs: Date.now() - started, ok: false });
    return corsJson(
      payloadErr,
      status,
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

import { z } from 'zod';
import { ok, fail, codeFromStatus } from '@/lib/api/response';
import { requireMutationAuth } from '@/lib/auth/requireMutationAuth';
import { findDeviceRecord } from '@/lib/device-router';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';
import { relayFetchSigned } from '@/lib/relayFetchSigned';
import { rateLimitOrThrow } from '@/lib/security/rateLimit';
import { getOrCreateRequestId } from '@/lib/security/requestId';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

const BodySchema = z.object({
  command: z.string().trim().optional().nullable(),
  sentences: z.array(z.any()).optional().nullable(),
  deviceId: z.string().trim().optional().nullable(),
  mikId: z.string().trim().optional().nullable(),
});

export async function POST(req) {
  const started = Date.now();
  const requestId = getOrCreateRequestId(req);

  const auth = await requireMutationAuth(req, { role: 'MASTER', requestId });
  if (auth instanceof Response) return auth;

  const limited = await rateLimitOrThrow(req, {
    name: 'relay_exec_by_device',
    limit: 10,
    windowMs: 60_000,
    requestId,
  });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);

  if (!parsed.success) {
    logger.warn({ route: 'api_relay_exec_by_device', requestId, issues: parsed.error.issues }, '[relay/exec-by-device] invalid payload');
    recordApiMetric('relay_exec_device', { durationMs: Date.now() - started, ok: false });
    return fail('BAD_REQUEST', { requestId });
  }

  const command = typeof parsed.data.command === 'string' ? parsed.data.command.trim() : '';
  const sentences = Array.isArray(parsed.data.sentences) ? parsed.data.sentences : null;

  if (!command && (!sentences || sentences.length === 0)) {
    recordApiMetric('relay_exec_device', { durationMs: Date.now() - started, ok: false });
    return fail('BAD_REQUEST', { requestId });
  }

  const asString = (value) => {
    if (typeof value === 'string') return value;
    if (value == null) return null;
    return String(value);
  };

  let deviceRecord;
  try {
    deviceRecord = await findDeviceRecord({
      deviceId: asString(parsed.data.deviceId),
      mikId: asString(parsed.data.mikId),
    });
  } catch (err) {
    logger.error({ err, requestId, route: 'api_relay_exec_by_device' }, '[relay/exec-by-device] router resolution failed');
    recordApiMetric('relay_exec_device', { durationMs: Date.now() - started, ok: false });
    return fail('INTERNAL_ERROR', { requestId });
  }

  if (!deviceRecord?.mikId) {
    recordApiMetric('relay_exec_device', { durationMs: Date.now() - started, ok: false });
    return fail(codeFromStatus(404), { requestId, status: 404 });
  }

  const payload = {
    mikId: deviceRecord.mikId,
  };

  if (sentences && sentences.length) {
    payload.sentences = sentences;
  } else {
    payload.sentences = [command];
  }

  const relayBaseUrl = (process.env.RELAY_BASE_URL || process.env.RELAY_URL || process.env.RELAY_BASE || '').replace(/\/+$/, '');
  const relayToken = process.env.RELAY_TOKEN_EXEC || '';
  const apiSecret = process.env.RELAY_API_SECRET || '';

  if (!relayBaseUrl || !relayToken || !apiSecret) {
    logger.error(
      { route: 'api_relay_exec_by_device', requestId, hasBase: Boolean(relayBaseUrl), hasToken: Boolean(relayToken), hasSecret: Boolean(apiSecret) },
      '[relay/exec-by-device] missing relay config'
    );
    recordApiMetric('relay_exec_device', { durationMs: Date.now() - started, ok: false });
    return fail('INTERNAL_ERROR', { requestId });
  }

  try {
    const resp = await relayFetchSigned({
      method: 'POST',
      originalUrl: '/relay/exec-by-device',
      body: payload,
      baseUrl: relayBaseUrl,
      token: relayToken,
      apiSecret,
      requestId,
    });

    recordApiMetric('relay_exec_device', { durationMs: Date.now() - started, ok: resp.ok });
    return ok(resp.data ?? resp, { requestId, status: resp.status || (resp.ok ? 200 : 502) });
  } catch (err) {
    const status = Number(err?.status || 500);
    logger.error({ err, requestId, route: 'api_relay_exec_by_device', status }, '[relay/exec-by-device] relay unreachable');
    recordApiMetric('relay_exec_device', { durationMs: Date.now() - started, ok: false });
    return fail(codeFromStatus(status), { requestId, status });
  }
}

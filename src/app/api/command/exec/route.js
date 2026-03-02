// src/app/api/command/exec/route.js

import { z } from 'zod';
import { ok, fail, codeFromStatus } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireDeviceRouter } from '@/lib/device-router';
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
  command: z.string().min(2, 'missing command').max(256),
  deviceId: z.string().trim().optional().nullable(),
  dispositivoId: z.string().trim().optional().nullable(),
  mikId: z.string().trim().optional().nullable(),
  routerId: z.string().trim().optional().nullable(),
});

export async function POST(req) {
  const started = Date.now();
  const requestId = getOrCreateRequestId(req);

  const auth = await requireAuth(req, { role: 'MASTER', requestId });
  if (auth?.error) return auth.response || fail('UNAUTHORIZED', { requestId, status: auth.error });

  const limited = await rateLimitOrThrow(req, {
    name: 'command_exec',
    limit: 10,
    windowMs: 60_000,
    requestId,
  });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);

  if (!parsed.success) {
    logger.warn({ route: 'api_command_exec', requestId, issues: parsed.error.issues }, '[command/exec] invalid payload');
    recordApiMetric('command_exec', { durationMs: Date.now() - started, ok: false });
    return fail('BAD_REQUEST', { requestId });
  }

  const { command, deviceId, dispositivoId, mikId, routerId } = parsed.data;

  const asString = (value) => {
    if (typeof value === 'string') return value;
    if (value == null) return null;
    return String(value);
  };

  let routerInfo;
  try {
    routerInfo = await requireDeviceRouter({
      deviceId: asString(deviceId ?? dispositivoId),
      mikId: asString(mikId ?? routerId),
    });
  } catch (err) {
    const status = err?.code === 'device_not_found' ? 404 : 400;
    recordApiMetric('command_exec', { durationMs: Date.now() - started, ok: false });
    logger.warn({ route: 'api_command_exec', requestId, status }, '[command/exec] router resolution failed');
    return fail(codeFromStatus(status), {
      requestId,
      status,
      meta: { code: err?.code || 'device_resolution_failed' },
    });
  }

  try {
    const out = await relayFetchSigned({
      method: 'POST',
      originalUrl: '/relay/exec',
      body: {
        host: routerInfo.router.host,
        user: routerInfo.router.user,
        pass: routerInfo.router.pass,
        port: routerInfo.router.port,
        command,
      },
      requestId,
    });

    recordApiMetric('command_exec', { durationMs: Date.now() - started, ok: out.ok });
    return ok(out.data ?? {}, { requestId, status: out.status || 200 });
  } catch (err) {
    if (err?.status) {
      recordApiMetric('command_exec', { durationMs: Date.now() - started, ok: false });
      logger.error(
        { route: 'api_command_exec', requestId, status: err.status },
        '[command/exec] relay returned error'
      );
      return fail(codeFromStatus(err.status), { requestId, status: err.status });
    }

    logger.error({ err, requestId, route: 'api_command_exec' }, '[command/exec] relay error');
    recordApiMetric('command_exec', { durationMs: Date.now() - started, ok: false });
    return fail('UPSTREAM_RELAY_DOWN', { requestId, status: 502 });
  }
}

// app/api/relay/exec/route.ts
import { z } from 'zod';
import { ok, fail, codeFromStatus } from '@/lib/api/response';
import { requireMutationAuth } from '@/lib/auth/requireMutationAuth';
import { requireDeviceRouter } from '@/lib/device-router';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';
import { relayFetchSigned } from '@/lib/relayFetchSigned';
import { rateLimitOrThrow } from '@/lib/security/rateLimit';
import { getOrCreateRequestId } from '@/lib/security/requestId';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function resolveRelayBaseUrl() {
  const base = process.env.RELAY_BASE_URL || process.env.RELAY_URL || process.env.RELAY_BASE || '';
  return base.replace(/\/+$/, '');
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
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
  const requestId = getOrCreateRequestId(req);

  const auth = await requireMutationAuth(req, { role: 'MASTER', requestId });
  if (auth instanceof Response) return auth;

  const limited = await rateLimitOrThrow(req, {
    name: 'relay_exec',
    limit: 10,
    windowMs: 60_000,
    requestId,
  });
  if (limited) return limited;

  const body = await req.json().catch(() => ({} as any));
  const parsed = BodySchema.safeParse(body);

  if (!parsed.success) {
    logger.warn({ route: 'api_relay_exec', requestId, issues: parsed.error.issues }, '[relay/exec] invalid payload');
    recordApiMetric('relay_exec', { durationMs: Date.now() - started, ok: false });
    return fail('BAD_REQUEST', { requestId });
  }

  const { command, deviceId, dispositivoId, mikId, routerId } = parsed.data;

  const asString = (value: any) => {
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
    logger.error({ err, requestId, route: 'api_relay_exec' }, '[relay/exec] router resolution failed');
    recordApiMetric('relay_exec', { durationMs: Date.now() - started, ok: false });
    return fail('INTERNAL_ERROR', { requestId });
  }

  const relayBaseUrl = resolveRelayBaseUrl();
  const relayToken = process.env.RELAY_TOKEN_EXEC || '';
  const apiSecret = process.env.RELAY_API_SECRET || '';

  if (!relayBaseUrl || !relayToken || !apiSecret) {
    logger.error(
      { route: 'api_relay_exec', requestId, hasBase: Boolean(relayBaseUrl), hasToken: Boolean(relayToken), hasSecret: Boolean(apiSecret) },
      '[relay/exec] missing relay config'
    );
    recordApiMetric('relay_exec', { durationMs: Date.now() - started, ok: false });
    return fail('INTERNAL_ERROR', { requestId });
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
      requestId,
    });

    recordApiMetric('relay_exec', { durationMs: Date.now() - started, ok: resp.ok });
    return ok(resp.data ?? resp, { requestId, status: resp.status || (resp.ok ? 200 : 502) });
  } catch (err: any) {
    const status = Number(err?.status || 500);
    logger.error({ err, requestId, route: 'api_relay_exec', status }, '[relay/exec] relay unreachable');
    recordApiMetric('relay_exec', { durationMs: Date.now() - started, ok: false });
    return fail(codeFromStatus(status), { requestId, status });
  }
}

// app/api/hotspot/kick/route.ts
import { z } from 'zod';
import { ok, fail, codeFromStatus } from '@/lib/api/response';
import { requireMutationAuth } from '@/lib/auth/requireMutationAuth';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';
import { relayFetchSigned } from '@/lib/relayFetchSigned';
import { rateLimitOrThrow } from '@/lib/security/rateLimit';
import { getOrCreateRequestId } from '@/lib/security/requestId';

const BodySchema = z.object({
  id: z.string().trim().min(1, 'id obrigatório'),
});

export async function POST(req: Request) {
  const started = Date.now();
  const requestId = getOrCreateRequestId(req);

  const auth = await requireMutationAuth(req, { role: 'MASTER', requestId });
  if (auth instanceof Response) return auth;

  const limited = await rateLimitOrThrow(req, {
    name: 'hotspot_kick',
    limit: 10,
    windowMs: 60_000,
    requestId,
  });
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      logger.warn({ route: 'api_hotspot_kick', requestId, issues: parsed.error.issues }, '[hotspot/kick] invalid payload');
      recordApiMetric('hotspot_kick', { durationMs: Date.now() - started, ok: false });
      return fail('BAD_REQUEST', { requestId });
    }

    const out = await relayFetchSigned({
      method: 'POST',
      originalUrl: '/hotspot/kick',
      body: { id: parsed.data.id },
      token: process.env.RELAY_TOKEN_EXEC || process.env.RELAY_TOKEN_TOOLS || process.env.RELAY_TOKEN || '',
      apiSecret: process.env.RELAY_API_SECRET || '',
      requestId,
    });

    recordApiMetric('hotspot_kick', { durationMs: Date.now() - started, ok: out.ok });
    return ok(out.data ?? {}, { requestId, status: out.status || 200 });
  } catch (err: any) {
    if (err?.status) {
      recordApiMetric('hotspot_kick', { durationMs: Date.now() - started, ok: false });
      return fail(codeFromStatus(err.status), { requestId, status: err.status });
    }

    logger.error({ err, requestId, route: 'api_hotspot_kick' }, '[hotspot/kick] unexpected error');
    recordApiMetric('hotspot_kick', { durationMs: Date.now() - started, ok: false });
    return fail('INTERNAL_ERROR', { requestId });
  }
}

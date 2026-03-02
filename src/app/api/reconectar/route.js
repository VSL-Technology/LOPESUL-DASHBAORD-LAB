import { z } from 'zod';
import { ok, fail } from '@/lib/api/response';
import { requireMutationAuth } from '@/lib/auth/requireMutationAuth';
import { validarTokenParaReconeccao } from '@/lib/clientToken';
import { liberarAcessoInteligente } from '@/lib/liberarAcesso';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';
import prisma from '@/lib/prisma';
import { rateLimitOrThrow } from '@/lib/security/rateLimit';
import { getOrCreateRequestId } from '@/lib/security/requestId';

const BodySchema = z.object({
  token: z.string().min(10, 'Token obrigatório'),
  ipAtual: z.string().trim().optional().nullable(),
  macAtual: z.string().trim().optional().nullable(),
});

export async function POST(req) {
  const started = Date.now();
  const requestId = getOrCreateRequestId(req);

  const auth = await requireMutationAuth(req, { role: 'MASTER', requestId });
  if (auth instanceof Response) return auth;

  const limited = await rateLimitOrThrow(req, {
    name: 'reconectar',
    limit: 10,
    windowMs: 60_000,
    requestId,
  });
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      logger.warn({ route: 'api_reconectar', requestId, issues: parsed.error.issues }, '[RECONEXAO] Payload inválido');
      recordApiMetric('reconectar', { durationMs: Date.now() - started, ok: false });
      return fail('BAD_REQUEST', { requestId });
    }

    const token = parsed.data.token.trim();
    const ipAtual = parsed.data.ipAtual ? parsed.data.ipAtual.trim() : undefined;
    const macAtual = parsed.data.macAtual ? parsed.data.macAtual.trim() : undefined;

    const validacao = await validarTokenParaReconeccao({ token, ipAtual, macAtual });
    if (!validacao?.ok) {
      logger.warn({ route: 'api_reconectar', requestId }, '[RECONEXAO] Token inválido ou não elegível');
      recordApiMetric('reconectar', { durationMs: Date.now() - started, ok: false });
      return fail('BAD_REQUEST', { requestId });
    }

    const { pedido, clientToken } = validacao;

    const pedidoCompleto = await prisma.pedido.findUnique({
      where: { id: pedido.id },
      include: { device: true },
    });

    if (!pedidoCompleto) {
      recordApiMetric('reconectar', { durationMs: Date.now() - started, ok: false });
      return fail('NOT_FOUND', { requestId, status: 404 });
    }

    const ipParaLiberar = ipAtual ?? pedidoCompleto.ip ?? clientToken?.ipInicial ?? undefined;
    const macParaLiberar = macAtual ?? pedidoCompleto.deviceMac ?? clientToken?.macInicial ?? undefined;

    const relayResp = await liberarAcessoInteligente({
      pedidoId: pedidoCompleto.id,
      deviceId: pedidoCompleto.deviceId ?? undefined,
      mikId: pedidoCompleto.deviceIdentifier ?? undefined,
      ip: ipParaLiberar,
      mac: macParaLiberar,
      modo: 'RECONEXAO',
    });

    recordApiMetric('reconectar', { durationMs: Date.now() - started, ok: true });
    return ok(
      {
        message: 'Reconexão disparada com sucesso via Relay.',
        pedidoId: pedidoCompleto.id,
        ipLiberado: ipParaLiberar,
        macLiberado: macParaLiberar,
        relay: relayResp,
      },
      { requestId }
    );
  } catch (err) {
    logger.error({ err, requestId, route: 'api_reconectar' }, '[RECONEXAO] Erro inesperado');
    recordApiMetric('reconectar', { durationMs: Date.now() - started, ok: false });
    return fail('INTERNAL_ERROR', { requestId });
  }
}

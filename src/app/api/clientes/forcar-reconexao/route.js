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
  token: z.string().min(8),
  ipAtual: z.string().min(7),
  macAtual: z.string().optional().nullable(),
});

export async function POST(req) {
  const started = Date.now();
  const requestId = getOrCreateRequestId(req);

  const auth = await requireMutationAuth(req, { role: 'MASTER', requestId });
  if (auth instanceof Response) return auth;

  const limited = await rateLimitOrThrow(req, {
    name: 'clientes_forcar_reconexao',
    limit: 10,
    windowMs: 60_000,
    requestId,
  });
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      logger.warn({ route: 'api_clientes_forcar_reconexao', requestId, issues: parsed.error.issues }, '[forcar-reconexao] payload inválido');
      recordApiMetric('clientes_forcar_reconexao', { durationMs: Date.now() - started, ok: false });
      return fail('BAD_REQUEST', { requestId });
    }

    const { token, ipAtual, macAtual } = parsed.data;

    const validacao = await validarTokenParaReconeccao({ token, ipAtual, macAtual });
    if (!validacao.ok || !validacao.pedido) {
      logger.warn({ route: 'api_clientes_forcar_reconexao', requestId }, '[forcar-reconexao] token inválido');
      recordApiMetric('clientes_forcar_reconexao', { durationMs: Date.now() - started, ok: false });
      return fail('BAD_REQUEST', { requestId });
    }

    const pedido = validacao.pedido;

    let mikId = pedido.mikId || null;
    if (!mikId && pedido.deviceId) {
      const device = await prisma.dispositivo.findUnique({ where: { id: pedido.deviceId } });
      mikId = device?.mikId ?? null;
    }

    if (!mikId) {
      recordApiMetric('clientes_forcar_reconexao', { durationMs: Date.now() - started, ok: false });
      return fail('INTERNAL_ERROR', { requestId });
    }

    const libResult = await liberarAcessoInteligente({
      pedidoId: pedido.id,
      mikId,
      ipAtual,
      macAtual,
      modo: 'RECONEXAO',
    });

    if (!libResult.ok) {
      logger.error({ route: 'api_clientes_forcar_reconexao', requestId }, '[forcar-reconexao] falha liberar');
      recordApiMetric('clientes_forcar_reconexao', { durationMs: Date.now() - started, ok: false });
      return fail('INTERNAL_ERROR', { requestId });
    }

    const minutosPadrao = 120;
    const agora = new Date();
    const expiraEm = new Date(agora.getTime() + minutosPadrao * 60 * 1000);

    let sessao = await prisma.sessaoAtiva.findFirst({ where: { pedidoId: pedido.id } });
    if (sessao) {
      sessao = await prisma.sessaoAtiva.update({
        where: { id: sessao.id },
        data: {
          ipCliente: ipAtual,
          macCliente: macAtual ?? null,
          ativo: true,
          expiraEm,
        },
      });
    } else {
      sessao = await prisma.sessaoAtiva.create({
        data: {
          pedidoId: pedido.id,
          roteadorId: libResult.roteadorId ?? null,
          ipCliente: ipAtual,
          macCliente: macAtual ?? null,
          plano: pedido.description || 'Acesso',
          inicioEm: agora,
          expiraEm,
          ativo: true,
        },
      });
    }

    recordApiMetric('clientes_forcar_reconexao', { durationMs: Date.now() - started, ok: true });
    return ok(
      {
        status: 'LIBERADO',
        pedidoId: pedido.id,
        mikId,
        ip: ipAtual,
        mac: macAtual ?? null,
        sessao,
      },
      { requestId }
    );
  } catch (err) {
    logger.error({ err, requestId, route: 'api_clientes_forcar_reconexao' }, '[forcar-reconexao] erro');
    recordApiMetric('clientes_forcar_reconexao', { durationMs: Date.now() - started, ok: false });
    return fail('INTERNAL_ERROR', { requestId });
  }
}

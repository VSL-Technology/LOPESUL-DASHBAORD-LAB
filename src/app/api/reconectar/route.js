import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validarTokenParaReconeccao } from '@/lib/clientToken';
import { liberarAcessoInteligente } from '@/lib/liberarAcesso';
import prisma from '@/lib/prisma';
import { checkInternalAuth } from '@/lib/security/internalAuth';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';

/**
 * Endpoint de reconexão:
 * "Já paguei e não liberou"
 *
 * Body esperado:
 * {
 *   "token": "CLIENT_TOKEN_SALVO_NO_BROWSER",
 *   "ipAtual": "192.168.88.50",
 *   "macAtual": "AA:BB:CC:DD:EE:FF"
 * }
 *
 * - Valida o token (expiração + pedido PAID)
 * - Descobre pedido/device/mikId
 * - Chama Relay em modo RECONEXAO
 */
const BodySchema = z.object({
  token: z.string().min(10, 'Token obrigatório'),
  ipAtual: z.string().trim().optional().nullable(),
  macAtual: z.string().trim().optional().nullable(),
});

export async function POST(req) {
  const started = Date.now();
  if (!checkInternalAuth(req)) {
    logger.warn({}, '[RECONEXAO] Tentativa sem auth interna');
    recordApiMetric('reconectar', { durationMs: Date.now() - started, ok: false });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, '[RECONEXAO] Payload inválido');
      recordApiMetric('reconectar', { durationMs: Date.now() - started, ok: false });
      return NextResponse.json(
        { error: 'Token do cliente é obrigatório.' },
        { status: 400 }
      );
    }
    const token = parsed.data.token.trim();
    const ipAtual = parsed.data.ipAtual ? parsed.data.ipAtual.trim() : undefined;
    const macAtual = parsed.data.macAtual ? parsed.data.macAtual.trim() : undefined;

    logger.info(
      { token, ipAtual, macAtual },
      '[RECONEXAO] Pedido de reconexão recebido'
    );

    // 1) Validar token + pedido (PAID, não expirado, etc.)
    const validacao = await validarTokenParaReconeccao({
      token,
      ipAtual,
      macAtual,
    });

    if (!validacao?.ok) {
      logger.warn({ validacao }, '[RECONEXAO] Token inválido ou não elegível');
      return NextResponse.json(
        {
          error: 'Token inválido ou sessão não elegível para reconexão.',
          detail: validacao,
        },
        { status: 400 }
      );
    }

    const { pedido, clientToken } = validacao;

    logger.info(
      {
        pedidoId: pedido.id,
        status: pedido.status,
        deviceId: pedido.deviceId,
        deviceIdentifier: pedido.deviceIdentifier,
        ipInicial: clientToken?.ipInicial,
        macInicial: clientToken?.macInicial,
      },
      '[RECONEXAO] Token válido, pedido resolvido'
    );

    // 2) (Opcional) recarregar pedido do banco com device
    const pedidoCompleto = await prisma.pedido.findUnique({
      where: { id: pedido.id },
      include: { device: true },
    });

    if (!pedidoCompleto) {
      return NextResponse.json(
        { error: 'Pedido não encontrado na base no momento da reconexão.' },
        { status: 404 }
      );
    }

    // Dados finais que vamos mandar para o Relay:
    const ipParaLiberar = ipAtual ?? pedidoCompleto.ip ?? clientToken?.ipInicial ?? undefined;
    const macParaLiberar = macAtual ?? pedidoCompleto.deviceMac ?? clientToken?.macInicial ?? undefined;

    // 3) Chamar Relay em modo RECONEXAO
    const relayResp = await liberarAcessoInteligente({
      pedidoId: pedidoCompleto.id,
      deviceId: pedidoCompleto.deviceId ?? undefined,
      mikId: pedidoCompleto.deviceIdentifier ?? undefined,
      ip: ipParaLiberar,
      mac: macParaLiberar,
      modo: 'RECONEXAO',
    });

    logger.info({ relayResp }, '[RECONEXAO] Resposta do Relay');

    recordApiMetric('reconectar', { durationMs: Date.now() - started, ok: true });
    return NextResponse.json(
      {
        ok: true,
        message: 'Reconexão disparada com sucesso via Relay.',
        pedidoId: pedidoCompleto.id,
        ipLiberado: ipParaLiberar,
        macLiberado: macParaLiberar,
        relay: relayResp,
      },
      { status: 200 }
    );
  } catch (err) {
    logger.error({ error: err?.message || err }, '[RECONEXAO] Erro inesperado');
    recordApiMetric('reconectar', { durationMs: Date.now() - started, ok: false });
    return NextResponse.json(
      {
        error: 'Erro interno ao tentar reconectar o dispositivo.',
        details: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { liberarAcessoInteligente } from '@/lib/liberarAcesso';
import { validateInternalToken, checkInternalAuth } from '@/lib/security/internalAuth';
import { logger } from '@/lib/logger';

/**
 * Debug: simula o webhook marcando o pedido como PAID
 * e disparando o fluxo inteligente de liberação no Mikrotik via Relay.
 *
 * Body esperado:
 * {
 *   "code": "or_xZljwRAtyfyJyO1n"   // O code do pedido (campo Pedido.code)
 * }
 */
export async function POST(req) {
  try {
    if (!checkInternalAuth(req)) {
      logger.warn({}, '[debug/pay] acesso negado (internal token)');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const validation = validateInternalToken(req);
    if (!validation.ok) {
      logger.warn({ reason: validation.reason }, '[debug/pay] acesso negado');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const code = String(body?.code || '').trim();

    if (!code) {
      return NextResponse.json(
        { error: 'code é obrigatório' },
        { status: 400 }
      );
    }

    // 1) Buscar pedido pelo code
    const pedido = await prisma.pedido.findUnique({
      where: { code },
      include: {
        device: true, // pra já ter mikId/ip se precisar
      },
    });

    if (!pedido) {
      logger.warn({ code }, '[debug/pay] pedido não encontrado');
      return NextResponse.json(
        { error: 'Pedido não encontrado' },
        { status: 404 }
      );
    }

    logger.info(
      {
        id: pedido.id,
        code: pedido.code,
        status: pedido.status,
        hasDevice: Boolean(pedido.deviceId),
      },
      '[debug/pay] pedido encontrado'
    );

    // 2) Marcar como PAID (se já não estiver)
    if (pedido.status !== 'PAID') {
      await prisma.pedido.update({
        where: { id: pedido.id },
        data: { status: 'PAID' },
      });
      logger.info({ pedidoId: pedido.id }, '[debug/pay] pedido marcado como PAID');
    } else {
      logger.info({ pedidoId: pedido.id }, '[debug/pay] pedido já estava PAID, disparando relay');
    }

    // 3) Disparar fluxo inteligente (modo WEBHOOK)
    const relayResp = await liberarAcessoInteligente({
      pedidoId: pedido.id,
      deviceId: pedido.deviceId ?? undefined,
      mikId: pedido.deviceIdentifier ?? undefined,
      ip: pedido.ip ?? undefined,
      mac: pedido.deviceMac ?? undefined,
      modo: 'WEBHOOK', // mesmo modo que o webhook real usa
    });

    logger.info({ response: relayResp }, '[debug/pay] relay executado');

    return NextResponse.json(
      {
        ok: true,
        message: 'Pedido marcado como PAID e Relay chamado com sucesso (modo WEBHOOK).',
        pedidoId: pedido.id,
        relay: relayResp,
      },
      { status: 200 }
    );
  } catch (err) {
    logger.error({ error: err?.message || err }, '[debug/pay] erro inesperado');
    return NextResponse.json(
      {
        error: 'Erro interno ao simular pagamento e chamar Relay.',
        details: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}

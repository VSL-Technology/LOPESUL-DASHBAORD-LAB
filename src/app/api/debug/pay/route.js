// TESTE: curl -X POST https://seu-dominio.com/api/debug/pay
// Esperado em produção: 404
// Esperado em dev com header x-debug-token correto: 200
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { liberarAcessoInteligente } from '@/lib/liberarAcesso';
import { requireMutationAuth } from '@/lib/auth/requireMutationAuth';
import { logger } from '@/lib/logger';
import { applySecurityHeaders } from '@/lib/security/httpGuards';

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
  // PROTEÇÃO A — apenas em desenvolvimento
  if (process.env.NODE_ENV !== 'development') {
    return json({ error: 'Not found' }, 404);
  }
  // PROTEÇÃO B — token de debug obrigatório
  const debugToken = req.headers.get('x-debug-token');
  if (!debugToken || debugToken !== process.env.INTERNAL_DEBUG_TOKEN) {
    return json({ error: 'Not found' }, 404);
  }

  const auth = await requireMutationAuth(req, { role: 'MASTER' });
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const code = String(body?.code || '').trim();

    if (!code) {
      return json(
        { error: 'code é obrigatório' },
        400
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
      return json(
        { error: 'Pedido não encontrado' },
        404
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

    return json(
      {
        ok: true,
        message: 'Pedido marcado como PAID e Relay chamado com sucesso (modo WEBHOOK).',
        pedidoId: pedido.id,
        relay: relayResp,
      },
      200
    );
  } catch (err) {
    logger.error({ error: err?.message || err }, '[debug/pay] erro inesperado');
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
}

function json(payload, status = 200) {
  return applySecurityHeaders(NextResponse.json(payload, { status }), { noStore: true });
}

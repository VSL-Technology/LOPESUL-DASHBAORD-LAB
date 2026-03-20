// src/app/api/payments/card/route.js
import { randomUUID } from 'crypto';
import { ok, fail } from '@/lib/api/response';
import { createCardOrder } from '@/lib/pagarme';
import prisma from '@/lib/prisma';
import { rateLimitOrThrow } from '@/lib/security/rateLimit';
import { getOrCreateRequestId } from '@/lib/security/requestId';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const statusFromGateway = (pgChargeStatus) => {
  switch ((pgChargeStatus || '').toLowerCase()) {
    case 'paid':
    case 'succeeded':
      return 'PAID';
    case 'authorized':
      return 'AUTHORIZED';
    case 'pending':
    case 'processing':
      return 'PENDING';
    case 'canceled':
      return 'CANCELED';
    case 'failed':
    default:
      return 'FAILED';
  }
};

export async function POST(req) {
  const requestId = getOrCreateRequestId(req);

  const limited = await rateLimitOrThrow(req, {
    name: 'payments_card',
    limit: 30,
    windowMs: 60_000,
    requestId,
  });
  if (limited) return limited;

  let body = {};

  try {
    body = await req.json();

    const code = (body.orderId && String(body.orderId).trim()) || randomUUID();
    const amount = Number(body?.valor);

    if (!Number.isFinite(amount) || amount <= 0) {
      return fail('BAD_REQUEST', { requestId });
    }
    if (!body?.cardToken) {
      return fail('BAD_REQUEST', { requestId });
    }

    const customer = body.customer ?? {};
    const description = body.descricao || 'Acesso Wi-Fi';
    const installments = Number(body.installments || 1);

    const metadata = {
      ...(body.metadata || {}),
      deviceMac: body.deviceMac || null,
      ip: body.ip || null,
      busId: body.busId || null,
      origin: 'card',
    };

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.pedido.findUnique({ where: { code } });

      const pedido =
        existing ||
        (await tx.pedido.create({
          data: {
            code,
            amount,
            method: 'CARD',
            status: 'PENDING',
            description,
            deviceMac: metadata.deviceMac,
            ip: metadata.ip,
            busId: metadata.busId,
            customerName: customer?.name || null,
            customerEmail: customer?.email || null,
            customerDoc: customer?.document || null,
            metadata,
          },
        }));

      const items = [{ amount, description, quantity: 1 }];
      const pg = await createCardOrder({
        code,
        customer,
        items,
        metadata,
        cardToken: body.cardToken,
        installments,
        capture: true,
        idempotencyKey: code,
      });

      const pgCharge = pg?.charges?.[0] || null;
      const mappedStatus = statusFromGateway(pgCharge?.status || pg?.status);

      const charge = await tx.charge.upsert({
        where: { providerId: pgCharge?.id ?? `prov-${code}` },
        create: {
          pedidoId: pedido.id,
          providerId: pgCharge?.id || null,
          status: mappedStatus,
          method: 'CARD',
          raw: pg,
        },
        update: {
          status: mappedStatus,
          raw: pg,
        },
      });

      const finalPedido = await tx.pedido.update({
        where: { id: pedido.id },
        data: { status: mappedStatus },
      });

      return { pedido: finalPedido, charge, pg };
    });

    return ok(
      {
        orderId: result.pedido.code,
        status: result.pedido.status,
        chargeId: result.charge?.providerId || null,
        nextAction: result.pg?.next_action || result.pg?.charges?.[0]?.next_action || null,
      },
      { requestId }
    );
  } catch (err) {
    try {
      const code = body?.orderId ? String(body.orderId).trim() : null;
      if (code) {
        await prisma.pedido.update({
          where: { code },
          data: { status: 'FAILED' },
        });
      }
    } catch {
      // ignore
    }

    logger.error({ err, requestId, route: 'api_payments_card' }, '[payments/card] failure');
    return fail('INTERNAL_ERROR', { requestId, status: 500 });
  }
}

// src/app/api/verificar-pagamento/route.js
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { pagarmeGET } from '@/lib/pagarme';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LOOKBACK_MINUTES = 120;

const BodySchema = z.object({
  externalId: z.string().trim().optional(),
  txid: z.string().trim().optional(),
  valor: z.union([z.string(), z.number()]).optional(),
  descricao: z.string().trim().optional(),
  clienteIp: z.string().trim().optional(),
  lookbackMin: z.union([z.string(), z.number()]).optional(),
});

function toCents(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function mapToPtStatus(s) {
  const t = String(s || '').toLowerCase();
  if (t === 'paid' || t === 'success' || t === 'succeeded') return 'pago';
  if (t === 'pending' || t === 'processing' || t === 'waiting_payment') return 'pendente';
  if (t === 'expired') return 'expirado';
  if (t === 'canceled' || t === 'cancelled') return 'cancelado';
  if (t === 'failed' || t === 'error') return 'falhou';
  return 'pendente';
}

async function checkPagarmeByOrderId(orderId) {
  try {
    const order = await pagarmeGET(`/orders/${orderId}`);
    const charge = Array.isArray(order?.charges) ? order.charges[0] : null;
    const trx = charge?.last_transaction || null;
    const st = mapToPtStatus(trx?.status || charge?.status || order?.status);

    if (st === 'pago') {
      try {
        const pedido = await prisma.pedido.findUnique({
          where: { code: orderId },
        });
        if (pedido && pedido.status !== 'PAID') {
          await prisma.pedido.update({
            where: { id: pedido.id },
            data: { status: 'PAID' },
          });
          logger.info(
            { orderId },
            '[verificar-pagamento] Pedido marcado como PAID'
          );
        }
      } catch (dbErr) {
        logger.error(
          { error: dbErr?.message, orderId },
          '[verificar-pagamento] Erro ao atualizar pedido'
        );
      }
    }

    return {
      encontrado: true,
      status: st,
      pago: st === 'pago',
      externalId: order?.id || orderId,
      txid: trx?.id || charge?.id || null,
    };
  } catch (e) {
    logger.error(
      { error: e?.message, orderId },
      '[verificar-pagamento] Erro ao consultar orderId'
    );
    return {
      encontrado: false,
      pago: false,
      status: 'desconhecido',
      detail: e?.message || String(e),
    };
  }
}

export async function POST(req) {
  const started = Date.now();
  let ok = false;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      logger.warn(
        { issues: parsed.error.issues },
        '[verificar-pagamento] Payload inválido'
      );
      return NextResponse.json(
        { error: 'Payload inválido' },
        { status: 400 }
      );
    }

    const {
      externalId,
      txid,
      valor,
      descricao,
      clienteIp,
      lookbackMin,
    } = parsed.data;

    if (externalId && /^or_/i.test(String(externalId))) {
      const out = await checkPagarmeByOrderId(externalId);
      ok = true;
      return NextResponse.json(out);
    }

    if (externalId) {
      try {
        const pedido = await prisma.pedido.findUnique({
          where: { code: externalId },
          select: {
            id: true,
            status: true,
            code: true,
            charges: {
              select: {
                id: true,
                providerId: true,
                status: true,
                qrCode: true,
                qrCodeUrl: true,
              },
            },
          },
        });

        if (!pedido) {
          ok = true;
          return NextResponse.json({
            encontrado: false,
            pago: false,
            status: 'desconhecido',
          });
        }

        const pago = pedido.status === 'PAID';
        ok = true;
        return NextResponse.json({
          encontrado: true,
          pagamentoId: pedido.id,
          status: pago ? 'pago' : mapToPtStatus(pedido.status),
          pago,
          externalId: pedido.code,
          charges: pedido.charges,
        });
      } catch (e) {
        const out = await checkPagarmeByOrderId(externalId);
        ok = true;
        return NextResponse.json(out);
      }
    }

    if (txid) {
      const charge = await prisma.charge.findFirst({
        where: { providerId: txid },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          providerId: true,
          pedido: {
            select: { id: true, status: true, code: true },
          },
        },
      });

      if (!charge) {
        ok = true;
        return NextResponse.json({
          encontrado: false,
          pago: false,
          status: 'desconhecido',
        });
      }

      const pago = charge.status === 'PAID';
      ok = true;
      return NextResponse.json({
        encontrado: true,
        pagamentoId: charge.pedido.id,
        status: pago ? 'pago' : mapToPtStatus(charge.pedido.status),
        pago,
        externalId: charge.pedido.code,
        txid: charge.providerId,
      });
    }

    const valorCent = toCents(valor);
    if (valorCent == null || !descricao) {
      return NextResponse.json(
        {
          error:
            'Informe externalId, txid, ou (valor + descricao) para verificar.',
        },
        { status: 400 }
      );
    }

    const minutes = Number.isFinite(Number(lookbackMin))
      ? Number(lookbackMin)
      : DEFAULT_LOOKBACK_MINUTES;
    const from = new Date(Date.now() - minutes * 60 * 1000);

    const pedido = await prisma.pedido.findFirst({
      where: {
        amount: valorCent,
        description: descricao,
        createdAt: { gte: from },
        ...(clienteIp ? { ip: clienteIp } : {}),
      },
      orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        status: true,
        code: true,
        charges: {
          select: { id: true, providerId: true, status: true },
        },
      },
    });

    if (!pedido) {
      ok = true;
      return NextResponse.json({
        encontrado: false,
        pago: false,
        status: 'desconhecido',
      });
    }

    ok = true;
    return NextResponse.json({
      encontrado: true,
      pagamentoId: pedido.id,
      status: pedido.status === 'PAID' ? 'pago' : mapToPtStatus(pedido.status),
      pago: pedido.status === 'PAID',
      externalId: pedido.code,
      charges: pedido.charges,
    });
  } catch (error) {
    logger.error(
      { error: error?.message },
      '[verificar-pagamento] Erro inesperado'
    );
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  } finally {
    recordApiMetric('verificar-pagamento', {
      durationMs: Date.now() - started,
      ok,
    });
  }
}

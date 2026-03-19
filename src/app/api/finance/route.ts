import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { formatPlanLabel } from '@/lib/formatCurrency';
import { logger } from '@/lib/logger';

const APPROVED = ['PAID', 'paid', 'pago', 'aprovado', 'approved'];

function isApproved(status) {
  if (!status) return false;
  const normalized = String(status).toUpperCase();
  return APPROVED.includes(normalized);
}

function toDayString(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET() {
  try {
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);

    const pedidos = await prisma.pedido.findMany({
      where: {
        status: { in: ['PAID', 'paid', 'pago', 'aprovado', 'approved'] },
        createdAt: { gte: sevenDaysAgo },
      },
      select: {
        amount: true,
        status: true,
        createdAt: true,
        description: true,
        plano: true,
      },
    });

    const approved = pedidos.filter((p) => isApproved(p.status));
    const receitaHoje = approved
      .filter((p) => toDayString(p.createdAt) === toDayString(today))
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    const receitaMes = approved
      .filter((p) => p.createdAt >= firstOfMonth)
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const planoMap = new Map();
    approved.forEach((p) => {
      const plano = formatPlanLabel(p.description || p.plano || 'Acesso');
      const entry = planoMap.get(plano) || { total: 0, quantidade: 0 };
      entry.total += p.amount || 0;
      entry.quantidade += 1;
      planoMap.set(plano, entry);
    });

    const vendasPorPlano = Array.from(planoMap.entries()).map(([plano, value]) => ({
      plano,
      total: value.total,
      quantidade: value.quantidade,
    }));

    const daysMap = new Map();
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      daysMap.set(toDayString(day), 0);
    }

    approved.forEach((p) => {
      const dia = toDayString(p.createdAt);
      if (daysMap.has(dia)) {
        daysMap.set(dia, (daysMap.get(dia) || 0) + (p.amount || 0));
      }
    });

    const vendasPorDia = Array.from(daysMap.entries())
      .map(([dia, total]) => ({ dia, total }))
      .sort((a, b) => (a.dia < b.dia ? -1 : 1));

    const totalSessoes = await prisma.pedido.count({ where: { status: { in: ['PAID', 'paid', 'pago', 'aprovado', 'approved'] } } });

    return NextResponse.json({
      ok: true,
      data: {
        receitaHoje: receitaHoje / 100,
        receitaMes: receitaMes / 100,
        totalSessoes,
        sessoesAtivas: totalSessoes,
        vendasPorPlano,
        vendasPorDia,
      },
    });
  } catch (error) {
    logger.error({ err: error?.message || error }, '[finance] aggregate error');
    return NextResponse.json({ ok: false, error: 'finance_error' }, { status: 500 });
  }
}

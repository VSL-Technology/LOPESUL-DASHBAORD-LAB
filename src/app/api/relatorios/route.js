// src/app/api/relatorios/route.js
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics';
import { getRequestAuth } from '@/lib/auth/context';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 185;

const QuerySchema = z.object({
  from: z.string().regex(DATE_RE, 'Use YYYY-MM-DD').optional(),
  to: z.string().regex(DATE_RE, 'Use YYYY-MM-DD').optional(),
});

const toNumber = (v) => Number(v || 0);
const ymd = (d) => d.toISOString().slice(0, 10);
const atStartOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const atEndOfDay   = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };

function rangeDays(startDate, endDate) {
  const out = [];
  const cur = atStartOfDay(startDate);
  const end = atEndOfDay(endDate);
  for (let d = new Date(cur); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(ymd(new Date(d)));
  }
  return out;
}

export async function GET(req) {
  const started = Date.now();
  let ok = false;
  try {
    const auth = await getRequestAuth();
    if (!auth.session) {
      return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
    }
    if (auth.maintenance && !auth.isMaster) {
      logger.warn({ role: auth.role }, '[relatorios] bloqueado por manutenção');
      return NextResponse.json(
        { error: 'Modo manutenção ativo. Apenas operadores Master podem continuar.' },
        { status: 423 }
      );
    }

    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      from: url.searchParams.get('from') || undefined,
      to: url.searchParams.get('to') || undefined,
    });
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, '[relatorios] Query inválida');
      return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    }

    const today = new Date();
    let start = atStartOfDay(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000));
    let end = atEndOfDay(today);

    if (parsed.data.from) start = atStartOfDay(new Date(parsed.data.from));
    if (parsed.data.to) end = atEndOfDay(new Date(parsed.data.to));

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Datas inválidas.' }, { status: 400 });
    }
    if (start > end) {
      return NextResponse.json({ error: '"from" deve ser anterior a "to".' }, { status: 400 });
    }

    const daysDiff = Math.ceil((atStartOfDay(end) - atStartOfDay(start)) / (1000 * 60 * 60 * 24)) + 1;
    if (daysDiff > MAX_DAYS) {
      return NextResponse.json({ error: `Intervalo máximo de ${MAX_DAYS} dias.` }, { status: 400 });
    }

    const dias = rangeDays(start, end);

    const [
      frotas,
      dispositivosCount,
      operadoresCount,
      sessoesAtivasCount,
      vendasPeriodo,
      pedidosPagoPeriodo,
      vendasPorFrotaPeriodoAgg,
      vendasAggPeriodo,
      pedidosPagoAggPeriodo,
      qtdPagos,
      qtdPendentes,
      qtdExpirados,
    ] = await Promise.all([
      prisma.frota.findMany({
        orderBy: { criadoEm: 'desc' },
        include: { _count: { select: { dispositivos: true } } },
      }).catch(() => []),
      prisma.dispositivo.count().catch(() => 0),
      prisma.operador.count().catch(() => 0),
      prisma.sessaoAtiva.count({ where: { ativo: true } }).catch(() => 0),
      prisma.venda.findMany({
        where: { data: { gte: start, lte: end } },
        select: { data: true, valorCent: true, frotaId: true },
      }).catch(() => []),
      prisma.pedido.findMany({
        where: { status: 'PAID', updatedAt: { gte: start, lte: end } },
        select: { updatedAt: true, amount: true },
      }).catch(() => []),
      prisma.venda.groupBy({
        by: ['frotaId'],
        where: { data: { gte: start, lte: end } },
        _sum: { valorCent: true },
      }).catch(() => []),
      prisma.venda.aggregate({
        _sum: { valorCent: true },
        _count: { _all: true },
        where: { data: { gte: start, lte: end } },
      }).catch(() => ({ _sum: { valorCent: 0 }, _count: { _all: 0 } })),
      prisma.pedido.aggregate({
        _sum: { amount: true },
        where: { status: 'PAID', updatedAt: { gte: start, lte: end } },
      }).catch(() => ({ _sum: { amount: 0 } })),
      prisma.pedido.count({
        where: { status: 'PAID', updatedAt: { gte: start, lte: end } },
      }).catch(() => 0),
      prisma.pedido.count({
        where: { status: 'PENDING', createdAt: { gte: start, lte: end } },
      }).catch(() => 0),
      prisma.pedido.count({
        where: { status: 'EXPIRED', createdAt: { gte: start, lte: end } },
      }).catch(() => 0),
    ]);

    const vendasMap = new Map(dias.map((k) => [k, 0]));
    for (const v of vendasPeriodo) {
      const k = ymd(new Date(v.data));
      vendasMap.set(k, toNumber(vendasMap.get(k)) + toNumber(v.valorCent) / 100);
    }
    const vendasPorDia = dias.map((k) => ({ dia: k, vendas: vendasMap.get(k) || 0 }));

    const pagosMap = new Map(dias.map((k) => [k, 0]));
    for (const p of pedidosPagoPeriodo) {
      const k = ymd(new Date(p.updatedAt));
      pagosMap.set(k, toNumber(pagosMap.get(k)) + toNumber(p.amount) / 100);
    }
    const pagamentosPorDia = dias.map((k) => ({ dia: k, pagos: pagosMap.get(k) || 0 }));

    const somaPorFrota = new Map(
      (vendasPorFrotaPeriodoAgg || []).map((v) => [v.frotaId, toNumber(v._sum?.valorCent) / 100])
    );
    const porFrota = (frotas || [])
      .map((f) => ({
        id: f.id,
        nome: f.nome ?? `Frota ${f.id.slice(0, 4)}`,
        valor: somaPorFrota.get(f.id) || 0,
        dispositivos: f._count?.dispositivos || 0,
        status: (f._count?.dispositivos || 0) > 0 ? 'desconhecido' : 'offline',
      }))
      .sort((a, b) => b.valor - a.valor);

    const totalVendasReais = toNumber(vendasAggPeriodo._sum?.valorCent) / 100;
    const totalPagosReais = toNumber(pedidosPagoAggPeriodo._sum?.amount) / 100;

    const resposta = {
      periodo: { from: ymd(start), to: ymd(end), days: dias.length },
      resumo: {
        totalVendas: totalVendasReais,
        qtdVendas: vendasAggPeriodo._count?._all || 0,
        totalPagos: totalPagosReais,
        qtdPagos,
        qtdPendentes,
        qtdExpirados,
        frotasCount: frotas?.length || 0,
        dispositivosCount,
        operadoresCount,
        sessoesAtivasCount,
      },
      series: {
        vendasPorDia,
        pagamentosPorDia,
      },
      porFrota,
    };

    ok = true;
    return NextResponse.json(resposta, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    logger.error({ error: err?.message }, '[relatorios] Erro inesperado');
    return NextResponse.json({ error: 'Erro ao montar relatórios' }, { status: 500 });
  } finally {
    recordApiMetric('relatorios', { durationMs: Date.now() - started, ok });
  }
}

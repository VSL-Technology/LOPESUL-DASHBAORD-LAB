// runtime & caching
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { relayIdentityStatus } from '@/lib/relayClient';

/**
 * GET /api/frotas/[id]
 * Retorna detalhes da frota: dispositivos, vendas e status técnico.
 */
export async function GET(_req, context) {
  try {
    const { id } = await context.params;
    const cleanId = String(id || '').trim();
    if (!cleanId) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    // 1) Busca frota no banco
    const frota = await prisma.frota.findUnique({
      where: { id: cleanId },
      include: {
        _count: { select: { dispositivos: true, vendas: true } },
        dispositivos: true,
        roteador: {
          select: { id: true, nome: true, identity: true, ipLan: true },
        },
      },
    });
    if (!frota) return NextResponse.json({ error: 'Frota não encontrada' }, { status: 404 });

    // 2) Vendas no período (últimos X dias)
    const days = 7;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const vendasPeriodo = await prisma.venda.findMany({
      where: { frotaId: cleanId, data: { gte: since } },
      select: { valorCent: true },
      take: 10000,
    });
    const receitaCentavos = (vendasPeriodo ?? []).reduce(
      (acc, v) => acc + (Number(v?.valorCent) || 0),
      0
    );

    // 3) Status técnico (fonte de verdade: Relay)
    const ips = (frota.dispositivos ?? []).map(d => d?.ip).filter(Boolean);
    const ipAtivo = ips[0] ?? null;
    const identity =
      frota.roteador?.identity ||
      (frota.dispositivos?.[0]?.mikId) ||
      (frota.dispositivos?.[0]?.ip) ||
      frota.id;

    const fallbackStatus = {
      state: 'DEGRADED',
      retryInMs: 10000,
      messageCode: 'RELAY_UNAVAILABLE',
    };

    const relayStatus = await (async () => {
      if (!identity) return { identity: null, ...fallbackStatus, messageCode: 'MISSING_ROUTER_IDENTITY' };
      try {
        const st = await relayIdentityStatus(identity);
        return { identity, ...st };
      } catch {
        return { identity, ...fallbackStatus };
      }
    })();

    const status =
      relayStatus.state === 'OK'
        ? 'online'
        : relayStatus.state === 'FAILED'
          ? 'offline'
          : 'desconhecido';
    const pingMs = null;
    const perda = null;

    return NextResponse.json(
      {
        id: frota.id,
        nome: frota.nome ?? `Frota ${frota.id.slice(0, 4)}`,
        placa: frota.placa,
        rotaLinha: frota.rotaLinha,
        statusFrota: frota.status,
        observacoes: frota.observacoes,
        roteadorId: frota.roteadorId,
        roteador: frota.roteador,
        criadoEm: frota.criadoEm,
        acessos: Number(frota._count?.dispositivos ?? 0),
        status,
        ipAtivo,
        pingMs,
        perdaPacotes: perda,
        valorTotal: Number(receitaCentavos / 100),
        valorTotalCentavos: Number(receitaCentavos),
        vendasTotal: Number(frota._count?.vendas ?? 0),
        vendasPeriodoQtd: (vendasPeriodo ?? []).length,
        periodoDias: days,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('GET /api/frotas/[id]', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}

/**
 * PUT /api/frotas/[id]
 * Atualiza dados da frota (incluindo vínculo com Roteador).
 */
export async function PUT(req, context) {
  try {
    const { id } = await context.params;
    const cleanId = String(id || '').trim();
    if (!cleanId) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const {
      nome,
      placa,
      rotaLinha,
      status,
      observacoes,
      roteadorId,
    } = body || {};

    const data = {};
    if (nome !== undefined) data.nome = nome ? String(nome).trim() : null;
    if (placa !== undefined) data.placa = placa ? String(placa).trim() : null;
    if (rotaLinha !== undefined) data.rotaLinha = rotaLinha ? String(rotaLinha).trim() : null;
    if (status !== undefined) data.status = status;
    if (observacoes !== undefined) data.observacoes = observacoes ? String(observacoes).trim() : null;
    if (roteadorId !== undefined) data.roteadorId = roteadorId ? String(roteadorId).trim() : null;

    const updated = await prisma.frota.update({
      where: { id: cleanId },
      data,
      include: {
        roteador: { select: { id: true, nome: true, ipLan: true } },
      },
    });

    return NextResponse.json(
      {
        id: updated.id,
        nome: updated.nome,
        placa: updated.placa,
        rotaLinha: updated.rotaLinha,
        statusFrota: updated.status,
        observacoes: updated.observacoes,
        roteadorId: updated.roteadorId,
        roteador: updated.roteador,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('PUT /api/frotas/[id]', error);
    return NextResponse.json({ error: 'Erro ao atualizar frota' }, { status: 500 });
  }
}

/* ---------- Helpers ---------- */

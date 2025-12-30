// src/app/api/roteadores/[id]/status/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestAuth } from '@/lib/auth/context';
import { relayIdentityStatus } from '@/lib/relayClient';

export async function GET(_req, context) {
  try {
    const auth = await getRequestAuth();
    if (!auth.session) {
      return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
    }
    if (!auth.isMaster) {
      logger.warn({ role: auth.role }, '[roteadores/:id/status] acesso negado');
      return NextResponse.json(
        { error: 'Apenas operadores Master podem consultar status.' },
        { status: 403 }
      );
    }
    const { id } = await context.params;
    const cleanId = String(id || '').trim();
    if (!cleanId) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const roteador = await prisma.roteador.findUnique({ where: { id: cleanId } });
    if (!roteador) {
      return NextResponse.json({ error: 'Roteador não encontrado' }, { status: 404 });
    }

    const identity = roteador.nome || roteador.id;
    const status = await relayIdentityStatus(identity);

    const statusMikrotik =
      status.state === 'OK' ? 'ONLINE' :
      status.state === 'FAILED' ? 'OFFLINE' :
      'DESCONHECIDO';

    const updated = await prisma.roteador.update({
      where: { id },
      data: { statusMikrotik },
      select: {
        id: true,
        nome: true,
        ipLan: true,
        portaApi: true,
        statusMikrotik: true,
      },
    });

  return NextResponse.json(
      {
        ok: true,
        identity,
        status,
        roteador: updated,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const statusCode = Number.isInteger(err?.status) ? err.status : 500;
    console.error('GET /api/roteadores/[id]/status =>', err);
    return NextResponse.json(
      { ok: false, error: 'Erro ao checar status do roteador', detail: err?.detail || null },
      { status: statusCode }
    );
  }
}

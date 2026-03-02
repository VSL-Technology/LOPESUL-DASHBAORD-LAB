// src/app/api/sessoes/[id]/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/requireAuth';
import { logger } from '@/lib/logger';

/* Helper JSON + CORS */
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

/* CORS preflight para DELETE */
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function DELETE(req, context) {
  const auth = await requireAuth(req, { role: 'MASTER' });
  if (auth.error) {
    return Response.json(
      { error: auth.error === 403 ? 'FORBIDDEN' : 'UNAUTHORIZED' },
      { status: auth.error }
    );
  }

  try {
    const { id } = await context.params;
    const cleanId = String(id || '').trim();
    if (!cleanId) return json({ error: 'ID inválido' }, 400);

    const sessao = await prisma.sessaoAtiva.findUnique({
      where: { id: cleanId },
      select: { id: true, ativo: true, ipCliente: true, macCliente: true },
    });

    if (!sessao) return json({ error: 'Sessão não encontrada' }, 404);

    // Idempotente: se já está inativa, não falha
    if (!sessao.ativo) {
      return json({ ok: true, id: sessao.id, note: 'já inativa' });
    }

    const now = new Date();
    await prisma.sessaoAtiva.update({
      where: { id: sessao.id },
      data: { ativo: false, expiraEm: now },
    });

    // (Opcional) Derrubar no Mikrotik aqui.
    // try {
    //   if (process.env.MIKROTIK_HOST) {
    //     const { disconnectByIpMac } = await import('@/lib/router'); // sua lib
    //     await disconnectByIpMac({ ip: sessao.ipCliente, mac: sessao.macCliente });
    //   }
    // } catch (e) {
    //   console.warn('Falha ao derrubar no roteador:', e?.message || e);
    // }

    return json({ ok: true, id: sessao.id });
  } catch (e) {
    logger.error({ error: e?.message || e }, 'DELETE /api/sessoes/[id] error');
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
}

// src/app/api/dispositivos/[id]/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireMutationAuth } from '@/lib/auth/requireMutationAuth';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';
import { applySecurityHeaders } from '@/lib/security/httpGuards';

// CORS preflight
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

// Helper com CORS
function json(payload, status = 200) {
  return applySecurityHeaders(new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  }), { noStore: true });
}

export async function DELETE(req, context) {
  const started = Date.now();
  const auth = await requireMutationAuth(req, { role: 'MASTER' });
  if (auth instanceof Response) return auth;

  try {
    const { id } = await context.params;
    const cleanId = String(id || '').trim();
    if (!cleanId) {
      recordApiMetric('dispositivos_delete', { durationMs: Date.now() - started, ok: false });
      return json({ error: 'ID inválido' }, 400);
    }

    // Se seu schema usa número, e você QUISER aceitar numérico também:
    // const where = /^\d+$/.test(cleanId) ? { id: Number(cleanId) } : { id: cleanId };

    // Como não sabemos o tipo do id, tratamos como string (UUID/Texto)
    const where = { id: cleanId };

    const deleted = await prisma.dispositivo.delete({ where });
    recordApiMetric('dispositivos_delete', { durationMs: Date.now() - started, ok: true });

    return json({
      ok: true,
      message: 'Dispositivo removido com sucesso.',
      id: deleted.id,
    });
  } catch (err) {
    if (err?.code === 'P2025') {
      recordApiMetric('dispositivos_delete', { durationMs: Date.now() - started, ok: false });
      return json({ error: 'Dispositivo não encontrado.' }, 404);
    }
    logger.error({ error: err?.message || err }, '[DELETE /api/dispositivos/:id] erro');
    recordApiMetric('dispositivos_delete', { durationMs: Date.now() - started, ok: false });
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
}

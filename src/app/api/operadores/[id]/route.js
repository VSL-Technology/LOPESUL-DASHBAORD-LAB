// src/app/api/operadores/[id]/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { getRequestAuth } from '@/lib/auth/context';

const RoleSchema = z.enum(['MASTER', 'READER']);

function json(payload, status = 200) {
  return new NextResponse(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function ensureMaster() {
  const auth = await getRequestAuth();
  if (!auth.session || !auth.isMaster) {
    throw new Response(JSON.stringify({ error: 'Apenas operadores Master têm acesso.' }), {
      status: 403,
    });
  }
}

export async function GET(_req, context) {
  try {
    await ensureMaster();
    const { id } = await context.params;
    const cleanId = String(id || '').trim();
    if (!cleanId) return json({ error: 'ID inválido' }, 400);

    const operador = await prisma.operador.findUnique({
      where: { id: cleanId },
      select: { id: true, nome: true, ativo: true, role: true, criadoEm: true },
    });

    if (!operador) return json({ error: 'Operador não encontrado' }, 404);
    return json(operador, 200);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('GET /api/operadores/[id] =>', err);
    return json({ error: 'Erro ao buscar operador' }, 500);
  }
}

export async function PUT(req, context) {
  try {
    await ensureMaster();
    const { id } = await context.params;
    const cleanId = String(id || '').trim();
    if (!cleanId) return json({ error: 'ID inválido' }, 400);

    const body = await req.json().catch(() => ({}));
    const payload = {
      nome: body.nome ?? body.usuario,
      ativo: body.ativo,
      senha: body.senha,
      role: body.role,
    };

    const data = {};
    if (payload.nome?.trim()) data.nome = payload.nome.trim();
    if (typeof payload.ativo === 'boolean') data.ativo = payload.ativo;
    if (payload.role) {
      const parsedRole = RoleSchema.safeParse(payload.role);
      if (parsedRole.success) data.role = parsedRole.data;
    }
    if (payload.senha?.trim()) {
      data.senha = await bcrypt.hash(payload.senha.trim(), 10);
    }

    if (!Object.keys(data).length) {
      return json({ error: 'Nada para atualizar.' }, 400);
    }

    const updated = await prisma.operador.update({
      where: { id: cleanId },
      data,
      select: { id: true, nome: true, ativo: true, role: true, criadoEm: true },
    });

    return json(updated, 200);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('PUT /api/operadores/[id] =>', err);
    return json({ error: 'Erro ao atualizar operador' }, 500);
  }
}

export async function DELETE(_req, context) {
  try {
    await ensureMaster();
    const { id } = await context.params;
    const cleanId = String(id || '').trim();
    if (!cleanId) return json({ error: 'ID inválido' }, 400);

    await prisma.operador.delete({ where: { id: cleanId } });
    return json({ ok: true, id: cleanId }, 200);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('DELETE /api/operadores/[id] =>', err);
    return json({ error: 'Erro ao excluir operador' }, 500);
  }
}

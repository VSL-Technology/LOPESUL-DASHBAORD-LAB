import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getRequestAuth } from '@/lib/auth/context';
import { requireMutationAuth } from '@/lib/auth/requireMutationAuth';
import { applySecurityHeaders } from '@/lib/security/httpGuards';

export const dynamic = 'force-dynamic';

const PasswordSchema = z
  .string()
  .min(8, 'Senha muito curta (mín. 8 caracteres)')
  .max(64, 'Senha muito longa')
  .regex(/[A-Z]/, 'Precisa de pelo menos uma letra maiúscula')
  .regex(/[a-z]/, 'Precisa de pelo menos uma letra minúscula')
  .regex(/[0-9]/, 'Precisa de pelo menos um número')
  .transform((val) => val.trim());

const RoleSchema = z.enum(['MASTER', 'READER'], {
  errorMap: () => ({ message: 'Role inválido' }),
});

const CreateOperadorSchema = z.object({
  nome: z
    .string()
    .min(3, 'Nome muito curto')
    .max(50, 'Nome muito longo')
    .transform((val) => val.trim()),
  senha: PasswordSchema,
  ativo: z.boolean().optional().default(true),
  role: RoleSchema.default('READER'),
});

// ✅ GET /api/operadores → lista operadores sem expor senha
export async function GET(_req, _ctx) {
  try {
    const auth = await getRequestAuth();
    if (!auth.session || !auth.isMaster) {
      return json({ error: 'Apenas Master visualizam operadores.' }, 403);
    }
    const operadores = await prisma.operador.findMany({
      orderBy: { criadoEm: 'desc' },
      select: { id: true, nome: true, ativo: true, role: true, criadoEm: true },
    });

    return json(operadores, 200);
  } catch (err) {
    logger.error({ error: err?.message || err }, 'GET /api/operadores');
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
}

// ✅ POST /api/operadores → cria operador com validação e bcrypt
export async function POST(req, _ctx) {
  const auth = await requireMutationAuth(req, { role: 'MASTER' });
  if (auth instanceof Response) return auth;

  try {
    const raw = await req.json().catch(() => ({}));
    const body = {
      nome: raw.nome ?? raw.usuario,
      senha: raw.senha,
      ativo: raw.ativo,
      role: raw.role,
    };
    const parsed = CreateOperadorSchema.safeParse(body);

    if (!parsed.success) {
      return json({ error: 'Dados inválidos.', details: parsed.error.flatten() }, 400);
    }

    const { nome, senha, ativo, role } = parsed.data;

    const existe = await prisma.operador.findUnique({
      where: { nome },
    });
    if (existe) {
      return json({ error: 'Nome já cadastrado.' }, 409);
    }

    const senhaHash = await bcrypt.hash(senha, 12);

    const novo = await prisma.operador.create({
      data: { nome, senha: senhaHash, ativo, role },
      select: { id: true, nome: true, ativo: true, role: true, criadoEm: true },
    });

    return json(novo, 201);
  } catch (err) {
    logger.error({ error: err?.message || err }, 'POST /api/operadores');
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
}

function json(payload, status = 200) {
  return applySecurityHeaders(NextResponse.json(payload, { status }), { noStore: true });
}

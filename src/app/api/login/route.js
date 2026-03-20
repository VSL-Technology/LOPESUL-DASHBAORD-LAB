// src/app/api/login/route.js
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { auditLog } from '@/lib/auditLogger';
import { getClientIp } from '@/lib/security/requestUtils';
import {
  isLoginBlocked,
  registerLoginAttempt,
} from '@/lib/security/loginGuard';
import { createSessionToken } from '@/lib/auth/session';
import { logger } from '@/lib/logger';
import { getMaintenanceFlag } from '@/lib/config/state';

// topo do arquivo
const DUR = {
  // aceita as duas nomenclaturas
  "30m": 30 * 60,
  "1h":  1  * 60 * 60,
  "3h":  3  * 60 * 60,
  "4h":  4  * 60 * 60,
  "6h":  6  * 60 * 60,
  "8h":  8  * 60 * 60,
  "24h": 24 * 60 * 60,
  "permanente": 100 * 24 * 60 * 60,
  "permanent":  100 * 24 * 60 * 60,
};

// lê default do Config
async function getDefaultSeconds() {
  try {
    const row = await prisma.config.findUnique({ where: { key: 'sessionDefault' }});
    return Number(row?.value) > 0 ? Number(row.value) : (4 * 60 * 60);
  } catch {
    return 4 * 60 * 60;
  }
}

const LoginSchema = z.object({
  usuario: z.string().min(3).max(100).optional(),
  nome: z.string().min(3).max(100).optional(),
  senha: z.string().min(6).max(128).transform((val) => val.trim()),
  duration: z.string().max(20).optional(),
});

export async function POST(req) {
  const ip = getClientIp(req);
  const requestId = req.headers.get('x-request-id') || '';

  try {
    const json = await req.json().catch(() => ({}));
    const parsed = LoginSchema.safeParse(json);

    if (!parsed.success) {
      logger.warn(
        { ip, issues: parsed.error.issues },
        '[AUTH] Payload de login inválido'
      );
      return NextResponse.json(
        { error: 'Usuário ou senha inválidos.' },
        { status: 400 }
      );
    }

    const { usuario, nome, senha, duration } = parsed.data;
    const login = (usuario ?? nome ?? '').trim();

    if (!login) {
      return NextResponse.json(
        { error: 'Usuário ou senha inválidos.' },
        { status: 400 }
      );
    }

    const blocked = await isLoginBlocked({ username: login, ip });
    if (blocked) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Tente novamente mais tarde.' },
        { status: 429 }
      );
    }

    const op = await prisma.operador.findFirst({
      where: { nome: login },
      select: { id: true, nome: true, senha: true, ativo: true, role: true },
    });

    if (!op || op.ativo === false) {
      await registerLoginAttempt({ username: login, ip, success: false });
      await auditLog({
        requestId,
        event: 'AUTH_LOGIN_ATTEMPT',
        actorId: op?.id,
        ip,
        result: 'FAIL',
        metadata: { reason: 'NO_USER_OR_INACTIVE', username: login },
      });
      return NextResponse.json(
        { error: 'Usuário ou senha inválidos.' },
        { status: 401 }
      );
    }

    const isHash = typeof op.senha === 'string' && /^\$2[aby]\$/.test(op.senha);
    let senhaValida = false;

    if (isHash) {
      senhaValida = await bcrypt.compare(senha, op.senha);
    } else if (op.senha) {
      senhaValida = senha === op.senha;
      if (senhaValida) {
        // migra para hash imediatamente
        const novoHash = await bcrypt.hash(senha, 12);
        await prisma.operador.update({
          where: { id: op.id },
          data: { senha: novoHash },
        });
        logger.warn(
          { operadorId: op.id },
          '[AUTH] Operador com senha em plaintext migrado para hash'
        );
      }
    }

    if (!senhaValida) {
      await registerLoginAttempt({ username: login, ip, success: false });
      await auditLog({
        requestId,
        event: 'AUTH_LOGIN_ATTEMPT',
        actorId: op?.id,
        ip,
        result: 'FAIL',
        metadata: { reason: 'INVALID_CREDENTIALS', username: login },
      });
      return NextResponse.json(
        { error: 'Usuário ou senha inválidos.' },
        { status: 401 }
      );
    }

    await registerLoginAttempt({ username: login, ip, success: true });

    await auditLog({
      requestId,
      event: 'AUTH_LOGIN_ATTEMPT',
      actorId: op.id,
      ip,
      result: 'SUCCESS',
      metadata: { username: login },
    });

    const pref = req.cookies.get('session_pref')?.value;
    const chosen =
      (duration && DUR[duration]) ||
      (pref && DUR[pref]) ||
      (await getDefaultSeconds());

    const normalizedRole = String(op.role || '').toUpperCase();
    const role =
      normalizedRole === 'MASTER' || normalizedRole === 'ADMIN'
        ? 'MASTER'
        : 'READER';
    const sessionToken = createSessionToken(
      { id: op.id, nome: op.nome, role },
      chosen
    );
    const maintenance = await getMaintenanceFlag();
    const res = NextResponse.json({ id: op.id, nome: op.nome, role });
    const secureCookie = process.env.NODE_ENV === 'production';

    res.cookies.set('session', sessionToken, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: 'lax',
      path: '/',
      maxAge: chosen,
    });

    res.cookies.set('token', 'ok', {
      httpOnly: true,
      secure: secureCookie,
      sameSite: 'lax',
      path: '/',
      maxAge: chosen,
    });

    res.cookies.set('op', encodeURIComponent(op.nome), {
      path: '/',
      maxAge: chosen,
      sameSite: 'lax',
      secure: secureCookie,
    });

    res.cookies.set('role', role, {
      path: '/',
      maxAge: chosen,
      sameSite: 'lax',
      secure: secureCookie,
    });

    res.cookies.set('maintenance', maintenance ? '1' : '0', {
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
      sameSite: 'lax',
      secure: secureCookie,
    });

    return res;
  } catch (e) {
    console.error({
      route: 'api_login',
      error: e?.message || String(e),
      stack: e?.stack,
    });
    logger.error({ ip, error: e?.message || e }, 'POST /api/login');
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

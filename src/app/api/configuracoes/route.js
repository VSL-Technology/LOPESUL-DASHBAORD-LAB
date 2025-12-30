// src/app/api/configuracoes/route.js
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics';
import { getRequestAuth } from '@/lib/auth/context';
import { getMaintenanceFlag, setMaintenanceFlag } from '@/lib/config/state';

const K_SESSION = 'sessionDefault';
const DEFAULT_SESSION_SECONDS = 60 * 60 * 4;

const UpdateSchema = z.object({
  sessionDefault: z
    .number()
    .int()
    .min(60, 'Sessão mínima de 1 minuto')
    .max(24 * 60 * 60, 'Sessão máxima de 24h')
    .optional(),
  maintenance: z.boolean().optional(),
});

async function getSessionDefault() {
  try {
    const row = await prisma.config.findUnique({ where: { key: K_SESSION } });
    return Number(row?.value) || DEFAULT_SESSION_SECONDS;
  } catch {
    return DEFAULT_SESSION_SECONDS;
  }
}

async function setSessionDefault(value) {
  await prisma.config.upsert({
    where: { key: K_SESSION },
    update: { value: String(value) },
    create: { key: K_SESSION, value: String(value) },
  });
}

export async function GET() {
  const started = Date.now();
  let ok = false;
  try {
    const auth = await getRequestAuth();
    if (!auth.session) {
      return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
    }
    if (!auth.isMaster) {
      return NextResponse.json(
        { error: 'Apenas operadores Master podem visualizar esta seção.' },
        { status: 403 }
      );
    }
    const [sessionDefault, maintenance] = await Promise.all([
      getSessionDefault(),
      getMaintenanceFlag(),
    ]);
    ok = true;
    return NextResponse.json(
      { sessionDefault, maintenance },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    logger.error({ error: err?.message }, '[configuracoes] Erro no GET');
    return NextResponse.json({ error: 'Erro ao carregar configurações' }, { status: 500 });
  } finally {
    recordApiMetric('config_get', { durationMs: Date.now() - started, ok });
  }
}

export async function PUT(req) {
  const started = Date.now();
  let ok = false;
  try {
    const auth = await getRequestAuth();
    if (!auth.session || !auth.isMaster) {
      return NextResponse.json(
        { error: 'Apenas operadores Master podem alterar esta seção.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
    }

    const updates = parsed.data;
    const out = {};

    if (typeof updates.sessionDefault === 'number') {
      await setSessionDefault(updates.sessionDefault);
      out.sessionDefault = updates.sessionDefault;
    }

    if (typeof updates.maintenance === 'boolean') {
      await setMaintenanceFlag(updates.maintenance);
      out.maintenance = updates.maintenance;
    }

    if (!Object.keys(out).length) {
      return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 });
    }

    ok = true;
    const res = NextResponse.json({ ok: true, ...out });
    if (out.maintenance !== undefined) {
      res.cookies.set('maintenance', out.maintenance ? '1' : '0', {
        path: '/',
        sameSite: 'lax',
      });
    }
    return res;
  } catch (err) {
    logger.error({ error: err?.message }, '[configuracoes] Erro no PUT');
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  } finally {
    recordApiMetric('config_update', { durationMs: Date.now() - started, ok });
  }
}

export function OPTIONS() {
  return NextResponse.json({}, { status: 204 });
}

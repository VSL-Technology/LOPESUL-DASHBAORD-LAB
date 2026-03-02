// src/app/api/configuracoes/route.js
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics';
import { getRequestAuth } from '@/lib/auth/context';
import { requireMutationAuth } from '@/lib/auth/requireMutationAuth';
import { getMaintenanceFlag, setMaintenanceFlag } from '@/lib/config/state';
import { applySecurityHeaders } from '@/lib/security/httpGuards';

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
      return json({ error: 'Autenticação necessária.' }, 401);
    }
    if (!auth.isMaster) {
      return json(
        { error: 'Apenas operadores Master podem visualizar esta seção.' },
        403
      );
    }
    const [sessionDefault, maintenance] = await Promise.all([
      getSessionDefault(),
      getMaintenanceFlag(),
    ]);
    ok = true;
    return json({ sessionDefault, maintenance }, 200);
  } catch (err) {
    logger.error({ error: err?.message }, '[configuracoes] Erro no GET');
    return json({ error: 'INTERNAL_ERROR' }, 500);
  } finally {
    recordApiMetric('config_get', { durationMs: Date.now() - started, ok });
  }
}

export async function PUT(req) {
  const started = Date.now();
  let ok = false;
  const auth = await requireMutationAuth(req, { role: 'MASTER' });
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Payload inválido' }, 400);
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
      return json({ error: 'Nada para atualizar' }, 400);
    }

    ok = true;
    const res = json({ ok: true, ...out }, 200);
    if (out.maintenance !== undefined) {
      res.cookies.set('maintenance', out.maintenance ? '1' : '0', {
        path: '/',
        sameSite: 'lax',
      });
    }
    return res;
  } catch (err) {
    logger.error({ error: err?.message }, '[configuracoes] Erro no PUT');
    return json({ error: 'INTERNAL_ERROR' }, 500);
  } finally {
    recordApiMetric('config_update', { durationMs: Date.now() - started, ok });
  }
}

export function OPTIONS() {
  return applySecurityHeaders(NextResponse.json({}, { status: 204 }), { noStore: true });
}

function json(payload, status = 200) {
  return applySecurityHeaders(NextResponse.json(payload, { status }), { noStore: true });
}

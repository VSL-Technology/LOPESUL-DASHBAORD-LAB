// src/app/api/trial/route.js
import { NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { ensureDeviceRouter } from '@/lib/device-router';
import callRelay from '@/lib/relayClient';
import { requireAuth } from '@/lib/auth/requireAuth';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { getOrCreateRequestId } from '@/lib/security/requestId';

const BodySchema = z.object({
  ip: z.string().trim().optional().nullable(),
  mac: z.string().trim().optional().nullable(),
  deviceId: z.string().trim().optional().nullable(),
  mikId: z.string().trim().optional().nullable(),
  minutos: z.number().int().min(1).max(30).optional().default(5),
});

const normalizeIp = (value) => {
  if (!value) return null;
  const clean = value.trim();
  return clean.length ? clean : null;
};

const normalizeMac = (value) => {
  if (!value) return null;
  const clean = value.trim().toUpperCase();
  return clean.length ? clean : null;
};

export async function POST(req) {
  const auth = await requireAuth(req, { role: 'MASTER' });
  if (auth.error) return Response.json({ error: 'UNAUTHORIZED' }, { status: auth.error });
  const requestId = getOrCreateRequestId(req);

  try {
    const json = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Payload inválido', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const ip = normalizeIp(parsed.data.ip || null);
    const mac = normalizeMac(parsed.data.mac || null);

    if (!ip && !mac) {
      return NextResponse.json(
        { error: 'Informe IP ou MAC para iniciar o acesso trial.' },
        { status: 400 }
      );
    }

    if (!ip || !mac) {
      return NextResponse.json(
        { error: 'Informe IP e MAC para iniciar o acesso trial.' },
        { status: 400 }
      );
    }

    const deviceCtx = await ensureDeviceRouter({
      deviceId: parsed.data.deviceId || undefined,
      mikId: parsed.data.mikId || undefined,
      ip: ip || undefined,
    });

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + parsed.data.minutos * 60 * 1000);
    const mikId = parsed.data.mikId || deviceCtx.device?.mikId || null;
    if (!mikId) {
      return NextResponse.json(
        { error: 'Não foi possível identificar o roteador para o trial.' },
        { status: 400 }
      );
    }

    // TODO(relay): expose a trial bootstrap that accepts only router/session
    // identifiers. For now, IP/MAC stay confined to device/hello instead of
    // being repeated in the authorize payload.
    const helloResp = await callRelay('/relay/device/hello', {
      deviceToken: token,
      mikId,
      ip,
      mac,
      userAgent: req.headers.get('user-agent') || null,
    }, {
      retries: 0,
      timeoutMs: 5000,
      requestId,
    });

    if (!helloResp.ok) {
      logger.warn(
        { error: helloResp.error, status: helloResp.status },
        '[TRIAL] falha ao sincronizar device com relay'
      );
      return NextResponse.json(
        { error: 'Não foi possível sincronizar o dispositivo trial.', details: helloResp.error },
        { status: 502 }
      );
    }

    const payload = {
      pedidoId: `trial:${token}`,
      mikId,
      deviceToken: helloResp.json?.deviceToken || token,
    };

    const resp = await callRelay('/relay/authorize-by-pedido', payload, {
      retries: 0,
      timeoutMs: 5000,
      requestId,
    });

    if (!resp.ok) {
      logger.warn(
        { error: resp.error, status: resp.status },
        '[TRIAL] falha ao delegar para relay'
      );
      return NextResponse.json(
        { error: 'Não foi possível iniciar o acesso trial.', details: resp.error },
        { status: 502 }
      );
    }

    try {
      await prisma.sessaoAtiva.create({
        data: {
          ipCliente: ip || `trial-${token}`.slice(0, 255),
          macCliente: mac || null,
          plano: 'TRIAL',
          inicioEm: new Date(),
          expiraEm: expiresAt,
          ativo: true,
          pedidoId: null,
          roteadorId: deviceCtx.device?.roteadorId || undefined,
        },
      });
    } catch (dbErr) {
      logger.warn(
        { error: dbErr?.message || dbErr },
        '[TRIAL] falha ao registrar sessão trial'
      );
    }

    return NextResponse.json({
      ok: true,
      token,
      expiresAt: expiresAt.toISOString(),
      relay: resp.json || null,
    });
  } catch (error) {
    logger.error({ error: error?.message || error }, '[TRIAL] erro inesperado');
    return NextResponse.json(
      { error: 'Erro interno ao iniciar trial.' },
      { status: 500 }
    );
  }
}

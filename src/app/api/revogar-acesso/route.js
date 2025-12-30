// src/app/api/revogar-acesso/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import prisma from '@/lib/prisma';
import mikrotik from '@/lib/mikrotik';
import { checkInternalAuth } from '@/lib/security/internalAuth';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';
const { revogarCliente } = mikrotik;

/* ===== helpers ===== */
const hasModel = (name) => {
  const m = prisma?.[name];
  return !!m && typeof m === 'object';
};

const tryAwait = async (fn, fallback = null) => {
  try { return await fn(); } catch { return fallback; }
};

function corsJson(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/* Preflight CORS */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

const BodySchema = z.object({
  externalId: z.string().trim().optional().nullable(),
  pagamentoId: z.string().trim().optional().nullable(),
  txid: z.string().trim().optional().nullable(),
  pedidoId: z.string().trim().optional().nullable(),
  code: z.string().trim().optional().nullable(),
  ip: z.string().trim().optional().nullable(),
  mac: z.string().trim().optional().nullable(),
  statusFinal: z.enum(['expirado', 'cancelado']).optional().nullable(),
});

/* ===== main ===== */
export async function POST(req) {
  const started = Date.now();
  if (!checkInternalAuth(req)) {
    logger.warn({}, '[revogar-acesso] Unauthorized attempt');
    recordApiMetric('revogar_acesso', { durationMs: Date.now() - started, ok: false });
    return corsJson({ ok: false, error: 'Unauthorized' }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, '[revogar-acesso] invalid payload');
      recordApiMetric('revogar_acesso', { durationMs: Date.now() - started, ok: false });
      return corsJson({ ok: false, error: 'Invalid payload' }, 400);
    }
    const {
      externalId,
      pagamentoId,
      txid,
      pedidoId,
      code,
      ip,
      mac,
      statusFinal,
    } = parsed.data;

    if (!externalId && !pagamentoId && !txid && !pedidoId && !code && !ip && !mac) {
      return corsJson({ ok: false, error: 'Informe externalId, pagamentoId, txid, pedidoId, code, ip ou mac.' }, 400);
    }

    /* 1) localizar registro em uma das tabelas (pagamento OU pedido) */
    let pg = null; // pagamento (legado)
    let pd = null; // pedido   (novo)

    if (hasModel('pagamento')) {
      if (externalId && !pg) pg = await tryAwait(() =>
        prisma.pagamento.findUnique({ where: { externalId } })
      );
      if (pagamentoId && !pg) pg = await tryAwait(() =>
        prisma.pagamento.findUnique({ where: { id: pagamentoId } })
      );
      if (txid && !pg) pg = await tryAwait(() =>
        prisma.pagamento.findFirst({ where: { txid } })
      );
    }

    if (!pg && hasModel('pedido')) {
      // no novo fluxo o "externalId" costuma ser o 'code' do pedido
      const pedidoCode = code || externalId || null;
      if (pedidoId && !pd) pd = await tryAwait(() =>
        prisma.pedido.findUnique({ where: { id: pedidoId } })
      );
      if (pedidoCode && !pd) pd = await tryAwait(() =>
        prisma.pedido.findUnique({ where: { code: pedidoCode } })
      );
    }

    /* 2) decidir IP/MAC (payload > registro encontrado) */
    const ipFinal  = ip  || pg?.clienteIp  || pd?.ip        || pd?.clienteIp  || null;
    const macFinal = mac || pg?.clienteMac || pd?.deviceMac || pd?.clienteMac || null;

    if (!ipFinal && !macFinal) {
      return corsJson({ ok: false, error: 'Sem IP/MAC (nem no payload, nem no registro).' }, 400);
    }

    /* 3) revogar na Mikrotik — idempotente */
    let mk;
    try {
      mk = await revogarCliente({
        ip:  ipFinal  || undefined,
        mac: macFinal || undefined,
      });
    } catch {
      // se já não existia, tratamos como sucesso para idempotência
      mk = { ok: true, note: 'revogarCliente idempotente (já não existia).' };
    }

    /* 4) atualizar status e sessão(ões) relacionadas */
    const now = new Date();

    if (pg && hasModel('pagamento')) {
      const novoStatus = statusFinal === 'cancelado' ? 'cancelado' : 'expirado';
      await tryAwait(() => prisma.pagamento.update({
        where: { id: pg.id },
        data: { status: novoStatus },
      }));
      await tryAwait(() => prisma.sessaoAtiva.updateMany({
        where: { pagamentoId: pg.id, ativo: true },
        data: { ativo: false, expiraEm: now },
      }));
    }

    if (pd && hasModel('pedido')) {
      // mapeia para o esquema novo (MAIÚSCULAS)
      const novoStatus = (statusFinal === 'cancelado') ? 'CANCELED' : 'EXPIRED';
      await tryAwait(() => prisma.pedido.update({
        where: { id: pd.id },
        data: { status: novoStatus },
      }));
      await tryAwait(() => prisma.sessaoAtiva.updateMany({
        where: { pedidoId: pd.id, ativo: true },
        data: { ativo: false, expiraEm: now },
      }));
    }

    recordApiMetric('revogar_acesso', { durationMs: Date.now() - started, ok: true });
    return corsJson({
      ok: true,
      mikrotik: mk,
      // ecos úteis para o chamador
      pagamentoId: pg?.id || null,
      pedidoId:    pd?.id || null,
      externalId:  pg?.externalId || pd?.code || externalId || code || null,
      ip:          ipFinal || null,
      mac:         macFinal || null,
    });
  } catch (e) {
    logger.error({ error: e?.message || e }, 'POST /api/revogar-acesso error');
    recordApiMetric('revogar_acesso', { durationMs: Date.now() - started, ok: false });
    return corsJson({ ok: false, error: 'Falha ao revogar' }, 500);
  }
}

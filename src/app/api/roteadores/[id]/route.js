// src/app/api/roteadores/[id]/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { getRequestAuth } from '@/lib/auth/context';
import { logger } from '@/lib/logger';
import { syncWireguardPeer } from '@/lib/wireguard';

function json(payload, status = 200) {
  return new NextResponse(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function ensureMaster() {
  const auth = await getRequestAuth();
  if (!auth.session) {
    throw new Response(JSON.stringify({ error: 'Autenticação necessária.' }), { status: 401 });
  }
  if (!auth.isMaster) {
    logger.warn({ role: auth.role }, '[roteadores/:id] acesso negado');
    throw new Response(JSON.stringify({ error: 'Apenas operadores Master têm acesso.' }), {
      status: 403,
    });
  }
}

async function syncWireguardStatus(payload) {
  try {
    const res = await syncWireguardPeer(payload);
    if (res.skipped) return undefined;
    if (res.ok) return payload.remove ? 'DESCONHECIDO' : 'ONLINE';
    return 'ERRO';
  } catch (err) {
    console.error('[roteadores] syncWireguardPeer failed', err?.message || err);
    return 'ERRO';
  }
}

function trimOrNull(value) {
  if (value === undefined) return undefined;
  const v = String(value ?? '').trim();
  return v ? v : null;
}

export async function GET(_req, context) {
  try {
    await ensureMaster();
    const { id } = await context.params;
    const cleanId = String(id || '').trim();
    if (!cleanId) return json({ error: 'ID inválido' }, 400);

    const existing = await prisma.roteador.findUnique({ where: { id: cleanId } });
    if (!existing) return json({ error: 'Roteador não encontrado' }, 404);

    const roteador = await prisma.roteador.findUnique({
      where: { id: cleanId },
      select: {
        id: true,
        nome: true,
        ipLan: true,
        usuario: true,
        portaApi: true,
        portaSsh: true,
        wgPublicKey: true,
        wgIp: true,
        statusMikrotik: true,
        statusWireguard: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!roteador) return json({ error: 'Roteador não encontrado' }, 404);
    return json(roteador, 200);
  } catch (err) {
    console.error('GET /api/roteadores/[id] =>', err);
    return json({ error: 'Erro ao buscar roteador' }, 500);
  }
}

export async function PUT(req, context) {
  try {
    await ensureMaster();
    const { id } = await context.params;
    const cleanId = String(id || '').trim();
    if (!cleanId) return json({ error: 'ID inválido' }, 400);

    const existing = await prisma.roteador.findUnique({ where: { id: cleanId } });
    if (!existing) return json({ error: 'Roteador não encontrado' }, 404);

    const body = await req.json().catch(() => ({}));
    const {
      nome,
      ipLan,
      usuario,
      senha,
      portaApi,
      portaSsh,
      wgPublicKey,
      wgIp,
      statusMikrotik,
      statusWireguard,
    } = body || {};

    const data = {};
    let nextWgPublicKey = trimOrNull(wgPublicKey);
    let nextWgIp = trimOrNull(wgIp);
    let statusWireguardUpdate;

    if (wgPublicKey === undefined) nextWgPublicKey = existing.wgPublicKey;
    if (wgIp === undefined) nextWgIp = existing.wgIp;

    if (wgPublicKey !== undefined || wgIp !== undefined) {
      const hasKey = Boolean(nextWgPublicKey);
      const hasIp = Boolean(nextWgIp);
      if (hasKey !== hasIp) {
        return json(
          { error: 'Para configurar WireGuard, envie wgPublicKey e wgIp juntos ou defina ambos como nulos.' },
          400
        );
      }

      const removingPeer = Boolean(existing.wgPublicKey) && !nextWgPublicKey;
      const replacingPeer =
        Boolean(existing.wgPublicKey) &&
        Boolean(nextWgPublicKey) &&
        existing.wgPublicKey !== nextWgPublicKey;
      if (replacingPeer && existing.wgPublicKey) {
        await syncWireguardStatus({ publicKey: existing.wgPublicKey, remove: true });
      }

      if (nextWgPublicKey && nextWgIp) {
        statusWireguardUpdate = await syncWireguardStatus({
          publicKey: nextWgPublicKey,
          allowedIp: nextWgIp,
        });
      } else if (removingPeer) {
        statusWireguardUpdate = await syncWireguardStatus({
          publicKey: existing.wgPublicKey,
          remove: true,
        });
      }

      data.wgPublicKey = nextWgPublicKey;
      data.wgIp = nextWgIp;
      if (statusWireguardUpdate !== undefined) data.statusWireguard = statusWireguardUpdate;
    }

    if (nome != null) data.nome = String(nome).trim();
    if (ipLan != null) data.ipLan = String(ipLan).trim();
    if (usuario != null) data.usuario = String(usuario).trim();
    if (portaApi != null) data.portaApi = Number(portaApi);
    if (portaSsh != null) data.portaSsh = Number(portaSsh);
    if (statusMikrotik !== undefined) data.statusMikrotik = statusMikrotik;
    if (statusWireguard !== undefined) data.statusWireguard = statusWireguard;

    if (senha != null && String(senha).trim()) {
      data.senhaHash = await bcrypt.hash(String(senha).trim(), 10);
    }

    const updated = await prisma.roteador.update({
      where: { id: cleanId },
      data,
      select: {
        id: true,
        nome: true,
        ipLan: true,
        usuario: true,
        portaApi: true,
        portaSsh: true,
        wgPublicKey: true,
        wgIp: true,
        statusMikrotik: true,
        statusWireguard: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return json(updated, 200);
  } catch (err) {
    console.error('PUT /api/roteadores/[id] =>', err);
    return json({ error: 'Erro ao atualizar roteador' }, 500);
  }
}

export async function DELETE(_req, context) {
  try {
    await ensureMaster();
    const { id } = await context.params;
    const cleanId = String(id || '').trim();
    if (!cleanId) return json({ error: 'ID inválido' }, 400);

    const roteador = await prisma.roteador.findUnique({
      where: { id: cleanId },
      select: { id: true, wgPublicKey: true, wgIp: true },
    });
    if (!roteador) return json({ error: 'Roteador não encontrado' }, 404);

    if (roteador.wgPublicKey) {
      await syncWireguardStatus({
        publicKey: roteador.wgPublicKey,
        allowedIp: roteador.wgIp || undefined,
        remove: true,
      });
    }

    await prisma.roteador.delete({ where: { id: cleanId } });
    return json({ ok: true, id: cleanId }, 200);
  } catch (err) {
    console.error('DELETE /api/roteadores/[id] =>', err);
    return json({ error: 'Erro ao remover roteador' }, 500);
  }
}

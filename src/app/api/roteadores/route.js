// src/app/api/roteadores/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { syncWireguardPeer } from '@/lib/wireguard';
import { getRequestAuth } from '@/lib/auth/context';
import { requireMutationAuth } from '@/lib/auth/requireMutationAuth';
import { logger } from '@/lib/logger';
import { applySecurityHeaders } from '@/lib/security/httpGuards';

async function ensureMaster() {
  const auth = await getRequestAuth();
  if (!auth.session) {
    return json({ error: 'Autenticação necessária.' }, 401);
  }
  if (!auth.isMaster) {
    logger.warn({ role: auth.role }, '[roteadores] acesso negado (não master)');
    return json(
      { error: 'Apenas operadores Master podem acessar roteadores.' },
      403
    );
  }
  return null;
}

// Lista roteadores (sem expor senhaHash)
export async function GET() {
  try {
    const denied = await ensureMaster();
    if (denied) return denied;
    const roteadores = await prisma.roteador.findMany({
      orderBy: { createdAt: 'desc' },
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

    return json(roteadores, 200);
  } catch (err) {
    console.error('GET /api/roteadores =>', err);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
}

// Cria um novo roteador
export async function POST(req) {
  const auth = await requireMutationAuth(req, { role: 'MASTER' });
  if (auth instanceof Response) return auth;

  try {
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
    } = body || {};

    if (!nome?.trim() || !ipLan?.trim() || !usuario?.trim() || !senha?.trim()) {
      return json(
        { error: 'Nome, IP, usuário e senha são obrigatórios.' },
        400
      );
    }

    const senhaHash = await bcrypt.hash(String(senha).trim(), 10);

    // Tenta sincronizar o peer no WireGuard, se tivermos dados suficientes
    let statusWireguard = undefined;
    if (wgPublicKey && wgIp) {
      try {
        const sync = await syncWireguardPeer({
          publicKey: String(wgPublicKey).trim(),
          allowedIp: String(wgIp).trim(),
        });
        if (sync.ok) statusWireguard = 'ONLINE';
        else if (!sync.skipped) statusWireguard = 'ERRO';
      } catch (e) {
        console.error('POST /api/roteadores => erro ao sincronizar WG:', e);
        statusWireguard = 'ERRO';
      }
    }

    const created = await prisma.roteador.create({
      data: {
        nome: String(nome).trim(),
        ipLan: String(ipLan).trim(),
        usuario: String(usuario).trim(),
        senhaHash,
        portaApi: portaApi ? Number(portaApi) : undefined,
        portaSsh: portaSsh ? Number(portaSsh) : undefined,
        wgPublicKey: wgPublicKey ? String(wgPublicKey).trim() : null,
        wgIp: wgIp ? String(wgIp).trim() : null,
        statusWireguard,
      },
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

    return json(created, 201);
  } catch (err) {
    logger.error({ error: err?.message || err }, 'POST /api/roteadores error');
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
}

function json(payload, status = 200) {
  return applySecurityHeaders(NextResponse.json(payload, { status }), { noStore: true });
}

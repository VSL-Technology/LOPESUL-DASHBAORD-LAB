// src/app/api/frotas/route.js
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { relayIdentityStatus } from '@/lib/relayClient';
import { getRequestAuth } from '@/lib/auth/context';
import { logger } from '@/lib/logger';
import { getOrCreateRequestId } from '@/lib/security/requestId';

export const dynamic = 'force-dynamic';
const RELAY_FALLBACK = {
  state: 'DEGRADED',
  retryInMs: 10000,
  messageCode: 'RELAY_UNAVAILABLE',
};

const RELAY_NOT_CONFIGURED = {
  state: 'DEGRADED',
  retryInMs: null,
  messageCode: 'RELAY_NOT_CONFIGURED',
};

function hasRelayConfig() {
  const base = process.env.RELAY_BASE_URL || process.env.RELAY_URL || process.env.RELAY_BASE;
  const token = process.env.RELAY_TOKEN || process.env.RELAY_API_TOKEN;
  const secret = process.env.RELAY_API_SECRET;
  return Boolean(base && token && secret);
}

function pickIp(row) {
  return row?.ip ?? row?.enderecoIp ?? row?.ipAddress ?? row?.host ?? null;
}

function pickIdentity(frota) {
  return (
    frota?.roteador?.identity ||
    (frota?.dispositivos?.[0]?.mikId) ||
    (frota?.dispositivos?.[0]?.ip) ||
    frota?.id ||
    null
  );
}

function mapStateToStatus(state) {
  if (state === 'OK') return 'online';
  if (state === 'FAILED') return 'offline';
  return 'desconhecido';
}

export async function GET(req) {
  const requestId = getOrCreateRequestId(req);
  try {
    const auth = await getRequestAuth();
    if (!auth.session) {
      return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
    }
    if (auth.maintenance && !auth.isMaster) {
      logger.warn({ role: auth.role }, '[frotas] bloqueado por manutenção');
      return NextResponse.json(
        { error: 'Modo manutenção ativo. Apenas operadores Master podem continuar.' },
        { status: 423 }
      );
    }

    // Busca frotas com dispositivos, vendas e roteador vinculado
    const frotas = await prisma.frota.findMany({
      where: { deletedAt: null },
      orderBy: { nome: 'asc' },
      include: {
        dispositivos: true,
        vendas: { select: { valorCent: true } },
        roteador: {
          select: {
            id: true,
            nome: true,
            identity: true,
            ipLan: true,
            statusMikrotik: true,
            statusWireguard: true,
          },
        },
      },
    });

    // Para cada frota (ônibus), checa status Mikrotik/Starlink com base nos IPs cadastrados
    const relayConfigured = hasRelayConfig();

    const resposta = await Promise.all(
      (frotas ?? []).map(async (f) => {
        const ips = (f.dispositivos ?? []).map(pickIp).filter(Boolean);
        const identity = pickIdentity(f);

        const status = await (async () => {
          if (!relayConfigured) {
            return {
              identity,
              ...RELAY_NOT_CONFIGURED,
            };
          }
          if (!identity) return { identity: null, ...RELAY_FALLBACK, messageCode: 'MISSING_ROUTER_IDENTITY' };
          try {
            const st = await relayIdentityStatus(identity, { requestId });
            return { identity, ...st };
          } catch {
            return { identity, ...RELAY_FALLBACK };
          }
        })();

        const sessoesAtivas = f.roteadorId
          ? await prisma.sessaoAtiva.count({
              where: {
                ativo: true,
                expiraEm: { gte: new Date() },
                roteadorId: f.roteadorId,
              },
            })
          : 0;

        const receitaCentavos = (f.vendas ?? []).reduce(
          (acc, v) => acc + (Number(v?.valorCent) || 0),
          0
        );

        return {
          id: f.id,
          busId: f.nome ?? `Bus-${f.id.slice(0, 6)}`,
          nome: f.nome ?? `Frota ${f.id.slice(0, 4)}`,
          status: mapStateToStatus(status.state),
          statusMikrotik: mapStateToStatus(status.state),
          messageCode: status.messageCode ?? null,
          sessoesAtivas,
          mikrotikHost: ips[0] ?? null,
          mikrotikIdentity: status.identity,
          valorTotal: Number(receitaCentavos / 100),
          valorTotalCentavos: Number(receitaCentavos),
          roteadorId: f.roteadorId ?? null,
        };
      })
    );

    return NextResponse.json(resposta, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('GET /api/frotas erro geral:', error);
    return NextResponse.json(
      { ok: false, error: 'server_error', message: String(error) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

// src/app/api/frotas/route.js
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { relayIdentityStatus } from '@/lib/relayClient';
import { getRequestAuth } from '@/lib/auth/context';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const DAYS = 7;
const RELAY_FALLBACK = {
  state: 'DEGRADED',
  retryInMs: 10000,
  messageCode: 'RELAY_UNAVAILABLE',
};

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

export async function GET() {
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

    const since = new Date();
    since.setDate(since.getDate() - DAYS);

    // Busca frotas com dispositivos, vendas recentes e roteador vinculado
    const frotas = await prisma.frota.findMany({
      orderBy: { nome: 'asc' },
      include: {
        dispositivos: true,
        vendas: {
          where: { data: { gte: since } },
          select: { valorCent: true },
        },
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
    const resposta = await Promise.all(
      (frotas ?? []).map(async (f) => {
        const ips = (f.dispositivos ?? []).map(pickIp).filter(Boolean);
        const identity = pickIdentity(f);

        const status = await (async () => {
          if (!identity) return { identity: null, ...RELAY_FALLBACK, messageCode: 'MISSING_ROUTER_IDENTITY' };
          try {
            const st = await relayIdentityStatus(identity);
            return { identity, ...st };
          } catch {
            return { identity, ...RELAY_FALLBACK };
          }
        })();

        const receitaCentavos = (f.vendas ?? []).reduce(
          (acc, v) => acc + (Number(v?.valorCent) || 0),
          0
        );

        return {
          id: f.id,
          nome: f.nome ?? `Frota ${f.id.slice(0, 4)}`,
          acessos: (f.dispositivos ?? []).length,
          // Mantém compatibilidade com a tela atual: "Status Mikrotik" usa `status`
          status: mapStateToStatus(status.state),
          statusMikrotik: mapStateToStatus(status.state),
          statusStarlink: mapStateToStatus(status.state),
          mikrotikHost: ips[0] ?? null,
          starlinkHost: ips[0] ?? null,
          mikrotikIdentity: status.identity,
          pingMs: null,
          perdaPct: null,
          valorTotal: Number(receitaCentavos / 100),
          valorTotalCentavos: Number(receitaCentavos),
          periodoDias: DAYS,
          // Dados do Roteador vinculado (se houver)
          roteadorId: f.roteadorId ?? null,
          roteadorNome: f.roteador?.nome ?? null,
          roteadorIpLan: f.roteador?.ipLan ?? null,
          roteadorStatusMikrotik: f.roteador?.statusMikrotik ?? null,
          roteadorStatusWireguard: f.roteador?.statusWireguard ?? null,
        };
      })
    );

    // A tela de /frotas espera um array simples; retornamos direto a lista
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

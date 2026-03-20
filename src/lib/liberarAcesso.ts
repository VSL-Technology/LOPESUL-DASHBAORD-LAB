import callRelay from "@/lib/relayClient";
import prisma from "@/lib/prisma";
import { requireDeviceRouter } from "@/lib/device-router";
import { obterTokenAtivoPorPedido } from "@/lib/clientToken";
import { logger } from "@/lib/logger";

type ModoLiberacao = "WEBHOOK" | "RECONEXAO" | "MANUAL";

interface LiberarAcessoParams {
  pedidoId: string;
  mikId: string;
  ipAtual?: string | null;
  macAtual?: string | null;
  modo: ModoLiberacao;
}

export async function liberarAcessoInteligente(params: LiberarAcessoParams) {
  const { pedidoId, mikId, ipAtual } = params;

  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { device: true },
  });

  if (!pedido) {
    logger.warn({ pedidoId }, '[LIBERACAO] Pedido não encontrado para enviar ao relay');
    return { ok: false, roteadorId: null, mikResult: { ok: false, error: 'pedido_not_found' } };
  }

  const tokenAtivo = await obterTokenAtivoPorPedido(pedido.id).catch(() => null);
  const resolvedIp = (ipAtual || pedido.ip || tokenAtivo?.ipInicial || '')?.trim() || null;

  let routerInfo: Awaited<ReturnType<typeof requireDeviceRouter>> | null = null;
  try {
    routerInfo = await requireDeviceRouter({
      deviceId: pedido.deviceId ?? undefined,
      mikId: mikId ?? pedido.device?.mikId ?? undefined,
      ip: resolvedIp ?? undefined,
    });
  } catch (err: unknown) {
    logger.error(
      {
        pedidoId,
        mikId,
        error: (err as Error)?.message || String(err),
      },
      '[LIBERACAO] Não foi possível resolver roteador para pedido'
    );
  }

  if (!routerInfo?.router) {
    return {
      ok: false,
      roteadorId: null,
      mikResult: { ok: false, error: 'router_not_found' },
    };
  }

  const payload = {
    pedidoId: pedido.id,
    mikId: routerInfo.device?.mikId ?? mikId,
    deviceToken: tokenAtivo?.token ?? null,
  };

  // TODO(relay): expose a reconnection contract driven only by deviceToken/session
  // so the dashboard never needs to send identity data on re-auth flows.
  const endpoint = '/relay/authorize-by-pedido';

  const resp = await callRelay(endpoint, payload, { retries: 1, timeoutMs: 8000 });
  const ok = !!resp && resp.ok === true;

  let roteadorId: string | null = null;
  if (routerInfo.device?.frotaId) {
    const frota = await prisma.frota
      .findUnique({
        where: { id: routerInfo.device.frotaId },
        select: { roteadorId: true },
      })
      .catch(() => null);
    roteadorId = frota?.roteadorId ?? null;
  }

  try {
    if (pedidoId && resp && resp.json) {
      const atual = (pedido.metadata as Record<string, unknown>) || {};
      await prisma.pedido
        .update({
          where: { id: pedidoId },
          data: { metadata: { ...atual, relayLast: resp.json } },
        })
        .catch(() => {});
    }
  } catch (e: unknown) {
    logger.warn(
      { pedidoId, error: (e as Error)?.message || String(e) },
      '[LIBERACAO] Falha ao atualizar metadata com retorno do relay'
    );
  }

  return {
    ok,
    roteadorId,
    mikResult: resp,
  };
}

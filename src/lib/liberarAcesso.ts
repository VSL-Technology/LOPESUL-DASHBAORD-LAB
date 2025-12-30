import callRelay from "@/lib/relayClient";
import prisma from "@/lib/prisma";
import { requireDeviceRouter } from "@/lib/device-router";
import { calcularMinutosPlano } from "@/lib/plan-duration";
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
  const { pedidoId, mikId, ipAtual, macAtual, modo } = params;

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
  const resolvedMac =
    (macAtual || pedido.deviceMac || tokenAtivo?.macInicial || '')
      ?.trim()
      .toUpperCase() || null;

  let routerInfo: Awaited<ReturnType<typeof requireDeviceRouter>> | null = null;
  try {
    routerInfo = await requireDeviceRouter({
      deviceId: pedido.deviceId ?? undefined,
      mikId: mikId ?? pedido.device?.mikId ?? undefined,
      ip: resolvedIp ?? undefined,
    });
  } catch (err) {
    logger.error(
      {
        pedidoId,
        mikId,
        error: err?.message || err,
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

  const minutosPlano = calcularMinutosPlano(pedido.description || pedido);
  const now = new Date();
  const expiraEm = new Date(now.getTime() + minutosPlano * 60 * 1000);

  const routerPayload = {
    host: routerInfo.router.host,
    user: routerInfo.router.user,
    pass: routerInfo.router.pass,
    port: routerInfo.router.port || 8728,
    secure: routerInfo.router.secure ?? false,
  };

  const payload = {
    pedidoId: pedido.id,
    orderCode: pedido.code,
    token: tokenAtivo?.token ?? null,
    plano: pedido.description || 'Acesso',
    planoMinutos: minutosPlano,
    expiresAt: expiraEm.toISOString(),
    ipAtual: resolvedIp,
    macAtual: resolvedMac,
    modo,
    router: routerPayload,
    contexto: {
      deviceId: pedido.deviceId,
      mikId,
      deviceIdentifier: pedido.deviceIdentifier,
      clienteIpInicial: tokenAtivo?.ipInicial ?? null,
      clienteMacInicial: tokenAtivo?.macInicial ?? null,
    },
  };

  const endpoint =
    modo === 'RECONEXAO' ? '/relay/resync-device' : '/relay/authorize-by-pedido';

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
  } catch (e) {
    logger.warn(
      { pedidoId, error: e?.message || e },
      '[LIBERACAO] Falha ao atualizar metadata com retorno do relay'
    );
  }

  return {
    ok,
    roteadorId,
    mikResult: resp,
  };
}

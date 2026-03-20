import prisma from "@/lib/prisma"; // ajusta o caminho se o teu prisma estiver em outro lugar
import { randomUUID } from "crypto";
const TEMPO_VIDA_TOKEN_HORAS = 3;

function adicionarHoras(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export async function emitirTokenCliente(params: {
  pedidoId: string;
  deviceId?: string | null;
  ip?: string | null;
  mac?: string | null;
}) {
  const { pedidoId, deviceId, ip, mac } = params;

  const token = randomUUID();
  const agora = new Date();

  const tokenCliente = await prisma.clientToken.create({
    data: {
      token,
      pedidoId,
      deviceId: deviceId ?? null,
      ipInicial: ip ?? null,
      macInicial: mac ?? null,
      expiresAt: adicionarHoras(agora, TEMPO_VIDA_TOKEN_HORAS)
    }
  });

  return tokenCliente;
}

export async function obterTokenValido(token: string) {
  if (!token) return null;

  const agora = new Date();

  const tokenCliente = await prisma.clientToken.findUnique({
    where: { token },
    include: {
      pedido: true
    }
  });

  if (!tokenCliente) return null;

  if (tokenCliente.expiresAt < agora) {
    return null;
  }

  return tokenCliente;
}

export async function obterTokenAtivoPorPedido(pedidoId: string) {
  if (!pedidoId) return null;
  const agora = new Date();

  const token = await prisma.clientToken.findFirst({
    where: {
      pedidoId,
      expiresAt: { gt: agora },
    },
    orderBy: { createdAt: 'desc' },
  });

  return token;
}

/**
 * Valida se esse token pode ser usado para re-liberar o cliente.
 * Aqui você pode incrementar a inteligência (comparar IP, MAC, etc).
 */
export async function validarTokenParaReconeccao(params: {
  token: string;
  ipAtual?: string | null;
  macAtual?: string | null;
}) {
  const { token, ipAtual, macAtual } = params;
  const tokenCliente = await obterTokenValido(token);
  if (!tokenCliente) {
    return { ok: false, motivo: "TOKEN_INVALIDO_OU_EXPIRADO" as const };
  }

  const pedido = tokenCliente.pedido;

  if (!pedido) {
    return { ok: false, motivo: "PEDIDO_NAO_ENCONTRADO" as const };
  }

  // Aqui é onde você pode turbinar a lógica:
  // - checar se pedido.status === "PAID"
  // - checar se o plano ainda está dentro da vigência
  // - checar se ipAtual está na mesma rede que ipInicial
  // - etc.

  if (pedido.status !== "PAID") {
    return { ok: false, motivo: "PEDIDO_NAO_PAGO" as const, tokenCliente, pedido };
  }

  // Exemplo simples: aceita mesmo que IP/MAC mudem
  // depois a gente incrementa com heurística (mesma /24, mesmo Mikrotik, etc).
  return {
    ok: true,
    motivo: "OK" as const,
    tokenCliente,
    pedido,
    contexto: {
      ipAtual: ipAtual ?? null,
      macAtual: macAtual ?? null,
      ipInicial: tokenCliente.ipInicial,
      macInicial: tokenCliente.macInicial
    }
  };
}

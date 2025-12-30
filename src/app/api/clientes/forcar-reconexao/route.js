import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { validarTokenParaReconeccao } from "@/lib/clientToken";
import { liberarAcessoInteligente } from "@/lib/liberarAcesso"; // vamos criar função wrapper
import { logger } from "@/lib/logger";
import { recordApiMetric } from "@/lib/metrics/index";
import { checkInternalAuth } from "@/lib/security/internalAuth";

const BodySchema = z.object({
  token: z.string().min(8),
  ipAtual: z.string().min(7),
  macAtual: z.string().optional().nullable(),
});

export async function POST(req) {
  const started = Date.now();
  if (!checkInternalAuth(req)) {
    logger.warn({}, "[forcar-reconexao] tentativa sem auth");
    recordApiMetric("clientes_forcar_reconexao", { durationMs: Date.now() - started, ok: false });
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, "[forcar-reconexao] payload inválido");
      recordApiMetric("clientes_forcar_reconexao", { durationMs: Date.now() - started, ok: false });
      return NextResponse.json(
        { error: "token e ipAtual são obrigatórios" },
        { status: 400 }
      );
    }
    const { token, ipAtual, macAtual } = parsed.data;

    const validacao = await validarTokenParaReconeccao({
      token,
      ipAtual,
      macAtual
    });

    if (!validacao.ok || !validacao.pedido) {
      logger.warn({ token }, "[forcar-reconexao] token inválido");
      recordApiMetric("clientes_forcar_reconexao", { durationMs: Date.now() - started, ok: false });
      return NextResponse.json(
        { error: "Token inválido, expirado ou pedido não pago", detalhe: validacao },
        { status: 400 }
      );
    }

    const pedido = validacao.pedido;

    // Descobre o device / mikId pela tabela que você já tem
    // Aqui vou assumir que o Pedido tem mikId ou deviceId linkado a Dispositivo
  let mikId = pedido.mikId || null;

    if (!mikId && pedido.deviceId) {
      const device = await prisma.dispositivo.findUnique({
        where: { id: pedido.deviceId }
      });
      mikId = device?.mikId ?? null;
    }

    if (!mikId) {
      recordApiMetric("clientes_forcar_reconexao", { durationMs: Date.now() - started, ok: false });
      return NextResponse.json(
        { error: "Não foi possível determinar o Mikrotik desse pedido" },
        { status: 500 }
      );
    }

    // Liberação via relay inteligente
    const libResult = await liberarAcessoInteligente({
      pedidoId: pedido.id,
      mikId,
      ipAtual,
      macAtual,
      modo: "RECONEXAO"
    });

    if (!libResult.ok) {
      logger.error({ detalhe: libResult }, "[forcar-reconexao] falha liberar");
      recordApiMetric("clientes_forcar_reconexao", { durationMs: Date.now() - started, ok: false });
      return NextResponse.json(
        { error: "Falha ao liberar no Mikrotik", detalhe: libResult },
        { status: 500 }
      );
    }

    // Garante a SessaoAtiva no banco (compatível com o schema `SessaoAtiva`)
    const minutosPadrao = 120; // padrão usado em outros serviços
    const agora = new Date();
    const expiraEm = new Date(agora.getTime() + minutosPadrao * 60 * 1000);

    // tenta achar sessão existente pelo pedidoId
    let sessao = await prisma.sessaoAtiva.findFirst({ where: { pedidoId: pedido.id } });
    if (sessao) {
      sessao = await prisma.sessaoAtiva.update({
        where: { id: sessao.id },
        data: {
          ipCliente: ipAtual,
          macCliente: macAtual ?? null,
          ativo: true,
          expiraEm,
        }
      });
    } else {
      sessao = await prisma.sessaoAtiva.create({
        data: {
          pedidoId: pedido.id,
          roteadorId: libResult.roteadorId ?? null,
          ipCliente: ipAtual,
          macCliente: macAtual ?? null,
          plano: pedido.description || 'Acesso',
          inicioEm: agora,
          expiraEm,
          ativo: true
        }
      });
    }

    recordApiMetric("clientes_forcar_reconexao", { durationMs: Date.now() - started, ok: true });
    return NextResponse.json({
      ok: true,
      status: "LIBERADO",
      pedidoId: pedido.id,
      mikId,
      ip: ipAtual,
      mac: macAtual ?? null,
      sessao
    });
  } catch (err) {
    logger.error({ error: err?.message || err }, "[forcar-reconexao] erro");
    recordApiMetric("clientes_forcar_reconexao", { durationMs: Date.now() - started, ok: false });
    return NextResponse.json(
      { error: "Erro interno", detalhe: err && err.message ? err.message : String(err) },
      { status: 500 }
    );
  }
}

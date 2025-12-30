// src/app/api/dashboard/route.js
import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordApiMetric } from "@/lib/metrics";
import { getRequestAuth } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  days: z
    .string()
    .regex(/^\d+$/, { message: "days deve ser numérico" })
    .transform((v) => Number(v))
    .optional(),
});

const DEFAULT_DAYS = 30;

function safeNum(n) {
  return Number.isFinite(n) ? n : 0;
}

function hasModel(name) {
  const model = prisma?.[name];
  return !!model && typeof model === "object";
}

async function safeCall(fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    logger.warn({ error: err?.message }, "[dashboard] Falha em consulta opcional");
    return fallback;
  }
}

export async function GET(req) {
  const started = Date.now();
  let ok = false;

  try {
    const auth = await getRequestAuth();
    if (!auth.session) {
      return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
    }
    if (auth.maintenance && !auth.isMaster) {
      logger.warn({ role: auth.role }, "[dashboard] bloqueado por manutenção");
      return NextResponse.json(
        { error: "Modo manutenção ativo. Apenas operadores Master podem continuar." },
        { status: 423 }
      );
    }

    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      days: searchParams.get("days") ?? undefined,
    });
    if (!parsed.success) {
      logger.warn(
        { issues: parsed.error.issues },
        "[dashboard] Query inválida"
      );
      return NextResponse.json(
        { error: "Parâmetros inválidos" },
        { status: 400 }
      );
    }

    const daysInput = parsed.data.days ?? DEFAULT_DAYS;
    const days = Math.min(Math.max(daysInput, 1), 365);
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - days);
    const between = { gte: from, lte: to };

    let pagos = 0;
    let pendentes = 0;
    let expirados = 0;
    let receitaCent = 0;

    if (hasModel("pedido") && typeof prisma.pedido.groupBy === "function") {
      const rows = await safeCall(
        () =>
          prisma.pedido.groupBy({
            by: ["status"],
            where: { createdAt: between },
            _count: { _all: true },
            _sum: { amount: true },
          }),
        []
      );

      for (const r of rows) {
        const status = r.status;
        const cnt = safeNum(r?._count?._all || 0);
        const sum = safeNum(r?._sum?.amount || 0);
        if (status === "PAID" || status === "pago") {
          pagos += cnt;
          receitaCent += sum;
        } else if (status === "PENDING" || status === "pendente") {
          pendentes += cnt;
        } else if (status === "EXPIRED" || status === "expirado") {
          expirados += cnt;
        }
      }
    } else if (
      hasModel("pagamento") &&
      typeof prisma.pagamento.groupBy === "function"
    ) {
      const rows = await safeCall(
        () =>
          prisma.pagamento.groupBy({
            by: ["status"],
            where: { criadoEm: between },
            _count: { _all: true },
            _sum: { valorCent: true },
          }),
        []
      );

      for (const r of rows) {
        const status = r.status;
        const cnt = safeNum(r?._count?._all || 0);
        const sum = safeNum(r?._sum?.valorCent || 0);
        if (status === "PAID" || status === "pago") {
          pagos += cnt;
          receitaCent += sum;
        } else if (status === "PENDING" || status === "pendente") {
          pendentes += cnt;
        } else if (status === "EXPIRED" || status === "expirado") {
          expirados += cnt;
        }
      }
    }

    let totalVendas = 0;
    let qtdVendas = 0;
    if (hasModel("venda")) {
      const ag = await safeCall(
        () =>
          prisma.venda.aggregate({
            _sum: { valorCent: true },
            _count: { id: true },
            where: { data: between },
          }),
        { _sum: { valorCent: 0 }, _count: { id: 0 } }
      );

      totalVendas = safeNum(ag._sum?.valorCent || 0) / 100;
      qtdVendas = safeNum(ag._count?.id || 0);
    }

    const counts = await safeCall(async () => {
      const tasks = [];
      if (hasModel("frota")) tasks.push(prisma.frota.count());
      if (hasModel("dispositivo")) tasks.push(prisma.dispositivo.count());
      if (hasModel("operador")) tasks.push(prisma.operador.count());
      if (hasModel("sessaoAtiva"))
        tasks.push(prisma.sessaoAtiva.count({ where: { ativo: true } }));

      if (!tasks.length) {
        return { frotas: 0, dispositivos: 0, operadores: 0, sessoesAtivas: 0 };
      }

      const res = await prisma.$transaction(tasks);
      let i = 0;
      return {
        frotas: tasks.length > i ? res[i++] : 0,
        dispositivos: tasks.length > i ? res[i++] : 0,
        operadores: tasks.length > i ? res[i++] : 0,
        sessoesAtivas: tasks.length > i ? res[i++] : 0,
      };
    }, {
      frotas: 0,
      dispositivos: 0,
      operadores: 0,
      sessoesAtivas: 0,
    });

    const payload = {
      periodo: { from, to, days },
      kpis: {
        totalVendas,
        qtdVendas,
        receita: receitaCent / 100,
        pagamentos: { pagos, pendentes, expirados },
      },
      inventario: {
        frotas: counts.frotas,
        dispositivos: counts.dispositivos,
      },
      operacao: {
        operadores: counts.operadores,
        sessoesAtivas: counts.sessoesAtivas,
      },
    };

    ok = true;
    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    logger.error({ error: e?.message }, "[dashboard] Erro inesperado");
    return NextResponse.json({ error: "Erro no dashboard" }, { status: 500 });
  } finally {
    recordApiMetric("dashboard_summary", {
      durationMs: Date.now() - started,
      ok,
    });
  }
}

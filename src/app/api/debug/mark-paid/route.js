// TESTE: curl -X POST https://seu-dominio.com/api/debug/mark-paid
// Esperado em produção: 404
// Esperado em dev com header x-debug-token correto: 200
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { requireMutationAuth } from "@/lib/auth/requireMutationAuth";
import { logger } from "@/lib/logger";
import { applySecurityHeaders } from "@/lib/security/httpGuards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  // PROTEÇÃO A — apenas em desenvolvimento
  if (process.env.NODE_ENV !== "development") {
    return json({ error: "Not found" }, 404);
  }
  // PROTEÇÃO B — token de debug obrigatório
  const debugToken = req.headers.get("x-debug-token");
  if (!debugToken || debugToken !== process.env.INTERNAL_DEBUG_TOKEN) {
    return json({ error: "Not found" }, 404);
  }

  const auth = await requireMutationAuth(req, { role: "MASTER" });
  if (auth instanceof Response) return auth;

  try {
    const token = cookies().get("lps_token")?.value;
    if (!token) return json({ ok: false, error: "token ausente" }, 401);

    const sessao = await prisma.sessaoPagamento.findUnique({ where: { token } });
    if (!sessao) return json({ ok: false, error: "sessão não encontrada" }, 404);

    await prisma.sessaoPagamento.update({
      where: { token },
      data: { status: "PAID", paidAt: new Date() },
    });

    return json({ ok: true }, 200);
  } catch (error) {
    logger.error({ error: error?.message || error }, "[debug/mark-paid] unexpected error");
    return json({ error: "INTERNAL_ERROR" }, 500);
  }
}

function json(payload, status = 200) {
  return applySecurityHeaders(NextResponse.json(payload, { status }), { noStore: true });
}

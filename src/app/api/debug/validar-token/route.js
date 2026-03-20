// TESTE: curl -X POST https://seu-dominio.com/api/debug/validar-token
// Esperado em produção: 404
// Esperado em dev com header x-debug-token correto: 200
import { NextResponse } from "next/server";
import { validarTokenParaReconeccao } from "@/lib/clientToken";
import { requireMutationAuth } from "@/lib/auth/requireMutationAuth";
import { logger } from "@/lib/logger";
import { applySecurityHeaders } from "@/lib/security/httpGuards";

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
    const body = await req.json().catch(() => ({}));
    const token = body?.token || null;
    const ipAtual = body?.ipAtual || null;
    const macAtual = body?.macAtual || null;

    if (!token) return json({ ok: false, error: 'token_obrigatorio' }, 400);

    const result = await validarTokenParaReconeccao({ token, ipAtual, macAtual });
    return json({ ok: true, result }, 200);
  } catch (e) {
    logger.error({ error: e?.message || e }, "[debug/validar-token] erro");
    return json({ error: "INTERNAL_ERROR" }, 500);
  }
}

function json(payload, status = 200) {
  return applySecurityHeaders(NextResponse.json(payload, { status }), { noStore: true });
}

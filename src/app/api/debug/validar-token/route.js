import { NextResponse } from "next/server";
import { validarTokenParaReconeccao } from "@/lib/clientToken";
import { validateInternalToken, checkInternalAuth } from "@/lib/security/internalAuth";
import { logger } from "@/lib/logger";

export async function POST(req) {
  try {
    if (!checkInternalAuth(req)) {
      logger.warn({}, "[debug/validar-token] acesso negado (internal token)");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const validation = validateInternalToken(req);
    if (!validation.ok) {
      logger.warn({ reason: validation.reason }, "[debug/validar-token] acesso negado");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const token = body?.token || null;
    const ipAtual = body?.ipAtual || null;
    const macAtual = body?.macAtual || null;

    if (!token) return NextResponse.json({ ok: false, error: 'token_obrigatorio' }, { status: 400 });

    const result = await validarTokenParaReconeccao({ token, ipAtual, macAtual });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    logger.error({ error: e?.message || e }, "[debug/validar-token] erro");
    return NextResponse.json({ ok: false, error: "Erro interno" }, { status: 500 });
  }
}

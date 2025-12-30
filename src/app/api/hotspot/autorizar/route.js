import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { relayEnsureHotspotUser, buildMockHotspotCreds } from "@/lib/relayHotspot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("lps_token")?.value;
  if (!token) return NextResponse.json({ ok: false, error: "token ausente" }, { status: 401 });

  const sessao = await prisma.sessaoPagamento.findUnique({ where: { token } });
  if (!sessao) return NextResponse.json({ ok: false, error: "sessão não encontrada" }, { status: 404 });

  if (sessao.status !== "PAID") {
    return NextResponse.json({ ok: false, error: "ainda não pago" }, { status: 409 });
  }
  if (!sessao.planoMinutos) {
    return NextResponse.json({ ok: false, error: "plano não definido" }, { status: 400 });
  }

  try {
    const out = await relayEnsureHotspotUser({
      identity: sessao.identity,
      token: sessao.token,
      minutes: sessao.planoMinutos,
    });

    return NextResponse.json({
      ok: true,
      username: out.username,
      password: out.password,
      mocked: !!out.mocked,
    });
  } catch (e) {
    // fallback para mock em caso de falha de rede/relay
    const mock = buildMockHotspotCreds(sessao.token);
    return NextResponse.json({
      ok: true,
      username: mock.username,
      password: mock.password,
      mocked: true,
      error: e?.message || String(e),
    }, { status: 200 });
  }
}

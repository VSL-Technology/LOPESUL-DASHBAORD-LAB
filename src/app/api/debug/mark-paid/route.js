import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const token = cookies().get("lps_token")?.value;
  if (!token) return NextResponse.json({ ok: false, error: "token ausente" }, { status: 401 });

  const sessao = await prisma.sessaoPagamento.findUnique({ where: { token } });
  if (!sessao) return NextResponse.json({ ok: false, error: "sessão não encontrada" }, { status: 404 });

  await prisma.sessaoPagamento.update({
    where: { token },
    data: { status: "PAID", paidAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

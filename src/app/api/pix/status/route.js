import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const token = cookies().get("lps_token")?.value;
  if (!token) return NextResponse.json({ status: "NO_TOKEN" }, { status: 401 });

  const sessao = await prisma.sessaoPagamento.findUnique({ where: { token } });
  if (!sessao) return NextResponse.json({ status: "NOT_FOUND" }, { status: 404 });

  if (sessao.expiresAt && sessao.expiresAt.getTime() < Date.now() && sessao.status !== "PAID") {
    await prisma.sessaoPagamento.update({
      where: { token },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json({ status: "EXPIRED" });
  }

  return NextResponse.json({ status: sessao.status });
}

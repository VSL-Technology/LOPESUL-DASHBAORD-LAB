import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { mac, ip, identity } = body || {};

  const cookieStore = cookies();
  const existingToken = cookieStore.get("lps_token")?.value || null;

  if (existingToken) {
    const sessao = await prisma.sessaoPagamento.findUnique({ where: { token: existingToken } });
    if (sessao) {
      await prisma.sessaoPagamento.update({
        where: { token: existingToken },
        data: {
          lastSeenMac: mac || sessao.lastSeenMac || sessao.macInicial || null,
          lastSeenIp: ip || sessao.lastSeenIp || sessao.ipInicial || null,
          ...(identity ? { identity } : {}),
        },
      });

      const res = NextResponse.json({ ok: true, token: existingToken, reused: true });
      res.cookies.set("lps_token", existingToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24,
      });
      return res;
    }
  }

  if (!identity) {
    return NextResponse.json({ ok: false, error: "identity ausente" }, { status: 400 });
  }

  const token = crypto.randomUUID();

  await prisma.sessaoPagamento.create({
    data: {
      token,
      identity,
      macInicial: mac || null,
      ipInicial: ip || null,
      lastSeenMac: mac || null,
      lastSeenIp: ip || null,
      status: "PENDING",
    },
  });

  const res = NextResponse.json({ ok: true, token, reused: false });
  res.cookies.set("lps_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24, // 24h
  });

  return res;
}

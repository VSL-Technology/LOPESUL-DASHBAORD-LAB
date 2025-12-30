import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { assertPlanId, PLANS } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const token = cookies().get("lps_token")?.value;
  if (!token) return NextResponse.json({ ok: false, error: "token ausente" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { planId } = body || {};

  try {
    assertPlanId(planId);
  } catch {
    return NextResponse.json({ ok: false, error: "plano inválido" }, { status: 400 });
  }

  const sessao = await prisma.sessaoPagamento.findUnique({ where: { token } });
  if (!sessao) return NextResponse.json({ ok: false, error: "sessão não encontrada" }, { status: 404 });

  // TODO: integrar PSP real (ex.: Pagar.me)
  const pix = {
    chargeId: `stub_charge_${Date.now()}`,
    orderId: `stub_order_${Date.now()}`,
    qrCode: "STUB_QR_CODE_DATA",
    pixCopiaECola: "STUB_PIX_COPIA_E_COLA",
  };

  await prisma.sessaoPagamento.update({
    where: { token },
    data: {
      planoId: planId,
      planoMinutos: PLANS[planId].minutes,
      chargeId: pix.chargeId,
      orderId: pix.orderId,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });

  return NextResponse.json({ ok: true, ...pix });
}

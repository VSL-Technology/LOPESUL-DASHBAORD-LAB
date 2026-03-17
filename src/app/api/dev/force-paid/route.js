import { activatePaidAccess } from '@/lib/trial/engine';
import { getPlanDurationMinutes } from '@/lib/trial/planDuration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const body = await req.json();
  const duration = getPlanDurationMinutes(body.plan);
  if (!duration) {
    return new Response(JSON.stringify({ success: false, error: 'Plano inválido' }), { status: 400 });
  }

  await activatePaidAccess({
    macAddress: body.macAddress,
    ip: body.ip,
    planName: body.plan,
    durationMinutes: duration,
    orderId: 'TESTE_MANUAL',
  });

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}

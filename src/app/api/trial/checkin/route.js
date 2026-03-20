import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { upsertDeviceSession, getDeviceAccessState } from '@/lib/trial/engine';
import { garantirEstadoMikrotik } from '@/lib/mikrotik';
import { normalizeMacAddress, normalizeIpAddress } from '@/lib/trial/validators';
import { buildTrialResponse } from '@/lib/trial/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function invalidPayload(message) {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

export async function POST(req) {
  try {
    const payload = await req.json().catch(() => ({}));
    const mac = normalizeMacAddress(payload.macAddress);
    if (!mac) {
      return invalidPayload('macAddress inválido');
    }

    let ip = null;
    if (payload.ip) {
      ip = normalizeIpAddress(payload.ip);
      if (!ip) {
        return invalidPayload('ip inválido');
      }
    }

    logger.info({ mac, ip }, '[trial/checkin] checking in');

    await upsertDeviceSession({ macAddress: mac, ip });
    const state = await getDeviceAccessState({ macAddress: mac, ip });

    await garantirEstadoMikrotik({
      status: state.status,
      ip: state.currentIp || ip,
      macAddress: mac,
      planName: state.planName,
    });

    const response = buildTrialResponse(state);
    return NextResponse.json({ success: true, ...response });
  } catch (error) {
    logger.error({ error: error?.message || error }, '[trial/checkin] erro');
    return NextResponse.json({ success: false, error: 'Erro interno ao processar trial' }, { status: 500 });
  }
}

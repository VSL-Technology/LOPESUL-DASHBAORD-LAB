import { NextResponse } from 'next/server';
import { relayIdentityRefresh } from '@/lib/relayIdentityRefresh';

export async function POST(req) {
  const body = await req.json().catch(() => ({}));

  const sid = body?.sid;
  const ip = body?.ip;
  const mac = body?.mac;
  const identity = body?.identity;
  const routerHint = body?.routerHint;

  if (!sid) {
    return NextResponse.json({ ok: false, code: 'missing_sid' }, { status: 400 });
  }

  if (!ip || !mac) {
    return NextResponse.json({ ok: false, code: 'missing_ip_or_mac' }, { status: 400 });
  }

  const RELAY_URL = process.env.RELAY_URL;
  const RELAY_TOKEN = process.env.RELAY_TOKEN;

  if (!RELAY_URL || !RELAY_TOKEN) {
    return NextResponse.json({ ok: false, code: 'relay_not_configured' }, { status: 500 });
  }

  const payload = { sid, ip, mac, identity, routerHint };

  const result = await relayIdentityRefresh({
    relayUrl: RELAY_URL,
    relayToken: RELAY_TOKEN,
    payload,
    timeoutMs: 5000,
    retries: 1,
    logger: console,
  });

  console.info('[backend] identity.refresh', {
    ok: result.ok,
    requestId: result.requestId,
    sid,
    identity,
    routerHint,
    status: result.status,
    relayCode: result.data?.code,
    authorized: result.data?.authorized,
    idempotent: result.data?.idempotent,
    pedidoId: result.data?.pedidoId,
  });

  if (result.ok) {
    return NextResponse.json({ ...result.data, requestId: result.requestId }, { status: 200 });
  }

  const relayCode = result.data?.code;

  if (relayCode === 'no_pending_payment') {
    return NextResponse.json(
      { ok: true, authorized: false, pending: true, code: 'awaiting_payment', requestId: result.requestId },
      { status: 200 },
    );
  }

  if (relayCode === 'router_not_resolved' || relayCode === 'missing_ip_or_mac') {
    return NextResponse.json({ ok: false, ...result.data, requestId: result.requestId }, { status: 400 });
  }

  return NextResponse.json({ ok: false, code: 'relay_error', requestId: result.requestId }, { status: 502 });
}

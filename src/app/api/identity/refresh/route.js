import { NextResponse } from 'next/server';
import { relayIdentityRefresh } from '@/lib/relayIdentityRefresh';
import { requireMutationAuth } from '@/lib/auth/requireMutationAuth';
import { logger } from '@/lib/logger';
import { applySecurityHeaders } from '@/lib/security/httpGuards';
import { getOrCreateRequestId } from '@/lib/security/requestId';

export async function POST(req) {
  const auth = await requireMutationAuth(req, { role: 'READER' });
  if (auth instanceof Response) return auth;
  const requestId = getOrCreateRequestId(req);

  try {
    const body = await req.json().catch(() => ({}));

    const sid = body?.sid;
    const ip = body?.ip;
    const mac = body?.mac;
    const identity = body?.identity;
    const routerHint = body?.routerHint;

    if (!sid) {
      return json({ ok: false, code: 'missing_sid' }, 400);
    }

    if (!ip || !mac) {
      return json({ ok: false, code: 'missing_ip_or_mac' }, 400);
    }

    const RELAY_URL = process.env.RELAY_BASE_URL || process.env.RELAY_URL || process.env.RELAY_BASE;
    const RELAY_TOKEN = process.env.RELAY_TOKEN || process.env.RELAY_API_TOKEN;
    const RELAY_API_SECRET = process.env.RELAY_API_SECRET;

    if (!RELAY_URL || !RELAY_TOKEN) {
      return json({ ok: false, code: 'relay_not_configured' }, 500);
    }
    if (!RELAY_API_SECRET) {
      return json({ ok: false, code: 'relay_api_secret_missing' }, 500);
    }

    // TODO(relay): allow refresh by sid/router identity only, so this route can
    // stop forwarding network identity data to the Relay.
    const payload = { sid, ip, mac, identity, routerHint };

    const result = await relayIdentityRefresh({
      relayUrl: RELAY_URL,
      relayToken: RELAY_TOKEN,
      payload,
      timeoutMs: 5000,
      retries: 1,
      logger: console,
      requestId,
      apiSecret: RELAY_API_SECRET,
    });

    logger.info(
      {
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
      },
      '[backend] identity.refresh'
    );

    if (result.ok) {
      return json({ ...result.data, requestId: result.requestId }, 200);
    }

    const relayCode = result.data?.code;

    if (relayCode === 'no_pending_payment') {
      return json(
        { ok: true, authorized: false, pending: true, code: 'awaiting_payment', requestId: result.requestId },
        200,
      );
    }

    if (relayCode === 'router_not_resolved' || relayCode === 'missing_ip_or_mac') {
      return json({ ok: false, ...result.data, requestId: result.requestId }, 400);
    }

    return json({ ok: false, code: 'relay_error', requestId: result.requestId }, 502);
  } catch (error) {
    logger.error({ error: error?.message || error }, '[identity/refresh] unexpected error');
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
}

function json(payload, status = 200) {
  return applySecurityHeaders(NextResponse.json(payload, { status }), { noStore: true });
}

// src/app/api/_debug/pagarme/route.js
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { pagarmeGET, __pagarmeBase, __pagarmeDebugMask } from '@/lib/pagarme';
import { validateInternalToken, checkInternalAuth } from '@/lib/security/internalAuth';
import { logger } from '@/lib/logger';
import { ENV } from '@/lib/env';

export async function GET(req) {
  try {
    if (!checkInternalAuth(req)) {
      logger.warn({}, '[debug/pagarme] acesso negado (internal token)');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const validation = validateInternalToken(req);
    if (!validation.ok) {
      logger.warn({ reason: validation.reason }, '[debug/pagarme] acesso negado');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const base = __pagarmeBase;
    const keyMasked = __pagarmeDebugMask();

    let ping = null;
    try {
      // Consulta mínima só pra validar permissão/ambiente
      const data = await pagarmeGET('/orders?page=1&size=1');
      const sampleLen = Array.isArray(data?.data) ? data.data.length : null;
      ping = { ok: true, status: 200, sample: sampleLen };
    } catch (e) {
      logger.error({ error: e?.message || e }, '[debug/pagarme] ping error');
      ping = {
        ok: false,
        status: e?.status || 0,
        data: (typeof e?.message === 'string' && e.message) ? e.message : 'Internal error',
      };
    }

    const json = {
      base,
      key_present: keyMasked !== '(vazio)',
      key_masked: keyMasked, // ex.: "sk_e...3eac"
      ping,
      // opcional: mostre em qual NODE_ENV está rodando
      env: ENV.NODE_ENV,
      // opcional: app url pra você confirmar de onde o webhook deveria apontar
      app_url: ENV.APP_URL,
    };

    return new NextResponse(JSON.stringify(json), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
        pragma: 'no-cache',
        expires: '0',
      },
    });
  } catch (e) {
    logger.error({ error: e?.message || e }, '[debug/pagarme] erro inesperado');
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

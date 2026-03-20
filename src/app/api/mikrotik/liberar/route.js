import { NextResponse } from 'next/server';
import { checkInternalAuth } from '@/lib/security/internalAuth';
import { liberarCliente } from '@/lib/mikrotik';

export const runtime = 'nodejs';

export async function POST(req) {
  if (!checkInternalAuth(req)) {
    console.warn('[MIKROTIK] Request sem token interno válido');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch (err) {
    console.warn('[MIKROTIK] Payload inválido no endpoint de liberação', err?.message || err);
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
  }

  const ip = String(body?.ip || '').trim();
  if (!ip) {
    return NextResponse.json({ error: 'IP não informado' }, { status: 400 });
  }

  try {
    await liberarCliente(ip);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[MIKROTIK] Erro ao liberar cliente via endpoint', {
      ip,
      error: error?.message || error,
    });
    return NextResponse.json(
      { error: 'Erro ao liberar cliente', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}

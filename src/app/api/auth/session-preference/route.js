// src/app/api/auth/session-preference/route.js
import { NextResponse } from 'next/server';
import { requireMutationAuth } from '@/lib/auth/requireMutationAuth';
import { applySecurityHeaders } from '@/lib/security/httpGuards';

export const dynamic = 'force-dynamic';

const DURATIONS = ['30m', '1h', '4h', '8h', '24h', 'permanent'];
const DUR_SET = new Set(DURATIONS);

// helper p/ resposta JSON com no-store
function json(payload, status = 200) {
  return applySecurityHeaders(new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  }), { noStore: true });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(req) {
  const pref = req.cookies.get('session_pref')?.value || null;
  return json({ preference: pref, allowed: DURATIONS });
}

export async function POST(req) {
  const auth = await requireMutationAuth(req, { role: 'READER' });
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const raw = body?.duration;

    // permitir limpar preferência (null/empty)
    if (raw === null || raw === '' || raw === undefined) {
      const res = json({ ok: true, saved: null });
      res.headers.set('Set-Cookie',
        // apaga cookie
        `session_pref=; Path=/; Max-Age=0; SameSite=Lax; ${
          process.env.NODE_ENV === 'production' ? 'Secure; ' : ''
        }HttpOnly=false`
      );
      return res;
    }

    const duration = String(raw).trim();

    if (!DUR_SET.has(duration)) {
      return json({ error: 'Duração inválida', allowed: DURATIONS }, 400);
    }

    // preferência do usuário dura 180 dias
    const maxAge = 180 * 24 * 60 * 60;

    const res = json({ ok: true, saved: duration });
    // Nota: NextResponse.cookies.set é mais simples, mas aqui usamos header
    // explícito para manter no-store + CORS homogêneos do helper.
    res.headers.append(
      'Set-Cookie',
      [
        `session_pref=${encodeURIComponent(duration)}`,
        'Path=/',
        `Max-Age=${maxAge}`,
        'SameSite=Lax',
        // preferência pode ser lida no client; não marcar HttpOnly
        process.env.NODE_ENV === 'production' ? 'Secure' : '',
      ]
        .filter(Boolean)
        .join('; ')
    );

    return res;
  } catch (e) {
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
}

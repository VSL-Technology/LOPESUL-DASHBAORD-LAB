// src/app/api/auth/me/route.js
import { NextResponse } from 'next/server';
import { getRequestAuth } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { session, maintenance, role } = await getRequestAuth();
    if (!session) {
      return NextResponse.json(
        {
          authenticated: false,
          maintenance,
          role: 'READER',
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        authenticated: true,
        maintenance,
        user: {
          id: session.sub,
          nome: session.username,
          role,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      { authenticated: false, error: 'Erro ao obter sessão' },
      { status: 500 }
    );
  }
}

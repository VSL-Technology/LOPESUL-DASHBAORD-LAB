// src/app/api/logout/route.js
import { NextResponse } from 'next/server';

const COOKIES_TO_CLEAR = ['session', 'token', 'op', 'role', 'maintenance'];

export async function POST() {
  const res = NextResponse.json({ ok: true });
  for (const name of COOKIES_TO_CLEAR) {
    res.cookies.set(name, '', {
      path: '/',
      maxAge: 0,
    });
  }
  return res;
}

export async function GET() {
  return POST();
}

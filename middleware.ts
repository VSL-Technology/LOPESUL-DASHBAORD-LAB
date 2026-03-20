import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { verifySession } from './src/lib/auth/session';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/operadores',
  '/dispositivos',
  '/frotas',
  '/configuracoes',
  '/relatorios',
  '/pagamentos',
  '/acessos',
  '/roteadores',
];

const MAINTENANCE_ALLOWED = ['/manutencao', '/login', '/api/login', '/api/logout', '/api/auth/me'];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isMaintenanceAllowed(pathname: string): boolean {
  return MAINTENANCE_ALLOWED.some((prefix) => pathname.startsWith(prefix));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApiRoute = pathname.startsWith('/api/');
  // Read requestId from incoming header or generate a new one
  const requestId = req.headers.get('x-request-id') || nanoid();
  
  const sessionToken = req.cookies.get('session')?.value || null;
  const session = sessionToken ? verifySession(sessionToken) : null;
  const isMaster = session?.role === 'MASTER' || session?.role === 'ADMIN';
  const maintenanceActive = req.cookies.get('maintenance')?.value === '1';
  let response: NextResponse;

  if (isProtectedPath(pathname)) {
    if (!session) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('from', pathname);

      response = NextResponse.redirect(loginUrl);
      response.cookies.delete('session');
      return withSecurityHeaders(response, requestId);
    }

    if (maintenanceActive && !isMaster && !isMaintenanceAllowed(pathname)) {
      if (isApiRoute) {
        response = NextResponse.json(
          { error: 'Modo de manutenção ativo. Apenas operadores Master podem continuar.' },
          { status: 423 }
        );
      } else {
        const maintenanceUrl = req.nextUrl.clone();
        maintenanceUrl.pathname = '/manutencao';
        maintenanceUrl.searchParams.set('from', pathname);
        response = NextResponse.redirect(maintenanceUrl);
      }
      return withSecurityHeaders(response, requestId);
    }

    response = NextResponse.next();
    return withSecurityHeaders(response, requestId);
  }

  if (pathname === '/login') {
    if (session) {
      const targetUrl = req.nextUrl.clone();
      targetUrl.pathname = maintenanceActive && !isMaster ? '/manutencao' : '/dashboard';
      response = NextResponse.redirect(targetUrl);
      return withSecurityHeaders(response, requestId);
    }
  }

  if (session && maintenanceActive && !isMaster && !isMaintenanceAllowed(pathname)) {
    if (isApiRoute) {
      response = NextResponse.json(
        { error: 'Modo de manutenção ativo. Apenas operadores Master podem continuar.' },
        { status: 423 }
      );
      return withSecurityHeaders(response, requestId);
    }
    const maintenanceUrl = req.nextUrl.clone();
    maintenanceUrl.pathname = '/manutencao';
    maintenanceUrl.searchParams.set('from', pathname);
    response = NextResponse.redirect(maintenanceUrl);
    return withSecurityHeaders(response, requestId);
  }

  response = NextResponse.next();
  return withSecurityHeaders(response, requestId);
}

function withSecurityHeaders(res: NextResponse, requestId: string): NextResponse {
  res.headers.set('x-request-id', requestId);
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  );
  res.headers.set(
    'Permissions-Policy',
    [
      'geolocation=()',
      'microphone=()',
      'camera=()',
      'fullscreen=(self)',
      'payment=(self)',
    ].join(', ')
  );
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self';",
      "img-src 'self' data: https:;",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval';",
      "style-src 'self' 'unsafe-inline';",
      "connect-src 'self' https:;",
      "frame-ancestors 'none';",
    ].join(' ')
  );

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|assets).*)'],
};

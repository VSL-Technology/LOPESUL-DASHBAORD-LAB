export function getRequestOrigin(req) {
  const origin = req?.headers?.get?.('origin');
  if (!origin) return null;
  const clean = String(origin).trim();
  return clean || null;
}

export function isSameOrigin(req, allowedOrigin) {
  const requestOrigin = getRequestOrigin(req);
  if (!requestOrigin || !allowedOrigin) return false;
  return requestOrigin === String(allowedOrigin).trim();
}

export function enforceSameOriginIfBrowser(req, allowedOrigin) {
  const origin = getRequestOrigin(req);
  if (!origin) return null; // non-browser clients (curl/server-to-server)

  if (origin !== String(allowedOrigin || '').trim()) {
    return Response.json({ error: 'FORBIDDEN_ORIGIN' }, { status: 403 });
  }
  return null;
}

export function applySecurityHeaders(res, options = {}) {
  const noStore = options?.noStore !== false;

  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Cache-Control', noStore ? 'no-store' : 'no-cache');

  return res;
}

import crypto from 'crypto';

export function getOrCreateRequestId(req) {
  const incoming = req?.headers?.get?.('x-request-id');
  const clean = String(incoming || '').trim();
  if (clean) return clean;
  return crypto.randomUUID();
}

export function withRequestIdHeaders(res, requestId) {
  res.headers.set('x-request-id', requestId);
  return res;
}

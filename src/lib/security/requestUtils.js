// src/lib/security/requestUtils.js

export function getClientIp(req) {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) {
    return xf.split(',')[0].trim();
  }

  const realIp =
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown';

  return realIp;
}

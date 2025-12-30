// src/lib/security/internalAuth.js
import { ENV } from '@/lib/env';

const DEBUG_HEADER = 'x-internal-debug-token';
const INTERNAL_HEADER = 'x-internal-token';

export function validateInternalToken(req) {
  const expected = ENV.INTERNAL_DEBUG_TOKEN;
  if (!expected) {
    return { ok: false, reason: 'token_not_configured' };
  }

  const provided = req.headers.get(DEBUG_HEADER)?.trim() || '';
  if (!provided) {
    return { ok: false, reason: 'token_missing' };
  }

  if (provided !== expected) {
    return { ok: false, reason: 'token_invalid' };
  }

  return { ok: true };
}

export function checkInternalAuth(req) {
  const token = req.headers.get(INTERNAL_HEADER)?.trim() || '';
  if (!token) return false;
  return token === ENV.INTERNAL_API_TOKEN;
}

export const INTERNAL_DEBUG_HEADER = DEBUG_HEADER;
export const INTERNAL_AUTH_HEADER = INTERNAL_HEADER;

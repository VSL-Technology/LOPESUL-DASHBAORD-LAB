import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getErrorStatus } from '@/lib/api/errorCodes';
import { applySecurityHeaders } from '@/lib/security/httpGuards';
import { withRequestIdHeaders } from '@/lib/security/requestId';

function mergeHeaders(response, headers) {
  if (!headers) return;
  const entries = headers instanceof Headers ? headers.entries() : Object.entries(headers);
  for (const [key, value] of entries) {
    if (value == null) continue;
    response.headers.set(key, String(value));
  }
}

function finalize(response, { requestId, headers, noStore = true } = {}) {
  const finalRequestId = String(requestId || crypto.randomUUID());
  withRequestIdHeaders(response, finalRequestId);
  mergeHeaders(response, headers);
  return applySecurityHeaders(response, { noStore });
}

export function ok(data, opts = {}) {
  const status = Number(opts?.status || 200);
  const requestId = String(opts?.requestId || crypto.randomUUID());
  const body = {
    ok: true,
    data: data ?? null,
    requestId,
  };

  const response = NextResponse.json(body, { status });
  return finalize(response, opts);
}

export function fail(code, opts = {}) {
  const normalizedCode = String(code || 'INTERNAL_ERROR').trim().toUpperCase();
  const status = Number(opts?.status || getErrorStatus(normalizedCode));
  const requestId = String(opts?.requestId || crypto.randomUUID());
  const error = { code: normalizedCode };

  if (opts?.meta && typeof opts.meta === 'object') {
    error.meta = opts.meta;
  }

  const body = {
    ok: false,
    error,
    requestId,
  };

  const response = NextResponse.json(body, { status });
  return finalize(response, opts);
}

export function codeFromStatus(status) {
  const value = Number(status || 500);
  if (value === 400) return 'BAD_REQUEST';
  if (value === 401) return 'UNAUTHORIZED';
  if (value === 403) return 'FORBIDDEN';
  if (value === 404) return 'NOT_FOUND';
  if (value === 429) return 'RATE_LIMITED';
  if (value >= 500) return 'INTERNAL_ERROR';
  return 'BAD_REQUEST';
}

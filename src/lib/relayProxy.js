// src/lib/relayProxy.js
// Helper centralizado para chamadas ao Relay com timeout + retry, sempre com HMAC assinado.
import 'server-only';
import { relayFetchSigned } from './relayFetchSigned';

const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const DEFAULT_TIMEOUT = 5000;
const DEFAULT_RETRIES = 1;

function isAbortError(err) {
  return err?.name === 'AbortError';
}

function shouldRetry(status) {
  return TRANSIENT_STATUSES.has(status);
}

function normalizePath(path) {
  if (!path || typeof path !== 'string') return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

export async function relayProxyFetch(path, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const method = String(opts.method || 'GET').toUpperCase();
  const originalUrl = normalizePath(path);

  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    attempt += 1;

    try {
      const out = await relayFetchSigned({
        method,
        originalUrl,
        body: opts.body,
        headers: opts.headers || {},
        timeoutMs,
        token: opts.token,
        apiSecret: opts.apiSecret,
        baseUrl: opts.baseUrl,
        requestId: opts.requestId,
      });

      return {
        ok: true,
        status: out.status,
        json: out.data ?? null,
        text: out.text ?? null,
        error: null,
      };
    } catch (err) {
      const status = Number(err?.status || 0);
      const json = err?.data ?? null;
      const text = typeof json === 'string' ? json : null;
      lastError = err?.message || String(err);

      const retryable = status === 0 || shouldRetry(status) || isAbortError(err);
      if (attempt <= retries && retryable) {
        continue;
      }

      return {
        ok: false,
        status,
        json,
        text,
        error: lastError,
      };
    }
  }

  return { ok: false, status: 0, json: null, text: null, error: lastError || 'UNKNOWN' };
}

export default relayProxyFetch;

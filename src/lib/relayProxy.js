// src/lib/relayProxy.js
// Helper centralizado para chamadas ao Relay com timeout + retry (transientes).
import 'server-only';

const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const DEFAULT_TIMEOUT = 5000;
const DEFAULT_RETRIES = 1;

function getRelayBase() {
  const base = process.env.RELAY_URL || process.env.RELAY_BASE_URL || process.env.RELAY_BASE || '';
  if (!base) throw new Error('RELAY_URL/RELAY_BASE_URL ausente');
  return base.replace(/\/+$/, '');
}

function relayHeaders(extra = {}) {
  const token = process.env.RELAY_TOKEN;
  return {
    Authorization: token ? `Bearer ${token}` : '',
    'Content-Type': 'application/json',
    ...extra,
  };
}

function isAbortError(err) {
  return err?.name === 'AbortError';
}

function shouldRetry(status) {
  return TRANSIENT_STATUSES.has(status);
}

async function fetchWithTimeout(url, init, ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function relayProxyFetch(path, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const method = opts.method || 'GET';
  const body = opts.body ? JSON.stringify(opts.body) : undefined;
  const headers = relayHeaders(opts.headers || {});

  const base = getRelayBase();
  const url = `${base}${path.startsWith('/') ? '' : '/'}${path}`;

  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    attempt++;
    try {
      const res = await fetchWithTimeout(
        url,
        {
          method,
          headers,
          body,
          cache: 'no-store',
        },
        timeoutMs
      );

      const text = await res.text().catch(() => null);
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok) {
        if (attempt <= retries && shouldRetry(res.status)) {
          lastError = `HTTP_${res.status}`;
          continue;
        }
        return { ok: false, status: res.status, json, text, error: `HTTP_${res.status}` };
      }

      return { ok: true, status: res.status, json, text, error: null };
    } catch (err) {
      const retryable = isAbortError(err) || err?.code === 'ECONNRESET' || err?.code === 'ENOTFOUND';
      lastError = err?.message || String(err);
      if (attempt <= retries && retryable) {
        continue;
      }
      return { ok: false, status: 0, json: null, text: null, error: lastError };
    }
  }

  return { ok: false, status: 0, json: null, text: null, error: lastError || 'UNKNOWN' };
}

export default relayProxyFetch;

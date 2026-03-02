import 'server-only';
import crypto from 'crypto';

type RelayOpts = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  originalUrl: string; // path + query exatamente como será chamado (ex.: /relay/exec?x=1)
  body?: unknown; // objeto ou string já pronta
  token?: string; // ex.: process.env.RELAY_TOKEN_EXEC
  apiSecret?: string; // ex.: process.env.RELAY_API_SECRET
  baseUrl?: string; // ex.: https://relay.lopesuldashboardwifi.com
  headers?: Record<string, string>;
  requestId?: string;
  timeoutMs?: number;
};

type RelaySignedResponse<T = any> = {
  ok: boolean;
  status: number;
  data: T | null;
  text: string | null;
};

const DEFAULT_TIMEOUT_MS =
  (process.env.RELAY_TIMEOUT_MS && Number(process.env.RELAY_TIMEOUT_MS)) || 7000;

function makeNonce() {
  return crypto.randomUUID().replaceAll('-', '');
}

function toRawBody(body: unknown): string {
  if (body === undefined || body === null) return '';
  if (typeof body === 'string') return body;
  // Sem identação para bater com rawBody do express.json
  return JSON.stringify(body);
}

function resolveBaseUrl(baseUrl?: string) {
  const base =
    baseUrl ||
    process.env.RELAY_BASE_URL ||
    process.env.RELAY_URL ||
    process.env.RELAY_BASE ||
    '';
  return base.replace(/\/+$/, '');
}

function resolveApiSecret(apiSecret?: string) {
  return apiSecret || process.env.RELAY_API_SECRET || '';
}

function resolveRequestId(
  requestId?: string,
  headers?: Record<string, string>
) {
  if (requestId && requestId.trim()) return requestId.trim();
  if (!headers) return crypto.randomUUID();

  const key = Object.keys(headers).find(
    (k) => k.toLowerCase() === 'x-request-id'
  );
  const value = key ? String(headers[key] || '').trim() : '';
  return value || crypto.randomUUID();
}

function configError(message: string, code: string) {
  const err = new Error(message) as Error & { status?: number; data?: Record<string, string> };
  err.status = 500;
  err.data = { error: code };
  return err;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(id);
  }
}

export async function relayFetchSigned<T = any>(opts: RelayOpts): Promise<RelaySignedResponse<T>> {
  if (!opts?.originalUrl || !opts.originalUrl.startsWith('/')) {
    throw new Error('originalUrl must start with "/"');
  }

  const baseUrl = resolveBaseUrl(opts.baseUrl);
  const apiSecret = resolveApiSecret(opts.apiSecret);
  const token = opts.token || process.env.RELAY_TOKEN || '';
  const requestId = resolveRequestId(opts.requestId, opts.headers);

  if (!baseUrl) throw configError('Missing RELAY_BASE_URL/RELAY_URL/RELAY_BASE', 'relay_base_url_missing');
  if (!apiSecret) throw configError('Missing RELAY_API_SECRET', 'relay_api_secret_missing');
  if (!token) throw configError('Missing relay token for request', 'relay_token_missing');

  const ts = String(Date.now()); // ms
  const nonce = makeNonce();
  const rawBody = toRawBody(opts.body);

  const base = `${opts.method}\n${opts.originalUrl}\n${ts}\n${nonce}\n${rawBody}`;
  const sigHex = crypto.createHmac('sha256', apiSecret).update(base).digest('hex');

  const url = `${baseUrl}${opts.originalUrl}`;
  const extraHeaders = { ...(opts.headers || {}) };
  delete (extraHeaders as Record<string, string>)['x-request-id'];
  delete (extraHeaders as Record<string, string>)['X-Request-Id'];

  const res = await fetchWithTimeout(
    url,
    {
      method: opts.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(rawBody ? { 'Content-Type': 'application/json' } : {}),
        'x-relay-ts': ts,
        'x-relay-nonce': nonce,
        'x-relay-signature': sigHex,
        'x-request-id': requestId,
        ...extraHeaders,
      },
      body: rawBody ? rawBody : undefined,
    },
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  const text = await res.text().catch(() => null);
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const err = new Error(`relay ${res.status} ${res.statusText}`);
    (err as any).status = res.status;
    (err as any).data = data;
    throw err;
  }

  return { ok: res.ok, status: res.status, data, text };
}

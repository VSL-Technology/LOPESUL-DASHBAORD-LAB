// src/lib/relayClient.ts
// Cliente fino para falar com o Relay usando assinatura HMAC (relayFetchSigned).
import 'server-only';
import { relayFetchSigned } from '@/lib/relayFetchSigned';

export type RelayStatus = {
  state: 'OK' | 'DEGRADED' | 'COOLDOWN' | 'FAILED';
  retryInMs: number;
  messageCode: string;
};

export type RelayActionResult = {
  ok: boolean;
  state: 'APPLIED' | 'PENDING' | 'FAILED';
  retryInMs?: number;
  messageCode?: string;
};

export type RelayActionContext = {
  identity: string;
  pedidoId?: string;
  sessionId?: string;
  mac?: string;
  ip?: string;
  plano?: { minutos?: number; perfil?: string; valor?: number };
};

type RelayResponse = {
  ok: boolean;
  status: number;
  json?: any;
  text?: string | null;
  error?: string | null;
};

const DEFAULT_TIMEOUT = 6000;
const TRANSIENT = new Set([502, 503, 504]);

function parseList(envValue?: string) {
  return (envValue || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function sanitizeAllowedHosts(envValue?: string): string[] {
  const hostPattern = /^(?:[a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+$|^(?:\d{1,3}\.){3}\d{1,3}$|^\[[0-9a-fA-F:]+\]$/;
  return (envValue || '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => !!v && hostPattern.test(v));
}

function sanitizeAllowedPorts(envValue?: string): string[] {
  return (envValue || '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => {
      if (v === '') return true;
      if (!/^\d+$/.test(v)) return false;
      const num = Number(v);
      return num >= 1 && num <= 65535;
    });
}

function validateRelayBase(raw?: string) {
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`Protocolo não permitido em RELAY_URL: ${url.protocol}`);
    }

    const defaultAllowedHosts = ['localhost', '127.0.0.1', '::1'];
    const allowedHosts = new Set([
      ...defaultAllowedHosts,
      ...sanitizeAllowedHosts(process.env.RELAY_ALLOWED_HOSTS),
    ]);
    if (!allowedHosts.has(url.hostname)) {
      throw new Error(`Host não permitido em RELAY_URL: ${url.hostname}`);
    }

    const defaultAllowedPorts = ['', '80', '443', '3001'];
    const allowedPorts = new Set([
      ...defaultAllowedPorts,
      ...sanitizeAllowedPorts(process.env.RELAY_ALLOWED_PORTS),
    ]);
    if (!allowedPorts.has(url.port)) {
      throw new Error(`Porta não permitida em RELAY_URL: ${url.port || '(padrão)'}`);
    }

    if (url.pathname && url.pathname !== '/' && url.pathname !== '') {
      throw new Error(`Path não permitido em RELAY_URL: ${url.pathname}`);
    }

    return url.origin.replace(/\/$/, '');
  } catch (err: any) {
    if (err && typeof err.message === 'string' && err.message.includes('RELAY_URL')) {
      throw err;
    }
    throw new Error(`RELAY_URL inválida ("${raw}"): ${err?.message || err}`);
  }
}

function relayBaseUrl() {
  return validateRelayBase(
    process.env.RELAY_BASE_URL || process.env.RELAY_URL || process.env.RELAY_BASE
  );
}

function relayToken() {
  return process.env.RELAY_TOKEN || process.env.RELAY_API_TOKEN || '';
}

function relaySecret() {
  return process.env.RELAY_API_SECRET || '';
}

function normalizePath(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

function parseBody(body?: unknown) {
  if (body === undefined || body === null) return undefined;
  if (typeof body !== 'string') return body;
  const trimmed = body.trim();
  if (!trimmed) return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return body;
  }
}

async function relaySignedCall<T>(path: string, init?: RequestInit & { requestId?: string }): Promise<T> {
  const base = relayBaseUrl();
  const token = relayToken();
  const apiSecret = relaySecret();

  if (!base) throw new Error('Missing RELAY_BASE_URL/RELAY_URL');
  if (!token) throw new Error('Missing RELAY_TOKEN/RELAY_API_TOKEN');
  if (!apiSecret) throw new Error('Missing RELAY_API_SECRET');

  const method = String(init?.method || 'GET').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE';
  const headers = (init?.headers || {}) as Record<string, string>;

  const out = await relayFetchSigned<T>({
    method,
    originalUrl: normalizePath(path),
    body: parseBody(init?.body),
    baseUrl: base,
    token,
    apiSecret,
    headers,
    timeoutMs: DEFAULT_TIMEOUT,
    requestId: (init as any)?.requestId,
  });

  return out.data as T;
}

// STATUS (fonte da verdade do roteador)
export async function relayIdentityStatus(
  identity: string,
  opts?: { requestId?: string }
): Promise<RelayStatus> {
  return relaySignedCall<RelayStatus>(`/relay/identity/status?identity=${encodeURIComponent(identity)}`, {
    requestId: opts?.requestId,
  });
}

// AÇÕES (declarativas)
export async function relayAuthorize(
  ctx: RelayActionContext,
  opts?: { requestId?: string }
): Promise<RelayActionResult> {
  return relaySignedCall<RelayActionResult>(`/relay/hotspot/authorize`, {
    method: 'POST',
    body: JSON.stringify(ctx),
    requestId: opts?.requestId,
  });
}

export async function relayRevoke(
  ctx: RelayActionContext,
  opts?: { requestId?: string }
): Promise<RelayActionResult> {
  return relaySignedCall<RelayActionResult>(`/relay/hotspot/revoke`, {
    method: 'POST',
    body: JSON.stringify(ctx),
    requestId: opts?.requestId,
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Compat: mantém callRelay para os usos existentes, agora sempre assinado.
export async function callRelay(
  path: string,
  body: any,
  opts?: {
    method?: string;
    timeoutMs?: number;
    retries?: number;
    headers?: Record<string, string>;
    requestId?: string;
  }
): Promise<RelayResponse> {
  const method = (opts?.method || 'POST').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE';
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT;
  const retries = typeof opts?.retries === 'number' ? opts.retries : 1;

  const base = relayBaseUrl();
  const token = relayToken();
  const apiSecret = relaySecret();

  if (!base) {
    return { ok: false, status: 0, error: 'RELAY_URL_NAO_CONFIGURADA' };
  }
  if (!token) {
    return { ok: false, status: 0, error: 'RELAY_TOKEN_NAO_CONFIGURADO' };
  }
  if (!apiSecret) {
    return { ok: false, status: 0, error: 'RELAY_API_SECRET_NAO_CONFIGURADO' };
  }

  let attempt = 0;
  let lastError: string | null = null;

  while (attempt <= retries) {
    attempt += 1;

    try {
      const out = await relayFetchSigned({
        method,
        originalUrl: normalizePath(path),
        body,
        headers: opts?.headers || {},
        timeoutMs,
        baseUrl: base,
        token,
        apiSecret,
        requestId: opts?.requestId,
      });

      return {
        ok: true,
        status: out.status,
        json: out.data,
        text: out.text,
        error: null,
      };
    } catch (err: any) {
      const status = Number(err?.status || 0);
      const json = err?.data || null;
      const text = typeof json === 'string' ? json : null;
      const remoteError =
        (json && (json.error || json.message)) || text || (err?.message ? String(err.message) : `status_${status || 0}`);

      lastError = remoteError;

      const retryable = status === 0 || TRANSIENT.has(status) || err?.name === 'AbortError';
      if (attempt <= retries && retryable) {
        await sleep(200 * attempt);
        continue;
      }

      return {
        ok: false,
        status,
        json,
        text,
        error: remoteError,
      };
    }
  }

  return { ok: false, status: 0, error: lastError || 'UNEXPECTED' };
}

export default callRelay;

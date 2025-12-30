// src/lib/relayClient.ts
// Cliente fino para falar com o Relay: centraliza URL/token, evita lógica de rede no backend.
import 'server-only';

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

function parseList(envValue?: string) {
  return (envValue || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function sanitizeAllowedHosts(envValue?: string): string[] {
  // Permite apenas hostnames simples e IPs literais (v4/v6) para os hosts extras configurados via env.
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

function relayHeaders(extra?: Record<string, string>) {
  const token = process.env.RELAY_TOKEN || process.env.RELAY_API_TOKEN;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function relayFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = relayBaseUrl();
  if (!base) throw new Error('Missing RELAY_BASE_URL/RELAY_URL');

  const url = `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: relayHeaders(init?.headers as Record<string, string> | undefined),
  });

  const text = await res.text().catch(() => null);
  const json = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;

  if (!res.ok) {
    const err = new Error((json && (json.error || json.message)) || `Relay HTTP ${res.status}`);
    (err as any).status = res.status;
    (err as any).detail = json;
    throw err;
  }

  return json as T;
}

// STATUS (fonte da verdade do roteador)
export async function relayIdentityStatus(identity: string): Promise<RelayStatus> {
  return relayFetch<RelayStatus>(`/relay/identity/status?identity=${encodeURIComponent(identity)}`);
}

// AÇÕES (declarativas)
export async function relayAuthorize(ctx: RelayActionContext): Promise<RelayActionResult> {
  return relayFetch<RelayActionResult>(`/relay/hotspot/authorize`, {
    method: 'POST',
    body: JSON.stringify(ctx),
  });
}

export async function relayRevoke(ctx: RelayActionContext): Promise<RelayActionResult> {
  return relayFetch<RelayActionResult>(`/relay/hotspot/revoke`, {
    method: 'POST',
    body: JSON.stringify(ctx),
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Compat: mantém callRelay para os usos existentes, mas centraliza URL/token aqui.
export async function callRelay(
  path: string,
  body: any,
  opts?: { method?: string; timeoutMs?: number; retries?: number; headers?: Record<string, string> }
): Promise<RelayResponse> {
  const method = opts?.method || 'POST';
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT;
  const retries = typeof opts?.retries === 'number' ? opts.retries : 1;

  const base = relayBaseUrl();
  if (!base) {
    return { ok: false, status: 0, error: 'RELAY_URL_NAO_CONFIGURADA' };
  }

  const url = `${base}${path.startsWith('/') ? '' : '/'}${path}`;

  let attempt = 0;
  let lastError: string | null = null;

  while (attempt <= retries) {
    attempt++;
    try {
      const res = await fetchWithTimeout(
        url,
        {
          method,
          headers: relayHeaders({
            ...(opts?.headers || {}),
          }),
          body: body !== undefined ? JSON.stringify(body) : undefined,
        },
        timeoutMs
      );

      const text = await res.text().catch(() => null);
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }

      const remoteError = (json && (json.error || json.message)) || text || `status_${res.status}`;

      return {
        ok: res.ok,
        status: res.status,
        json,
        text,
        error: res.ok ? null : remoteError,
      };
    } catch (err: any) {
      const isAbort = err && err.name === 'AbortError';
      lastError = isAbort ? 'TIMEOUT' : (err && err.message ? err.message : String(err));
      if (attempt > retries) break;
      await sleep(200 * attempt);
    }
  }

  return { ok: false, status: 0, error: lastError || 'UNEXPECTED' };
}

export default callRelay;

// src/lib/relay.ts
type FetchRequestInit = globalThis.RequestInit;
const DEFAULT_TIMEOUT = 7000;

declare const process: {
  env?: {
    RELAY_ALLOWED_HOSTS?: string;
    RELAY_ALLOWED_PORTS?: string;
    RELAY_URL?: string;
    RELAY_BASE?: string;
    RELAY_TOKEN?: string; // << precisamos disso
  };
};

function parseList(envValue?: string) {
  return (envValue || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function validateRelayBase(raw?: string) {
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`Protocolo não permitido em RELAY_URL: ${url.protocol}`);
    }

    const env = (typeof process !== 'undefined' && process.env) ? process.env : {};

    const defaultAllowedHosts = ['localhost', '127.0.0.1', '::1'];
    const allowedHosts = new Set([...defaultAllowedHosts, ...parseList(env.RELAY_ALLOWED_HOSTS)]);
    if (!allowedHosts.has(url.hostname)) {
      throw new Error(`Host não permitido em RELAY_URL: ${url.hostname}`);
    }

    const defaultAllowedPorts = ['', '80', '443', '3001']; // '' = porta padrão do protocolo
    const allowedPorts = new Set([...defaultAllowedPorts, ...parseList(env.RELAY_ALLOWED_PORTS)]);
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

// Normaliza e valida a base do Relay vinda do env (RELAY_URL ou RELAY_BASE)
export function getRelayBase() {
  const env = (typeof process !== 'undefined' && process.env) ? process.env : {};
  const base = env.RELAY_URL || env.RELAY_BASE || '';
  return validateRelayBase(base);
}

function getRelayToken() {
  const env = (typeof process !== 'undefined' && process.env) ? process.env : {};
  return env.RELAY_TOKEN || '';
}

async function fetchWithTimeout(url: string, init: FetchRequestInit = {}, ms = DEFAULT_TIMEOUT) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Faz requisição HTTP para o Relay via fetchWithTimeout, sempre com Bearer.
 * Lança erro se RELAY_URL/RELAY_BASE estiver ausente.
 */
export async function relayFetch(path: string, init: FetchRequestInit = {}, ms = DEFAULT_TIMEOUT) {
  const base = getRelayBase();
  if (!base) throw new Error('RELAY_URL/RELAY_BASE ausente');

  const token = getRelayToken();
  // Não enviaremos requests sem token — evita spam de [AUTH FAIL]
  if (!token || token.length < 10) {
    throw new Error('RELAY_TOKEN ausente ou inválido');
  }

  const p = path.startsWith('/') ? path : `/${path}`;
  const url = `${base}${p}`;

  // Garante headers e Bearer
  const headers = new Headers(init.headers || {});
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  return fetchWithTimeout(url, { ...init, headers }, ms);
}

// helpers opcionais
export function toHealth(url: string) {
  const base = url.replace(/\/relay\/exec\/?$/i, '').replace(/\/$/, '');
  return `${base}/health`;
}
export function toExec(url: string) {
  if (/\/relay\/exec\/?$/i.test(url)) return url;
  return `${url.replace(/\/$/, '')}/relay/exec`;
}

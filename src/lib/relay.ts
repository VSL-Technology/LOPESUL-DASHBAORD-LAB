// src/lib/relay.ts
// Utilitários de validação e normalização da URL base do Relay.

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

    const defaultAllowedHosts = ['localhost', '127.0.0.1', '::1'];
    const allowedHosts = new Set([
      ...defaultAllowedHosts,
      ...parseList(process.env.RELAY_ALLOWED_HOSTS),
    ]);
    if (!allowedHosts.has(url.hostname)) {
      throw new Error(`Host não permitido em RELAY_URL: ${url.hostname}`);
    }

    const defaultAllowedPorts = ['', '80', '443', '3001'];
    const allowedPorts = new Set([
      ...defaultAllowedPorts,
      ...parseList(process.env.RELAY_ALLOWED_PORTS),
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

// Normaliza e valida a base do Relay vinda do env (RELAY_BASE_URL, RELAY_URL ou RELAY_BASE).
export function getRelayBase() {
  const base = process.env.RELAY_BASE_URL || process.env.RELAY_URL || process.env.RELAY_BASE || '';
  return validateRelayBase(base);
}

export function toHealth(url: string) {
  const base = url.replace(/\/relay\/exec\/?$/i, '').replace(/\/$/, '');
  return `${base}/health`;
}

export function toExec(url: string) {
  if (/\/relay\/exec\/?$/i.test(url)) return url;
  return `${url.replace(/\/$/, '')}/relay/exec`;
}

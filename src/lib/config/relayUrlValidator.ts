/**
 * Shared RELAY_URL validation utility
 * Valida protocolo, hostname, porta e pathname de RELAY_URL para evitar SSRF
 */

/**
 * Faz parse de uma string de valores separados por vírgula do env
 */
function parseList(envValue?: string): string[] {
  return (envValue || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Lógica interna de validação da URL do relay
 * @param raw URL bruta vinda do env
 * @param env Objeto de environment variables (opcional, usa process.env por padrão)
 * @returns Objeto URL validado
 * @throws Error se a URL for inválida ou não atender aos critérios de segurança
 */
function validateRelayUrlInternal(raw?: string, env?: Record<string, string | undefined>): URL {
  if (!raw) {
    throw new Error('RELAY_URL não pode estar vazia ou indefinida');
  }

  try {
    const url = new URL(raw);

    // Protocolo: apenas http/https
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`Protocolo não permitido em RELAY_URL: ${url.protocol}`);
    }

    // Acessa env do ambiente ou usa o fornecido
    const envVars = env || (typeof process !== 'undefined' && process.env) || {};

    // Hosts permitidos (localhost por padrão + extras via env)
    const defaultAllowedHosts = ['localhost', '127.0.0.1', '::1'];
    const allowedHosts = new Set([
      ...defaultAllowedHosts,
      ...parseList(envVars.RELAY_ALLOWED_HOSTS)
    ]);
    if (!allowedHosts.has(url.hostname)) {
      throw new Error(`Host não permitido em RELAY_URL: ${url.hostname}`);
    }

    // Portas permitidas (padrão http/https + 3001; extras via env)
    const defaultAllowedPorts = ['', '80', '443', '3001']; // '' = porta padrão do protocolo
    const allowedPorts = new Set([
      ...defaultAllowedPorts,
      ...parseList(envVars.RELAY_ALLOWED_PORTS)
    ]);
    if (!allowedPorts.has(url.port)) {
      throw new Error(`Porta não permitida em RELAY_URL: ${url.port || '(padrão)'}`);
    }

    // Path: apenas vazio ou raiz
    if (url.pathname && url.pathname !== '/' && url.pathname !== '') {
      throw new Error(`Path não permitido em RELAY_URL: ${url.pathname}`);
    }

    return url;
  } catch (err: any) {
    // Se já é um erro de validação, propaga
    if (err && typeof err.message === 'string' && err.message.includes('RELAY_URL')) {
      throw err;
    }
    // Caso contrário, envolve com mensagem genérica
    throw new Error(`RELAY_URL inválida: ${err?.message || err}`);
  }
}

/**
 * Valida e normaliza a URL do relay, retornando origin
 * @param raw URL bruta vinda do env
 * @param env Objeto de environment variables (opcional, usa process.env por padrão)
 * @returns URL normalizada como origin (sem trailing slash)
 * @throws Error se a URL for inválida ou não atender aos critérios de segurança
 */
export function validateRelayUrl(raw?: string, env?: Record<string, string | undefined>): string {
  if (!raw) return '';
  
  const url = validateRelayUrlInternal(raw, env);
  return url.origin.replace(/\/$/, '');
}

/**
 * Valida e normaliza a URL do relay, retornando toString()
 * Compatível com o comportamento original do worker
 * @param raw URL bruta vinda do env
 * @param env Objeto de environment variables (opcional, usa process.env por padrão)
 * @returns URL normalizada como toString() (sem trailing slash)
 * @throws Error se a URL for inválida ou não atender aos critérios de segurança
 */
export function validateRelayUrlWithToString(raw?: string, env?: Record<string, string | undefined>): string {
  if (!raw) return '';
  
  const url = validateRelayUrlInternal(raw, env);
  return url.toString().replace(/\/$/, '');
}

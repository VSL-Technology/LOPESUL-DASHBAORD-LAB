// src/lib/security/rateLimiter.js
// Wrapper de compatibilidade — delega para src/lib/rateLimit.ts (Redis ou in-memory).
// Mantém a assinatura enforceRateLimit(key, { windowMs, max }) → boolean
// para não alterar os 20+ call sites existentes.
import { rateLimitMs } from '@/lib/rateLimit';

/**
 * @param {string} key  Chave do bucket, ex: "webhook:10.0.0.1"
 * @param {{ windowMs?: number, max?: number }} options
 * @returns {Promise<boolean>} true = request permitido, false = bloqueado
 */
export async function enforceRateLimit(
  key,
  { windowMs = 60_000, max = 10 } = {}
) {
  try {
    const result = await rateLimitMs({ key, limit: max, windowMs });
    return result.allowed;
  } catch (err) {
    // em caso de falha completa, permite a requisição (fail-open)
    console.error('[enforceRateLimit] erro interno, permitindo request', err?.message || err);
    return true;
  }
}

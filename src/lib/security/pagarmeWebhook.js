// src/lib/security/pagarmeWebhook.js
import crypto from 'crypto';
import { ENV } from '@/lib/env';
import { logger } from '@/lib/logger';

function getWebhookSecret() {
  const secret = ENV.PAGARME_WEBHOOK_SECRET || ENV.PAGARME_SECRET_KEY || '';
  return secret.trim();
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyPagarmeSignature(rawBody, signatureHeader) {
  const secret = getWebhookSecret();

  if (!secret) {
    logger.error('[WEBHOOK] Secret do Pagar.me não configurada');
    return false;
  }

  if (!signatureHeader) {
    logger.warn('[WEBHOOK] Header de assinatura ausente');
    return false;
  }

  const cleanSignature = signatureHeader.includes('=')
    ? signatureHeader.split('=')[1].trim()
    : signatureHeader.trim();

  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(rawBody, 'utf8');
  const expected = hmac.digest('hex');

  const ok = timingSafeEqual(cleanSignature, expected);

  if (!ok) {
    logger.warn(
      { receivedPrefix: cleanSignature.slice(0, 8), expectedPrefix: expected.slice(0, 8) },
      '[WEBHOOK] Assinatura inválida'
    );
  }

  return ok;
}

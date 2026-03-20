// Helper para chamar o Relay identity refresh com HMAC, timeout, retry e correlation-id.
import crypto from 'crypto';
import { relayFetchSigned } from './relayFetchSigned';

function makeRequestId() {
  return crypto.randomUUID?.() ?? crypto.randomBytes(16).toString('hex');
}

function isRetryableStatus(status) {
  return status === 502 || status === 503 || status === 504;
}

export async function relayIdentityRefresh({
  relayUrl,
  relayToken,
  payload,
  timeoutMs = 5000,
  retries = 1,
  requestId = makeRequestId(),
  logger = console,
  apiSecret = process.env.RELAY_API_SECRET,
}) {
  const baseUrl = relayUrl || process.env.RELAY_BASE_URL || process.env.RELAY_URL || process.env.RELAY_BASE;
  const token = relayToken || process.env.RELAY_TOKEN || process.env.RELAY_API_TOKEN;

  if (!baseUrl) {
    logger.error?.({ requestId, sid: payload?.sid }, '[backend] relay refresh missing relayUrl configuration');
    return { ok: false, requestId, status: 0, data: { code: 'relay_invalid_url' } };
  }

  if (!token) {
    logger.error?.({ requestId, sid: payload?.sid }, '[backend] relay refresh missing relay token');
    return { ok: false, requestId, status: 0, data: { code: 'relay_token_missing' } };
  }

  if (!apiSecret) {
    logger.error?.({ requestId, sid: payload?.sid }, '[backend] relay refresh missing RELAY_API_SECRET');
    return { ok: false, requestId, status: 0, data: { code: 'relay_api_secret_missing' } };
  }

  let attempt = 0;
  while (attempt <= retries) {
    attempt += 1;

    try {
      const out = await relayFetchSigned({
        method: 'POST',
        originalUrl: '/relay/identity/refresh',
        body: payload,
        timeoutMs,
        baseUrl,
        token,
        apiSecret,
        requestId,
      });

      return {
        ok: true,
        requestId,
        status: out.status,
        data: out.data || {},
      };
    } catch (err) {
      const status = Number(err?.status || 0);
      const data = err?.data || { code: 'relay_unreachable', detail: err?.message || String(err) };

      if (attempt <= retries && isRetryableStatus(status)) {
        logger.warn?.(
          { requestId, attempt, status, sid: payload?.sid },
          '[backend] relay refresh transient HTTP error; retrying',
        );
        continue;
      }

      return {
        ok: false,
        requestId,
        status,
        data,
      };
    }
  }

  return { ok: false, requestId, status: 0, data: { code: 'relay_unreachable' } };
}

// Helper para chamar o relay com timeout, retry e correlation-id
import crypto from 'crypto';

function withTimeout(ms) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { controller, clear: () => clearTimeout(t) };
}

function makeRequestId() {
  return crypto.randomUUID?.() ?? crypto.randomBytes(16).toString('hex');
}

function isRetryableStatus(status) {
  return status === 502 || status === 503 || status === 504;
}

function isAbortError(err) {
  return err?.name === 'AbortError';
}

function buildRelayUrl(relayUrl) {
  try {
    const base = new URL(relayUrl);

    // Only allow http/https to mitigate SSRF risk via other schemes.
    if (base.protocol !== 'http:' && base.protocol !== 'https:') {
      return null;
    }

    // Build the final URL using URL API instead of string concat.
    return new URL('/relay/identity/refresh', base).toString();
  } catch {
    return null;
  }
}

export async function relayIdentityRefresh({
  relayUrl,
  relayToken,
  payload,
  timeoutMs = 5000,
  retries = 1,
  requestId = makeRequestId(),
  logger = console,
}) {
  const url = buildRelayUrl(relayUrl);
  if (!url) {
    logger.error?.(
      { requestId, sid: payload?.sid },
      '[backend] relay refresh invalid relayUrl configuration',
    );
    return {
      ok: false,
      requestId,
      status: 0,
      data: { code: 'relay_invalid_url' },
    };
  }

  let attempt = 0;
  while (attempt <= retries) {
    attempt += 1;

    const { controller, clear } = withTimeout(timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${relayToken}`,
          'Content-Type': 'application/json',
          'X-Request-Id': requestId,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (attempt <= retries && isRetryableStatus(res.status)) {
          logger.warn?.(
            { requestId, attempt, status: res.status, sid: payload?.sid },
            '[backend] relay refresh transient HTTP error; retrying',
          );
          continue;
        }

        return {
          ok: false,
          requestId,
          status: res.status,
          data: json,
        };
      }

      return {
        ok: true,
        requestId,
        status: res.status,
        data: json,
      };
    } catch (err) {
      const retryable =
        isAbortError(err) || err?.code === 'ECONNRESET' || err?.code === 'ENOTFOUND';

      if (attempt <= retries && retryable) {
        logger.warn?.(
          { requestId, attempt, sid: payload?.sid, err: err?.message || String(err) },
          '[backend] relay refresh network/timeout error; retrying',
        );
        continue;
      }

      return {
        ok: false,
        requestId,
        status: 0,
        data: { code: 'relay_unreachable', detail: err?.message || String(err) },
      };
    } finally {
      clear();
    }
  }

  return { ok: false, requestId, status: 0, data: { code: 'relay_unreachable' } };
}

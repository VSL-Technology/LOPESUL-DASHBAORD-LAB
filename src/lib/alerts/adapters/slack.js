// Minimal Slack webhook adapter with limited retries and backoff.
// Safe: never throws to caller (it logs failures) and avoids leaking secrets.
import { ENV } from '@/lib/env';

export async function sendSlack(alertEvent) {
  const url = ENV.ALERT_SLACK_WEBHOOK_URL;
  if (!url) return false; // no-op when not configured

  // Validate and restrict the webhook URL to prevent SSRF/misconfiguration.
  let validatedUrl;
  try {
    const parsed = new URL(url);
    // Require HTTPS, a known Slack webhook host, and an expected webhook path.
    const allowedHosts = new Set(['hooks.slack.com']);
    const allowedPathPrefixes = ['/services/'];
    const isAllowedHost = allowedHosts.has(parsed.hostname);
    const isHttps = parsed.protocol === 'https:';
    // Check path starts with /services/ and contains no traversal sequences
    const hasAllowedPath = allowedPathPrefixes.some(
      (prefix) => parsed.pathname.startsWith(prefix) && !parsed.pathname.includes('..')
    );
    const hasAllowedPort = !parsed.port || parsed.port === '443';
    if (!isHttps || !isAllowedHost || !hasAllowedPath || !hasAllowedPort) {
      console.error('[ALERT_SLACK] invalid webhook URL configuration (host/protocol/path/port); refusing to send');
      return false;
    }
    validatedUrl = parsed.toString();
  } catch (e) {
    console.error('[ALERT_SLACK] invalid webhook URL configuration; refusing to send');
    return false;
  }

  const textLines = [];
  textLines.push(`*${alertEvent.rule}* — ${alertEvent.severity}`);
  if (alertEvent.summary) textLines.push(`_${alertEvent.summary}_`);
  if (alertEvent.context) textLines.push(`Context: ${JSON.stringify(alertEvent.context)}`);
  if (alertEvent.evidence) textLines.push(`Evidence: ${JSON.stringify({ count: alertEvent.evidence.count, sample: alertEvent.evidence.sampleEventIds?.slice(0,3) })}`);

  const payload = { text: textLines.join('\n') };

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let timeout;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(validatedUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (res.ok) return true;
      // non-2xx response
      const body = await res.text().catch(() => '');
      console.error('[ALERT_SLACK] non-ok response', res.status, body?.slice(0,200));
    } catch (err) {
      // network or other failure
      console.error('[ALERT_SLACK_FAIL]', err?.message || err);
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    // backoff before next attempt (but not after the last attempt)
    if (attempt < maxAttempts) {
      const backoff = 500 * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  return false;
}

export default sendSlack;

import alertCritical from '@/lib/security/alerts';
import prisma from '@/lib/prisma';
import { sendSlack } from '@/lib/alerts/adapters/slack';

/**
 * Dispatch an alert asynchronously with minimal deduplication/cooldown.
 * This function schedules the real delivery (setImmediate) and returns quickly.
 * It records an `ALERT_SENT` sentinel in the AuditLog to support cooldown/dedup.
 */
export function dispatchAlert(alertEvent) {
  // schedule non-blocking work
  setImmediate(async () => {
    try {
      const cooldownMinutes = (alertEvent.cooldownMinutes && Number(alertEvent.cooldownMinutes)) || 5;
      const target = alertEvent.context?.mikrotikId || alertEvent.context?.orderCode || 'unknown';
      const since = new Date(Date.now() - cooldownMinutes * 60 * 1000);

      // Check recent ALERT_SENT entries to avoid duplicate noisy alerts.
      const recent = await prisma.auditLog.findMany({
        where: { event: 'ALERT_SENT', AND: [{ createdAt: { gte: since } }] },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      const exists = recent.find((r) => {
        try {
          return r.metadata && r.metadata.rule === alertEvent.rule && r.metadata.target === target;
        } catch (e) {
          return false;
        }
      });

      if (exists) {
        // duplicate within cooldown window — skip sending
        console.warn('[ALERT] duplicate suppressed', { rule: alertEvent.rule, target, cooldownMinutes });
        return;
      }

      // Build message and send to sink (fire-and-forget to external channels)
      const message = `[${alertEvent.rule}] ${alertEvent.severity} - ${alertEvent.summary || ''}`;
      try {
        alertCritical(message, alertEvent);
      } catch (e) {
        // channel failure — log and continue
        console.error('[ALERT_CHANNEL_FAIL]', e?.message || e);
      }

      // Try Slack webhook adapter if configured (fire-and-forget style handled by this setImmediate)
      try {
        if (process.env.ALERT_SLACK_WEBHOOK_URL) {
          sendSlack(alertEvent).catch((err) => {
            // log adapter-level failures but never throw
            console.error('[ALERT_SLACK_ADAPTER_FAIL]', err?.message || err);
          });
        }
      } catch (e) {
        // ignore adapter installation errors
      }

      // Record sentinel so future alerts are deduped within cooldown
      try {
        await prisma.auditLog.create({
          data: {
            requestId: alertEvent.evidence?.sampleEventIds?.[0] || `alert-${Date.now()}`,
            event: 'ALERT_SENT',
            actorId: null,
            ip: null,
            entityId: null,
            result: 'SENT',
            metadata: {
              rule: alertEvent.rule,
              target,
              severity: alertEvent.severity,
              evidence: alertEvent.evidence || {},
            },
          },
        });
      } catch (e) {
        // never fail because of logging the sentinel
        console.error('[ALERT] failed to record sentinel', e?.message || e);
      }
    } catch (err) {
      // overall catch
      console.error('[ALERT_DISPATCHER] error', err?.message || err);
    }
  });
  // return immediately
  return Promise.resolve();
}

export default dispatchAlert;

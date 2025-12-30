import prisma from '@/lib/prisma';
import { dispatchAlert } from '@/lib/alerts/dispatcher';

// Alert engine: evaluate a single audit record against a set of rules.
// Rules are intentionally lightweight and query a small recent window.

const MINUTES = (n) => n * 60 * 1000;

function safeMetadata(audit) {
  return (audit && audit.metadata) || {};
}

export async function processAudit(audit) {
  try {
    // Only react to release-related events
    const evt = audit.event;
    if (!evt || !evt.startsWith('MIKROTIK_RELEASE')) return null;

    const meta = safeMetadata(audit);
    const mikrotikId = meta.mikrotikId || (meta.mikrotik && meta.mikrotik.host) || null;
    const orderCode = meta.orderCode || null;

    // Rule A: concentrated fails on same mikrotikId: >=3 FAIL within 5 minutes
    if (mikrotikId) {
      const since = new Date(Date.now() - MINUTES(5));
      const rows = await prisma.auditLog.findMany({
        where: {
          event: 'MIKROTIK_RELEASE_FAIL',
          AND: [{ createdAt: { gte: since } }],
          // metadata match: prisma can't query deep JSON reliably without native filters;
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      // Filter by mikrotikId in metadata client-side
      const matched = rows.filter((r) => r.metadata?.mikrotikId === mikrotikId);
      if (matched.length >= 3) {
        const sample = matched.slice(0, 3).map((r) => r.id);
        const alertEvent = {
          rule: 'MIKROTIK_FAIL_CONCENTRATED',
          severity: 'HIGH',
          summary: `>=3 fails for mikrotik ${mikrotikId} in 5m`,
          context: { mikrotikId },
          evidence: { count: matched.length, windowMinutes: 5, sampleEventIds: sample },
        };
        await dispatchAlert(alertEvent);
        return alertEvent;
      }
    }

    // Rule B: distributed fails across multiple mikrotiks: >=10 FAIL in 10 minutes across >=3 mikrotikIds
    {
      const since = new Date(Date.now() - MINUTES(10));
      const rows = await prisma.auditLog.findMany({
        where: { event: 'MIKROTIK_RELEASE_FAIL', AND: [{ createdAt: { gte: since } }] },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      if (rows.length >= 10) {
        const grouping = {};
        for (const r of rows) {
          const mid = r.metadata?.mikrotikId || 'unknown';
          grouping[mid] = grouping[mid] || [];
          grouping[mid].push(r.id);
        }
        const distinctMik = Object.keys(grouping).filter((k) => k !== 'unknown').length;
        if (distinctMik >= 3) {
          const sample = Object.values(grouping).flat().slice(0, 10);
          const alertEvent = {
            rule: 'MIKROTIK_FAIL_DISTRIBUTED',
            severity: 'CRITICAL',
            summary: `>=10 fails in 10m across ${distinctMik} mikrotiks`,
            context: { distinctMikrotiks: distinctMik },
            evidence: { count: rows.length, windowMinutes: 10, sampleEventIds: sample },
          };
          await dispatchAlert(alertEvent);
          return alertEvent;
        }
      }
    }

    // Rule C: interleaved FAIL/SUCCESS for same orderCode in 10 minutes (race/inconsistency)
    if (orderCode) {
      const since = new Date(Date.now() - MINUTES(10));
      const rows = await prisma.auditLog.findMany({
        where: { AND: [{ createdAt: { gte: since } }], },
        orderBy: { createdAt: 'asc' },
        take: 200,
      });
      // Filter client-side for same orderCode and relevant events
      const seq = rows
        .filter((r) => r.metadata?.orderCode === orderCode)
        .filter((r) => r.metadata && r.metadata.orderCode === orderCode)
        .map((r) => ({ id: r.id, event: r.event, ts: r.createdAt }));
      if (seq.length >= 2) {
        // detect alternation: presence of both FAIL and SUCCESS and sequence not all same
        const hasFail = seq.some((s) => s.event && s.event.endsWith('FAIL'));
        const hasSuccess = seq.some((s) => s.event && s.event.endsWith('SUCCESS'));
        if (hasFail && hasSuccess) {
          // Simple alternation detection
          let alternates = false;
          for (let i = 1; i < seq.length; i++) {
            if (seq[i - 1].event !== seq[i].event) {
              alternates = true;
              break;
            }
          }
          if (alternates) {
            const alertEvent = {
              rule: 'MIKROTIK_FAIL_SUCCESS_INTERLEAVE',
              severity: 'CRITICAL',
              summary: `Interleaved FAIL/SUCCESS for order ${orderCode} in 10m`,
              context: { orderCode },
              evidence: { count: seq.length, windowMinutes: 10, sampleEventIds: seq.slice(0, 10).map((s) => s.id) },
            };
            await dispatchAlert(alertEvent);
            return alertEvent;
          }
        }
      }
    }

    return null;
  } catch (err) {
    // Never throw from alert engine — log and continue
    console.error('[ALERT-ENGINE] error processing audit', err?.message || err);
    return null;
  }
}

export default { processAudit };

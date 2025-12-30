import { PrismaClient } from '@prisma/client';
import { sendSlack } from '../src/lib/alerts/adapters/slack.js';
const prisma = new PrismaClient();

const MINUTES = (n) => n * 60 * 1000;

async function sendAndRecord(alertEvent) {
  // send slack (if configured) and record ALERT_SENT sentinel
  try {
    const sent = await sendSlack(alertEvent).catch(() => false);
    // record sentinel regardless of send success to avoid duplicate noisy alerts
    await prisma.auditLog.create({
      data: {
        requestId: alertEvent.evidence?.sampleEventIds?.[0] || `alert-${Date.now()}`,
        event: 'ALERT_SENT',
        actorId: null,
        ip: null,
        entityId: null,
        result: sent ? 'SENT' : 'FAILED',
        metadata: {
          rule: alertEvent.rule,
          target: alertEvent.context?.mikrotikId || alertEvent.context?.orderCode || 'unknown',
          severity: alertEvent.severity,
          evidence: alertEvent.evidence || {},
        },
      },
    });
    console.log('[INTEGRATION] dispatched', alertEvent.rule, '-> sent=', sent);
  } catch (e) {
    console.error('[INTEGRATION] failed dispatch or record', e?.message || e);
  }
}

async function process() {
  const recent = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  console.log('[INTEGRATION] loaded', recent.length, 'audit rows');

  // Rule A: concentrated fails on same mikrotikId: >=3 FAIL within 5 minutes
  {
    const since = new Date(Date.now() - MINUTES(5));
    const rows = recent.filter(r => r.event === 'MIKROTIK_RELEASE_FAIL' && new Date(r.createdAt) >= since);
    const grouping = {};
    for (const r of rows) {
      const mid = (r.metadata && r.metadata.mikrotikId) || 'unknown';
      grouping[mid] = grouping[mid] || [];
      grouping[mid].push(r);
    }
    for (const mid of Object.keys(grouping)) {
      if (mid === 'unknown') continue;
      if (grouping[mid].length >= 3) {
        const sample = grouping[mid].slice(0,3).map(x => x.id);
        const alertEvent = {
          rule: 'MIKROTIK_FAIL_CONCENTRATED',
          severity: 'HIGH',
          summary: `>=3 fails for mikrotik ${mid} in 5m`,
          context: { mikrotikId: mid },
          evidence: { count: grouping[mid].length, windowMinutes: 5, sampleEventIds: sample }
        };
        await sendAndRecord(alertEvent);
      }
    }
  }

  // Rule B: distributed fails across multiple mikrotiks: >=10 FAIL in 10 minutes across >=3 mikrotikIds
  {
    const since = new Date(Date.now() - MINUTES(10));
    const rows = recent.filter(r => r.event === 'MIKROTIK_RELEASE_FAIL' && new Date(r.createdAt) >= since);
    if (rows.length >= 10) {
      const grouping = {};
      for (const r of rows) {
        const mid = (r.metadata && r.metadata.mikrotikId) || 'unknown';
        grouping[mid] = grouping[mid] || [];
        grouping[mid].push(r.id);
      }
      const distinctMik = Object.keys(grouping).filter(k => k !== 'unknown').length;
      if (distinctMik >= 3) {
        const sample = Object.values(grouping).flat().slice(0,10);
        const alertEvent = {
          rule: 'MIKROTIK_FAIL_DISTRIBUTED',
          severity: 'CRITICAL',
          summary: `>=10 fails in 10m across ${distinctMik} mikrotiks`,
          context: { distinctMikrotiks: distinctMik },
          evidence: { count: rows.length, windowMinutes: 10, sampleEventIds: sample }
        };
        await sendAndRecord(alertEvent);
      }
    }
  }

  // Rule C: interleaved FAIL/SUCCESS for same orderCode in 10 minutes (race/inconsistency)
  {
    const since = new Date(Date.now() - MINUTES(10));
    const relevant = recent.filter(r => new Date(r.createdAt) >= since && r.metadata && r.metadata.orderCode).reverse();
    const byOrder = {};
    for (const r of relevant) {
      const code = r.metadata.orderCode;
      byOrder[code] = byOrder[code] || [];
      byOrder[code].push(r);
    }
    for (const code of Object.keys(byOrder)) {
      const seq = byOrder[code].map(s => s.event);
      const hasFail = seq.some(e => e && e.endsWith('FAIL'));
      const hasSuccess = seq.some(e => e && e.endsWith('SUCCESS'));
      if (hasFail && hasSuccess) {
        // detect alternation
        let alternates = false;
        for (let i = 1; i < seq.length; i++) {
          if (seq[i] !== seq[i-1]) { alternates = true; break; }
        }
        if (alternates) {
          const sample = byOrder[code].slice(0,10).map(x => x.id);
          const alertEvent = {
            rule: 'MIKROTIK_FAIL_SUCCESS_INTERLEAVE',
            severity: 'CRITICAL',
            summary: `Interleaved FAIL/SUCCESS for order ${code} in 10m`,
            context: { orderCode: code },
            evidence: { count: seq.length, windowMinutes: 10, sampleEventIds: sample }
          };
          await sendAndRecord(alertEvent);
        }
      }
    }
  }

  await prisma.$disconnect();
}

process().catch(e => { console.error(e); process.exit(1); });

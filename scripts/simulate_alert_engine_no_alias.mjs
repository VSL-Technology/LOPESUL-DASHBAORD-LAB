import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const MINUTES = (n) => n * 60 * 1000;

async function run() {
  const recent = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  console.log('Loaded', recent.length, 'recent audit rows');

  // replicate Rule A, B, C checks
  // Rule A: per mikrotikId concentrated fails in last 5m
  const sinceA = new Date(Date.now() - MINUTES(5));
  const failsA = recent.filter(r => r.event === 'MIKROTIK_RELEASE_FAIL' && new Date(r.createdAt) >= sinceA);
  const byM = {};
  for (const r of failsA) {
    const mid = (r.metadata && r.metadata.mikrotikId) || 'unknown';
    byM[mid] = byM[mid] || [];
    byM[mid].push(r);
  }
  for (const mid of Object.keys(byM)) {
    if (mid === 'unknown') continue;
    if (byM[mid].length >= 3) {
      console.error('[SIMULATED-ALERT] MIKROTIK_FAIL_CONCENTRATED', { mikrotikId: mid, count: byM[mid].length, sample: byM[mid].slice(0,3).map(x=>x.id) });
    }
  }

  // Rule B: distributed fails >=10 in 10 min across >=3 mikrotikIds
  const sinceB = new Date(Date.now() - MINUTES(10));
  const failsB = recent.filter(r => r.event === 'MIKROTIK_RELEASE_FAIL' && new Date(r.createdAt) >= sinceB);
  if (failsB.length >= 10) {
    const group = {};
    for (const r of failsB) {
      const mid = (r.metadata && r.metadata.mikrotikId) || 'unknown';
      group[mid] = group[mid] || [];
      group[mid].push(r);
    }
    const distinctMik = Object.keys(group).filter(k => k !== 'unknown').length;
    if (distinctMik >= 3) {
      console.error('[SIMULATED-ALERT] MIKROTIK_FAIL_DISTRIBUTED', { distinctMikrotiks: distinctMik, totalFails: failsB.length });
    }
  }

  // Rule C: interleaved FAIL/SUCCESS same orderCode in 10min
  const sinceC = new Date(Date.now() - MINUTES(10));
  const relevant = recent.filter(r => new Date(r.createdAt) >= sinceC && r.metadata && r.metadata.orderCode).reverse();
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
        console.error('[SIMULATED-ALERT] MIKROTIK_FAIL_SUCCESS_INTERLEAVE', { orderCode: code, count: seq.length, sample: byOrder[code].slice(0,10).map(x => x.id) });
      }
    }
  }

  await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });

// Trigger script for Rule B: distributed fails across multiple mikrotiks
// Creates >=10 FAIL events within the last 2 seconds across >=3 mikrotikIds
// NOTE: Run the alert engine simulation (e.g., run_alert_engine_on_recent.mjs or
// simulate_alert_engine_full.mjs) immediately after this script to ensure events
// fall within the 10-minute detection window.

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Spread events every 200ms to create a 2-second window for 10 events
const SPREAD_INTERVAL_MS = 200;
const EVENT_COUNT = 10;

(async ()=>{
  try {
    const now = Date.now();
    const miks = ['b-mik-1','b-mik-2','b-mik-3'];
    for (let i=0;i<EVENT_COUNT;i++){
      const mik = miks[i % miks.length];
      await prisma.auditLog.create({data:{
        requestId: `ruleB-${now}-${i}`,
        event: 'MIKROTIK_RELEASE_FAIL',
        actorId: null,
        ip: '127.0.0.1',
        entityId: null,
        result: 'FAIL',
        metadata: { orderCode: `RULEB_ORDER_${i}`, mikrotikId: mik },
        createdAt: new Date(now - (SPREAD_INTERVAL_MS * (EVENT_COUNT - 1 - i)))
      }});
    }
    console.log('WROTE rule B events');
    process.exit(0);
  } catch(e){ console.error(e); process.exit(1);} finally{ await prisma.$disconnect(); }
})();

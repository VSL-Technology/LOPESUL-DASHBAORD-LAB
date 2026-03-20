import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
(async ()=>{
  try {
    const now = Date.now();
    const code = 'RULEC_ORDER_1';
    const seq = [
      { event: 'MIKROTIK_RELEASE_ATTEMPT', result: 'ATTEMPT' },
      { event: 'MIKROTIK_RELEASE_SUCCESS', result: 'SUCCESS' },
      { event: 'MIKROTIK_RELEASE_FAIL', result: 'FAIL' },
      { event: 'MIKROTIK_RELEASE_SUCCESS', result: 'SUCCESS' }
    ];
    for (let i=0;i<seq.length;i++){
      const s = seq[i];
      await prisma.auditLog.create({data:{
        requestId: `ruleC-${now}-${i}`,
        event: s.event,
        actorId: null,
        ip: '127.0.0.1',
        entityId: null,
        result: s.result,
        metadata: { orderCode: code, mikrotikId: 'c-mik-1' },
        createdAt: new Date(now - (1000*(seq.length-i)))
      }});
    }
    console.log('WROTE rule C events');
    process.exit(0);
  } catch(e){ console.error(e); process.exit(1);} finally{ await prisma.$disconnect(); }
})();

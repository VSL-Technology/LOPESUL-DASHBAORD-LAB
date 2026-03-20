import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
(async ()=>{
  try {
    const now = Date.now();
    const mik = 'trigger-mik-a-1';
    for (let i=0;i<3;i++){
      await prisma.auditLog.create({data:{
        requestId: `ruleA-${now}-${i}`,
        event: 'MIKROTIK_RELEASE_FAIL',
        actorId: null,
        ip: '127.0.0.1',
        entityId: null,
        result: 'FAIL',
        metadata: { orderCode: 'RULEA_ORDER', mikrotikId: mik },
        createdAt: new Date(now - (3000*(3-i)))
      }});
    }
    console.log('WROTE rule A events');
    process.exit(0);
  } catch(e){ console.error(e); process.exit(1);} finally{ await prisma.$disconnect(); }
})();

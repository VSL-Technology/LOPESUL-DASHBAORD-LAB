import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
(async ()=>{
  try {
    const rule = 'MIKROTIK_FAIL_CONCENTRATED';
    const target = 'dedupe-mik-1';
    const now = new Date();
    // create an ALERT_SENT within cooldown
    await prisma.auditLog.create({data:{
      requestId: 'sent-1-' + Date.now(),
      event: 'ALERT_SENT',
      actorId: null,
      ip: null,
      entityId: null,
      result: 'SENT',
      metadata: { rule, target },
      createdAt: new Date(now.getTime() - 1000) // 1s ago
    }});

    // now simulate dispatcher check
    const cooldownMinutes = 5;
    const since = new Date(Date.now() - cooldownMinutes * 60 * 1000);
    const recent = await prisma.auditLog.findMany({ where: { event: 'ALERT_SENT', AND: [{ createdAt: { gte: since } }] }, orderBy: { createdAt: 'desc' }, take: 50 });
    const exists = recent.find(r => r.metadata && r.metadata.rule === rule && r.metadata.target === target);
    console.log('Dedupe check exists?', !!exists);
    process.exit(0);
  } catch(e){ console.error(e); process.exit(1);} finally{ await prisma.$disconnect(); }
})();

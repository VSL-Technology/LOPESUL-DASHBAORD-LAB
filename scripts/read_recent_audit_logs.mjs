import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
try {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, requestId: true, event: true, result: true, entityId: true, metadata: true, createdAt: true }
  });
  for (const r of rows) {
    console.log(r.id, r.requestId, r.event, r.result, r.entityId, JSON.stringify(r.metadata), r.createdAt.toISOString());
  }
  process.exit(0);
} catch (e) {
  console.error('ERR', e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}

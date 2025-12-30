import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

try {
  const now = new Date();
  const create1 = await prisma.auditLog.create({
    data: {
      requestId: 'test-release-invalid-' + Date.now(),
      event: 'ACCESS_GRANTED',
      actorId: null,
      ip: '127.0.0.1',
      entityId: 'TEST_ORDER_PLACEHOLDER',
      result: 'FAIL',
      metadata: { reason: 'simulated invalid liberação' },
      createdAt: now,
    }
  });

  const create2 = await prisma.auditLog.create({
    data: {
      requestId: 'test-release-valid-' + Date.now(),
      event: 'ACCESS_GRANTED',
      actorId: null,
      ip: '127.0.0.1',
      entityId: 'TEST_ORDER_PLACEHOLDER',
      result: 'SUCCESS',
      metadata: { detail: 'simulated successful liberação' },
      createdAt: new Date(now.getTime() + 1000),
    }
  });

  console.log('WROTE', create1.id, create2.id);

  const recent = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, requestId: true, event: true, result: true, entityId: true, metadata: true, createdAt: true }
  });

  console.log('RECENT AUDIT LOGS');
  for (const r of recent) {
    console.log(r.id, r.requestId, r.event, r.result, r.entityId, JSON.stringify(r.metadata), r.createdAt.toISOString());
  }

  process.exit(0);
} catch (e) {
  console.error('ERR', e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}

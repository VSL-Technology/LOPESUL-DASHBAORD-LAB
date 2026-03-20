import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

try {
  const now = Date.now();
  // 1) Invalid order: attempt then fail
  const attemptInvalid = await prisma.auditLog.create({
    data: {
      requestId: 'sim-release-invalid-' + now,
      event: 'MIKROTIK_RELEASE_ATTEMPT',
      actorId: null,
      ip: '127.0.0.1',
      entityId: null,
      result: 'ATTEMPT',
      metadata: { orderCode: 'NON_EXISTENT_ORDER' },
      createdAt: new Date(now - 2000),
    }
  });
  const failInvalid = await prisma.auditLog.create({
    data: {
      requestId: 'sim-release-invalid-' + now,
      event: 'MIKROTIK_RELEASE_FAIL',
      actorId: null,
      ip: '127.0.0.1',
      entityId: null,
      result: 'FAIL',
      metadata: { reason: 'INVALID_ORDER', orderCode: 'NON_EXISTENT_ORDER' },
      createdAt: new Date(now - 1000),
    }
  });

  // 2) Valid order: attempt then success
  const attemptValid = await prisma.auditLog.create({
    data: {
      requestId: 'sim-release-valid-' + now,
      event: 'MIKROTIK_RELEASE_ATTEMPT',
      actorId: null,
      ip: '127.0.0.1',
      entityId: 'test-pedido-id',
      result: 'ATTEMPT',
      metadata: { orderCode: 'EXISTING_TEST_ORDER' },
      createdAt: new Date(now + 1000),
    }
  });
  const successValid = await prisma.auditLog.create({
    data: {
      requestId: 'sim-release-valid-' + now,
      event: 'MIKROTIK_RELEASE_SUCCESS',
      actorId: null,
      ip: '127.0.0.1',
      entityId: 'test-pedido-id',
      result: 'SUCCESS',
      metadata: { orderCode: 'EXISTING_TEST_ORDER', mikrotikId: 'mik-host-123', sessaoId: 'sess-test-1' },
      createdAt: new Date(now + 2000),
    }
  });

  console.log('WROTE', attemptInvalid.id, failInvalid.id, attemptValid.id, successValid.id);
  process.exit(0);
} catch (e) {
  console.error('ERR', e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}

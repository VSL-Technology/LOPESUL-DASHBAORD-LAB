import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const existing = await prisma.pedido.findFirst();
  if (existing) {
    console.log('EXISTS', existing.id, existing.code);
    process.exit(0);
  }
  const r = await prisma.pedido.create({
    data: {
      code: 'TEST_ORDER_001_' + Date.now(),
      amount: 100,
      method: 'PIX',
      status: 'PENDING',
      description: 'Teste liberação',
    },
  });
  console.log('CREATED', r.id, r.code);
  process.exit(0);
} catch (e) {
  console.error('ERR', e.message || e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}

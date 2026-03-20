const { PrismaClient } = require('@prisma/client');

(async function(){
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.pedido.findFirst();
    if (existing) {
      console.log('EXISTS', existing.id, existing.code);
      return;
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
  } catch (e) {
    console.error('ERR', e.message || e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();

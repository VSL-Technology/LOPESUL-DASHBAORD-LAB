import { PrismaClient } from '@prisma/client';
import { processAudit } from '@/lib/alerts/engine';
const prisma = new PrismaClient();

async function main() {
  const recent = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  console.log('Feeding', recent.length, 'events into alert engine');
  for (const r of recent.reverse()) {
    // call processAudit and await to see dispatcher output in order
    await processAudit(r);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

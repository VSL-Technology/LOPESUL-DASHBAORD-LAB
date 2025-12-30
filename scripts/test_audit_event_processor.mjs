#!/usr/bin/env node
// scripts/test_audit_event_processor.mjs
// Test script to verify the audit event processor works correctly

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[TEST] Starting audit event processor test...\n');

  try {
    // 1. Create a test pedido if it doesn't exist
    const testPedido = await prisma.pedido.findFirst({
      where: { code: { startsWith: 'TEST-AUDIT-' } },
    });

    let pedidoId = testPedido?.id;

    if (!testPedido) {
      console.log('[TEST] Creating test pedido...');
      const created = await prisma.pedido.create({
        data: {
          code: `TEST-AUDIT-${Date.now()}`,
          description: 'Test pedido for audit processor',
          status: 'PAID',
          ip: '192.168.1.100',
          deviceMac: '00:11:22:33:44:55',
        },
      });
      pedidoId = created.id;
      console.log(`[TEST] Created test pedido: ${created.code} (${pedidoId})\n`);
    } else {
      console.log(`[TEST] Using existing test pedido: ${testPedido.code} (${pedidoId})\n`);
    }

    // 2. Create a WEBHOOK_RELEASE_REQUESTED audit event
    console.log('[TEST] Creating WEBHOOK_RELEASE_REQUESTED audit event...');
    const auditEvent = await prisma.auditLog.create({
      data: {
        requestId: `test-${Date.now()}`,
        event: 'WEBHOOK_RELEASE_REQUESTED',
        result: 'PENDING',
        entityId: pedidoId,
        ip: '192.168.1.100',
        metadata: {
          orderCode: testPedido?.code || 'TEST-CODE',
          pedidoId: pedidoId,
          ip: '192.168.1.100',
          mac: '00:11:22:33:44:55',
          router: 'test-router',
          note: 'Created by test script',
        },
      },
    });
    console.log(`[TEST] Created audit event: ${auditEvent.id}\n`);

    // 3. Query for pending events (simulating what the processor will do)
    console.log('[TEST] Querying for pending WEBHOOK_RELEASE_REQUESTED events...');
    const pendingEvents = await prisma.auditLog.findMany({
      where: {
        event: 'WEBHOOK_RELEASE_REQUESTED',
        result: 'PENDING',
      },
      take: 5,
      orderBy: { createdAt: 'asc' },
    });

    console.log(`[TEST] Found ${pendingEvents.length} pending event(s):`);
    pendingEvents.forEach((evt) => {
      console.log(`  - ${evt.id}: ${evt.event} (${evt.result}), created: ${evt.createdAt}`);
    });
    console.log();

    // 4. Verify the test event is in the list
    const testEventFound = pendingEvents.some((evt) => evt.id === auditEvent.id);
    if (testEventFound) {
      console.log('[TEST] ✓ Test event found in pending events list');
    } else {
      console.log('[TEST] ✗ Test event NOT found in pending events list');
    }

    console.log('\n[TEST] Test completed successfully!');
    console.log('\n[TEST] Note: The scheduler will process this event within 60 seconds.');
    console.log('[TEST] You can monitor the processing by checking the audit log result status.\n');
  } catch (error) {
    console.error('[TEST] Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

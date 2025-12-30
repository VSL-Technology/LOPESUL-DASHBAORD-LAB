import prisma from '@/lib/prisma';
import { processAudit } from '@/lib/alerts/engine';

/**
 * Audit logger helper — single place to write audit events.
 * Keep it small and sync-friendly; failures should not crash main flow.
 */
export async function auditLog(data) {
  try {
    const created = await prisma.auditLog.create({
      data: {
        requestId: data.requestId,
        event: data.event,
        actorId: data.actorId || null,
        ip: data.ip || null,
        entityId: data.entityId || null,
        result: data.result,
        metadata: data.metadata || {},
      },
    });
    // Fire-and-forget: let the alert engine evaluate this audit record asynchronously.
    // Don't await to avoid blocking main flow.
    try {
      processAudit(created).catch((e) => {
        console.error('[AUDIT->ALERT] processing failed', e?.message || e);
      });
    } catch (e) {
      // ignore
    }
    return created;
  } catch (err) {
    // never throw from audit logger — degrade gracefully
    // write to console for developer visibility
    // future: ship to an external sink
    console.error('[AUDIT] falha ao gravar auditLog', err?.message || err);
    return null;
  }
}

export default auditLog;

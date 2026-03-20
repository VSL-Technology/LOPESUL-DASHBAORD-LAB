// src/lib/auditEventProcessor.js
// Processa eventos AuditEntry com action=WEBHOOK_RELEASE_REQUESTED e result=PENDING,
// disparando o Relay para liberar acesso no Mikrotik.
import prisma from '@/lib/prisma';
import { liberarAcessoInteligente } from '@/lib/liberarAcesso';
import { logger } from '@/lib/logger';

let warnedMissingDelegate = false;

function getAuditDelegate() {
  if (prisma?.auditEntry) {
    return prisma.auditEntry;
  }
  if (!warnedMissingDelegate) {
    warnedMissingDelegate = true;
    logger.warn(
      { hint: 'Run `npm run prisma:generate` and restart Next.js dev server' },
      '[AUDIT_PROCESSOR] Prisma client missing auditEntry delegate; skipping processor'
    );
  }
  return null;
}

/**
 * Processa AuditEntry com action=WEBHOOK_RELEASE_REQUESTED e result=PENDING
 */
async function processPendingReleaseRequests(limit = 10) {
  try {
    const delegate = getAuditDelegate();
    if (!delegate) return;

    const pendingEvents = await delegate.findMany({
      where: { action: 'WEBHOOK_RELEASE_REQUESTED', result: 'PENDING' },
      take: limit,
      orderBy: { createdAt: 'asc' },
    });

    if (pendingEvents.length === 0) return;

    logger.info(
      { count: pendingEvents.length },
      '[AUDIT_PROCESSOR] Found pending release requests to process'
    );

    for (const event of pendingEvents) {
      await processReleaseRequest(event);
    }
  } catch (error) {
    logger.error(
      { error: error?.message || error },
      '[AUDIT_PROCESSOR] Error processing pending release requests'
    );
  }
}

async function processReleaseRequest(event) {
  const metadata = event.payload || {};
  const { pedidoId, ip, mac, router, orderCode } = metadata;
  const delegate = getAuditDelegate();
  if (!delegate) return;

  try {
    await delegate.update({
      where: { id: event.id },
      data: { result: 'PROCESSING' },
    });

    logger.info(
      { eventId: event.id, pedidoId, orderCode },
      '[AUDIT_PROCESSOR] Processing release request'
    );

    if (!pedidoId) {
      await delegate.update({
        where: { id: event.id },
        data: {
          result: 'FAILED',
          payload: { ...metadata, error: 'missing_pedido_id', processedAt: new Date().toISOString() },
        },
      });
      logger.warn({ eventId: event.id }, '[AUDIT_PROCESSOR] Missing pedidoId in event payload');
      return;
    }

    let releaseResult;
    try {
      releaseResult = await liberarAcessoInteligente({
        pedidoId,
        mikId: router || null,
        ipAtual: ip || null,
        macAtual: mac || null,
        modo: 'WEBHOOK',
      });
    } catch (liberarError) {
      logger.error(
        { eventId: event.id, pedidoId, error: liberarError?.message || liberarError },
        '[AUDIT_PROCESSOR] liberarAcessoInteligente threw an exception'
      );
      releaseResult = { ok: false, error: liberarError?.message || String(liberarError) };
    }

    const resultStatus = releaseResult?.ok ? 'SUCCESS' : 'FAILED';
    await delegate.update({
      where: { id: event.id },
      data: {
        result: resultStatus,
        payload: {
          ...metadata,
          releaseResult: {
            ok: releaseResult?.ok || false,
            roteadorId: releaseResult?.roteadorId || null,
            mikResult: releaseResult?.mikResult || null,
          },
          processedAt: new Date().toISOString(),
        },
      },
    });

    logger.info(
      { eventId: event.id, pedidoId, success: releaseResult?.ok },
      '[AUDIT_PROCESSOR] Completed processing release request'
    );
  } catch (error) {
    try {
      await delegate.update({
        where: { id: event.id },
        data: {
          result: 'FAILED',
          payload: { ...metadata, error: error?.message || String(error), processedAt: new Date().toISOString() },
        },
      });
    } catch (updateError) {
      logger.error(
        { eventId: event.id, error: updateError?.message || updateError },
        '[AUDIT_PROCESSOR] Failed to update audit entry after error'
      );
    }
    logger.error(
      { eventId: event.id, pedidoId, error: error?.message || error },
      '[AUDIT_PROCESSOR] Error processing release request'
    );
  }
}

export { processPendingReleaseRequests };

// src/lib/auditEventProcessor.js
// Processes audit events that require Mikrotik access release actions
// Polls for WEBHOOK_RELEASE_REQUESTED events and triggers the Relay

import prisma from '@/lib/prisma';
import { liberarAcessoInteligente } from '@/lib/liberarAcesso';
import { logger } from '@/lib/logger';

/**
 * Process pending WEBHOOK_RELEASE_REQUESTED audit events
 * These are created by the payment webhook but need to be acted upon
 * by calling the Relay to actually release Mikrotik access
 */
async function processPendingReleaseRequests(limit = 10) {
  try {
    // Find audit events that need processing
    const pendingEvents = await prisma.auditLog.findMany({
      where: {
        event: 'WEBHOOK_RELEASE_REQUESTED',
        result: 'PENDING',
      },
      take: limit,
      orderBy: { createdAt: 'asc' },
    });

    if (pendingEvents.length === 0) {
      return;
    }

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

/**
 * Process a single release request audit event
 */
async function processReleaseRequest(event) {
  const metadata = event.metadata || {};
  const { pedidoId, ip, mac, router, orderCode } = metadata;

  try {
    // Mark as processing to prevent duplicate processing
    await prisma.auditLog.update({
      where: { id: event.id },
      data: { result: 'PROCESSING' },
    });

    logger.info(
      { eventId: event.id, pedidoId, orderCode },
      '[AUDIT_PROCESSOR] Processing release request'
    );

    // Validate we have required data
    if (!pedidoId) {
      await prisma.auditLog.update({
        where: { id: event.id },
        data: {
          result: 'FAILED',
          metadata: {
            ...metadata,
            error: 'missing_pedido_id',
            processedAt: new Date().toISOString(),
          },
        },
      });
      logger.warn(
        { eventId: event.id },
        '[AUDIT_PROCESSOR] Missing pedidoId in event metadata'
      );
      return;
    }

    // Call liberarAcessoInteligente to trigger the Relay
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
      // If liberarAcessoInteligente throws, treat it as a failed release
      logger.error(
        { eventId: event.id, pedidoId, error: liberarError?.message || liberarError },
        '[AUDIT_PROCESSOR] liberarAcessoInteligente threw an exception'
      );
      releaseResult = {
        ok: false,
        error: liberarError?.message || String(liberarError),
      };
    }

    // Update audit log with result
    const resultStatus = releaseResult?.ok ? 'SUCCESS' : 'FAILED';
    await prisma.auditLog.update({
      where: { id: event.id },
      data: {
        result: resultStatus,
        metadata: {
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
    // Update audit log to mark as failed
    try {
      await prisma.auditLog.update({
        where: { id: event.id },
        data: {
          result: 'FAILED',
          metadata: {
            ...metadata,
            error: error?.message || String(error),
            processedAt: new Date().toISOString(),
          },
        },
      });
    } catch (updateError) {
      logger.error(
        { eventId: event.id, error: updateError?.message || updateError },
        '[AUDIT_PROCESSOR] Failed to update audit log after error'
      );
    }

    logger.error(
      { eventId: event.id, pedidoId, error: error?.message || error },
      '[AUDIT_PROCESSOR] Error processing release request'
    );
  }
}

export { processPendingReleaseRequests };

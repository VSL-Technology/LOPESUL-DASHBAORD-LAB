// src/lib/auditLogger.js
// Wrapper de compatibilidade — delega para src/lib/audit.ts (AuditEntry).
// Mantém a assinatura antiga para não precisar alterar todos os call sites de uma vez.
import { audit } from '@/lib/audit';

let processAuditLoader = null;

function getProcessAudit() {
  if (!processAuditLoader) {
    processAuditLoader = import('@/lib/alerts/engine')
      .then((mod) => mod?.processAudit || null)
      .catch((err) => {
        console.error('[AUDIT->ALERT] failed to load engine', err?.message || err);
        return null;
      });
  }
  return processAuditLoader;
}

/**
 * Audit logger helper — compatibilidade com call sites legados.
 * Recebe { requestId, event, actorId, ip, entityId, result, metadata }
 * e grava em AuditEntry via audit().
 */
export async function auditLog(data) {
  try {
    await audit({
      action: data.event,
      entity: guessEntity(data.event),
      entityId: data.entityId ?? null,
      actorId: data.actorId ?? null,
      payload: {
        requestId: data.requestId ?? null,
        ...(data.metadata || {}),
      },
      ip: data.ip ?? null,
      result: data.result ?? null,
    });

    // Fire-and-forget: envia para o motor de alertas
    try {
      getProcessAudit()
        .then((processAudit) => {
          if (!processAudit) return;
          // Passa um objeto compatível com o que engine.js espera
          return processAudit({
            event: data.event,
            metadata: data.metadata || {},
          }).catch((e) => {
            console.error('[AUDIT->ALERT] processing failed', e?.message || e);
          });
        })
        .catch((e) => {
          console.error('[AUDIT->ALERT] loader failed', e?.message || e);
        });
    } catch (e) {
      // ignore
    }
  } catch (err) {
    console.error('[AUDIT] falha ao gravar auditLog', err?.message || err);
  }
}

/**
 * Infere a entidade a partir do nome do evento para preencher o campo entity.
 */
function guessEntity(event) {
  const e = String(event || '').toUpperCase();
  if (e.includes('PAYMENT') || e.includes('PIX') || e.includes('WEBHOOK') || e.includes('CHARGE')) return 'payment';
  if (e.includes('LOGIN') || e.includes('SESSION') || e.includes('AUTH')) return 'session';
  if (e.includes('ACCESS') || e.includes('RELEASE') || e.includes('MIKROTIK')) return 'access';
  if (e.includes('ALERT')) return 'alert';
  if (e.includes('OPERATOR') || e.includes('OPERADOR')) return 'operator';
  return 'system';
}

export default auditLog;

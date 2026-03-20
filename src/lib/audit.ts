// src/lib/audit.ts
// Função única de auditoria — escreve em AuditEntry.
// Substitui os antigos Auditoria e AuditLog models.
import prisma from '@/lib/prisma';

export interface AuditParams {
  action: string;
  entity?: string;
  entityId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  payload?: Record<string, unknown> | null;
  ip?: string | null;
  result?: string | null;
}

export async function audit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditEntry.create({
      data: {
        action: params.action,
        entity: params.entity ?? 'system',
        entityId: params.entityId ?? null,
        actorId: params.actorId ?? null,
        actorRole: params.actorRole ?? null,
        payload: params.payload ?? {},
        ip: params.ip ?? null,
        result: params.result ?? null,
      },
    });
  } catch (err: unknown) {
    // Nunca lançar do audit — degrade gracefully
    console.error('[AUDIT] falha ao gravar auditEntry', (err as Error)?.message ?? err);
  }
}

export default audit;

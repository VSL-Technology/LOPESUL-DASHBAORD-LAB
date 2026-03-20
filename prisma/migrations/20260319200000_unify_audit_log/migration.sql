-- Unify audit log: remove Auditoria (never migrated) and AuditLog tables,
-- create single AuditEntry table.

-- Drop AuditLog indexes and table (mapped as "AuditLog" in DB due to original migration)
DROP INDEX IF EXISTS "AuditLog_requestId_idx";
DROP INDEX IF EXISTS "AuditLog_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_event_idx";
DROP TABLE IF EXISTS "AuditLog";

-- Drop audit_log (in case mapped name variant also exists)
DROP TABLE IF EXISTS "audit_log";

-- Drop Auditoria table if it was ever created
DROP INDEX IF EXISTS "Auditoria_entidade_entidadeId_idx";
DROP INDEX IF EXISTS "Auditoria_operadorId_idx";
DROP TABLE IF EXISTS "Auditoria";

-- CreateTable
CREATE TABLE "audit_entry" (
    "id"        TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action"    TEXT         NOT NULL,
    "entity"    TEXT         NOT NULL DEFAULT 'system',
    "entityId"  TEXT,
    "actorId"   TEXT,
    "actorRole" TEXT,
    "payload"   JSONB,
    "ip"        TEXT,
    "result"    TEXT,

    CONSTRAINT "audit_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_entry_entity_entityId_idx" ON "audit_entry"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_entry_actorId_idx" ON "audit_entry"("actorId");

-- CreateIndex
CREATE INDEX "audit_entry_createdAt_idx" ON "audit_entry"("createdAt");

-- CreateIndex
CREATE INDEX "audit_entry_action_createdAt_idx" ON "audit_entry"("action", "createdAt");

-- Align historical table names with Prisma @@map definitions.
-- This keeps migration history and current schema in sync without data loss.

DO $$
BEGIN
  IF to_regclass('public."AuditLog"') IS NOT NULL
     AND to_regclass('public.audit_log') IS NULL THEN
    ALTER TABLE "AuditLog" RENAME TO audit_log;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public."SessaoPagamento"') IS NOT NULL
     AND to_regclass('public.sessao_pagamento') IS NULL THEN
    ALTER TABLE "SessaoPagamento" RENAME TO sessao_pagamento;
  END IF;
END $$;

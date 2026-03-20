-- Align constraint/index names after mapped table-name normalization.
-- Safe to run multiple times via conditional checks.

DO $$
BEGIN
  IF to_regclass('public.audit_log') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'AuditLog_pkey'
        AND conrelid = 'public.audit_log'::regclass
    ) THEN
      ALTER TABLE public.audit_log
      RENAME CONSTRAINT "AuditLog_pkey" TO audit_log_pkey;
    END IF;
  END IF;
END $$;

ALTER INDEX IF EXISTS "AuditLog_createdAt_idx" RENAME TO "audit_log_createdAt_idx";
ALTER INDEX IF EXISTS "AuditLog_event_idx" RENAME TO "audit_log_event_idx";
ALTER INDEX IF EXISTS "AuditLog_requestId_idx" RENAME TO "audit_log_requestId_idx";

DO $$
BEGIN
  IF to_regclass('public.sessao_pagamento') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'SessaoPagamento_pkey'
        AND conrelid = 'public.sessao_pagamento'::regclass
    ) THEN
      ALTER TABLE public.sessao_pagamento
      RENAME CONSTRAINT "SessaoPagamento_pkey" TO sessao_pagamento_pkey;
    END IF;
  END IF;
END $$;

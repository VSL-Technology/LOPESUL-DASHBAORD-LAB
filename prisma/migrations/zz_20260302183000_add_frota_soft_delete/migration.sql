-- Soft delete metadata for Frota
ALTER TABLE "Frota"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedById" TEXT;

CREATE INDEX "Frota_deletedById_idx" ON "Frota"("deletedById");

ALTER TABLE "Frota"
ADD CONSTRAINT "Frota_deletedById_fkey"
FOREIGN KEY ("deletedById") REFERENCES "operadores"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Structured audit table for compliance trail
CREATE TABLE "Auditoria" (
  "id" TEXT NOT NULL,
  "entidade" TEXT NOT NULL,
  "entidadeId" TEXT NOT NULL,
  "acao" TEXT NOT NULL,
  "operadorId" TEXT,
  "ip" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Auditoria_entidade_entidadeId_idx" ON "Auditoria"("entidade", "entidadeId");
CREATE INDEX "Auditoria_operadorId_idx" ON "Auditoria"("operadorId");

ALTER TABLE "Auditoria"
ADD CONSTRAINT "Auditoria_operadorId_fkey"
FOREIGN KEY ("operadorId") REFERENCES "operadores"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

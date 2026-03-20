-- CreateTable
CREATE TABLE "SessaoPagamento" (
    "token" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "macInicial" TEXT,
    "ipInicial" TEXT,
    "planoId" TEXT,
    "planoMinutos" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "chargeId" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "lastSeenMac" TEXT,
    "lastSeenIp" TEXT,

    CONSTRAINT "SessaoPagamento_pkey" PRIMARY KEY ("token")
);

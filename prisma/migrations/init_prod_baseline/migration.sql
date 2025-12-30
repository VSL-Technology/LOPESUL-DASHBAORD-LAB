-- CreateEnum
CREATE TYPE "FrotaStatus" AS ENUM ('ATIVO', 'INATIVO', 'MANUTENCAO');

-- CreateEnum
CREATE TYPE "RoteadorStatus" AS ENUM ('DESCONHECIDO', 'ONLINE', 'OFFLINE', 'ERRO');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'CARD', 'BOLETO');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('CREATED', 'AUTHORIZED', 'PAID', 'REFUNDED', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "operadores" (
    "role" TEXT,
    "id" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Frota" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nome" TEXT,
    "placa" TEXT,
    "rotaLinha" TEXT,
    "status" "FrotaStatus" NOT NULL DEFAULT 'ATIVO',
    "observacoes" TEXT,
    "roteadorId" TEXT,

    CONSTRAINT "Frota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venda" (
    "id" TEXT NOT NULL,
    "frotaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valorCent" INTEGER NOT NULL,

    CONSTRAINT "Venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispositivo" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "frotaId" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "ip" INET NOT NULL,
    "mikId" TEXT,
    "mikrotikHost" TEXT,
    "mikrotikUser" TEXT,
    "mikrotikPass" TEXT,
    "mikrotikPort" INTEGER NOT NULL DEFAULT 8728,
    "mikrotikUseSsl" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Dispositivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roteador" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "identity" TEXT,
    "ipLan" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "portaApi" INTEGER NOT NULL DEFAULT 8728,
    "portaSsh" INTEGER NOT NULL DEFAULT 22,
    "wgPublicKey" TEXT,
    "wgIp" TEXT,
    "statusMikrotik" "RoteadorStatus" NOT NULL DEFAULT 'DESCONHECIDO',
    "statusWireguard" "RoteadorStatus" NOT NULL DEFAULT 'DESCONHECIDO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Roteador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes_ativas" (
    "id" TEXT NOT NULL,
    "ipCliente" TEXT NOT NULL,
    "macCliente" TEXT,
    "plano" TEXT NOT NULL,
    "inicioEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "pedidoId" TEXT,
    "roteadorId" TEXT,

    CONSTRAINT "sessoes_ativas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "deviceMac" TEXT,
    "ip" INET,
    "busId" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerDoc" TEXT,
    "metadata" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deviceId" TEXT,
    "deviceIdentifier" TEXT,

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "providerId" TEXT,
    "status" "ChargeStatus" NOT NULL DEFAULT 'CREATED',
    "method" "PaymentMethod" NOT NULL,
    "qrCode" TEXT,
    "qrCodeUrl" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "deviceId" TEXT,
    "ipInicial" INET,
    "macInicial" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL,
    "event" TEXT,
    "orderCode" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operadores_usuario_key" ON "operadores"("usuario");

-- CreateIndex
CREATE UNIQUE INDEX "Frota_roteadorId_key" ON "Frota"("roteadorId");

-- CreateIndex
CREATE INDEX "Frota_createdAt_idx" ON "Frota"("createdAt");

-- CreateIndex
CREATE INDEX "Venda_frotaId_data_idx" ON "Venda"("frotaId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "Dispositivo_mikId_key" ON "Dispositivo"("mikId");

-- CreateIndex
CREATE INDEX "Dispositivo_ip_idx" ON "Dispositivo"("ip");

-- CreateIndex
CREATE UNIQUE INDEX "Dispositivo_frotaId_ip_key" ON "Dispositivo"("frotaId", "ip");

-- CreateIndex
CREATE UNIQUE INDEX "Roteador_identity_key" ON "Roteador"("identity");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_ativas_ipCliente_key" ON "sessoes_ativas"("ipCliente");

-- CreateIndex
CREATE INDEX "sessoes_ativas_ativo_idx" ON "sessoes_ativas"("ativo");

-- CreateIndex
CREATE INDEX "sessoes_ativas_pedidoId_idx" ON "sessoes_ativas"("pedidoId");

-- CreateIndex
CREATE INDEX "sessoes_ativas_roteadorId_idx" ON "sessoes_ativas"("roteadorId");

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_code_key" ON "Pedido"("code");

-- CreateIndex
CREATE INDEX "Pedido_status_createdAt_idx" ON "Pedido"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Pedido_method_createdAt_idx" ON "Pedido"("method", "createdAt");

-- CreateIndex
CREATE INDEX "Pedido_status_processedAt_idx" ON "Pedido"("status", "processedAt");

-- CreateIndex
CREATE INDEX "Pedido_deviceId_idx" ON "Pedido"("deviceId");

-- CreateIndex
CREATE INDEX "Charge_pedidoId_idx" ON "Charge"("pedidoId");

-- CreateIndex
CREATE INDEX "Charge_status_createdAt_idx" ON "Charge"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Charge_providerId_idx" ON "Charge"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "client_tokens_token_key" ON "client_tokens"("token");

-- CreateIndex
CREATE INDEX "client_tokens_pedidoId_idx" ON "client_tokens"("pedidoId");

-- CreateIndex
CREATE INDEX "LoginAttempt_username_createdAt_idx" ON "LoginAttempt"("username", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ip_createdAt_idx" ON "LoginAttempt"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookLog_createdAt_idx" ON "WebhookLog"("createdAt");

-- CreateIndex
CREATE INDEX "WebhookLog_event_idx" ON "WebhookLog"("event");

-- AddForeignKey
ALTER TABLE "Frota" ADD CONSTRAINT "Frota_roteadorId_fkey" FOREIGN KEY ("roteadorId") REFERENCES "Roteador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_frotaId_fkey" FOREIGN KEY ("frotaId") REFERENCES "Frota"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispositivo" ADD CONSTRAINT "Dispositivo_frotaId_fkey" FOREIGN KEY ("frotaId") REFERENCES "Frota"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes_ativas" ADD CONSTRAINT "sessoes_ativas_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes_ativas" ADD CONSTRAINT "sessoes_ativas_roteadorId_fkey" FOREIGN KEY ("roteadorId") REFERENCES "Roteador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Dispositivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_tokens" ADD CONSTRAINT "client_tokens_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Dispositivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_tokens" ADD CONSTRAINT "client_tokens_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

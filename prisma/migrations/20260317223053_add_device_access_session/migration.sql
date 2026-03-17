-- CreateEnum
CREATE TYPE "DeviceAccessStatus" AS ENUM ('TRIAL', 'BLOCKED', 'PAID', 'EXPIRED');

-- CreateTable
CREATE TABLE "DeviceAccessSession" (
    "id" TEXT NOT NULL,
    "macAddress" TEXT NOT NULL,
    "currentIp" TEXT,
    "status" "DeviceAccessStatus" NOT NULL DEFAULT 'TRIAL',
    "trialStartedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "paidStartedAt" TIMESTAMP(3),
    "paidEndsAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPlanName" TEXT,
    "lastOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceAccessSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceAccessEvent" (
    "id" TEXT NOT NULL,
    "macAddress" TEXT NOT NULL,
    "ip" TEXT,
    "eventType" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceAccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceAccessSession_macAddress_key" ON "DeviceAccessSession"("macAddress");

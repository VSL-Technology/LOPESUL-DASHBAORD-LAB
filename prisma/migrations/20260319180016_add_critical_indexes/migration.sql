-- CreateIndex
CREATE INDEX "Pedido_deviceMac_idx" ON "Pedido"("deviceMac");

-- CreateIndex
CREATE INDEX "WebhookEvent_eventId_idx" ON "WebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "WebhookEvent_processedAt_idx" ON "WebhookEvent"("processedAt");

-- CreateIndex
CREATE INDEX "sessoes_ativas_macCliente_idx" ON "sessoes_ativas"("macCliente");

-- CreateIndex
CREATE INDEX "sessoes_ativas_expiraEm_idx" ON "sessoes_ativas"("expiraEm");

# Audit Event Processor - Architecture Documentation

## Overview

The Audit Event Processor is a background service that bridges the gap between the payment webhook and the Relay service for Mikrotik access release operations.

## Problem Statement

Previously, the payment webhook directly called `liberarAcessoInteligente` and `liberarAcesso` to release Mikrotik access when a payment was confirmed. This created tight coupling and made the webhook responsible for network operations.

The new architecture separates concerns:
- **Webhook**: Only validates payment and creates an audit log event
- **Audit Event Processor**: Polls for pending events and triggers the Relay
- **Relay Service**: Executes Mikrotik commands

## Architecture

```
Payment Webhook (pagarme)
  ↓
  Creates WEBHOOK_RELEASE_REQUESTED audit event (result: PENDING)
  ↓
Scheduler (runs every 60 seconds)
  ↓
Audit Event Processor
  ↓
  Queries for PENDING WEBHOOK_RELEASE_REQUESTED events
  ↓
  Calls liberarAcessoInteligente() for each event
  ↓
  Updates audit log with result (SUCCESS/FAILED)
  ↓
Relay Service
  ↓
  Executes Mikrotik commands
```

## Components

### 1. Audit Event Processor (`src/lib/auditEventProcessor.js`)

**Purpose**: Process pending audit events that require Mikrotik access release

**Key Functions**:
- `processPendingReleaseRequests(limit)`: Main entry point, queries and processes pending events
- `processReleaseRequest(event)`: Processes a single event by calling liberarAcessoInteligente

**Flow**:
1. Query AuditLog for events where `event='WEBHOOK_RELEASE_REQUESTED'` and `result='PENDING'`
2. For each event:
   - Mark as `PROCESSING` to prevent duplicate processing
   - Extract metadata (pedidoId, ip, mac, router)
   - Call `liberarAcessoInteligente()` to trigger the Relay
   - Update audit log with result (SUCCESS/FAILED) and processing details
3. Handle errors gracefully, logging failures without crashing

### 2. Scheduler Integration (`src/lib/scheduler.js`)

The processor is integrated into the existing scheduler that runs every 60 seconds.

**Execution Order**:
1. Process pending audit events (NEW)
2. Expire pending orders
3. Create sessions for paid orders without sessions
4. Revoke expired sessions

### 3. Instrumentation Hook (`src/instrumentation.js`)

Next.js instrumentation hook that initializes the scheduler when the application starts.

**Configuration**: Requires `experimental.instrumentationHook: true` in `next.config.mjs`

### 4. Test Script (`scripts/test_audit_event_processor.mjs`)

Utility script to create test audit events and verify the processor can find them.

## Audit Log Schema

```javascript
{
  id: String (cuid),
  requestId: String,
  event: 'WEBHOOK_RELEASE_REQUESTED',
  result: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED',
  entityId: String (pedidoId),
  ip: String,
  metadata: {
    orderCode: String,
    pedidoId: String,
    ip: String,
    mac: String,
    router: String,
    note: String,
    // Added after processing:
    releaseResult: {
      ok: Boolean,
      roteadorId: String,
      mikResult: Object
    },
    processedAt: ISO timestamp,
    error: String (if failed)
  },
  createdAt: DateTime
}
```

## Error Handling

1. **Missing pedidoId**: Event marked as FAILED with error 'missing_pedido_id'
2. **Relay failure**: Event marked as FAILED with error details in metadata
3. **Unexpected errors**: Event marked as FAILED, error logged

All errors are logged but don't crash the scheduler.

## Monitoring

To monitor the processor:

1. **Check for pending events**:
   ```sql
   SELECT * FROM AuditLog 
   WHERE event = 'WEBHOOK_RELEASE_REQUESTED' 
   AND result = 'PENDING';
   ```

2. **Check processing results**:
   ```sql
   SELECT result, COUNT(*) 
   FROM AuditLog 
   WHERE event = 'WEBHOOK_RELEASE_REQUESTED' 
   GROUP BY result;
   ```

3. **View failed events**:
   ```sql
   SELECT * FROM AuditLog 
   WHERE event = 'WEBHOOK_RELEASE_REQUESTED' 
   AND result = 'FAILED'
   ORDER BY createdAt DESC;
   ```

## Benefits

1. **Separation of Concerns**: Webhook only handles payment validation
2. **Resilience**: Failed releases can be retried on next scheduler tick
3. **Auditability**: All release attempts are logged with results
4. **Observability**: Easy to monitor via audit log queries
5. **Scalability**: Can process multiple events in batches

## Future Improvements

1. Add exponential backoff for failed events
2. Add maximum retry limit to prevent infinite retries
3. Add Slack/email alerts for persistent failures
4. Consider real-time processing via database triggers instead of polling
5. Add metrics/dashboards for processing success rate

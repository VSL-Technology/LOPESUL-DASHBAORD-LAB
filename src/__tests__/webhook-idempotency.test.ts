/**
 * src/__tests__/webhook-idempotency.test.ts
 *
 * Testa que o mesmo chargeId entregue 2x resulta em apenas 1 liberação.
 * O mecanismo: prisma.webhookEvent.create com uniqueKey @unique.
 * Na segunda chamada, Prisma lança P2002 e o handler retorna 200 { duplicate: true }.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── vi.hoisted garante acesso às variáveis dentro do factory vi.mock ──────

const {
  mockWebhookEventCreate,
  mockWebhookEventUpdate,
  mockWebhookLogCreate,
  mockPedidoFindFirst,
  mockPedidoUpdate,
  mockChargeFindFirst,
  mockChargeUpdate,
  mockChargeCreate,
} = vi.hoisted(() => ({
  mockWebhookEventCreate: vi.fn(),
  mockWebhookEventUpdate: vi.fn(),
  mockWebhookLogCreate: vi.fn(),
  mockPedidoFindFirst: vi.fn(),
  mockPedidoUpdate: vi.fn(),
  mockChargeFindFirst: vi.fn(),
  mockChargeUpdate: vi.fn(),
  mockChargeCreate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    webhookEvent: {
      create: mockWebhookEventCreate,
      update: mockWebhookEventUpdate,
    },
    webhookLog: { create: mockWebhookLogCreate },
    pedido: { findFirst: mockPedidoFindFirst, update: mockPedidoUpdate },
    charge: {
      findFirst: mockChargeFindFirst,
      update: mockChargeUpdate,
      create: mockChargeCreate,
    },
  },
}));

vi.mock('@/lib/security/rateLimiter', () => ({
  enforceRateLimit: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/security/pagarmeWebhook', () => ({
  verifyPagarmeSignature: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/security/requestId', () => ({
  getOrCreateRequestId: vi.fn().mockReturnValue('req-test-123'),
}));

vi.mock('@/lib/security/requestUtils', () => ({
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

vi.mock('@/lib/auditLogger', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/device-router', () => ({
  requireDeviceRouter: vi.fn().mockResolvedValue({
    device: { id: 'device-1', frotaId: null, mikId: 'mik-1' },
    router: { host: '10.0.0.1', user: 'api', pass: 'pass', port: 8728, secure: false },
  }),
}));

vi.mock('@/lib/mikrotik', () => ({
  liberarCliente: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/api/response', () => ({
  ok: vi.fn((data: unknown, opts?: { requestId?: string; status?: number }) =>
    new Response(JSON.stringify({ success: true, ...(data as object) }), {
      status: opts?.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  ),
  fail: vi.fn((code: string, opts?: { requestId?: string; status?: number }) =>
    new Response(JSON.stringify({ success: false, code }), {
      status: opts?.status ?? 500,
      headers: { 'Content-Type': 'application/json' },
    })
  ),
}));

// ─── Helpers ───────────────────────────────────────────────────────────────

// Cria um payload de webhook Pagar.me com charge.paid
function makeWebhookPayload(chargeId: string) {
  return JSON.stringify({
    id: `hook-${chargeId}`,
    type: 'charge.paid',
    data: {
      // O extractEventId usa evt.data.id PRIMEIRO, então o uniqueKey usará chargeId
      id: chargeId,
      object: 'charge',
      status: 'paid',
      code: `order-${chargeId}`,
    },
  });
}

function makeRequest(body: string): Request {
  return new Request('http://localhost/api/webhooks/pagarme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Webhook idempotency — mesmo chargeId entregue 2x', () => {
  const CHARGE_ID = 'ch_test_abc123';
  // extractEventId retorna evt.data.id primeiro → uniqueKey = pagarme:<chargeId>
  const EXPECTED_UNIQUE_KEY = `pagarme:${CHARGE_ID}`;
  const CREATED_EVENT = { id: 'wh-event-1', uniqueKey: EXPECTED_UNIQUE_KEY };

  beforeEach(() => {
    vi.clearAllMocks();
    // Defaults seguros para todos os mocks de Prisma usados no processamento
    mockWebhookLogCreate.mockResolvedValue({});
    mockWebhookEventUpdate.mockResolvedValue({});
    mockPedidoFindFirst.mockResolvedValue(null); // pedido não encontrado → sem liberação
    mockChargeFindFirst.mockResolvedValue(null);
    mockChargeCreate.mockResolvedValue({});
  });

  it('segunda entrega do mesmo chargeId retorna 200 { duplicate: true } sem reprocessar', async () => {
    // Simula que o WebhookEvent já existe → P2002 na segunda chamada
    const p2002Error = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    mockWebhookEventCreate.mockRejectedValueOnce(p2002Error);

    const { POST } = await import('@/app/api/webhooks/pagarme/route');
    const response = await POST(makeRequest(makeWebhookPayload(CHARGE_ID)));

    // Deve retornar 200 com duplicate:true
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ duplicate: true });

    // NÃO deve chegar ao processamento do pedido
    expect(mockPedidoFindFirst).not.toHaveBeenCalled();
  });

  it('primeira entrega é processada: webhookEvent criado com uniqueKey correto', async () => {
    mockWebhookEventCreate.mockResolvedValueOnce(CREATED_EVENT);

    const { POST } = await import('@/app/api/webhooks/pagarme/route');
    const response = await POST(makeRequest(makeWebhookPayload(CHARGE_ID)));

    // webhookEvent deve ter sido criado com o uniqueKey correto
    expect(mockWebhookEventCreate).toHaveBeenCalledOnce();
    expect(mockWebhookEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ uniqueKey: EXPECTED_UNIQUE_KEY }),
      })
    );

    // Deve retornar 200
    expect(response.status).toBe(200);
  });

  it('erro P2002 não impede processamento de eventos com uniqueKey diferente', async () => {
    const CHARGE_ID_2 = 'ch_different_456';
    const EXPECTED_KEY_2 = `pagarme:${CHARGE_ID_2}`;
    const p2002Error = Object.assign(new Error('Unique constraint'), { code: 'P2002' });

    // Primeiro evento: duplicado (P2002)
    mockWebhookEventCreate
      .mockRejectedValueOnce(p2002Error)
      // Segundo evento (charge diferente): criado com sucesso
      .mockResolvedValueOnce({ id: 'wh-event-2', uniqueKey: EXPECTED_KEY_2 });

    const { POST } = await import('@/app/api/webhooks/pagarme/route');

    // Primeira chamada — duplicada
    const res1 = await POST(makeRequest(makeWebhookPayload(CHARGE_ID)));
    const body1 = await res1.json();
    expect(body1.duplicate).toBe(true);

    // Segunda chamada — charge diferente, deve criar novo WebhookEvent
    await POST(makeRequest(makeWebhookPayload(CHARGE_ID_2)));

    expect(mockWebhookEventCreate).toHaveBeenCalledTimes(2);
    // Segunda chamada deve ter usado o uniqueKey do segundo charge
    expect(mockWebhookEventCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ uniqueKey: EXPECTED_KEY_2 }),
      })
    );
  });
});

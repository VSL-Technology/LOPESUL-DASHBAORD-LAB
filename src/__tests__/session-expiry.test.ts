/**
 * src/__tests__/session-expiry.test.ts
 *
 * Testa que sessões expiradas (TRIAL ou PAID) não autorizam acesso.
 * A lógica de expiração está em expireTrialIfNeeded / expirePaidIfNeeded
 * e em buildStatePayload (status = 'BLOCKED' quando remainingSeconds === 0).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted garante que as variáveis estão disponíveis quando vi.mock() é içado pelo Vitest
const { mockFindUnique, mockUpdate, mockUpsert, mockEventCreate } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpsert: vi.fn(),
  mockEventCreate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    deviceAccessSession: {
      findUnique: mockFindUnique,
      update: mockUpdate,
      upsert: mockUpsert,
    },
    deviceAccessEvent: {
      create: mockEventCreate,
    },
  },
}));

import { getDeviceAccessState } from '@/lib/trial/engine';

const VALID_MAC = 'AA:BB:CC:DD:EE:FF';
const PAST_DATE = new Date(Date.now() - 60 * 60 * 1000); // 1 hora atrás
const FUTURE_DATE = new Date(Date.now() + 60 * 60 * 1000); // 1 hora no futuro

describe('Session expiry — sessão expirada não deve autorizar acesso', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventCreate.mockResolvedValue({});
  });

  it('sessão TRIAL expirada retorna status !== "TRIAL"', async () => {
    const expiredTrialSession = {
      id: 'sess-trial-expired',
      macAddress: VALID_MAC,
      status: 'TRIAL',
      trialEndsAt: PAST_DATE,
      paidEndsAt: null,
      currentIp: '10.0.0.1',
      lastPlanName: null,
      lastOrderId: null,
      lastSeenAt: new Date(),
    };
    const blockedSession = { ...expiredTrialSession, status: 'BLOCKED' };

    // Primeira busca (before expiry check) → retorna sessão expirada
    mockFindUnique
      .mockResolvedValueOnce(expiredTrialSession)
      // Segunda busca (after expiry functions rodarem) → retorna sessão bloqueada
      .mockResolvedValueOnce(blockedSession);

    // update para lastSeenAt
    mockUpdate.mockResolvedValueOnce(expiredTrialSession);

    // blockDeviceSession (chamado por expireTrialIfNeeded)
    mockUpsert.mockResolvedValue(blockedSession);

    const state = await getDeviceAccessState({ macAddress: VALID_MAC, ip: '10.0.0.1' });

    expect(state).not.toBeNull();
    expect(state?.status).not.toBe('TRIAL');
    // Deve ser BLOCKED pois o trial expirou
    expect(['BLOCKED', 'EXPIRED']).toContain(state?.status);
  });

  it('sessão PAID expirada retorna status !== "PAID"', async () => {
    const expiredPaidSession = {
      id: 'sess-paid-expired',
      macAddress: VALID_MAC,
      status: 'PAID',
      trialEndsAt: null,
      paidEndsAt: PAST_DATE,
      currentIp: '10.0.0.2',
      lastPlanName: 'Acesso 24h',
      lastOrderId: 'order-expired-1',
      lastSeenAt: new Date(),
    };
    const blockedSession = { ...expiredPaidSession, status: 'BLOCKED' };

    mockFindUnique
      .mockResolvedValueOnce(expiredPaidSession)
      .mockResolvedValueOnce(blockedSession);

    mockUpdate.mockResolvedValueOnce(expiredPaidSession);
    mockUpsert.mockResolvedValue(blockedSession);

    const state = await getDeviceAccessState({ macAddress: VALID_MAC, ip: '10.0.0.2' });

    expect(state).not.toBeNull();
    expect(state?.status).not.toBe('PAID');
  });

  it('sessão PAID ainda válida retorna status "PAID" com remainingSeconds > 0', async () => {
    const activePaidSession = {
      id: 'sess-paid-active',
      macAddress: VALID_MAC,
      status: 'PAID',
      trialEndsAt: null,
      paidEndsAt: FUTURE_DATE,
      currentIp: '10.0.0.3',
      lastPlanName: 'Acesso 12h',
      lastOrderId: 'order-active-1',
      lastSeenAt: new Date(),
    };

    mockFindUnique
      .mockResolvedValueOnce(activePaidSession)
      .mockResolvedValueOnce(activePaidSession);

    mockUpdate.mockResolvedValueOnce(activePaidSession);

    const state = await getDeviceAccessState({ macAddress: VALID_MAC, ip: '10.0.0.3' });

    expect(state).not.toBeNull();
    expect(state?.status).toBe('PAID');
    expect(state?.remainingSeconds).toBeGreaterThan(0);
  });

  it('sessão TRIAL ainda válida retorna status "TRIAL" com remainingSeconds > 0', async () => {
    const activeTrialSession = {
      id: 'sess-trial-active',
      macAddress: VALID_MAC,
      status: 'TRIAL',
      trialEndsAt: FUTURE_DATE,
      paidEndsAt: null,
      currentIp: '10.0.0.4',
      lastPlanName: null,
      lastOrderId: null,
      lastSeenAt: new Date(),
    };

    mockFindUnique
      .mockResolvedValueOnce(activeTrialSession)
      .mockResolvedValueOnce(activeTrialSession);

    mockUpdate.mockResolvedValueOnce(activeTrialSession);

    const state = await getDeviceAccessState({ macAddress: VALID_MAC, ip: '10.0.0.4' });

    expect(state).not.toBeNull();
    expect(state?.status).toBe('TRIAL');
    expect(state?.remainingSeconds).toBeGreaterThan(0);
  });
});

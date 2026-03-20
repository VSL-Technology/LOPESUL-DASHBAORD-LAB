/**
 * src/__tests__/audit-entry.test.ts
 *
 * Testa a função audit() de src/lib/audit.ts:
 * - Deve criar AuditEntry com os campos corretos
 * - Nunca deve lançar exceção mesmo quando o banco estiver indisponível (fire-and-forget)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted garante que as variáveis estão disponíveis quando vi.mock() é içado pelo Vitest
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    auditEntry: {
      create: mockCreate,
    },
  },
}));

import { audit } from '@/lib/audit';

describe('audit()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cria AuditEntry com os campos corretos', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'entry-1' });

    await audit({
      action: 'TEST_ACTION',
      entity: 'pedido',
      entityId: 'pedido-abc',
      actorId: 'user-1',
      actorRole: 'MASTER',
      payload: { key: 'value' },
      ip: '10.0.0.1',
      result: 'SUCCESS',
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        action: 'TEST_ACTION',
        entity: 'pedido',
        entityId: 'pedido-abc',
        actorId: 'user-1',
        actorRole: 'MASTER',
        payload: { key: 'value' },
        ip: '10.0.0.1',
        result: 'SUCCESS',
      },
    });
  });

  it('usa "system" como entity padrão quando não informado', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'entry-2' });

    await audit({ action: 'MINIMAL_ACTION' });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'MINIMAL_ACTION',
        entity: 'system',
        entityId: null,
        actorId: null,
        actorRole: null,
        ip: null,
        result: null,
      }),
    });
  });

  it('nunca lança exceção quando o banco está indisponível (fire-and-forget)', async () => {
    mockCreate.mockRejectedValueOnce(new Error('DB connection refused'));

    // Não deve lançar — o audit() deve devorar o erro silenciosamente
    await expect(audit({ action: 'SAFE_ACTION' })).resolves.toBeUndefined();
  });

  it('nunca lança exceção mesmo com payload de erro sem .message', async () => {
    mockCreate.mockRejectedValueOnce('string error sem .message');

    await expect(audit({ action: 'ANOTHER_ACTION' })).resolves.toBeUndefined();
  });
});

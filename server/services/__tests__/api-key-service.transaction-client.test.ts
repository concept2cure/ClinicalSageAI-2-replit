import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ poolQuery: vi.fn(), audit: vi.fn() }));
vi.mock('../auditService', () => ({ writeChainedAuditRow: h.audit }));
vi.mock('../../db.js', () => ({ pool: { query: h.poolQuery } }));
import { generateApiKey, revokeApiKey } from '../api-key-service';

beforeEach(() => { h.poolQuery.mockReset(); h.audit.mockReset(); h.audit.mockResolvedValue(undefined); });

describe('API-key writes enlist the audit transaction client', () => {
  it('stores only the generated key hash on the caller client, without using the pool', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 9 }] });
    const key = await generateApiKey({ organizationId: 7, name: 'Reporting', scopes: ['documents:read'], createdBy: 42 }, { query } as any);
    expect(key.keyId).toBe(9);
    expect(key.rawKey).toMatch(/^csai_/);
    expect(query).toHaveBeenCalledTimes(1);
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ query }), expect.objectContaining({ tenantId: 7, userId: 42, action: 'api_key_created' }));
    const params = query.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe(7);
    expect(params[2]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(params)).not.toContain(key.rawKey);
    expect(h.poolQuery).not.toHaveBeenCalled();
  });

  it('revokes on the caller client within the authenticated organization', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 9 }] });
    expect(await revokeApiKey(9, 7, { query }, { userId: 42 })).toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('organization_id = $2'), [9, 7]);
    expect(h.poolQuery).not.toHaveBeenCalled();
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ query }), expect.objectContaining({ tenantId: 7, userId: 42, action: 'api_key_revoked' }));
  });

  it('propagates a chained-write failure to the transaction owner without committing, rolling back, or exposing a secret', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 9 }] });
    h.audit.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(generateApiKey({ organizationId: 7, name: 'Reporting', scopes: ['documents:read'], createdBy: 42 }, { query })).rejects.toThrow('audit unavailable');
    expect(query).toHaveBeenCalledTimes(1); expect(h.poolQuery).not.toHaveBeenCalled();
  });
});

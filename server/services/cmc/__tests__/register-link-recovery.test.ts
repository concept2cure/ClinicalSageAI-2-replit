import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ write: vi.fn(), metric: vi.fn() }));
vi.mock('../../cmc-write-through', async (original) => ({ ...await original<typeof import('../../cmc-write-through')>(), writeThroughAnalyticalMethod: h.write }));
vi.mock('../../../metrics.js', () => ({ metrics: { concept2cureErrors: { inc: h.metric } } }));
import { listRegisterLinks, retryRegisterLink, RegisterLinkRefusal } from '../register-link-recovery';
import { mapAnalyticalMethodPayload } from '../../cmc-write-through';
import { createSourceHash } from '../../cmc-module3-compiler';
const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';
const record = { id: 31, organization_id: 7, project_id: PROJECT, method_code: 'AM-31', title: 'HPLC assay', technique: 'HPLC', validation_date: new Date('2026-10-01T00:00:00Z') };
const args = { organizationId: 7, projectId: PROJECT, register: 'analytical-methods', recordId: '31', userId: 12 };
beforeEach(() => { h.write.mockReset(); h.metric.mockReset(); });

describe('durable CMC register linkage recovery', () => {
  it('distinguishes missing, older, current and unfiled rows from saved records, not request receipts', async () => {
    const records = [record, { ...record, id: 32 }, { ...record, id: 33 }, { ...record, id: 34, project_id: null }];
    const current = createSourceHash(mapAnalyticalMethodPayload(record));
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM cmc_source_objects')) return { rows: [{ source_key: 'method:32', source_hash: 'old-content' }, { source_key: 'method:33', source_hash: current }] };
      if (sql.includes('FROM analytical_methods')) return { rows: records };
      return { rows: [] };
    });
    expect((await listRegisterLinks({ query }, 7, PROJECT)).map((r) => [r.recordId, r.state, r.retryable])).toEqual([
      ['31', 'missing', true], ['32', 'outdated', true], ['33', 'linked', false], ['34', 'unfiled', false],
    ]);
    expect(query.mock.calls.find(([sql]) => sql.includes('FROM analytical_methods'))?.[0]).toContain('organization_id = $1');
  });

  it('retries the stored owned record through the existing writer with its actual actor and changes no signature', async () => {
    h.write.mockResolvedValue({ ok: true });
    const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith('SELECT') ? [record] : [] }));
    expect(await retryRegisterLink({ query }, args)).toEqual({ module3Linked: true });
    expect(h.write).toHaveBeenCalledWith(7, PROJECT, '31', expect.objectContaining({ methodCode: 'AM-31', projectId: PROJECT }), '12');
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', expect.stringContaining('FOR SHARE'), 'COMMIT']);
    expect(query.mock.calls.some(([sql]) => /UPDATE|INSERT|electronic_signatures/.test(sql))).toBe(false);
  });

  it('a canonical failure stays unlinked and is metered; no success is inferred from saving the register', async () => {
    h.write.mockResolvedValue({ ok: false, code: 'write_failed', reason: 'unavailable' });
    const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith('SELECT') ? [record] : [] }));
    const out = await retryRegisterLink({ query }, args);
    expect(out.module3Linked).toBe(false); expect(out.module3Warning).toMatch(/did not complete/);
    expect(h.metric).toHaveBeenCalled();
  });

  it.each(['foreign-record', 'unfiled-record'])('refuses %s without invoking any canonical writer', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await expect(retryRegisterLink({ query }, args)).rejects.toBeInstanceOf(RegisterLinkRefusal);
    expect(query.mock.calls[1]).toEqual([expect.stringContaining('project_id::text = $3'), ['31', 7, PROJECT]]);
    expect(h.write).not.toHaveBeenCalled(); expect(query.mock.calls.at(-1)).toEqual(['ROLLBACK']);
  });

  it('refuses request-controlled SQL identifiers and reports a failed schema read as an error', async () => {
    const query = vi.fn(async () => { throw new Error('register store unavailable'); });
    await expect(retryRegisterLink({ query }, { ...args, register: 'constructor' })).rejects.toBeInstanceOf(RegisterLinkRefusal);
    expect(query).not.toHaveBeenCalled();
    await expect(listRegisterLinks({ query }, 7, PROJECT)).rejects.toThrow('register store unavailable');
  });
});

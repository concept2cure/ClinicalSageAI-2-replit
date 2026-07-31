import { describe, it, expect, vi } from 'vitest';
import { loadPriorSequenceManifest, loadLatestPriorManifest, type PoolLike } from '../prior-sequence-loader';

const manifestRow = [
  { ctdSection: '3.2.S.1', fileName: 'general.pdf', href: 'm3/32/general.pdf', md5: 'a' },
  { ctdSection: '5.3.5.1', fileName: 'csr.pdf', href: 'm5/535/csr.pdf', md5: 'b' },
];

function stubPool(rows: Array<Record<string, unknown>>): PoolLike & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async query(sql: string, params?: unknown[]) {
      calls.push([sql, params]);
      return { rows };
    },
  };
}

describe('loadPriorSequenceManifest', () => {
  it('returns the prior sequence leaves as PriorLeaf[]', async () => {
    const pool = stubPool([{ leaf_manifest: manifestRow }]);
    const prior = await loadPriorSequenceManifest(pool, {
      organizationId: 7,
      applicationNumber: 'IND-123',
      priorSequenceNumber: '0000',
    });
    expect(prior).toEqual([
      { ctdSection: '3.2.S.1', fileName: 'general.pdf', md5: 'a', href: 'm3/32/general.pdf' },
      { ctdSection: '5.3.5.1', fileName: 'csr.pdf', md5: 'b', href: 'm5/535/csr.pdf' },
    ]);
  });

  it('ALWAYS scopes the query by organization_id (never cross-tenant)', async () => {
    const pool = stubPool([{ leaf_manifest: manifestRow }]);
    await loadPriorSequenceManifest(pool, {
      organizationId: 7,
      applicationNumber: 'IND-123',
      priorSequenceNumber: '0000',
    });
    const [sql, params] = pool.calls[0];
    expect(String(sql)).toMatch(/organization_id\s*=\s*\$1/);
    expect(params).toEqual([7, 'IND-123', '0000']);
  });

  it('returns [] when no matching compilation exists (a first sequence has no prior)', async () => {
    const pool = stubPool([]);
    const prior = await loadPriorSequenceManifest(pool, {
      organizationId: 7,
      applicationNumber: 'IND-123',
      priorSequenceNumber: '0000',
    });
    expect(prior).toEqual([]);
  });

  it('returns [] without touching the DB when an identifier is missing', async () => {
    const pool = stubPool([{ leaf_manifest: manifestRow }]);
    const spy = vi.spyOn(pool, 'query');
    const prior = await loadPriorSequenceManifest(pool, {
      organizationId: 7,
      applicationNumber: '',
      priorSequenceNumber: '0000',
    });
    expect(prior).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('tolerates a NULL/garbage stored manifest without throwing', async () => {
    const pool = stubPool([{ leaf_manifest: null }]);
    const prior = await loadPriorSequenceManifest(pool, {
      organizationId: 7,
      applicationNumber: 'IND-123',
      priorSequenceNumber: '0000',
    });
    expect(prior).toEqual([]);
  });
});

describe('loadLatestPriorManifest', () => {
  it('finds the most recent sequence BEFORE the current one, org-scoped', async () => {
    const pool = stubPool([{ sequence_number: '0002', leaf_manifest: manifestRow }]);
    const spy = vi.spyOn(pool, 'query');
    const res = await loadLatestPriorManifest(pool, {
      organizationId: 7,
      applicationNumber: 'IND-123',
      currentSequence: '0003',
    });
    expect(res.priorSequenceNumber).toBe('0002');
    expect(res.leaves).toHaveLength(2);
    const [sql, params] = spy.mock.calls[0];
    expect(String(sql)).toMatch(/sequence_number\s*<\s*\$3/);
    expect(String(sql)).toMatch(/organization_id\s*=\s*\$1/);
    expect(params).toEqual([7, 'IND-123', '0003']);
  });

  it('returns an empty prior for a first sequence (no earlier compilation)', async () => {
    const pool = stubPool([]);
    const res = await loadLatestPriorManifest(pool, {
      organizationId: 7,
      applicationNumber: 'IND-123',
      currentSequence: '0000',
    });
    expect(res).toEqual({ priorSequenceNumber: '', leaves: [] });
  });
});

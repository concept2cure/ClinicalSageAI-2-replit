import { describe, it, expect, vi } from 'vitest';
import { loadPriorSequenceManifest, type PoolLike } from '../prior-sequence-loader';

const manifestRow = [
  { ctdSection: '3.2.S.1', fileName: 'general.pdf', href: 'm3/32/general.pdf', md5: 'a' },
  { ctdSection: '5.3.5.1', fileName: 'csr.pdf', href: 'm5/535/csr.pdf', md5: 'b' },
];

/**
 * 2026-10-15: loadPriorSequenceManifest now issues two reads — which submission
 * FILED the named sequence, then that submission's filed history folded — and
 * refuses a named sequence that is not on file. This stub answers the first with
 * `filedSubmissionIds` and the fold with `rows`. The tests that pinned [] for a
 * named sequence with nothing on file, and the loadLatestPriorManifest tests
 * (that function read unfiled compiles as on file and had no production caller;
 * it was removed), were changed or removed with it.
 */
function stubPool(rows: Array<Record<string, unknown>>, filedSubmissionIds: number[] = [42]): PoolLike & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async query(sql: string, params?: unknown[]) {
      calls.push([sql, params]);
      if (/SELECT DISTINCT c\.submission_id/.test(sql)) {
        return { rows: filedSubmissionIds.map((submission_id) => ({ submission_id })) };
      }
      return { rows };
    },
  };
}

describe('loadPriorSequenceManifest', () => {
  it('returns the filed leaves as PriorLeaf[], each carrying the sequence that holds it', async () => {
    const pool = stubPool([{ sequence_number: '0000', leaf_manifest: manifestRow }]);
    const prior = await loadPriorSequenceManifest(pool, {
      organizationId: 7,
      applicationNumber: 'IND-123',
      priorSequenceNumber: '0000',
    });
    expect(prior).toEqual([
      { ctdSection: '3.2.S.1', fileName: 'general.pdf', md5: 'a', href: 'm3/32/general.pdf', sequenceNumber: '0000' },
      { ctdSection: '5.3.5.1', fileName: 'csr.pdf', md5: 'b', href: 'm5/535/csr.pdf', sequenceNumber: '0000' },
    ]);
  });

  it('ALWAYS scopes both reads by organization_id (never cross-tenant)', async () => {
    const pool = stubPool([{ sequence_number: '0000', leaf_manifest: manifestRow }]);
    await loadPriorSequenceManifest(pool, {
      organizationId: 7,
      applicationNumber: 'IND-123',
      priorSequenceNumber: '0000',
    });
    const [sql, params] = pool.calls[0];
    expect(String(sql)).toMatch(/organization_id\s*=\s*\$1/);
    expect(String(sql)).toMatch(/dispatch_status/);
    expect(params).toEqual([7, 'IND-123', '0000']);
    const [foldSql, foldParams] = pool.calls[1];
    expect(String(foldSql)).toMatch(/organization_id\s*=\s*\$1/);
    expect(foldParams).toEqual([7, 42, '0001']);
  });

  it('refuses a named sequence that is not on file, instead of returning an empty prior', async () => {
    const pool = stubPool([], []);
    await expect(
      loadPriorSequenceManifest(pool, {
        organizationId: 7,
        applicationNumber: 'IND-123',
        priorSequenceNumber: '0000',
      }),
    ).rejects.toThrow(/PRIOR_SEQUENCE_NOT_FOUND/);
  });

  it('refuses without touching the DB when an identifier is missing', async () => {
    const pool = stubPool([{ sequence_number: '0000', leaf_manifest: manifestRow }]);
    const spy = vi.spyOn(pool, 'query');
    await expect(
      loadPriorSequenceManifest(pool, {
        organizationId: 7,
        applicationNumber: '',
        priorSequenceNumber: '0000',
      }),
    ).rejects.toThrow(/application number/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('tolerates a NULL/garbage stored manifest without throwing', async () => {
    const pool = stubPool([{ sequence_number: '0000', leaf_manifest: null }]);
    const prior = await loadPriorSequenceManifest(pool, {
      organizationId: 7,
      applicationNumber: 'IND-123',
      priorSequenceNumber: '0000',
    });
    expect(prior).toEqual([]);
  });
});

describe('a sequence\'s own withdrawals', () => {
  // A stored manifest records the sequence's deletes (2026-09-23): the leaf a
  // delete names is off file after that sequence, so a single-sequence read must
  // not hand it to the lifecycle diff as a leaf on file.
  const withWithdrawal = [
    ...manifestRow,
    { ctdSection: '3.2.S.9', fileName: 'obsolete.pdf', href: '../0000/m3/32/obsolete.pdf', md5: 'c', operation: 'delete' },
  ];

  it('loadPriorSequenceManifest leaves a withdrawn leaf out', async () => {
    const prior = await loadPriorSequenceManifest(stubPool([{ sequence_number: '0001', leaf_manifest: withWithdrawal }]), {
      organizationId: 7,
      applicationNumber: 'IND-123',
      priorSequenceNumber: '0001',
    });
    expect(prior.map((l) => l.fileName)).toEqual(['general.pdf', 'csr.pdf']);
  });
});

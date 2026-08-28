/**
 * Regression: a leaf's lifecycle parent pointer (parentLeafId) must be tenant- and
 * sequence-scoped.
 *
 * A replace|append|delete leaf names the prior leaf it supersedes via parentLeafId.
 * upsertLeaf must refuse a parentLeafId that does not resolve to a leaf in THIS
 * sequence owned by THIS organization — otherwise the eCTD lifecycle chain could be
 * pointed at another tenant's (or another sequence's) leaf, corrupting the index.
 *
 * These tests drive a stubbed Drizzle query chain so the scoping predicate and the
 * refusal path are exercised without a real database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Queue of results the stubbed query chain resolves, in call order.
const selectResults = vi.hoisted(() => [] as unknown[]);
const insertCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock('../../../db', () => {
  const chain = () => {
    const p: any = {
      from: () => p,
      where: () => p,
      orderBy: () => p,
      limit: () => p,
      set: () => p,
      values: () => p,
      returning: () => p,
      then: (resolve: (v: unknown) => unknown) => resolve(selectResults.shift() ?? []),
    };
    return p;
  };
  return {
    db: {
      select: () => chain(),
      insert: () => {
        insertCalls.count += 1;
        return chain();
      },
      update: () => chain(),
      execute: () => Promise.resolve({ rows: [] }),
    },
  };
});

vi.mock('../../auditService', () => ({
  default: { logAction: vi.fn().mockResolvedValue({ persisted: true, chained: true, tamperProof: true }) },
}));

import { upsertLeaf, SubmissionError } from '../submission-service';

const ctx = { organizationId: 1, userId: 7 };

beforeEach(() => {
  selectResults.length = 0;
  insertCalls.count = 0;
  vi.clearAllMocks();
});

describe('upsertLeaf parentLeafId scoping', () => {
  it('rejects a parentLeafId that is not a leaf in this sequence for this org', async () => {
    // 1) getSequence -> an unlocked sequence the org owns.
    selectResults.push([{ id: 10, status: 'assembling', organizationId: 1 }]);
    // 2) parent-leaf lookup -> not found (wrong sequence / wrong tenant).
    selectResults.push([]);

    await expect(
      upsertLeaf(
        { sequenceId: 10, sectionCode: '3.2.S', title: 'Drug Substance', lifecycleOp: 'replace', parentLeafId: 999 },
        ctx
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // The bug: without scoping the insert would proceed and persist a cross-tenant
    // parent pointer. The guard must short-circuit before any write.
    expect(insertCalls.count).toBe(0);
  });

  it('allows a parentLeafId that resolves to a leaf in this sequence for this org', async () => {
    // 1) getSequence
    selectResults.push([{ id: 10, status: 'assembling', organizationId: 1 }]);
    // 2) parent-leaf lookup -> found, in-sequence, same org.
    selectResults.push([{ id: 5 }]);
    // 3) insert .returning() -> the new leaf row.
    selectResults.push([{ id: 11, sequenceId: 10, lifecycleOp: 'replace', parentLeafId: 5 }]);

    const row = await upsertLeaf(
      { sequenceId: 10, sectionCode: '3.2.S', title: 'Drug Substance', lifecycleOp: 'replace', parentLeafId: 5 },
      ctx
    );
    expect(row).toMatchObject({ id: 11, parentLeafId: 5 });
    expect(insertCalls.count).toBe(1);
  });

  it('does not run a parent lookup when no parentLeafId is given (new leaf)', async () => {
    selectResults.push([{ id: 10, status: 'assembling', organizationId: 1 }]); // getSequence
    selectResults.push([{ id: 12, sequenceId: 10, lifecycleOp: 'new' }]); // insert returning

    const row = await upsertLeaf({ sequenceId: 10, sectionCode: '1.1', title: 'Cover' }, ctx);
    expect(row).toMatchObject({ id: 12 });
    expect(insertCalls.count).toBe(1);
    // All queued results consumed -> no extra (parent) select happened.
    expect(selectResults.length).toBe(0);
  });
});

// Sanity: SubmissionError shape is what callers match on.
describe('SubmissionError', () => {
  it('carries a code', () => {
    expect(new SubmissionError('FORBIDDEN', 'x').code).toBe('FORBIDDEN');
  });
});

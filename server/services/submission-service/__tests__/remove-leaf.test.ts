/**
 * removeLeaf — a misplaced leaf can be taken OUT of a draft-stage sequence
 * (BP-W1-6 find F05: before this, a wrong placement could only be corrected in
 * place, and the first end-to-end chain exercise had to clean its own test
 * leaves with SQL).
 *
 * Guards under test, in refusal order:
 *   1. a frozen/dispatched sequence's leaves are immutable;
 *   2. a leaf that another leaf's parentLeafId points at cannot be removed —
 *      that would orphan the eCTD lifecycle chain;
 *   3. the soft delete is tenant- and sequence-scoped, and a miss is NOT_FOUND,
 *      never a silent success.
 *
 * Same stubbed Drizzle chain as the sibling leaf tests — no real database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const selectResults = vi.hoisted(() => [] as unknown[]);
const updateCalls = vi.hoisted(() => ({ count: 0 }));

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
      insert: () => chain(),
      update: () => {
        updateCalls.count += 1;
        return chain();
      },
      execute: () => Promise.resolve({ rows: [] }),
    },
  };
});

const logAction = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../auditService', () => ({
  default: { logAction },
}));

import { removeLeaf } from '../submission-service';

const ctx = { organizationId: 1, userId: 7 };

beforeEach(() => {
  selectResults.length = 0;
  updateCalls.count = 0;
  vi.clearAllMocks();
});

describe('removeLeaf', () => {
  it('refuses on a frozen sequence before touching anything', async () => {
    selectResults.push([{ id: 10, status: 'frozen', organizationId: 1 }]);

    await expect(removeLeaf(5, 10, ctx)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(updateCalls.count).toBe(0);
    expect(logAction).not.toHaveBeenCalled();
  });

  it('refuses to remove a leaf another leaf lifecycle-references', async () => {
    selectResults.push([{ id: 10, status: 'draft', organizationId: 1 }]); // getSequence
    selectResults.push([{ id: 6 }]); // dependent leaf exists

    await expect(removeLeaf(5, 10, ctx)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(updateCalls.count).toBe(0);
  });

  it('soft-deletes a removable leaf and writes the audit event', async () => {
    selectResults.push([{ id: 10, status: 'draft', organizationId: 1 }]); // getSequence
    selectResults.push([]); // no dependent leaf
    selectResults.push([{ id: 5, sectionCode: '1.2', deletedAt: new Date() }]); // update .returning

    await expect(removeLeaf(5, 10, ctx)).resolves.toBeUndefined();
    expect(updateCalls.count).toBe(1);
    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LEAF_REMOVED', resourceId: 5 })
    );
  });

  it('a scoped miss is NOT_FOUND, never a silent success', async () => {
    selectResults.push([{ id: 10, status: 'draft', organizationId: 1 }]); // getSequence
    selectResults.push([]); // no dependent leaf
    selectResults.push([]); // update matched nothing (wrong org/sequence, or already deleted)

    await expect(removeLeaf(999, 10, ctx)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(logAction).not.toHaveBeenCalled();
  });
});

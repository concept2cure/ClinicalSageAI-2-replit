/**
 * The frozen-document write gate (21 CFR 11 §11.10(c)/(e)).
 *
 * MDX UAT 2026-08-18, item A4: a section of a document whose toolbar read
 * "Frozen" accepted typed edits and flipped to "unsaved changes". The server
 * refused the save, but through `canEditSection`'s boolean, which reported the
 * seal as 403 "No edit permission for this section" — the wrong fact, with the
 * wrong remedy, to an author who had just typed a paragraph into a signed
 * record.
 *
 * This pins the lock itself: which statuses seal a record, that the seal is read
 * through the caller's executor (so it can run inside the write's transaction),
 * and that every uncertain answer is a refusal. A gate that has only been seen
 * to allow has not been tested, so each case here is written against the state
 * that must be REFUSED.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  checkDocumentWritable,
  checkSectionWritable,
  LOCKED_DOCUMENT_STATUSES,
  type Queryable,
} from '../document-lock';

/** An executor that answers one query with `rows`. */
const executorReturning = (rows: unknown[]): Queryable & { query: ReturnType<typeof vi.fn> } => {
  const query = vi.fn(async () => ({ rows, rowCount: rows.length }));
  return { query } as Queryable & { query: typeof query };
};

describe('which statuses seal a record', () => {
  it('locks FROZEN and APPROVED', () => {
    expect(LOCKED_DOCUMENT_STATUSES.has('FROZEN')).toBe(true);
    expect(LOCKED_DOCUMENT_STATUSES.has('APPROVED')).toBe(true);
  });

  it('does NOT lock IN_REVIEW — review is a state a document is edited during', () => {
    // Locking it would stop the review cycle rather than protect a sealed
    // record, and the editor's own status filter lists it as editable.
    expect(LOCKED_DOCUMENT_STATUSES.has('IN_REVIEW')).toBe(false);
    expect(LOCKED_DOCUMENT_STATUSES.has('DRAFT')).toBe(false);
  });
});

describe('checkDocumentWritable refuses a sealed document', () => {
  it.each([
    ['FROZEN', /frozen/i],
    ['APPROVED', /approved/i],
  ])('refuses %s and says why', async (status, expected) => {
    const ex = executorReturning([{ status, locked_at: null }]);
    const verdict = await checkDocumentWritable(ex, 'doc-1', 7);

    expect(verdict.writable).toBe(false);
    expect(verdict.code).toBe('DOCUMENT_FROZEN');
    expect(verdict.reason).toMatch(expected);
    // The remedy, not just the refusal.
    expect(verdict.reason).toMatch(/new version/i);
  });

  it('is case-insensitive, because the router writes both cases', async () => {
    // POST /docs inserts 'draft' lower-case while freeze writes 'FROZEN' upper —
    // a case-sensitive comparison would silently miss a locked record.
    const ex = executorReturning([{ status: 'frozen', locked_at: null }]);
    expect((await checkDocumentWritable(ex, 'doc-1', 7)).writable).toBe(false);
  });

  it('refuses when locked_at is set even if the status looks editable', async () => {
    const ex = executorReturning([{ status: 'DRAFT', locked_at: '2026-08-18T00:00:00Z' }]);
    const verdict = await checkDocumentWritable(ex, 'doc-1', 7);
    expect(verdict.writable).toBe(false);
    expect(verdict.code).toBe('DOCUMENT_FROZEN');
  });

  it('refuses a document that is not in the caller’s tenant', async () => {
    // Fails closed rather than treating "no row" as "nothing stopping you".
    const verdict = await checkDocumentWritable(executorReturning([]), 'doc-1', 7);
    expect(verdict.writable).toBe(false);
    expect(verdict.code).toBe('DOCUMENT_NOT_FOUND');
  });

  it('allows an editable document', async () => {
    // The gate must not be bought by refusing everything.
    const ex = executorReturning([{ status: 'DRAFT', locked_at: null }]);
    expect((await checkDocumentWritable(ex, 'doc-1', 7)).writable).toBe(true);
  });

  it('reads through the executor it is given, so it can run inside the write’s transaction', async () => {
    // Checking on the pool while writing in a transaction leaves a window in
    // which a concurrent freeze commits between the check and the write.
    const ex = executorReturning([{ status: 'DRAFT', locked_at: null }]);
    await checkDocumentWritable(ex, 'doc-9', 42);
    expect(ex.query).toHaveBeenCalledTimes(1);
    expect(ex.query.mock.calls[0][1]).toEqual(['doc-9', 42]);
  });
});

describe('checkSectionWritable resolves the parent document', () => {
  it('refuses a section whose document is frozen', async () => {
    const ex = executorReturning([{ status: 'FROZEN', locked_at: null }]);
    const verdict = await checkSectionWritable(ex, 'sec-1', 7);
    expect(verdict.writable).toBe(false);
    expect(verdict.code).toBe('DOCUMENT_FROZEN');
  });

  it('scopes the section by tenant, so a guessed id cannot reach another org', async () => {
    const ex = executorReturning([{ status: 'DRAFT', locked_at: null }]);
    await checkSectionWritable(ex, 'sec-1', 7);
    const [sql, params] = ex.query.mock.calls[0];
    expect(String(sql)).toMatch(/s\.tenant_id\s*=\s*\$2/);
    // The join must be tenant-consistent too, or a section could resolve a
    // document in another tenant and read ITS status.
    expect(String(sql)).toMatch(/d\.tenant_id\s*=\s*s\.tenant_id/);
    expect(params).toEqual(['sec-1', 7]);
  });

  it('refuses an unknown section', async () => {
    const verdict = await checkSectionWritable(executorReturning([]), 'nope', 7);
    expect(verdict.writable).toBe(false);
    expect(verdict.code).toBe('DOCUMENT_NOT_FOUND');
  });
});

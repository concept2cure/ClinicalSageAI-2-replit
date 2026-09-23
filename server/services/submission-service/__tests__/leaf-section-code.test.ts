/**
 * A leaf's section code must be a CTD section code.
 *
 * WHAT WAS MISSING. `submission_leaves.section_code` is free text on every write
 * path: the route schema takes `z.string().min(1).max(64)`, `upsertLeaf` stored
 * whatever it was handed, and the placement dialog offers a plain text input —
 * whose own placeholder suggested `m1/us/1.2`. The packager then derives the
 * leaf's MODULE and FOLDER from that string. A value that is not a CTD code did
 * not fail: it became a folder name, so `m1/us/1.2` shipped a package with a
 * top-level `mm/m1-us-1-2/` directory and a backbone pointing into it.
 *
 * WHAT IS LOCKED HERE. upsertLeaf refuses a section code that is not
 * code-shaped, on create and on update, and writes nothing.
 *
 * The gate is deliberately NARROW — code-shaped, not "published heading". Four
 * of the codes this product itself writes (`m1.5`, `m1.7`, `m1.9`, `m1.13`) are
 * not in FDA's published Module 1 table, so a placeability gate here would
 * refuse the IND annual report the product files. That mismatch is real and is
 * reported separately; it is not a reason to reject a well-formed code at the
 * write boundary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const selectChain = vi.fn();
const insertValues = vi.fn();
const updateSet = vi.fn();

vi.mock('../../../db', () => {
  const db: any = {
    select: () => {
      const tail = { limit: () => selectChain() };
      const afterWhere = { ...tail, orderBy: () => tail };
      return { from: () => ({ where: () => afterWhere }) };
    },
    execute: vi.fn(),
    insert: () => ({ values: (v: unknown) => ({ returning: () => insertValues(v) }) }),
    update: () => ({ set: (v: unknown) => ({ where: () => ({ returning: () => updateSet(v) }) }) }),
  };
  // 2026-09-23 (W5/D7, round-2 skeptic): the leaf write now runs inside a
  // transaction holding the sequence row lock; the stub's lock read reports an
  // unlocked sequence, and the write goes through the same stubs as before.
  db.transaction = async (fn: (tx: any) => unknown) => fn({ ...db, execute: async () => ({ rows: [{ status: 'draft' }] }) });
  return { db };
});
vi.mock('../../auditService', () => ({
  default: { logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })) },
}));

import { upsertLeaf } from '../submission-service';

const CTX = { organizationId: 7, userId: 3 };

beforeEach(() => {
  selectChain.mockReset();
  insertValues.mockReset();
  updateSet.mockReset();
  insertValues.mockResolvedValue([{ id: 99 }]);
  updateSet.mockResolvedValue([{ id: 99 }]);
});

async function place(sectionCode: string, over: Record<string, unknown> = {}, applicationType = 'ind') {
  selectChain.mockResolvedValueOnce([{ id: 1, status: 'draft', submissionId: 21 }]); // getSequence
  // The submission lookup that decides the section-code vocabulary. An IND
  // files on CTD headings, so the CTD gate these tests exercise is unchanged.
  selectChain.mockResolvedValueOnce([{ applicationType }]);
  return upsertLeaf({ sequenceId: 1, sectionCode, title: 'Doc', ...over } as never, CTX).then(
    () => ({
      rejected: false as const,
      code: null as string | null,
      // Present on both branches so a caller can read it without narrowing —
      // the refusal MESSAGE is the contract for several of these tests.
      message: '',
      wrote: (insertValues.mock.calls[0]?.[0] as Record<string, unknown> | undefined)?.sectionCode
        ?? (updateSet.mock.calls[0]?.[0] as Record<string, unknown> | undefined)?.sectionCode ?? null,
    }),
    (err: { code?: string; message?: string }) =>
      ({ rejected: true as const, code: err?.code ?? null, message: err?.message ?? '', wrote: null }),
  );
}

describe('upsertLeaf — the section code must name a CTD section', () => {
  it('refuses a value that is not a CTD code, and writes nothing', async () => {
    const out = await place('m1/us/1.2'); // the placement dialog's own placeholder
    expect(out.rejected).toBe(true);
    expect(out.code).toBe('VALIDATION');
    expect(insertValues).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('names the value it refused, and what one looks like', async () => {
    const out = await place('cover letter') as { message: string };
    expect(out.message).toContain('cover letter');
    expect(out.message).toMatch(/3\.2\.S\.4\.2|2\.7\.3/);
  });

  it.each(['', '   ', 'foo', '6.1', 'm1/us/1.2', '1', '3'])('refuses %o', async bad => {
    expect((await place(bad)).rejected).toBe(true);
  });

  it('refuses on UPDATE too — a leaf cannot be edited into an unplaceable section', async () => {
    const out = await place('nonsense', { leafId: 42 });
    expect(out.rejected).toBe(true);
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('stores a precise section EXACTLY as given — 3.2.S.4.2 is not collapsed', async () => {
    const out = await place('3.2.S.4.2');
    expect(out.rejected).toBe(false);
    expect(out.wrote).toBe('3.2.S.4.2');
  });

  it.each([
    'm1.1', 'm1.2', 'm1.5', 'm1.7', 'm1.9', 'm1.12.4', 'm1.13', 'm1.1.1', 'm5.3.5',
    'm3.2.S.2', '2.5', '3.2.S', '3.2.S.4.2', '5.3.5.1', '1.14.4.2',
  ])('accepts %o — a code this product actually writes', async code => {
    const out = await place(code);
    expect(out.rejected, `${code} was refused`).toBe(false);
    // Stored verbatim: readers match on the spelling that was written (the IND
    // checklist looks for `m1.1.1`), so canonicalising here would silently
    // detach them. The packager canonicalises when it derives the layout.
    expect(out.wrote).toBe(code);
  });
});

/*
 * The gate above is right for an eCTD sequence and was refusing two whole
 * submission types that do not file on CTD headings at all. The refusal read
 * as a malformed-code validation error, so it looked like a caller bug rather
 * than a missing capability — `docs/design/IRB_SUBMISSION.md` D2 calls it "the
 * one real blocker".
 *
 * The vocabulary is now a property of the submission type. These tests are the
 * proof that the generalisation added the two types WITHOUT loosening the CTD
 * gate: the same code is accepted under one application type and refused under
 * another, by the same function.
 */
describe('upsertLeaf — the vocabulary follows the submission type', () => {
  it('accepts an eSTAR device section on a 510(k), which the CTD gate refused outright', async () => {
    const out = await place('clinical-performance-testing', {}, '510k');

    expect(out.rejected).toBe(false);
    expect(out.wrote).toBe('clinical-performance-testing');
  });

  it('accepts an IRB package slot on an IRB submission', async () => {
    const out = await place('irb.consent', {}, 'irb');

    expect(out.rejected).toBe(false);
    expect(out.wrote).toBe('irb.consent');
  });

  it('refuses that same eSTAR code on an IND, because an IND files on CTD headings', async () => {
    const out = await place('clinical-performance-testing', {}, 'ind');

    expect(out.rejected).toBe(true);
    expect(out.code).toBe('VALIDATION');
    expect(out.message).toMatch(/CTD section code/);
    expect(out.wrote).toBeNull();
  });

  it('refuses a CTD code on an IRB submission, in the other direction', async () => {
    const out = await place('2.7.3', {}, 'irb');

    expect(out.rejected).toBe(true);
    expect(out.message).toMatch(/not an IRB package slot/);
  });

  it('refuses a misspelled IRB slot by name, because that list is closed', async () => {
    const out = await place('irb.conset', {}, 'irb');

    expect(out.rejected).toBe(true);
    expect(out.message).toContain('irb.consent');
  });

  it('refuses a path fragment on a 510(k) too — the folder-name defect is vocabulary-independent', async () => {
    const out = await place('estar/clinical performance', {}, '510k');

    expect(out.rejected).toBe(true);
    expect(out.wrote).toBeNull();
  });

  /* The compatibility guarantee, exercised through the real function rather
     than asserted about the mapping table: an application type nobody has
     taught this system about must land on the strictest vocabulary. */
  it('falls back to the CTD gate for an application type it does not recognise', async () => {
    expect((await place('2.7.3', {}, 'something-new')).rejected).toBe(false);
    expect((await place('clinical-performance-testing', {}, 'something-new')).rejected).toBe(true);
  });

  /*
   * FAIL CLOSED. This lookup only decides how STRICT the code gate is, so a
   * submission row that cannot be read must narrow to CTD rather than widen to
   * anything. Without this test the fail-open case was invisible: injecting
   * `return applicationType ? vocabularyForApplicationType(applicationType) :
   * 'estar'` passed all 54 tests, because every other test hands the mock a
   * row. A missing row is exactly when a gate quietly stops being a gate.
   */
  it('narrows to CTD when the submission row cannot be read at all', async () => {
    const out = await placeWithNoSubmissionRow('clinical-performance-testing');

    expect(out.rejected).toBe(true);
    expect(out.message).toMatch(/CTD section code/);
    expect(out.wrote).toBeNull();
  });

  it('still accepts a CTD code when the submission row cannot be read', async () => {
    expect((await placeWithNoSubmissionRow('2.7.3')).rejected).toBe(false);
  });
});

/** The sequence resolves, the submission lookup returns nothing. */
async function placeWithNoSubmissionRow(sectionCode: string) {
  selectChain.mockResolvedValueOnce([{ id: 1, status: 'draft', submissionId: 21 }]);
  selectChain.mockResolvedValueOnce([]);
  return upsertLeaf({ sequenceId: 1, sectionCode, title: 'Doc' } as never, CTX).then(
    () => ({
      rejected: false as const,
      code: null as string | null,
      message: '',
      wrote: (insertValues.mock.calls[0]?.[0] as Record<string, unknown> | undefined)?.sectionCode ?? null,
    }),
    (err: { code?: string; message?: string }) =>
      ({ rejected: true as const, code: err?.code ?? null, message: err?.message ?? '', wrote: null }),
  );
}

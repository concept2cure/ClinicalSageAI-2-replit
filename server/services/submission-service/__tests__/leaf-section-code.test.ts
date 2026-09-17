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

vi.mock('../../../db', () => ({
  db: {
    select: () => {
      const tail = { limit: () => selectChain() };
      const afterWhere = { ...tail, orderBy: () => tail };
      return { from: () => ({ where: () => afterWhere }) };
    },
    execute: vi.fn(),
    insert: () => ({ values: (v: unknown) => ({ returning: () => insertValues(v) }) }),
    update: () => ({ set: (v: unknown) => ({ where: () => ({ returning: () => updateSet(v) }) }) }),
  },
}));
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

async function place(sectionCode: string, over: Record<string, unknown> = {}) {
  selectChain.mockResolvedValueOnce([{ id: 1, status: 'draft' }]); // getSequence
  return upsertLeaf({ sequenceId: 1, sectionCode, title: 'Doc', ...over } as never, CTX).then(
    () => ({
      rejected: false as const,
      code: null as string | null,
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

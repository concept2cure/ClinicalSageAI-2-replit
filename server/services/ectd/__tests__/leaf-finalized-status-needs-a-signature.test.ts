/**
 * A filing section counts as finalized only on a status a signature produces.
 *
 * THE DEFECT THIS PREVENTS. `isFinalizedStatus(status, 'c2c_document_sections')`
 * — the predicate the eCTD assembler and dispatch readiness use to decide
 * whether a leaf may be transmitted — read `C2C_SECTION_COMPLETE_STATUSES`,
 * which is `{'approved','locked'}`.
 *
 * That set is not a fresh opinion and must not be narrowed: it is the
 * TypeScript mirror of `c2c_recompute_document_readiness()`, the trigger that
 * maintains `c2c_documents.readiness`, and
 * tests/schema-contract/c2c-section-completion.contract.test.ts parses the
 * migration and fails if the two disagree. Readiness is a PROGRESS metric —
 * "how much of this document is done" — and both words belong in it.
 *
 * Transmittability is a different question, and the answer is narrower.
 *
 *  - `approved` on a filing section is written in exactly ONE place:
 *    `approveBoundFilingSections`, inside the signature's transaction, and only
 *    for a section whose filed text equals the text signed. It carries a
 *    signature behind it by construction.
 *  - `locked` on a filing section is written by NO production path. The
 *    filing-side route refuses `status: 'locked'` outright
 *    (APPROVAL_REQUIRES_SIGNATURE — "a section cannot be locked here");
 *    `commitSectionToFiling` only ever reads it; `POST /api/c2c/documents/:id/lock`
 *    sets `c2c_documents.status`, not any section's.
 *
 * And it is REACHABLE, which is what makes this a fail-open rather than dead
 * vocabulary: `migrations/20260529_phase9_backfill.sql` maps a legacy section's
 * status through `WHEN 'locked' THEN 'locked'`, and that file is on the applier
 * (`C2C_MIGRATION_FILES`). So a legacy-migrated section could be transmitted as
 * a finalized eCTD leaf with no electronic signature ever having covered its
 * text — §11.70's link to the record simply absent.
 *
 * The fix gives the transmit predicate its own set, `{'approved'}`, and leaves
 * readiness alone.
 */
import { describe, expect, it } from 'vitest';

import { isFinalizedStatus, notFinalizedStatus } from '../leaf-source-resolver';
import { C2C_SECTION_COMPLETE_STATUSES } from '../../c2c/section-content';

describe('a filing section is transmittable only on a status a signature produces', () => {
  it('refuses `locked`, which no production path writes', async () => {
    expect(isFinalizedStatus('locked', 'c2c_document_sections')).toBe(false);
  });

  it('admits `approved`, which only the approval signature writes', () => {
    expect(isFinalizedStatus('approved', 'c2c_document_sections')).toBe(true);
  });

  it('names `locked` in the refusal, rather than passing it silently', () => {
    // The wording the Validation and Dispatch tabs print. A status that is
    // refused must be SAID, or the client sees a gap with no cause.
    expect(notFinalizedStatus('locked', 'c2c_document_sections', 'todo')).toBe('locked');
  });

  it('still refuses every drafting status', () => {
    for (const status of ['todo', 'drafted', 'review', 'submitted', '', null, undefined]) {
      expect(isFinalizedStatus(status, 'c2c_document_sections'), String(status)).toBe(false);
    }
  });
});

describe('readiness keeps both words, because it mirrors the database', () => {
  it('C2C_SECTION_COMPLETE_STATUSES is unchanged', () => {
    /* The guard on the fix. Narrowing the readiness set instead of the
       transmit predicate would have been the wrong edit: it is pinned to
       `c2c_recompute_document_readiness()` by a contract test that parses the
       migration, so it would have broken that pin and quietly changed every
       document's completion percentage. */
    expect([...C2C_SECTION_COMPLETE_STATUSES].sort()).toEqual(['approved', 'locked']);
  });

  it('the two questions now give different answers for `locked`', () => {
    // The whole point, stated as one assertion: progress says done,
    // transmittability says no signature.
    expect(C2C_SECTION_COMPLETE_STATUSES.has('locked')).toBe(true);
    expect(isFinalizedStatus('locked', 'c2c_document_sections')).toBe(false);
  });
});

describe('the other stores are untouched', () => {
  it('a concept2cure artifact still admits locked', () => {
    // Its own vocabulary, its own writers, out of scope here.
    expect(isFinalizedStatus('locked', 'concept2cure_artifacts')).toBe(true);
  });

  it('a coauthor document still reads `finalized` as an unsigned freeze', () => {
    expect(notFinalizedStatus('finalized', 'coauthor_documents')).toBe('frozen, not approved');
  });
});

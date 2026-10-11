/**
 * Unit tests for the deterministic dispatch-readiness validator.
 *
 * These pin the contract that the dispatch gate relies on: the `errors` count is
 * computed from the canonical leaves and reflects only unambiguous structural
 * defects — warnings and infos never inflate it.
 */
import { describe, it, expect } from 'vitest';
import {
  computeDispatchReadiness,
  hasCompleteDocumentPointer,
  type LeafDocumentResolution,
  type ReadinessLeaf,
} from '../dispatch-readiness';
import {
  PLACEABLE_DOCUMENT_TABLES,
  RESOLVABLE_DOCUMENT_TABLES,
} from '../leaf-document-tables';

const VAULT_UUID = '1b80ee68-61d1-46cd-b4b5-c26e25f5035b';

const goodLeaf = (over: Partial<ReadinessLeaf> = {}): ReadinessLeaf => ({
  sectionCode: 'm2.5',
  title: 'Clinical Overview',
  lifecycleOp: 'new',
  documentTable: 'coauthor_documents',
  documentId: 42,
  ...over,
});

describe('computeDispatchReadiness', () => {
  it('reports zero errors for a clean, resolvable sequence', () => {
    const r = computeDispatchReadiness([goodLeaf(), goodLeaf({ sectionCode: 'm2.4', documentId: 43 })]);
    expect(r.errors).toBe(0);
    expect(r.findings.filter(f => f.severity === 'error')).toHaveLength(0);
  });

  it('flags an empty sequence as an error', () => {
    const r = computeDispatchReadiness([]);
    expect(r.errors).toBe(1);
    expect(r.findings[0].code).toBe('EMPTY_SEQUENCE');
  });

  it('treats a sequence of only deletes as empty (error)', () => {
    const r = computeDispatchReadiness([goodLeaf({ lifecycleOp: 'delete', documentTable: null, documentId: null })]);
    expect(r.errors).toBe(1);
    expect(r.findings.some(f => f.code === 'EMPTY_SEQUENCE')).toBe(true);
  });

  it('flags a non-delete leaf with no document as UNRESOLVED_DOCUMENT', () => {
    const r = computeDispatchReadiness([goodLeaf({ documentTable: null, documentId: null })]);
    expect(r.errors).toBe(1);
    expect(r.findings.some(f => f.code === 'UNRESOLVED_DOCUMENT')).toBe(true);
  });

  it('does NOT flag a delete leaf with no document', () => {
    const r = computeDispatchReadiness([
      goodLeaf(),
      goodLeaf({ sectionCode: 'm3.2', lifecycleOp: 'delete', documentTable: null, documentId: null }),
    ]);
    expect(r.errors).toBe(0);
  });

  it('flags an invalid lifecycle operation', () => {
    const r = computeDispatchReadiness([goodLeaf({ lifecycleOp: 'frobnicate' })]);
    expect(r.findings.some(f => f.code === 'INVALID_LIFECYCLE_OP')).toBe(true);
    expect(r.errors).toBeGreaterThanOrEqual(1);
  });

  it('reports missing required sections as non-blocking warnings (not errors)', () => {
    const r = computeDispatchReadiness([goodLeaf({ sectionCode: 'm1.1' })], {
      requiredSections: ['1.1', '1.2', '2.3'],
    });
    expect(r.errors).toBe(0); // warnings do not block the gate
    expect(r.warnings).toBe(2); // 1.2 and 2.3 absent; 1.1 matches m1.1
    expect(r.findings.filter(f => f.code === 'MISSING_REQUIRED_SECTION')).toHaveLength(2);
  });

  it('matches required sections across module-prefix/format differences', () => {
    // required "1.1" should be satisfied by a leaf coded "m1.1".
    const r = computeDispatchReadiness([goodLeaf({ sectionCode: 'm1.1' })], { requiredSections: ['1.1'] });
    expect(r.warnings).toBe(0);
  });

  it('a true sub-section satisfies a required parent section', () => {
    const r = computeDispatchReadiness([goodLeaf({ sectionCode: '1.2.1' })], { requiredSections: ['1.2'] });
    expect(r.findings.filter(f => f.code === 'MISSING_REQUIRED_SECTION')).toHaveLength(0);
  });

  it('a numerically-adjacent section does NOT satisfy a required section', () => {
    // '1.20' must not satisfy required '1.2' (the dot-stripping collision bug).
    const r = computeDispatchReadiness([goodLeaf({ sectionCode: '1.20' })], { requiredSections: ['1.2'] });
    expect(r.findings.filter(f => f.code === 'MISSING_REQUIRED_SECTION')).toHaveLength(1);
  });

  it('emits an info for duplicate "new" leaves in one section without erroring', () => {
    const r = computeDispatchReadiness([goodLeaf(), goodLeaf({ documentId: 99 })]);
    expect(r.errors).toBe(0);
    expect(r.infos).toBe(1);
    expect(r.findings.some(f => f.code === 'DUPLICATE_NEW_SECTION')).toBe(true);
  });

  it('warnings and infos never inflate the authoritative error count', () => {
    const r = computeDispatchReadiness(
      [goodLeaf(), goodLeaf({ documentId: 7 })], // duplicate -> info
      { requiredSections: ['9.9'] } // missing -> warning
    );
    expect(r.errors).toBe(0);
    expect(r.warnings).toBe(1);
    expect(r.infos).toBe(1);
  });

  it('flags replace/append/delete in an ORIGINAL sequence as errors', () => {
    const r = computeDispatchReadiness(
      [
        goodLeaf({ sectionCode: 'm2.5', lifecycleOp: 'replace' }),
        goodLeaf({ sectionCode: 'm2.4', lifecycleOp: 'append', documentId: 50 }),
      ],
      { isOriginalSequence: true }
    );
    expect(r.findings.filter(f => f.code === 'LIFECYCLE_OP_IN_ORIGINAL')).toHaveLength(2);
    expect(r.errors).toBeGreaterThanOrEqual(2);
  });

  it('allows new leaves in an original sequence (no lifecycle error)', () => {
    const r = computeDispatchReadiness([goodLeaf(), goodLeaf({ sectionCode: 'm2.4', documentId: 51 })], {
      isOriginalSequence: true,
    });
    expect(r.findings.some(f => f.code === 'LIFECYCLE_OP_IN_ORIGINAL')).toBe(false);
    expect(r.errors).toBe(0);
  });

  it('does NOT apply the original-sequence rule to amendments', () => {
    const r = computeDispatchReadiness([goodLeaf({ lifecycleOp: 'replace' })], { isOriginalSequence: false });
    expect(r.findings.some(f => f.code === 'LIFECYCLE_OP_IN_ORIGINAL')).toBe(false);
    expect(r.errors).toBe(0);
  });

  it('says a follow-up\'s declared acts were not bound here, rather than reading clean (2026-09-22 W5/D7)', () => {
    // Binding happens at assembly and an unbindable act blocks transmit; a
    // readiness verdict silent about it would promise a transmit the system
    // then refuses.
    const r = computeDispatchReadiness(
      [goodLeaf({ lifecycleOp: 'replace' }), goodLeaf({ sectionCode: 'm2.4', documentId: 51 })],
      { isOriginalSequence: false },
    );
    const w = r.findings.filter(f => f.code === 'LIFECYCLE_BINDING_NOT_ASSESSED');
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ severity: 'warning', sectionCode: 'm2.5' });
    expect(r.errors).toBe(0);
  });

  it('accepts a valid 4-digit sequence number', () => {
    for (const n of ['0000', '0001', '0042', '9999']) {
      const r = computeDispatchReadiness([goodLeaf()], { sequenceNumber: n });
      expect(r.findings.some(f => f.code === 'SEQUENCE_NUMBER_FORMAT')).toBe(false);
    }
  });

  it('flags a malformed sequence number as an error', () => {
    for (const n of ['0', '00', '12345', 'abcd', '00a0', '']) {
      const r = computeDispatchReadiness([goodLeaf()], { sequenceNumber: n });
      expect(r.findings.some(f => f.code === 'SEQUENCE_NUMBER_FORMAT')).toBe(true);
      expect(r.errors).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('computeDispatchReadiness — document-pointer rules', () => {
  it('flags a leaf whose document_table no resolver can materialize', () => {
    const r = computeDispatchReadiness([goodLeaf({ documentTable: 'coauthor_doccuments' })]);
    expect(r.errors).toBe(1);
    expect(r.findings.some(f => f.code === 'UNPLACEABLE_DOCUMENT_TABLE')).toBe(true);
  });

  it('does NOT flag the tables the assembler can resolve', () => {
    const tables = [
      'coauthor_documents',
      'unified_documents',
      'ctd_onboarding_documents',
      'rendered_leaf_files',
      'c2c_document_sections',
    ];
    const r = computeDispatchReadiness(
      tables.map((documentTable, i) => goodLeaf({ sectionCode: `m2.${i}`, documentTable, documentId: 40 + i })),
    );
    expect(r.errors).toBe(0);
    expect(r.findings.filter(f => f.code === 'UNPLACEABLE_DOCUMENT_TABLE')).toHaveLength(0);
  });

  // A vault_documents leaf is PLACEABLE (a documented polymorphic target the
  // write path accepts) but the assembler cannot materialize it, and
  // transmitSequence fails closed on ANY unresolved leaf — external ones
  // included. A dispatch-clear verdict for such a sequence would assert
  // something the system can never deliver, which is the exact defect the
  // readiness gate exists to prevent.
  /*
   * THE EXTERNAL-TABLE CASE HAS NO MEMBER TO TEST WITH, as of 2026-09-17.
   *
   * `vault_documents` was the only entry in EXTERNAL_DOCUMENT_TABLES, and it
   * became RESOLVABLE once both blockers fell: vault ingest now writes through
   * getStorageProvider() (so the packager can fetch the bytes) and
   * submission_leaves carries document_uuid (so a leaf can name a uuid-keyed
   * document). The map is now empty, so EXTERNAL_DOCUMENT_NOT_MATERIALIZABLE
   * cannot be produced through the public API — there is no table to pass.
   *
   * The two tests that used vault_documents as the external example were
   * removed rather than rewritten, because a test that asserts behaviour the
   * system can no longer exhibit is worse than no test: it passes for the wrong
   * reason or has to be forced. What replaces them is the assertion below —
   * that the mechanism is intact and currently empty — so whoever adds the next
   * external store is told, by a failing test, to restore this coverage.
   */
  it('has no external table today, and the vault leaf it used to flag now reads clear', () => {
    // EXTERNAL_DOCUMENT_TABLES is module-local by design (externalDocumentTableReason
    // is the only reader), so assert it derivatively: placeable is resolvable
    // PLUS external, so the two sets matching means external is empty.
    expect(PLACEABLE_DOCUMENT_TABLES.size).toBe(RESOLVABLE_DOCUMENT_TABLES.size);
    // A vault leaf is keyed by uuid (documentId stays null) — see the block below.
    const r = computeDispatchReadiness([goodLeaf({ documentTable: 'vault_documents', documentId: null, documentUuid: VAULT_UUID })]);
    // Placeable AND resolvable now — so neither the external finding nor the
    // invented-table finding. A vault leaf is a legitimate pointer.
    expect(r.findings.some(f => f.code === 'EXTERNAL_DOCUMENT_NOT_MATERIALIZABLE')).toBe(false);
    expect(r.findings.some(f => f.code === 'UNPLACEABLE_DOCUMENT_TABLE')).toBe(false);
  });

  // A delete leaf is exempt from the COMPLETENESS check — it legitimately ships
  // no file — but that exemption was written as a blanket `return []` for every
  // delete leaf, which skipped the two table checks as well. A delete row can
  // still carry a document pointer (AnaToolExecutor accepts lifecycle_op with a
  // document_table on the same call), and a bogus one read dispatch-clear.
  // A pointer that EXISTS must be a valid one whatever the operation: the
  // assembler calls resolveFile on every stored leaf, delete rows included, and
  // counts each one it cannot resolve against submission completeness.
  it('flags an invented document_table on a DELETE leaf — the completeness exemption is not a pointer exemption', () => {
    const r = computeDispatchReadiness([
      goodLeaf(),
      goodLeaf({ sectionCode: 'm3.2', lifecycleOp: 'delete', documentTable: 'coauthor_doccuments', documentId: 7 }),
    ]);
    expect(r.findings.some(f => f.code === 'UNPLACEABLE_DOCUMENT_TABLE'), 'a typo table on a delete leaf read dispatch-clear').toBe(true);
    expect(r.errors).toBe(1);
  });

  it('still exempts a delete leaf that carries NO pointer — that is the legitimate shape', () => {
    const r = computeDispatchReadiness([
      goodLeaf(),
      goodLeaf({ sectionCode: 'm3.2', lifecycleOp: 'delete', documentTable: null, documentId: null }),
    ]);
    expect(r.errors).toBe(0);
  });

  it('does not double-report a delete leaf that points at a table the assembler CAN resolve', () => {
    const r = computeDispatchReadiness([
      goodLeaf(),
      goodLeaf({ sectionCode: 'm3.2', lifecycleOp: 'delete', documentTable: 'coauthor_documents', documentId: 7 }),
    ]);
    expect(r.errors).toBe(0);
  });

});

// ── Two key spaces (MDX demo pack, 2026-09-21, finding F5) ────────────────
// submission_leaves addresses integer-keyed stores by documentId and the
// uuid-keyed vault by documentUuid. The completeness check read the integer
// column alone, so every leaf filed from the vault — uuid stored, integer
// null, content hash pinned — was UNRESOLVED_DOCUMENT, and no vault-built
// sequence could clear the gate.
describe('document pointer completeness is judged per key space', () => {
  it('a uuid-keyed vault leaf (documentId null) is a complete pointer — no UNRESOLVED_DOCUMENT', () => {
    const r = computeDispatchReadiness([goodLeaf({ documentTable: 'vault_documents', documentId: null, documentUuid: VAULT_UUID })]);
    expect(r.findings.filter(f => f.code === 'UNRESOLVED_DOCUMENT')).toHaveLength(0);
    expect(r.errors).toBe(0);
  });

  it('an integer-keyed leaf still resolves', () => {
    const r = computeDispatchReadiness([goodLeaf({ documentTable: 'coauthor_documents', documentId: 42 })]);
    expect(r.errors).toBe(0);
  });

  it('a vault leaf carrying only an integer names nothing — UNRESOLVED_DOCUMENT', () => {
    const r = computeDispatchReadiness([goodLeaf({ documentTable: 'vault_documents', documentId: 1, documentUuid: null })]);
    expect(r.findings.some(f => f.code === 'UNRESOLVED_DOCUMENT')).toBe(true);
  });

  it('an integer-keyed table carrying only a uuid names nothing — UNRESOLVED_DOCUMENT', () => {
    const r = computeDispatchReadiness([goodLeaf({ documentTable: 'coauthor_documents', documentId: null, documentUuid: VAULT_UUID })]);
    expect(r.findings.some(f => f.code === 'UNRESOLVED_DOCUMENT')).toBe(true);
  });

  it('hasCompleteDocumentPointer: uuid for the vault, integer elsewhere, either for an unknown table', () => {
    expect(hasCompleteDocumentPointer({ documentTable: 'vault_documents', documentId: null, documentUuid: VAULT_UUID })).toBe(true);
    expect(hasCompleteDocumentPointer({ documentTable: 'vault_documents', documentId: 9, documentUuid: null })).toBe(false);
    expect(hasCompleteDocumentPointer({ documentTable: 'coauthor_documents', documentId: 9, documentUuid: null })).toBe(true);
    expect(hasCompleteDocumentPointer({ documentTable: 'coauthor_documents', documentId: null, documentUuid: VAULT_UUID })).toBe(false);
    expect(hasCompleteDocumentPointer({ documentTable: 'no_such_table', documentId: null, documentUuid: VAULT_UUID })).toBe(true);
    expect(hasCompleteDocumentPointer({ documentTable: null, documentId: 9, documentUuid: VAULT_UUID })).toBe(false);
  });
});

// The DB-bound resolver's verdict rides in on `document`; the validator turns
// it into findings. Existence and the pin comparison cannot be judged here.
describe('resolver verdicts become findings', () => {
  const resolution = (over: Partial<LeafDocumentResolution>): LeafDocumentResolution => ({
    status: 'resolved',
    keyKind: 'uuid',
    documentTable: 'vault_documents',
    documentId: null,
    documentUuid: VAULT_UUID,
    pinnedSha256: 'a'.repeat(64),
    storedSha256: 'a'.repeat(64),
    pin: 'match',
    reason: null,
    ...over,
  });
  const vaultLeaf = (document: LeafDocumentResolution) =>
    goodLeaf({ documentTable: 'vault_documents', documentId: null, documentUuid: VAULT_UUID, document });

  it('a resolved leaf whose pin matches carries no error', () => {
    const r = computeDispatchReadiness([vaultLeaf(resolution({}))]);
    expect(r.errors).toBe(0);
    expect(r.findings.some(f => f.code === 'DOCUMENT_CONTENT_NOT_PINNED')).toBe(false);
  });

  it('an unpinned leaf says its content was not verified, rather than reading like a match (2026-09-22 W5/D7)', () => {
    const r = computeDispatchReadiness([vaultLeaf(resolution({ pin: 'unpinned', pinnedSha256: null }))]);
    const w = r.findings.filter(f => f.code === 'DOCUMENT_CONTENT_NOT_PINNED');
    expect(w).toHaveLength(1);
    expect(w[0].severity).toBe('warning');
    expect(r.errors).toBe(0);
  });

  it('a pinned hash that differs from the stored document is DOCUMENT_CONTENT_MISMATCH — its own code, never silently passed', () => {
    const r = computeDispatchReadiness([vaultLeaf(resolution({ status: 'content_changed', pin: 'mismatch', storedSha256: 'b'.repeat(64) }))]);
    const f = r.findings.find(x => x.code === 'DOCUMENT_CONTENT_MISMATCH');
    expect(f?.severity).toBe('error');
    expect(f?.sectionCode).toBe('m2.5');
    expect(f?.message).toContain('a'.repeat(64));
    expect(f?.message).toContain('b'.repeat(64));
    expect(r.findings.some(x => x.code === 'UNRESOLVED_DOCUMENT')).toBe(false);
    expect(r.errors).toBe(1);
  });

  // 2026-09-23 (W5/D7, residual repair): a withdrawal withdraws the copy on
  // file and transmit no longer reads its source, so a changed source is not a
  // readiness error on a delete — the two gates would otherwise disagree.
  it('a delete whose source changed since it was pinned is not DOCUMENT_CONTENT_MISMATCH; the leaf that ships it still is', () => {
    const changed = resolution({ status: 'content_changed', pin: 'mismatch', storedSha256: 'b'.repeat(64) });
    const del = computeDispatchReadiness([
      goodLeaf({ sectionCode: 'm1.2', title: 'Cover' }),
      { ...vaultLeaf(changed), lifecycleOp: 'delete' },
    ]);
    expect(del.findings.some(x => x.code === 'DOCUMENT_CONTENT_MISMATCH')).toBe(false);
    expect(del.errors).toBe(0);
    const shipped = computeDispatchReadiness([{ ...vaultLeaf(changed), lifecycleOp: 'replace' }]);
    expect(shipped.findings.some(x => x.code === 'DOCUMENT_CONTENT_MISMATCH')).toBe(true);
  });

  it('a document the resolver could not find stays UNRESOLVED_DOCUMENT, naming the pointer', () => {
    const r = computeDispatchReadiness([vaultLeaf(resolution({ status: 'missing', pin: 'unpinned', pinnedSha256: null, storedSha256: null, reason: 'vault document not found in this organization' }))]);
    const f = r.findings.find(x => x.code === 'UNRESOLVED_DOCUMENT');
    expect(f?.severity).toBe('error');
    expect(f?.message).toContain(VAULT_UUID);
    expect(f?.message).toContain('not found in this organization');
    expect(r.errors).toBe(1);
  });

  it('a missing document on a DELETE leaf is not a completeness error (a delete ships no file)', () => {
    const r = computeDispatchReadiness([
      goodLeaf(),
      goodLeaf({ sectionCode: 'm3.2', lifecycleOp: 'delete', documentTable: 'coauthor_documents', documentId: 7,
        document: resolution({ status: 'missing', keyKind: 'integer', documentTable: 'coauthor_documents', documentId: 7, documentUuid: null }) }),
    ]);
    expect(r.errors).toBe(0);
  });

  /* QA 2026-10-08 (j6, findings 1 and 11). An unapproved Vault version read
     "source verified" in the Builder and was absent from the Dispatch blockers;
     the refusal that named it ran only in the assembly after the e-signature. */
  it('an approved document, a delete, and a missing document raise no DOCUMENT_NOT_APPROVED', () => {
    const approved = computeDispatchReadiness([vaultLeaf(resolution({ notTransmittable: null }))]);
    expect(approved.findings.some((x) => x.code === 'DOCUMENT_NOT_APPROVED')).toBe(false);
    const del = computeDispatchReadiness([
      goodLeaf({ sectionCode: 'm1.2', title: 'Cover' }),
      { ...vaultLeaf(resolution({ notTransmittable: 'draft' })), lifecycleOp: 'delete' },
    ]);
    expect(del.findings.some((x) => x.code === 'DOCUMENT_NOT_APPROVED')).toBe(false);
    const missing = computeDispatchReadiness([vaultLeaf(resolution({ status: 'missing', notTransmittable: 'not found' }))]);
    expect(missing.findings.map((x) => x.code)).not.toContain('DOCUMENT_NOT_APPROVED');
  });

  /* QA 2026-10-08 (j6, finding 7). "Re-place the leaf to pin its content" was
     printed over documents with no content, which no placement can pin. */
  it('a document with no content is UNRESOLVED_DOCUMENT, not a pin warning that re-placing cannot clear', () => {
    const r = computeDispatchReadiness([
      goodLeaf({ sectionCode: '1.2', title: 'Cover Letter', document: resolution({
        keyKind: 'integer', documentTable: 'coauthor_documents', documentId: 5, documentUuid: null,
        pin: 'unpinned', pinnedSha256: null, storedSha256: null, reason: 'the document has no authored content', noContent: true,
      }) }),
    ]);
    expect(r.findings.map((x) => x.code)).not.toContain('DOCUMENT_CONTENT_NOT_PINNED');
    const f = r.findings.find((x) => x.code === 'UNRESOLVED_DOCUMENT');
    expect(f?.severity).toBe('error');
    expect(f?.message).toContain('no authored content');
    expect(f?.message).not.toMatch(/Re-place the leaf to pin/);
  });
});

describe('required sections, decided per sequence', () => {
  /* QA 2026-10-08 (j7, finding 4). Every missing section was a warning, so a
     one-leaf original IND with no Form 1571, no IB and no general
     investigational plan read "structural gate satisfied". A section the
     regulation requires in this sequence is now decided as an error. */
  it('a section the regulation requires in this sequence is an ERROR when no leaf carries it, citing the record', () => {
    const basis = 'The regional Module 1 record (US) requires it in an original IND application.';
    const r = computeDispatchReadiness([goodLeaf({ sectionCode: '1.2' })], {
      requiredByRegulation: { codes: ['1.1', '1.2', '1.14.4.1', '1.20'], basis },
    });
    const missing = r.findings.filter((f) => f.code === 'MISSING_REQUIRED_SECTION');
    expect(missing.map((f) => f.sectionCode)).toEqual(['1.1', '1.14.4.1', '1.20']);
    expect(missing.every((f) => f.severity === 'error')).toBe(true);
    expect(missing[0].message).toContain(basis);
    expect(r.errors).toBe(3);
    expect(r.warnings).toBe(0);
  });

  it('a regulation-required section is satisfied by a sub-section, and is not reported again from the profile list', () => {
    const r = computeDispatchReadiness([goodLeaf({ sectionCode: 'm1.1.1' }), goodLeaf({ sectionCode: '1.14.4.1', documentId: 43 })], {
      requiredByRegulation: { codes: ['1.1', '1.14', '1.14.4.1', '1.20'], basis: 'record' },
      requiredSections: ['1.1', '1.20', '1.3'],
    });
    const missing = r.findings.filter((f) => f.code === 'MISSING_REQUIRED_SECTION');
    // 1.20 is decided by regulation (error, once); 1.3 only listed (warning).
    expect(missing.map((f) => `${f.severity} ${f.sectionCode}`)).toEqual(['error 1.20', 'warning 1.3']);
    expect(r.errors).toBe(1);
  });
});

describe('P-22: approval gates the release, not the technical validation', () => {
  /** A resolved vault leaf whose approval verdict is `reason` (null: approved). */
  const notApprovedLeaf = (reason: string | null, over: Partial<LeafDocumentResolution> = {}): ReadinessLeaf =>
    goodLeaf({
      documentTable: 'vault_documents', documentId: null, documentUuid: VAULT_UUID,
      document: {
        status: 'resolved', keyKind: 'uuid', documentTable: 'vault_documents', documentId: null, documentUuid: VAULT_UUID,
        pinnedSha256: 'a'.repeat(64), storedSha256: 'a'.repeat(64), pin: 'match', reason: null, notTransmittable: reason, ...over,
      },
    });

  /* P-22 (product decision 2026-10-08): approval gates the release, not the
     technical validation. At validation the finding is a WARNING ("not yet
     approved") marked for the release steps, which refuse it — never an error,
     so it cannot fail Validated, and never silent, so freeze, dispatch and
     transmit still name it. */
  it('a resolved leaf whose document is not approved is a DOCUMENT_NOT_APPROVED warning that blocks the release, naming the leaf and its section', () => {
    const r = computeDispatchReadiness([notApprovedLeaf('not reviewed')]);
    const f = r.findings.find((x) => x.code === 'DOCUMENT_NOT_APPROVED');
    expect(f?.severity).toBe('warning');
    expect(f?.blocksRelease).toBe(true);
    expect(f?.sectionCode).toBe('m2.5');
    expect(f?.message).toContain('not yet approved (not reviewed)');
    expect(f?.message).toMatch(/freeze, dispatch and transmit refuse/);
    expect(f?.message).toContain(VAULT_UUID);
    expect(r.errors).toBe(0);
    expect(r.releaseBlockers).toBe(1);
  });

  it('only a not-yet-approved document is a release blocker; ordinary warnings are not', () => {
    const r = computeDispatchReadiness([notApprovedLeaf(null, { pin: 'unpinned', pinnedSha256: null })], { requiredSections: ['1.1'] });
    expect(r.warnings).toBe(2); // DOCUMENT_CONTENT_NOT_PINNED + MISSING_REQUIRED_SECTION (profile list)
    expect(r.releaseBlockers).toBe(0);
    expect(r.findings.some((x) => x.blocksRelease)).toBe(false);
  });
});

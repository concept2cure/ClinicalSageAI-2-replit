/**
 * Unit tests for the deterministic dispatch-readiness validator.
 *
 * These pin the contract that the dispatch gate relies on: the `errors` count is
 * computed from the canonical leaves and reflects only unambiguous structural
 * defects — warnings and infos never inflate it.
 */
import { describe, it, expect } from 'vitest';
import { computeDispatchReadiness, type ReadinessLeaf } from '../dispatch-readiness';

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
  it('flags a leaf on a documented-external table the assembler cannot materialize', () => {
    const r = computeDispatchReadiness([goodLeaf({ documentTable: 'vault_documents' })]);
    expect(r.errors).toBe(1);
    const finding = r.findings.find(f => f.code === 'EXTERNAL_DOCUMENT_NOT_MATERIALIZABLE');
    expect(finding, 'a vault_documents leaf must not read dispatch-clear').toBeTruthy();
    expect(finding!.severity).toBe('error');
    // The refusal must carry the resolver's own reason, not a generic message.
    expect(finding!.message).toContain('vault');
    // It is not an invented table — the write-side allowlist still accepts it.
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

  it('flags an external document_table on a DELETE leaf', () => {
    const r = computeDispatchReadiness([
      goodLeaf(),
      goodLeaf({ sectionCode: 'm3.2', lifecycleOp: 'delete', documentTable: 'vault_documents', documentId: 7 }),
    ]);
    expect(r.findings.some(f => f.code === 'EXTERNAL_DOCUMENT_NOT_MATERIALIZABLE')).toBe(true);
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

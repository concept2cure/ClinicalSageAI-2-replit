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
});

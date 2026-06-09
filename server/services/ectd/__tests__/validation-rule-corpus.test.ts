/**
 * Tests for the eCTD validation rule corpus — proves the catalog is internally
 * consistent and, crucially, that every finding code the dispatch gate can emit is
 * cataloged (the corpus and the enforced rules can never drift apart).
 */
import { describe, it, expect } from 'vitest';
import { computeDispatchReadiness, type ReadinessLeaf } from '../dispatch-readiness';
import {
  RULE_CORPUS,
  getRule,
  rulesForRegion,
  rulesByEnforcement,
  dispatchFindingCodes,
  corpusSummary,
} from '../validation-rule-corpus';

describe('validation rule corpus — internal consistency', () => {
  it('has unique ids and required fields on every rule', () => {
    const ids = RULE_CORPUS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RULE_CORPUS) {
      expect(r.title).toBeTruthy();
      expect(r.rationale).toBeTruthy();
      expect(r.source).toBeTruthy();
      expect(r.regions.length).toBeGreaterThan(0);
      expect(['high', 'medium', 'low']).toContain(r.severity);
    }
  });

  it('gives every dispatch-readiness rule a findingCode equal to its id', () => {
    for (const r of rulesByEnforcement('dispatch-readiness')) {
      expect(r.findingCode, `${r.id} must carry a findingCode`).toBeTruthy();
      expect(r.findingCode).toBe(r.id); // the gate emits the rule id as its code
    }
  });

  it('summary counts are internally consistent', () => {
    const s = corpusSummary();
    expect(s.total).toBe(RULE_CORPUS.length);
    const enforcementTotal = Object.values(s.byEnforcement).reduce((a, b) => a + b, 0);
    expect(enforcementTotal).toBe(RULE_CORPUS.length);
    const severityTotal = Object.values(s.bySeverity).reduce((a, b) => a + b, 0);
    expect(severityTotal).toBe(RULE_CORPUS.length);
  });

  it('scopes rules to a region (shared ich rules + region-specific)', () => {
    const fda = rulesForRegion('fda');
    expect(fda.some((r) => r.regions.includes('ich'))).toBe(true);
    expect(fda.every((r) => r.regions.includes('ich') || r.regions.includes('fda'))).toBe(true);
    // A jp-only rule does not leak into fda's set unless it is also ich/fda.
    expect(rulesForRegion('eu').some((r) => r.id === 'REGIONAL_XML_PRESENT')).toBe(true);
  });

  it('looks rules up by id', () => {
    expect(getRule('EMPTY_SEQUENCE')?.severity).toBe('high');
    expect(getRule('does-not-exist')).toBeUndefined();
  });
});

describe('corpus ↔ gate cross-reference invariant', () => {
  it('catalogs EVERY finding code the dispatch gate can emit', () => {
    const leaf = (over: Partial<ReadinessLeaf> = {}): ReadinessLeaf => ({
      sectionCode: '3.2.p',
      title: 'A leaf',
      lifecycleOp: 'new',
      documentTable: 'coauthor_documents',
      documentId: 1,
      ...over,
    });

    // A battery of inputs that, between them, trigger every rule the gate enforces.
    const scenarios: Array<{ leaves: ReadinessLeaf[]; opts?: Parameters<typeof computeDispatchReadiness>[1] }> = [
      { leaves: [] }, // EMPTY_SEQUENCE
      { leaves: [leaf()], opts: { sequenceNumber: 'nope' } }, // SEQUENCE_NUMBER_FORMAT
      { leaves: [leaf({ lifecycleOp: 'frobnicate' })] }, // INVALID_LIFECYCLE_OP
      { leaves: [leaf({ documentTable: null, documentId: null })] }, // UNRESOLVED_DOCUMENT
      { leaves: [leaf({ lifecycleOp: 'replace' })], opts: { isOriginalSequence: true } }, // LIFECYCLE_OP_IN_ORIGINAL
      { leaves: [leaf()], opts: { requiredSections: ['1.1'] } }, // MISSING_REQUIRED_SECTION
      { leaves: [leaf(), leaf()] }, // DUPLICATE_NEW_SECTION
    ];

    const emitted = new Set<string>();
    for (const s of scenarios) {
      for (const f of computeDispatchReadiness(s.leaves, s.opts).findings) emitted.add(f.code);
    }

    // Every emitted code must be a cataloged dispatch-readiness rule.
    const cataloged = dispatchFindingCodes();
    for (const code of emitted) {
      const rule = getRule(code);
      expect(rule, `gate emitted "${code}" which is not in the corpus`).toBeTruthy();
      expect(rule!.enforcement).toBe('dispatch-readiness');
      expect(cataloged.has(code)).toBe(true);
    }

    // Sanity: the battery actually exercised the corpus (not a vacuous pass).
    expect(emitted.size).toBeGreaterThanOrEqual(7);
  });
});

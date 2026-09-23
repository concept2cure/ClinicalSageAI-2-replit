/**
 * Tests for the eCTD validation rule corpus — proves the catalog is internally
 * consistent and, crucially, that every finding code the dispatch gate can emit is
 * cataloged (the corpus and the enforced rules can never drift apart).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { computeDispatchReadiness, type ReadinessLeaf } from '../dispatch-readiness';
import {
  RULE_CORPUS,
  getRule,
  rulesForRegion,
  supportedRegions,
  rulesByEnforcement,
  dispatchFindingCodes,
  corpusSummary,
  enforcementStatement,
  ruleView,
  DISPATCH_GATE_RULE_IDS,
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

  it('covers the global eCTD-adopting regions (US, EU, JP, CA, AU, CH)', () => {
    const regions = supportedRegions();
    for (const r of ['fda', 'eu', 'jp', 'ca', 'au', 'ch']) {
      expect(regions, `region ${r} must have at least one rule`).toContain(r);
    }
    // Each region resolves a non-empty rule set (shared ich rules + regional).
    for (const r of ['ca', 'au', 'ch'] as const) {
      const rules = rulesForRegion(r);
      expect(rules.some((rule) => rule.regions.includes(r))).toBe(true);
      expect(rules.some((rule) => rule.regions.includes('ich'))).toBe(true);
    }
    // The new regional backbone rules are cataloged and sourced.
    for (const id of ['CA_REGIONAL_BACKBONE', 'AU_REGIONAL_BACKBONE', 'CH_REGIONAL_BACKBONE']) {
      const rule = getRule(id);
      expect(rule, `${id} must exist`).toBeTruthy();
      expect(rule!.source).toBeTruthy();
      expect(rule!.enforcement).not.toBe('dispatch-readiness'); // documented, not a new gate code
    }
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
      // DOCUMENT_CONTENT_MISMATCH — the DB-bound resolver's verdict rides in on
      // `document`; a pin that no longer matches the stored content is its own
      // error, never a silent pass.
      { leaves: [leaf({ document: { status: 'content_changed', keyKind: 'integer', documentTable: 'coauthor_documents', documentId: 1, documentUuid: null, pinnedSha256: 'a'.repeat(64), storedSha256: 'b'.repeat(64), pin: 'mismatch', reason: null } })] },
      { leaves: [leaf({ documentTable: 'coauthor_doccuments' })] }, // UNPLACEABLE_DOCUMENT_TABLE
      // EXTERNAL_DOCUMENT_NOT_MATERIALIZABLE has NO scenario, because as of
      // 2026-09-17 it cannot be emitted: `vault_documents` was the only member
      // of EXTERNAL_DOCUMENT_TABLES and it became resolvable, leaving that map
      // empty. The rule and its mechanism are deliberately kept (the next store
      // a leaf may point at but the assembler cannot render belongs there), so
      // the corpus still catalogues the code — it simply has no input that
      // produces it today. Adding a member back means restoring a scenario here
      // and raising the floor below.
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
    // 8, not 9, since 2026-09-17: EXTERNAL_DOCUMENT_NOT_MATERIALIZABLE has no
    // producible input while EXTERNAL_DOCUMENT_TABLES is empty (see the battery
    // above). Lowered with that reason rather than left to fail, and it is a
    // floor — a rule that stops firing for any OTHER reason still trips it.
    // 9 since 2026-09-21: DOCUMENT_CONTENT_MISMATCH (a resolved document whose
    // pinned content hash no longer matches) joined the battery.
    expect(emitted.size).toBeGreaterThanOrEqual(9);
  });
});

/* The battery above proves the codes IT triggers are catalogued. It cannot see
   a code it has no scenario for: the assessor adds UNKNOWN_REGION_PROFILE
   itself, outside computeDispatchReadiness, and the surface renders it, yet no
   rule named it. A new code added without a scenario passes vacuously, because
   the floor only catches rules that STOP firing. This scan reads the sources. */
describe('corpus ↔ source invariant — every finding code written in the assessment', () => {
  it('catalogs every code the dispatch-readiness sources can emit', () => {
    const sources = ['../dispatch-readiness.ts', '../assess-dispatch-readiness.ts'];
    const codes = new Set<string>();
    for (const src of sources) {
      for (const line of fs.readFileSync(new URL(src, import.meta.url), 'utf8').split('\n')) {
        if (/\bthrow\b/.test(line)) continue; // an error's code is not a finding
        const m = /^\s*code:\s*'([A-Z][A-Z0-9_]+)',?\s*$/.exec(line);
        if (m) codes.add(m[1]);
      }
    }
    // Guards the scanner itself: a pattern that matched nothing would pass everything.
    expect(codes.size).toBeGreaterThanOrEqual(11);
    for (const code of codes) {
      const rule = getRule(code);
      expect(rule, `the assessment can emit "${code}", which is not in the corpus`).toBeTruthy();
      expect(rule!.enforcement).toBe('dispatch-readiness');
    }
  });
});

describe('each rule says where it is enforced — the work order\'s three statements', () => {
  it('maps every enforcement to its statement', () => {
    expect(enforcementStatement('dispatch-readiness')).toMatch(/^Enforced here/);
    expect(enforcementStatement('ectd-validator')).toMatch(/^Enforced here/);
    expect(enforcementStatement('packager')).toMatch(/^Guaranteed by packager construction/);
    expect(enforcementStatement('external')).toMatch(/^Requires the agency validator/);
  });

  it('a rule view carries its title, regions, severity and statement; an unknown code has none', () => {
    const v = ruleView('EMPTY_SEQUENCE');
    expect(v).toMatchObject({ id: 'EMPTY_SEQUENCE', severity: 'high', enforcement: 'dispatch-readiness' });
    expect(v!.title).toBeTruthy();
    expect(v!.regions.length).toBeGreaterThan(0);
    expect(v!.enforcementStatement).toMatch(/^Enforced here/);
    expect(ruleView('NOT_A_RULE')).toBeNull();
  });

  it('names every composed dispatch gate as a corpus rule', () => {
    expect(Object.keys(DISPATCH_GATE_RULE_IDS).sort()).toEqual(['external', 'releaseSignature', 'shadowPresence', 'structural']);
    for (const id of Object.values(DISPATCH_GATE_RULE_IDS)) expect(getRule(id), id).toBeTruthy();
  });

  it('cites FDA\'s criteria for the required-Module-1 rule an FDA IND trips most', () => {
    expect(getRule('MISSING_REQUIRED_SECTION')!.source).toMatch(/FDA/);
  });
});

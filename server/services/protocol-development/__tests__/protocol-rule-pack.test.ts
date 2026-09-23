/**
 * Protocol regulatory rule pack — deterministic, pure, dependency-free.
 *
 * RED-FIRST EVIDENCE (CLAUDE.md "verify by making the check fail"): the three tests
 * in `describe('rule pack — red-first')` were written and run BEFORE
 * protocol-rule-pack.ts existed. First run: ERR_MODULE_NOT_FOUND. Second run,
 * against an empty stub that returned `{ findings: [] }`, three real assertion
 * failures:
 *   - "expected undefined to be 'unmet'"        (endpoint-less objective)
 *   - "expected undefined to be 'not-assessed'" (null involvesChildren flag)
 *   - "expected false to be true"               (IRB protocol with no 50.25 finding)
 * The third test carries a POSITIVE half on purpose: a bare
 * `expect(iacuc.findings.some(...)).toBe(false)` passes against an empty stub, so a
 * kind-scoping test without the positive half proves nothing.
 */

import { describe, it, expect } from 'vitest';
import { templateFor, type ProtocolKind } from '../protocol-development-logic';
import {
  listProtocolRules,
  evaluateProtocolRules,
  PROTOCOL_RULES,
  type ProtocolRuleInput,
  type ProtocolRuleStatus,
} from '../protocol-rule-pack';

function baseInput(overrides: Partial<ProtocolRuleInput> = {}): ProtocolRuleInput {
  return {
    kind: 'clinical',
    sections: [],
    objectives: [],
    inclusion: [],
    exclusion: [],
    scheduleVisitCount: 0,
    ...overrides,
  };
}

describe('rule pack — red-first', () => {
  it('an objective with no endpoint is unmet under ICH M11 objectives/endpoints', () => {
    const r = evaluateProtocolRules(
      baseInput({ objectives: [{ objectiveType: 'primary', objective: 'Show benefit', endpoint: null }] }),
    );
    const f = r.findings.find((x) => x.ruleId === 'ich-m11-objectives-endpoints');
    expect(f?.status).toBe('unmet');
    expect(f?.standard).toBe('ICH M11');
  });

  it('a null vulnerable-population flag is not-assessed, never met', () => {
    const r = evaluateProtocolRules(baseInput({ kind: 'irb', involvesChildren: null }));
    const f = r.findings.find((x) => x.ruleId === 'hhs-subpart-d-children-assent-permission');
    expect(f?.status).toBe('not-assessed');
    expect(f?.status).not.toBe('met');
  });

  it('an IACUC protocol gets no 21 CFR 50.25 findings but an IRB one does', () => {
    const iacuc = evaluateProtocolRules(baseInput({ kind: 'iacuc' }));
    const irb = evaluateProtocolRules(baseInput({ kind: 'irb' }));
    // The positive half keeps the negative half from passing vacuously.
    expect(irb.findings.some((x) => x.standard.startsWith('21 CFR 50.25'))).toBe(true);
    expect(iacuc.findings.some((x) => x.standard.startsWith('21 CFR 50.25'))).toBe(false);
    expect(listProtocolRules('iacuc').some((x) => x.standard.startsWith('21 CFR 50.25'))).toBe(false);
  });
});

// ─── Scenario matrix ─────────────────────────────────────────────────────────

const EXTRA_KEYS: Record<string, string[]> = {
  // 'discontinuation' is NOT here: this rule found that SECTION_TEMPLATES.clinical
  // had no such section, and the template now carries it, so it arrives from
  // templateFor(). Re-adding it here would hide a future removal.
  clinical: ['monitoring', 'quality', 'privacy', 'data_safety', 'oversight', 'risks_benefits', 'diversity_plan'],
  irb: ['safety', 'consent', 'statistics', 'intervention', 'design', 'synopsis'],
  iacuc: [],
  ibc: [],
};

function sectionsFor(kind: ProtocolKind, status: 'not_started' | 'draft' | 'complete', len: number) {
  const base = templateFor(kind).map((t) => ({
    sectionKey: t.sectionKey, title: t.title, required: t.required, status, contentLength: len, hasContent: len > 0,
  }));
  const extra = (EXTRA_KEYS[kind] ?? []).map((k) => ({
    sectionKey: k, title: k, required: false, status, contentLength: len, hasContent: len > 0,
  }));
  return [...base, ...extra];
}

const empty = (kind: ProtocolKind): ProtocolRuleInput => baseInput({ kind });

const full = (kind: ProtocolKind): ProtocolRuleInput => ({
  kind,
  sections: sectionsFor(kind, 'complete', 400),
  objectives: [{ objectiveType: 'primary', objective: 'Demonstrate superiority using a treatment policy strategy', endpoint: 'Overall survival', timepoint: 'Month 24' }],
  inclusion: ['a', 'b'],
  exclusion: ['c'],
  scheduleVisitCount: 5,
  phase: 'Phase 3',
  designType: 'randomised double-blind',
  regions: ['US', 'EU'],
  involvesChildren: false,
  involvesPregnantWomen: false,
  involvesPrisoners: false,
  involvesVulnerable: false,
  isIndTrial: true,
});

const SCENARIOS: Array<[string, ProtocolRuleInput]> = [
  ['clin-empty', empty('clinical')],
  ['clin-full', full('clinical')],
  ['clin-draft-flags-on', { ...full('clinical'), sections: sectionsFor('clinical', 'draft', 10),
    objectives: [{ objectiveType: 'primary', objective: 'A', endpoint: null }, { objectiveType: 'primary', objective: 'B', endpoint: 'E' }],
    inclusion: [], exclusion: [], scheduleVisitCount: 0, regions: ['JP'], isIndTrial: false,
    involvesChildren: true, involvesPregnantWomen: true, involvesPrisoners: true, involvesVulnerable: true }],
  ['clin-complete-no-content', { ...full('clinical'), sections: sectionsFor('clinical', 'complete', 0) }],
  ['clin-no-context', { ...full('clinical'), phase: null, designType: null, regions: undefined, isIndTrial: null,
    involvesChildren: null, involvesPregnantWomen: null, involvesPrisoners: null, involvesVulnerable: null, objectives: [] }],
  ['clin-notstarted', { ...full('clinical'), sections: sectionsFor('clinical', 'not_started', 0) }],
  ['clin-eu-incomplete', { ...full('clinical'), sections: sectionsFor('clinical', 'draft', 5), regions: ['DE'] }],
  ['clin-excl-missing', { ...full('clinical'), exclusion: [] }],
  ['clin-nonpivotal', { ...full('clinical'), phase: 'Phase 1', designType: 'open label', regions: ['US'] }],
  ['clin-ind-bare', { ...full('clinical'), sections: [], objectives: [], inclusion: [], exclusion: [], scheduleVisitCount: 0,
    designType: '', phase: 'Phase 3', regions: ['US', 'DE'], isIndTrial: true }],
  ['clin-eu-endpointless', { ...full('clinical'), regions: ['DE'], objectives: [{ objectiveType: 'secondary', objective: 'X', endpoint: '' }] }],
  ['irb-empty', empty('irb')],
  ['irb-full', full('irb')],
  ['irb-flags-on', { ...full('irb'), involvesChildren: true, involvesPregnantWomen: true, involvesPrisoners: true, involvesVulnerable: true }],
  ['irb-no-incl', { ...full('irb'), inclusion: [] }],
  ['iacuc-empty', empty('iacuc')],
  ['iacuc-full', full('iacuc')],
  ['iacuc-draft', { ...full('iacuc'), sections: sectionsFor('iacuc', 'draft', 20) }],
  ['ibc-empty', empty('ibc')],
  ['ibc-full', full('ibc')],
];

/**
 * The statuses each rule is REACHABLE in. Asserted as an exact set, so a rule that
 * silently loses its unmet state — or gains a 'met' it should not have — fails here.
 * Rules whose set has no 'met' are the section-backed ones: a status and a character
 * count are not evidence of what a section says, so the best they reach is
 * 'attention'. That is the honesty contract, pinned as a test.
 */
const REACHABLE: Array<[string, ProtocolRuleStatus[]]> = [
  ['ich-m11-protocol-summary', ['attention', 'unmet']],
  ['ich-m11-objectives-endpoints', ['met', 'unmet']],
  ['ich-m11-trial-design', ['attention', 'unmet']],
  ['ich-m11-population-eligibility', ['met', 'unmet']],
  ['ich-m11-intervention-concomitant', ['attention', 'unmet']],
  ['ich-m11-discontinuation-withdrawal', ['attention', 'unmet']],
  ['ich-m11-assessment-schedule', ['met', 'unmet']],
  ['ich-m11-statistical-considerations', ['attention', 'unmet']],
  ['ich-m11-oversight-quality', ['attention', 'unmet']],
  ['ich-e9r1-estimand-treatment-condition', ['attention', 'unmet']],
  ['ich-e9r1-estimand-population', ['met', 'unmet']],
  ['ich-e9r1-estimand-variable', ['met', 'not-assessed', 'unmet']],
  ['ich-e9r1-estimand-intercurrent-events', ['attention', 'met', 'not-assessed']],
  ['ich-e9r1-estimand-population-level-summary', ['not-assessed']],
  ['ich-e9-sample-size-justification', ['attention', 'unmet']],
  ['ich-e9-multiplicity', ['attention', 'met', 'not-assessed']],
  ['ich-e8r1-critical-to-quality-factors', ['attention', 'unmet']],
  ['ich-e8r1-risk-proportionate-approach', ['attention', 'not-assessed']],
  ['ich-e6r3-safety-reporting', ['attention', 'unmet']],
  ['ich-e6r3-monitoring-approach', ['attention', 'unmet']],
  ['ich-e6r3-data-integrity', ['attention', 'unmet']],
  ['fda-ind-objectives-purpose', ['met', 'not-assessed', 'unmet']],
  ['fda-ind-investigator-site-information', ['met', 'not-assessed']],
  ['fda-ind-selection-exclusion-criteria', ['met', 'not-assessed', 'unmet']],
  ['fda-ind-study-design-control', ['met', 'not-assessed', 'unmet']],
  ['fda-ind-dosing', ['attention', 'met', 'not-assessed', 'unmet']],
  ['fda-ind-observations-measurements', ['met', 'not-assessed', 'unmet']],
  ['fda-ind-safety-monitoring-procedures', ['attention', 'met', 'not-assessed', 'unmet']],
  ['fda-consent-basic-elements', ['attention', 'unmet']],
  ['fda-consent-additional-elements', ['attention', 'unmet']],
  ['fda-irb-risks-minimized', ['attention', 'unmet']],
  ['fda-irb-risks-reasonable', ['attention', 'unmet']],
  ['fda-irb-equitable-selection', ['attention', 'unmet']],
  ['fda-irb-consent-sought-and-documented', ['attention', 'unmet']],
  ['fda-irb-data-monitoring-for-safety', ['attention', 'unmet']],
  ['fda-irb-privacy-confidentiality', ['attention', 'unmet']],
  ['hhs-subpart-b-pregnant-women', ['attention', 'met', 'not-assessed']],
  ['hhs-subpart-c-prisoners', ['attention', 'met', 'not-assessed']],
  ['hhs-subpart-d-children-risk-category', ['attention', 'met', 'not-assessed']],
  ['hhs-subpart-d-children-assent-permission', ['attention', 'met', 'not-assessed']],
  ['hhs-additional-safeguards-vulnerable', ['attention', 'met', 'not-assessed']],
  ['eu-ctr-protocol-content', ['met', 'not-assessed', 'unmet']],
  ['eu-ctr-eligibility-criteria', ['met', 'not-assessed', 'unmet']],
  ['eu-ctr-endpoints', ['met', 'not-assessed', 'unmet']],
  ['fdora-3601-diversity-action-plan', ['attention', 'met', 'not-assessed']],
  ['iacuc-3rs-replacement', ['attention', 'unmet']],
  ['iacuc-3rs-reduction', ['attention', 'unmet']],
  ['iacuc-3rs-refinement', ['attention', 'unmet']],
  ['iacuc-pain-distress-category', ['attention', 'unmet']],
  ['iacuc-humane-endpoints', ['attention', 'unmet']],
  ['iacuc-euthanasia-avma', ['attention', 'unmet']],
  ['ibc-risk-group-classification', ['attention', 'unmet']],
  ['ibc-containment-level', ['attention', 'unmet']],
];

function observedStatuses(): Map<string, Set<ProtocolRuleStatus>> {
  const obs = new Map<string, Set<ProtocolRuleStatus>>();
  for (const [, input] of SCENARIOS) {
    for (const f of evaluateProtocolRules(input).findings) {
      const set = obs.get(f.ruleId) ?? new Set<ProtocolRuleStatus>();
      set.add(f.status);
      obs.set(f.ruleId, set);
    }
  }
  return obs;
}

describe('rule coverage — every rule exercised in every state it can reach', () => {
  const observed = observedStatuses();

  it('the reachability table names every rule exactly once', () => {
    expect(REACHABLE.map((r) => r[0]).sort()).toEqual(PROTOCOL_RULES.map((r) => r.id).sort());
    expect(new Set(REACHABLE.map((r) => r[0])).size).toBe(REACHABLE.length);
  });

  it.each(REACHABLE)('%s reaches exactly its declared statuses', (ruleId, expected) => {
    expect([...(observed.get(ruleId) ?? [])].sort()).toEqual([...expected].sort());
  });

  it('every rule reaches at least one non-met state — nothing is green by construction', () => {
    for (const [ruleId, statuses] of REACHABLE) {
      expect(statuses.some((s) => s !== 'met'), `${ruleId} is only ever met`).toBe(true);
    }
  });
});

// ─── Honesty contract ────────────────────────────────────────────────────────

describe('honesty contract', () => {
  it('a section marked complete with content is attention, never met, and says why', () => {
    const r = evaluateProtocolRules(full('clinical'));
    const f = r.findings.find((x) => x.ruleId === 'ich-m11-protocol-summary');
    expect(f?.status).toBe('attention');
    expect(f?.message).toMatch(/marked complete/);
    expect(f?.message).toMatch(/was not inspected/);
  });

  it('a section marked complete but holding no content is unmet, not attention', () => {
    const r = evaluateProtocolRules({ ...full('clinical'), sections: sectionsFor('clinical', 'complete', 0) });
    const f = r.findings.find((x) => x.ruleId === 'ich-m11-protocol-summary');
    expect(f?.status).toBe('unmet');
    expect(f?.message).toMatch(/holds no content/);
  });

  it('every null vulnerable-population flag is not-assessed and says absence is not a record', () => {
    const ids = ['hhs-subpart-b-pregnant-women', 'hhs-subpart-c-prisoners', 'hhs-subpart-d-children-risk-category', 'hhs-subpart-d-children-assent-permission', 'hhs-additional-safeguards-vulnerable'];
    for (const kind of ['clinical', 'irb'] as ProtocolKind[]) {
      const r = evaluateProtocolRules({ ...full(kind), involvesChildren: null, involvesPregnantWomen: null, involvesPrisoners: null, involvesVulnerable: null });
      for (const id of ids) {
        const f = r.findings.find((x) => x.ruleId === id);
        expect(f?.status, `${kind}/${id}`).toBe('not-assessed');
        expect(f?.message).toMatch(/not a record of absence/);
      }
    }
  });

  it('a recorded-false flag is reported as not applicable, not as a passed safeguard', () => {
    const f = evaluateProtocolRules({ ...full('irb'), involvesPrisoners: false }).findings
      .find((x) => x.ruleId === 'hhs-subpart-c-prisoners');
    expect(f?.status).toBe('met');
    expect(f?.message).toMatch(/^Not applicable:/);
  });

  it('every keyword scan declares itself, and a scan that finds nothing is never unmet', () => {
    for (const [name, input] of SCENARIOS) {
      for (const f of evaluateProtocolRules(input).findings) {
        if (/\bscan\b/i.test(f.message)) {
          expect(f.message, `${name}/${f.ruleId}`).toMatch(/keyword scan/);
          if (/found none|matched none/i.test(f.message)) expect(f.status, `${name}/${f.ruleId}`).not.toBe('unmet');
        }
      }
    }
  });

  it('no finding fabricates a percentage and none falls through to the unreached fallback', () => {
    for (const [name, input] of SCENARIOS) {
      for (const f of evaluateProtocolRules(input).findings) {
        expect(f.message, `${name}/${f.ruleId}`).not.toMatch(/%/);
        expect(f.message, `${name}/${f.ruleId}`).not.toMatch(/no evaluator produced an assessment/);
        expect(f.message.length, `${name}/${f.ruleId}`).toBeGreaterThan(20);
        expect(f.remediation.length, `${name}/${f.ruleId}`).toBeGreaterThan(10);
      }
    }
  });

  it('counts add up and not-assessed is never counted as assessed', () => {
    for (const [name, input] of SCENARIOS) {
      const r = evaluateProtocolRules(input);
      expect(r.assessed + r.notAssessed, name).toBe(r.findings.length);
      expect(r.notAssessed, name).toBe(r.findings.filter((f) => f.status === 'not-assessed').length);
      expect(r.unmet, name).toBe(r.findings.filter((f) => f.status === 'unmet').length);
    }
  });
});

// ─── Kind scoping ────────────────────────────────────────────────────────────

describe('kind scoping', () => {
  it('a clinical protocol gets no 3Rs findings but an IACUC one does', () => {
    const clin = evaluateProtocolRules(full('clinical'));
    const iacuc = evaluateProtocolRules(full('iacuc'));
    expect(iacuc.findings.some((f) => /3rs/i.test(f.title) || f.ruleId.startsWith('iacuc-3rs'))).toBe(true);
    expect(clin.findings.some((f) => f.ruleId.startsWith('iacuc-'))).toBe(false);
    expect(iacuc.findings.some((f) => f.ruleId.startsWith('ich-m11-'))).toBe(false);
  });

  it('findings are exactly the rules in scope for the kind, in catalogue order', () => {
    for (const kind of ['clinical', 'irb', 'iacuc', 'ibc'] as ProtocolKind[]) {
      const ids = evaluateProtocolRules(full(kind)).findings.map((f) => f.ruleId);
      expect(ids, kind).toEqual(listProtocolRules(kind).map((r) => r.id));
      for (const f of evaluateProtocolRules(full(kind)).findings) {
        const rule = PROTOCOL_RULES.find((r) => r.id === f.ruleId);
        expect(rule?.appliesTo, `${kind}/${f.ruleId}`).toContain(kind);
      }
    }
  });

  it('listProtocolRules returns every rule when no kind is given', () => {
    expect(listProtocolRules()).toHaveLength(PROTOCOL_RULES.length);
    expect(listProtocolRules('ibc').length).toBeLessThan(PROTOCOL_RULES.length);
  });
});

// ─── Catalogue integrity ─────────────────────────────────────────────────────

describe('rule catalogue', () => {
  it('ids are unique kebab-case and every rule carries a standard, clause and rationale', () => {
    expect(new Set(PROTOCOL_RULES.map((r) => r.id)).size).toBe(PROTOCOL_RULES.length);
    for (const r of PROTOCOL_RULES) {
      expect(r.id, r.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(r.standard.length, r.id).toBeGreaterThan(3);
      expect(r.clause.length, r.id).toBeGreaterThan(3);
      expect(r.title.length, r.id).toBeGreaterThan(5);
      expect(r.rationale.endsWith('.'), r.id).toBe(true);
      expect(r.appliesTo.length, r.id).toBeGreaterThan(0);
    }
  });

  it('listProtocolRules hands back copies, so a caller cannot mutate the catalogue', () => {
    const copy = listProtocolRules('clinical');
    copy[0].appliesTo.push('iacuc');
    expect(PROTOCOL_RULES.find((r) => r.id === copy[0].id)?.appliesTo).not.toContain('iacuc');
  });

  it('covers each standard the section templates claim as their basis', () => {
    const standards = new Set(PROTOCOL_RULES.map((r) => r.standard));
    for (const s of ['ICH M11', 'ICH E9', 'ICH E9(R1)', 'ICH E8(R1)', 'ICH E6(R3)', '21 CFR 312.23(a)(6)', '21 CFR 50.25', '21 CFR 56.111', '45 CFR 46', 'EU CTR 536/2014', 'FDORA 2022 §3601']) {
      expect(standards, s).toContain(s);
    }
  });
});

// ─── Specific rule behaviour ─────────────────────────────────────────────────

function statusOf(input: ProtocolRuleInput, ruleId: string): ProtocolRuleStatus | undefined {
  return evaluateProtocolRules(input).findings.find((f) => f.ruleId === ruleId)?.status;
}

describe('estimand, multiplicity and applicability gates', () => {
  const twoPrimary = { ...full('clinical'), objectives: [
    { objectiveType: 'primary', objective: 'A', endpoint: 'E1' },
    { objectiveType: 'primary', objective: 'B', endpoint: 'E2' },
  ] };

  it('one primary endpoint is met for multiplicity, two is attention, none is not-assessed', () => {
    expect(statusOf(full('clinical'), 'ich-e9-multiplicity')).toBe('met');
    expect(statusOf(twoPrimary, 'ich-e9-multiplicity')).toBe('attention');
    expect(statusOf({ ...full('clinical'), objectives: [] }, 'ich-e9-multiplicity')).toBe('not-assessed');
  });

  it('the intercurrent-event strategy is met only when a named strategy is present', () => {
    expect(statusOf(full('clinical'), 'ich-e9r1-estimand-intercurrent-events')).toBe('met');
    expect(statusOf(twoPrimary, 'ich-e9r1-estimand-intercurrent-events')).toBe('attention');
    expect(statusOf({ ...full('clinical'), objectives: [] }, 'ich-e9r1-estimand-intercurrent-events')).toBe('not-assessed');
  });

  it('the population-level summary is always not-assessed because nothing records it', () => {
    expect(statusOf(full('clinical'), 'ich-e9r1-estimand-population-level-summary')).toBe('not-assessed');
  });

  it('IND rules gate on isIndTrial: true evaluates, false is not applicable, null is not-assessed', () => {
    expect(statusOf(full('clinical'), 'fda-ind-objectives-purpose')).toBe('met');
    expect(statusOf({ ...full('clinical'), isIndTrial: false }, 'fda-ind-objectives-purpose')).toBe('met');
    expect(statusOf({ ...full('clinical'), isIndTrial: null }, 'fda-ind-objectives-purpose')).toBe('not-assessed');
    expect(statusOf({ ...full('clinical'), isIndTrial: true, objectives: [] }, 'fda-ind-objectives-purpose')).toBe('unmet');
  });

  it('EU CTR gates on a recorded EU/EEA region', () => {
    expect(statusOf({ ...full('clinical'), regions: ['DE'] }, 'eu-ctr-eligibility-criteria')).toBe('met');
    expect(statusOf({ ...full('clinical'), regions: ['JP'] }, 'eu-ctr-eligibility-criteria')).toBe('met');
    expect(statusOf({ ...full('clinical'), regions: [] }, 'eu-ctr-eligibility-criteria')).toBe('not-assessed');
    expect(statusOf({ ...full('clinical'), regions: ['DE'], inclusion: [] }, 'eu-ctr-eligibility-criteria')).toBe('unmet');
  });

  it('FDORA applies to a US pivotal/phase 3 trial only', () => {
    const id = 'fdora-3601-diversity-action-plan';
    expect(statusOf({ ...full('clinical'), regions: ['US'], phase: 'Phase 3' }, id)).toBe('attention');
    expect(statusOf({ ...full('clinical'), regions: ['US'], phase: 'Phase 1', designType: 'open label' }, id)).toBe('met');
    expect(statusOf({ ...full('clinical'), regions: ['EU'], phase: 'Phase 3' }, id)).toBe('met');
    expect(statusOf({ ...full('clinical'), regions: [], phase: 'Phase 3' }, id)).toBe('not-assessed');
  });

  /* This rule is why SECTION_TEMPLATES.clinical now has a 'discontinuation'
     section (and why migrations/20260922b backfills it). The template supplies
     it, so the seeded case is 'attention'; strip it and the rule still says
     'unmet', which is what protects the template from losing it again. */
  it('ICH M11 Section 7 is what put the discontinuation section in the template', () => {
    const f = evaluateProtocolRules(full('clinical')).findings.find((x) => x.ruleId === 'ich-m11-discontinuation-withdrawal');
    expect(f?.clause).toMatch(/Section 7/);
    // The template seeds it now, so a fully-seeded protocol no longer reports unmet.
    expect(f?.status).not.toBe('unmet');
    const noSection = evaluateProtocolRules({ ...full('clinical'), sections: sectionsFor('clinical', 'complete', 400).filter((s) => s.sectionKey !== 'discontinuation') });
    const g = noSection.findings.find((x) => x.ruleId === 'ich-m11-discontinuation-withdrawal');
    expect(g?.status).toBe('unmet');
    expect(g?.message).toMatch(/No section keyed/);
  });
});

// ─── Determinism and totality ────────────────────────────────────────────────

describe('determinism and totality', () => {
  it('the same input twice gives byte-identical output', () => {
    for (const [name, input] of SCENARIOS) {
      const a = JSON.stringify(evaluateProtocolRules(input));
      const b = JSON.stringify(evaluateProtocolRules(input));
      expect(a, name).toBe(b);
      // A JSON round-trip rebuilds every object and array, so an identical result
      // cannot come from object identity or a memo keyed on the input reference.
      expect(JSON.stringify(evaluateProtocolRules(JSON.parse(JSON.stringify(input)) as ProtocolRuleInput)), name).toBe(a);
    }
  });

  it('section order does not change the output', () => {
    const input = full('clinical');
    const reversed = { ...input, sections: [...input.sections].reverse() };
    expect(JSON.stringify(evaluateProtocolRules(reversed).findings.map((f) => [f.ruleId, f.status])))
      .toBe(JSON.stringify(evaluateProtocolRules(input).findings.map((f) => [f.ruleId, f.status])));
  });

  it('is total: malformed input is reported, never thrown on', () => {
    const junk = { kind: 'clinical', sections: null, objectives: null, inclusion: null, exclusion: null, scheduleVisitCount: Number.NaN } as unknown as ProtocolRuleInput;
    expect(() => evaluateProtocolRules(junk)).not.toThrow();
    expect(evaluateProtocolRules(junk).findings.length).toBe(listProtocolRules('clinical').length);
    const unknownKind = evaluateProtocolRules(baseInput({ kind: 'nope' as ProtocolKind }));
    expect(unknownKind.findings).toEqual([]);
    expect(unknownKind.assessed).toBe(0);
  });
});

/**
 * Protocol rule packs — the right rules fire for the right archetype, and the
 * engine does not criticize what it cannot know.
 *
 * The second half matters more. A confident wrong criticism costs more than a
 * missing one: it teaches the author to dismiss the rail, and then the real
 * findings go unread too. So there are as many tests here for rules NOT firing as
 * for rules firing.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateProtocol, emptyDraft, blockers, type ProtocolDraft,
} from '../mdx-protocol-rules';
import { getArchetype } from '../mdx-study-archetypes';

/**
 * A draft with every required section and question filled, plus extra text.
 *
 * The filler is deliberately NEUTRAL and does not echo the section title. An
 * earlier version wrote `Content for ${s}`, which put the section headings into
 * the scanned text — so a protocol satisfied the "no lot design" rule merely by
 * having a section called "Lot design", written or not. That made every
 * content-derived rule silently unreachable in these tests.
 */
function completeDraft(archetypeId: string, extraText = ''): ProtocolDraft {
  const a = getArchetype(archetypeId)!;
  const d = emptyDraft(archetypeId);
  for (const s of a.protocolSections) d.sections[s] = `Drafted narrative. ${extraText}`;
  for (const q of a.designQuestions) d.answers[q] = `Answered. ${extraText}`;
  // Neutral too, and for the same reason: the archetype's SUGGESTED statistical
  // methods name the very things several rules look for ("non-parametric",
  // "independent", "subgroup", "root-cause"). Copying them in as the default made
  // those rules unreachable in every test that used this helper.
  d.acceptanceCriteria = ['Pre-specified limit, justified in the report.'];
  d.statisticalMethods = ['Descriptive summary.'];
  d.supportingPlans = [...a.requiredSupportingPlans];
  return d;
}

const ruleIds = (d: ProtocolDraft) => evaluateProtocol(d).findings.map(f => f.rule);

describe('outline and completeness', () => {
  it('returns the archetype outline in authoring order', () => {
    const e = evaluateProtocol(emptyDraft('precision'));
    expect(e.outline.length).toBeGreaterThan(0);
    expect(e.outline[0].section).toBe('Assay and instrument configuration');
    expect(e.outline.every(o => o.written === false)).toBe(true);
  });

  it('counts written sections', () => {
    const d = emptyDraft('precision');
    d.sections['Intended use'] = 'Detection of X in plasma.';
    const e = evaluateProtocol(d);
    expect(e.completeness!.written).toBe(1);
    expect(e.completeness!.required).toBe(e.outline.length);
  });

  it('treats a whitespace-only section as unwritten', () => {
    const d = emptyDraft('precision');
    d.sections['Intended use'] = '   \n  ';
    expect(evaluateProtocol(d).completeness!.written).toBe(0);
  });

  it('changing the archetype changes the outline', () => {
    // The acceptance criterion for MDX-STUDY-02: one editor, different guidance.
    const ivd = evaluateProtocol(emptyDraft('precision')).outline.map(o => o.section);
    const device = evaluateProtocol(emptyDraft('pivotal_clinical_investigation'))
      .outline.map(o => o.section);
    expect(ivd).toContain('Specimen handling and retention');
    expect(device).toContain('Adverse device effects');
    expect(device).not.toContain('Specimen handling and retention');
  });

  it('refuses to invent an outline for an unknown archetype', () => {
    // A generic outline would produce a protocol shaped like nothing in particular.
    const e = evaluateProtocol(emptyDraft('not_a_real_study'));
    expect(e.archetype).toBeNull();
    expect(e.outline).toEqual([]);
    expect(e.completeness).toBeNull();
    expect(e.findings).toHaveLength(1);
    expect(e.findings[0].rule).toBe('core.unknown_archetype');
  });
});

describe('completeness rules', () => {
  it('flags every unwritten required section as a blocker', () => {
    const e = evaluateProtocol(emptyDraft('precision'));
    const missing = e.findings.filter(f => f.rule === 'core.section_missing');
    expect(missing.length).toBe(getArchetype('precision')!.protocolSections.length);
    expect(missing.every(f => f.severity === 'blocker')).toBe(true);
    expect(missing[0].section).toBeTruthy();
  });

  it('flags a missing acceptance criterion and statistical method', () => {
    const ids = ruleIds(emptyDraft('precision'));
    expect(ids).toContain('core.no_acceptance_criteria');
    expect(ids).toContain('core.no_statistical_method');
  });

  it('clears the completeness findings once the draft is filled', () => {
    const ids = ruleIds(completeDraft('precision', 'medical decision point, three reagent lots'));
    expect(ids).not.toContain('core.section_missing');
    expect(ids).not.toContain('core.no_acceptance_criteria');
    expect(ids).not.toContain('core.no_statistical_method');
    expect(ids).not.toContain('core.design_question_unanswered');
  });

  it('says outright when the archetype guidance is only outline-level', () => {
    // Otherwise a writer treats a starting frame as a reviewed specification.
    const ids = ruleIds(completeDraft('carryover'));
    expect(ids).toContain('core.outline_depth');
    const full = ruleIds(completeDraft('precision', 'medical decision point, lots'));
    expect(full).not.toContain('core.outline_depth');
  });
});

describe('IVD analytical pack', () => {
  it('asks why the concentrations were chosen when no decision point is referenced', () => {
    const ids = ruleIds(completeDraft('precision', 'three reagent lots'));
    expect(ids).toContain('ivd.no_decision_point');
  });

  it('stops asking once the decision point is referenced', () => {
    const ids = ruleIds(completeDraft('precision', 'levels bracket the medical decision point; 3 lots'));
    expect(ids).not.toContain('ivd.no_decision_point');
  });

  it('flags a missing lot design', () => {
    const ids = ruleIds(completeDraft('precision', 'medical decision point'));
    expect(ids).toContain('ivd.no_lot_design');
  });

  it('asks which LoD estimation route was taken', () => {
    // EP17's parametric and non-parametric routes give different answers on the
    // same data, so "we followed EP17" is not an answer.
    const ids = ruleIds(completeDraft('lob_lod_loq', 'medical decision point; 3 lots'));
    expect(ids).toContain('ivd.lod_method_unstated');
    const stated = ruleIds(completeDraft('lob_lod_loq', 'medical decision point; 3 lots; non-parametric per EP17'));
    expect(stated).not.toContain('ivd.lod_method_unstated');
  });

  it('does not apply analytical rules to a device study', () => {
    const ids = ruleIds(completeDraft('pivotal_clinical_investigation'));
    expect(ids).not.toContain('ivd.no_decision_point');
    expect(ids).not.toContain('ivd.no_lot_design');
  });
});

describe('IVD clinical pack', () => {
  it('BLOCKS an agreement study that describes its results as sensitivity/specificity', () => {
    // The most common diagnostic-statistics error, and checkable: this archetype
    // has no reference standard, so it cannot report accuracy.
    const d = completeDraft('ppa_npa_opa', 'discordant adjudication pre-specified');
    d.sections['Acceptance criteria'] = 'Clinical sensitivity above 95% and clinical specificity above 98%.';
    const e = evaluateProtocol(d);
    const f = e.findings.find(x => x.rule === 'ivd.agreement_claimed_as_accuracy')!;
    expect(f).toBeTruthy();
    expect(f.severity).toBe('blocker');
    expect(f.kind).toBe('contradiction');
  });

  it('does NOT fire that rule on a study that genuinely has a reference standard', () => {
    // clinical_sensitivity_specificity is the archetype where those words are
    // correct. Firing here would be the engine criticizing correct work.
    const d = completeDraft('clinical_sensitivity_specificity',
      'reference standard applied to all subjects; discordant review; consecutive enrollment');
    d.sections['Acceptance criteria'] = 'Clinical sensitivity above 95%.';
    expect(ruleIds(d)).not.toContain('ivd.agreement_claimed_as_accuracy');
  });

  it('flags a missing discordant plan', () => {
    const ids = ruleIds(completeDraft('ppa_npa_opa', 'consecutive enrollment'));
    expect(ids).toContain('ivd.no_discordant_plan');
  });

  it('BLOCKS a cutoff study with no independent validation', () => {
    const ids = ruleIds(completeDraft('roc_cutoff', 'discordant adjudication'));
    const e = evaluateProtocol(completeDraft('roc_cutoff', 'discordant adjudication'));
    expect(ids).toContain('ivd.cutoff_not_independently_validated');
    expect(blockers(e).some(f => f.rule === 'ivd.cutoff_not_independently_validated')).toBe(true);
  });

  it('clears once an independent validation set is described', () => {
    const ids = ruleIds(completeDraft('roc_cutoff',
      'discordant adjudication; cutoff validated on an independent hold-out set'));
    expect(ids).not.toContain('ivd.cutoff_not_independently_validated');
  });

  it('challenges banked specimens used without addressing selection bias', () => {
    const ids = ruleIds(completeDraft('ppa_npa_opa', 'banked specimens; discordant adjudication'));
    expect(ids).toContain('ivd.banked_without_bias_treatment');
  });

  it('does not challenge banked specimens when spectrum is addressed', () => {
    const ids = ruleIds(completeDraft('ppa_npa_opa',
      'banked specimens; selection bias and spectrum assessed; discordant adjudication'));
    expect(ids).not.toContain('ivd.banked_without_bias_treatment');
  });
});

describe('usability pack', () => {
  it('BLOCKS a lay-user study that mentions training', () => {
    // The claim under test is that an untrained user succeeds from the labeling
    // alone; any training invalidates that for the participant who received it.
    const d = completeDraft('lay_user', 'observers do not interfere');
    d.sections['Lay-user population and recruitment'] = 'Participants receive a short demonstration first.';
    const e = evaluateProtocol(d);
    const f = e.findings.find(x => x.rule === 'usability.training_mentioned')!;
    expect(f).toBeTruthy();
    expect(f.severity).toBe('blocker');
  });

  it('does NOT block when the mention is a prohibition', () => {
    // "No training is given" contains the word and is the correct design. Firing
    // here would be the engine failing to read.
    const d = completeDraft('lay_user', 'observers do not interfere');
    d.sections['Lay-user population and recruitment'] = 'No training or demonstration is given to participants.';
    expect(ruleIds(d)).not.toContain('usability.training_mentioned');
  });

  it('asks for an observer non-interference protocol', () => {
    const ids = ruleIds(completeDraft('lay_user'));
    expect(ids).toContain('usability.no_observer_protocol');
  });

  it('raises participant count as a consideration, not a verdict', () => {
    // 15 per group is a convention, not a power calculation, so a smaller group
    // with a stated reason is legitimate.
    const e = evaluateProtocol(completeDraft('human_factors_validation', 'root cause; final design'));
    const f = e.findings.find(x => x.rule === 'usability.participant_count')!;
    expect(f).toBeTruthy();
    expect(f.severity).toBe('consideration');
  });

  it('flags a human-factors validation with no root-cause approach', () => {
    const ids = ruleIds(completeDraft('human_factors_validation', '15 participants; final design'));
    expect(ids).toContain('usability.no_root_cause');
  });
});

describe('device clinical pack', () => {
  it('BLOCKS a clinical investigation with no sample size basis', () => {
    const d = completeDraft('pivotal_clinical_investigation',
      'randomized against an active comparator; stopping rules; adverse device effects');
    expect(d.sampleSize).toBeNull();
    expect(ruleIds(d)).toContain('device.no_sample_size_basis');
  });

  it('accepts a stated sample size', () => {
    const d = completeDraft('pivotal_clinical_investigation',
      'randomized; stopping rules; adverse device effects');
    d.sampleSize = 240;
    expect(ruleIds(d)).not.toContain('device.no_sample_size_basis');
  });

  it('flags missing stopping criteria and adverse-effect handling', () => {
    const d = completeDraft('pivotal_clinical_investigation', 'randomized controlled');
    d.sampleSize = 240;
    const ids = ruleIds(d);
    expect(ids).toContain('device.no_stopping_rules');
    expect(ids).toContain('device.no_adverse_effect_handling');
  });

  it('does not apply device rules to an IVD study', () => {
    const ids = ruleIds(completeDraft('precision', 'medical decision point; lots'));
    expect(ids).not.toContain('device.no_stopping_rules');
    expect(ids).not.toContain('device.no_sample_size_basis');
  });
});

describe('software pack', () => {
  it('BLOCKS when validation-set independence is not stated', () => {
    const ids = ruleIds(completeDraft('software_clinical_validation', 'subgroups; locked version'));
    expect(ids).toContain('samd.validation_set_independence');
  });

  it('clears when independence is stated', () => {
    const ids = ruleIds(completeDraft('software_clinical_validation',
      'validation set is independent of training data; subgroups; locked version v2.1'));
    expect(ids).not.toContain('samd.validation_set_independence');
  });

  it('asks for subgroup analysis', () => {
    const ids = ruleIds(completeDraft('software_clinical_validation',
      'independent hold-out; locked version'));
    expect(ids).toContain('samd.no_subgroup_analysis');
  });
});

describe('postmarket pack', () => {
  it('asks which evaluation the plan feeds', () => {
    const ids = ruleIds(completeDraft('pmcf', 'annual data collection'));
    expect(ids).toContain('postmarket.no_parent_document_link');
  });

  it('clears when the parent document is named', () => {
    const ids = ruleIds(completeDraft('pmcf', 'feeds the CER on an annual cadence'));
    expect(ids).not.toContain('postmarket.no_parent_document_link');
  });
});

describe('adopting the archetype guidance satisfies the guidance rules', () => {
  it('accepts the suggested statistical method when the author adopts it', () => {
    // Worth stating rather than treating as a loophole: if the protocol says
    // "non-parametric per EP17", the method IS stated, and copying the registry's
    // suggestion into the protocol is a legitimate way to state it. The rules are
    // keyword heuristics over authored text — they check that something was said,
    // not that it was thought about, and the module says so.
    const a = getArchetype('lob_lod_loq')!;
    const d = completeDraft('lob_lod_loq', 'medical decision point; 3 lots');
    d.statisticalMethods = [...a.statisticalMethods];
    expect(ruleIds(d)).not.toContain('ivd.lod_method_unstated');
  });

  it('still flags what the suggestion does not cover', () => {
    const a = getArchetype('human_factors_validation')!;
    const d = completeDraft('human_factors_validation');
    d.statisticalMethods = [...a.statisticalMethods];
    // The suggested methods say "qualitative root-cause", so that rule clears.
    expect(ruleIds(d)).not.toContain('usability.no_root_cause');
    // But whether the FINAL production-equivalent design and labeling are under
    // test is a fact about the study article, not about the statistics — no
    // suggested method supplies it, and it is the thing that decides whether the
    // validation validates what ships.
    expect(ruleIds(d)).toContain('usability.not_final_design');
  });

  it('is honest that for some archetypes the suggestions clear every rule', () => {
    // software_clinical_validation is one: its suggested methods name
    // "independent", "subgroup" and "locked", so an author who adopts them
    // verbatim clears all three software rules without adding a word of their own.
    // That is a real limit of keyword heuristics over authored text, and it is
    // better recorded here than discovered later.
    const a = getArchetype('software_clinical_validation')!;
    const d = completeDraft('software_clinical_validation');
    d.statisticalMethods = [...a.statisticalMethods];
    const ids = ruleIds(d);
    expect(ids).not.toContain('samd.validation_set_independence');
    expect(ids).not.toContain('samd.no_subgroup_analysis');
    expect(ids).not.toContain('samd.no_locked_version');
  });
});

describe('finding ordering and blockers', () => {
  it('sorts blockers first so the rail leads with what stops the filing', () => {
    const e = evaluateProtocol(emptyDraft('precision'));
    const severities = e.findings.map(f => f.severity);
    const firstNonBlocker = severities.findIndex(s => s !== 'blocker');
    if (firstNonBlocker !== -1) {
      expect(severities.slice(firstNonBlocker)).not.toContain('blocker');
    }
  });

  it('blockers() returns only what must clear before approval', () => {
    const e = evaluateProtocol(emptyDraft('precision'));
    expect(blockers(e).length).toBeGreaterThan(0);
    expect(blockers(e).every(f => f.severity === 'blocker')).toBe(true);
  });

  it('every finding carries a stable rule id and a reason', () => {
    // The id is what lets a finding be dismissed and stay dismissed; the detail is
    // what stops the rail being a list of complaints.
    const e = evaluateProtocol(emptyDraft('ppa_npa_opa'));
    for (const f of e.findings) {
      expect(f.rule, f.title).toMatch(/^[a-z]+\.[a-z_]+$/);
      expect(f.detail.length, f.title).toBeGreaterThan(30);
    }
  });
});

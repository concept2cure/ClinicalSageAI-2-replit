/**
 * Master-protocol check.
 *
 * What the suite holds: every FDA-expected element is listed stated-or-not,
 * per sub-study and across them; biomarker elements are asked of basket and
 * umbrella designs only, a stated "not biomarker-defined" answers them and the
 * assay is demanded only when a biomarker is named; MAMS is a master design; a
 * shared control needs two ARMS compared against it (in one sub-study or many)
 * and must be an arm of the design; an arm a sub-study names but the design
 * does not carry, a repeated arm, id or name is an integrity defect; any use of
 * non-concurrent controls needs a recorded justification and unadjusted use is
 * also a defect; a stated "no DMC charter" is stated and still a gap; "no
 * shared control" must be stated, not inferred from absence; a malformed plan
 * is reported, never thrown on; a non-master design is not_applicable with no
 * gap, an unrecorded structural design is missing, and a master design with no
 * sub-studies is missing.
 */
import { describe, expect, it } from 'vitest';

import type { StudyDesign } from '../study-design-types';
import { MASTER_PROTOCOL_BASIS, checkMasterProtocol } from '../master-protocol';

function design(): StudyDesign {
  return {
    title: 'An umbrella study in NSCLC', phase: '2', indication: 'NSCLC', objectives: [], estimands: [], endpoints: [],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'umbrella', controlType: 'active' },
    population: { targetDescription: 'adults with NSCLC', analysisPopulations: [], eligibility: [] },
    arms: [
      { name: 'Drug A', interventions: [{ name: 'A', role: 'investigational' }] },
      { name: 'Drug B', interventions: [{ name: 'B', role: 'investigational' }] },
      { name: 'Docetaxel', interventions: [{ name: 'docetaxel', role: 'comparator' }] },
    ],
    statisticalPlan: { plannedAnalyses: [] },
    safety: { dmcCharter: { present: true } },
    masterProtocol: {
      subStudies: [
        { id: 'S1', name: 'KRAS G12C', population: 'KRAS G12C-mutant NSCLC', biomarker: 'KRAS G12C', biomarkerAssay: 'central NGS, analytically validated', arms: ['Drug A', 'Docetaxel'], decisionRule: 'PFS HR < 1 at one-sided 0.025' },
        { id: 'S2', name: 'MET ex14', population: 'METex14 NSCLC', biomarker: 'MET exon 14', biomarkerAssay: 'central NGS, analytically validated', arms: ['Drug B', 'Docetaxel'], decisionRule: 'PFS HR < 1 at one-sided 0.025' },
      ],
      sharedControlArm: 'Docetaxel',
      nonConcurrentControls: 'not_used',
      armAdditionProcedure: 'protocol amendment with IRB approval before randomisation to a new arm',
      armDroppingRules: 'futility at 50% information, posterior P(HR<1) < 0.1',
      multiplicityAcrossSubStudies: 'each sub-study tested at its own one-sided 0.025; no pooled claim',
    },
  } as StudyDesign;
}

const sub = (d: StudyDesign, i: number) => d.masterProtocol!.subStudies[i] as Record<string, unknown>;

describe('checkMasterProtocol — a complete umbrella plan', () => {
  it('states every element and has no integrity defect', () => {
    const c = checkMasterProtocol(design());
    expect(c.status).toBe('rendered');
    expect(c.gaps).toEqual([]);
    expect(c.elements.filter((e) => e.scope === 'sub-study KRAS G12C').map((e) => e.element)).toEqual(['Population', 'Arms', 'Decision rule', 'Biomarker', 'Biomarker assay']);
    expect(c.elements.find((e) => e.element === 'Use of non-concurrent controls')!.detail).toBe('comparisons use concurrent controls only');
    expect(c.basis).toBe(MASTER_PROTOCOL_BASIS);
  });
});

describe('checkMasterProtocol — what the plan does not state', () => {
  it('names each unstated element per sub-study and across them', () => {
    const d = design();
    delete d.masterProtocol!.subStudies[1].biomarkerAssay;
    delete d.masterProtocol!.armDroppingRules;
    d.safety = {};
    const c = checkMasterProtocol(d);
    expect(c.status).toBe('partial');
    expect(c.gaps).toEqual([
      'sub-study MET ex14: Biomarker assay not stated',
      'across sub-studies: Dropping an arm not stated',
      'across sub-studies: Data monitoring committee (charter) not stated',
    ]);
  });

  it('a blank value is not stated', () => {
    const d = design();
    d.masterProtocol!.subStudies[0].population = '   ';
    d.masterProtocol!.armAdditionProcedure = '';
    expect(checkMasterProtocol(d).gaps).toEqual(['sub-study KRAS G12C: Population not stated', 'across sub-studies: Adding an arm or sub-study not stated']);
  });

  it('a basket design is asked for the biomarker; "not biomarker-defined" answers it and drops the assay', () => {
    const d = design();
    d.framework.structuralDesign = 'basket';
    delete d.masterProtocol!.subStudies[0].biomarker;
    delete d.masterProtocol!.subStudies[0].biomarkerAssay;
    expect(checkMasterProtocol(d).gaps).toEqual(['sub-study KRAS G12C: Biomarker not stated']);
    sub(d, 0).biomarker = null;
    const c = checkMasterProtocol(d);
    expect(c.status).toBe('rendered');
    expect(c.elements.filter((e) => e.scope === 'sub-study KRAS G12C').map((e) => [e.element, e.detail])).toContainEqual(['Biomarker', 'stated: the sub-study population is not biomarker-defined']);
    expect(c.elements.some((e) => e.scope === 'sub-study KRAS G12C' && e.element === 'Biomarker assay')).toBe(false);
  });

  it('biomarker elements are not demanded of a platform design', () => {
    const d = design();
    d.framework.structuralDesign = 'platform';
    for (const s of d.masterProtocol!.subStudies) { delete s.biomarker; delete s.biomarkerAssay; }
    const c = checkMasterProtocol(d);
    expect(c.status).toBe('rendered');
    expect(c.elements.some((e) => e.element === 'Biomarker')).toBe(false);
  });

  it('absence of a shared control is not stated; null states there is none', () => {
    const d = design();
    delete d.masterProtocol!.sharedControlArm;
    expect(checkMasterProtocol(d).gaps).toContain('across sub-studies: Shared control arm not stated');
    d.masterProtocol!.sharedControlArm = null;
    const c = checkMasterProtocol(d);
    expect(c.elements.find((e) => e.element === 'Shared control arm')!.detail).toBe('stated: no shared control arm');
    expect(c.elements.some((e) => e.element === 'Use of non-concurrent controls')).toBe(false);
  });

  it('with a shared control, silence on non-concurrent controls is a gap', () => {
    const d = design();
    delete d.masterProtocol!.nonConcurrentControls;
    expect(checkMasterProtocol(d).gaps).toEqual(['across sub-studies: Use of non-concurrent controls not stated']);
  });

  it('a stated "no DMC charter" is stated, and still a gap; a charter does not record independence', () => {
    const d = design();
    d.safety = { dmcCharter: { present: false } };
    const c = checkMasterProtocol(d);
    const dmc = c.elements.find((e) => e.element === 'Data monitoring committee (charter)')!;
    expect([dmc.stated, dmc.detail]).toEqual([true, 'stated: no DMC charter']);
    expect(c.status).toBe('partial');
    expect(c.gaps).toEqual([dmc.gap]);
    expect(dmc.gap).toMatch(/the design states there is no DMC charter/);
    expect(checkMasterProtocol(design()).elements.find((e) => e.element === 'Data monitoring committee (charter)')!.detail).toMatch(/independent is not recorded/);
  });
});

describe('checkMasterProtocol — integrity', () => {
  it('an arm the design does not carry, a duplicate id and a control with one arm against it are defects', () => {
    const d = design();
    d.masterProtocol!.subStudies[1] = { ...d.masterProtocol!.subStudies[1], id: 'S1', arms: ['Drug C'] };
    const c = checkMasterProtocol(d);
    expect(c.integrity).toEqual([
      'sub-study id "S1" is used twice',
      'sub-study MET ex14 names arm "Drug C", which the design does not carry',
      'the shared control arm "Docetaxel" is compared against 1 arm (Drug A): a shared control needs at least two arms compared against it',
    ]);
  });

  it('a single MAMS sub-study of several drugs against one control is a shared control; MAMS is a master design', () => {
    const d = design();
    d.framework.structuralDesign = 'mams';
    d.masterProtocol!.subStudies = [{ id: 'M', name: 'MAMS', population: 'NSCLC', arms: ['Drug A', 'Drug B', 'Docetaxel'], decisionRule: 'each arm vs control at one-sided 0.025' }];
    const c = checkMasterProtocol(d);
    expect(c.status).toBe('rendered');
    expect(c.integrity).toEqual([]);
  });

  it('a shared control that is not an arm of the design is a defect', () => {
    const d = design();
    d.masterProtocol!.sharedControlArm = 'Placebo';
    expect(checkMasterProtocol(d).integrity).toContain('the shared control arm "Placebo" is not an arm of the design');
  });

  it('a repeated sub-study name and an arm listed twice are defects, and the scopes say which sub-study', () => {
    const d = design();
    d.masterProtocol!.subStudies[1] = { ...d.masterProtocol!.subStudies[1], name: 'KRAS G12C', arms: ['Drug B', 'Drug B', 'Docetaxel'] };
    delete d.masterProtocol!.subStudies[1].decisionRule;
    const c = checkMasterProtocol(d);
    expect(c.integrity).toEqual(['sub-study name "KRAS G12C" is used by 2 sub-studies (ids S1, S2)', 'sub-study KRAS G12C (id S2) lists arm "Drug B" 2 times']);
    expect(c.gaps).toContain('sub-study KRAS G12C (id S2): Decision rule not stated');
  });

  it('non-concurrent controls need a recorded justification, adjusted or not; unadjusted use is also a defect', () => {
    const d = design();
    d.masterProtocol!.nonConcurrentControls = 'used';
    const used = checkMasterProtocol(d);
    expect(used.integrity.at(-1)).toMatch(/no pre-specified time-trend adjustment/);
    expect(used.gaps.some((g) => g.startsWith('across sub-studies: Justification for non-concurrent controls not stated'))).toBe(true);
    d.masterProtocol!.nonConcurrentControls = 'used_with_time_adjustment';
    const adjusted = checkMasterProtocol(d);
    expect(adjusted.integrity).toEqual([]);
    expect(adjusted.status).toBe('partial');
    expect(adjusted.gaps).toHaveLength(1);
    expect(adjusted.gaps[0]).toMatch(/Justification for non-concurrent controls not stated — .*concurrently randomized controls/);
    (d.masterProtocol as unknown as Record<string, unknown>).nonConcurrentControlsJustification = 'rare disease; rationale agreed with FDA at the EOP2 meeting';
    expect(checkMasterProtocol(d).status).toBe('rendered');
    const e = design();
    e.masterProtocol!.sharedControlArm = null;
    e.masterProtocol!.nonConcurrentControls = 'used_with_time_adjustment';
    expect(checkMasterProtocol(e).gaps.some((g) => g.startsWith('across sub-studies: Justification for non-concurrent controls not stated'))).toBe(true);
  });
});

describe('checkMasterProtocol — applicability and malformed plans', () => {
  it('a parallel-group design is not_applicable with no gap; a plan on it is noted as ignored', () => {
    const d = design();
    d.framework.structuralDesign = 'parallel_group';
    const c = checkMasterProtocol(d);
    expect([c.status, c.gaps]).toEqual(['not_applicable', []]);
    expect(c.notes).toContain('a master-protocol plan is recorded, but the structural design "parallel_group" is not a master protocol: the plan is not checked');
  });

  it('an unrecorded structural design is missing, not not_applicable; a master design with no sub-studies is missing', () => {
    const d = design();
    delete (d.framework as unknown as Record<string, unknown>).structuralDesign;
    expect(checkMasterProtocol(d).status).toBe('missing');
    const e = design();
    delete e.masterProtocol;
    expect(checkMasterProtocol(e).status).toBe('missing');
  });

  it('a plan with no sub-study list, or a sub-study with no arms, is reported, never thrown on', () => {
    const d = design();
    (d as unknown as Record<string, unknown>).masterProtocol = {};
    expect(checkMasterProtocol(d).status).toBe('missing');
    const e = design();
    delete (sub(e, 0) as { arms?: unknown }).arms;
    (e.masterProtocol!.subStudies as unknown[]).push(null);
    const c = checkMasterProtocol(e);
    expect(c.gaps).toContain('sub-study KRAS G12C: Arms not stated');
    expect(c.integrity).toContain('1 sub-study entry is not a record, so not checked');
  });

  it('is deterministic', () => {
    expect(JSON.stringify(checkMasterProtocol(design()))).toBe(JSON.stringify(checkMasterProtocol(design())));
  });
});

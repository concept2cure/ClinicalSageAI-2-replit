/**
 * Master-protocol check.
 *
 * What the suite holds: every FDA-expected element is listed stated-or-not,
 * per sub-study and across them; biomarker elements are demanded of basket and
 * umbrella designs only; an arm a sub-study names but the design does not carry
 * is an integrity defect; a shared control needs two users; non-concurrent
 * controls with no time adjustment are called out; "no shared control" must be
 * stated, not inferred from absence; a non-master design is not_applicable and
 * a master design with no sub-studies is missing.
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
      'across sub-studies: Independent data monitoring committee not stated',
    ]);
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
});

describe('checkMasterProtocol — integrity', () => {
  it('an arm the design does not carry, a duplicate id and a one-user shared control are defects', () => {
    const d = design();
    d.masterProtocol!.subStudies[1] = { ...d.masterProtocol!.subStudies[1], id: 'S1', arms: ['Drug C'] };
    const c = checkMasterProtocol(d);
    expect(c.integrity).toEqual([
      'sub-study id "S1" is used twice',
      'sub-study MET ex14 names arm "Drug C", which the design does not carry',
      'the shared control arm "Docetaxel" is used by 1 sub-study: a shared control needs at least two',
    ]);
  });

  it('non-concurrent controls with no time adjustment are called out; with one they are not', () => {
    const d = design();
    d.masterProtocol!.nonConcurrentControls = 'used';
    expect(checkMasterProtocol(d).integrity.at(-1)).toMatch(/no pre-specified time-trend adjustment/);
    d.masterProtocol!.nonConcurrentControls = 'used_with_time_adjustment';
    expect(checkMasterProtocol(d).integrity).toEqual([]);
  });
});

describe('checkMasterProtocol — applicability', () => {
  it('a parallel-group design is not_applicable; a master design with no sub-studies is missing', () => {
    const d = design();
    d.framework.structuralDesign = 'parallel_group';
    expect(checkMasterProtocol(d).status).toBe('not_applicable');
    const e = design();
    delete e.masterProtocol;
    expect(checkMasterProtocol(e).status).toBe('missing');
  });

  it('is deterministic', () => {
    expect(JSON.stringify(checkMasterProtocol(design()))).toBe(JSON.stringify(checkMasterProtocol(design())));
  });
});

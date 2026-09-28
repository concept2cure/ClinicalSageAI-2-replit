/**
 * Dose-escalation projection.
 *
 * What the suite holds: the boundaries are the published BOIN values
 * (φ = 0.3 ⇒ λe 0.236, λd 0.358 — Liu & Yuan 2015, Table 1), because every
 * number is the stats engine's; the decision table's elimination column agrees
 * with the engine's own `boinDecision` cell by cell; a default is labelled a
 * default; an escalation-phase design with no rules is MISSING (not
 * not_applicable); a late-phase design with none is not_applicable with its
 * reason; invalid parameters are gaps, never a throw and never a table.
 */
import { describe, expect, it } from 'vitest';

import { boinDecision } from '../../stats/dose-finding-boin';
import type { DoseEscalationDesign, StudyDesign } from '../study-design-types';
import { BOIN_DEFAULTS, DOSE_ESCALATION_BASIS, projectDoseEscalation } from '../dose-escalation';

function escalation(): DoseEscalationDesign {
  return {
    method: 'boin',
    targetToxicity: 0.3,
    doseLevels: [{ label: 'DL1', dose: '10 mg' }, { label: 'DL2', dose: '20 mg' }, { label: 'DL3', dose: '40 mg' }, { label: 'DL4' }],
    cohortSize: 3,
    maxSampleSize: 30,
    startingDoseIndex: 0,
    stopWhenAtDoseN: 12,
  };
}

function fihDesign(): StudyDesign {
  return {
    title: 'A first-in-human study of ACM-7 in advanced solid tumours',
    phase: 'FIH',
    indication: 'advanced solid tumours',
    productType: 'drug',
    objectives: [{ level: 'primary', order: 1, text: 'Determine the MTD', endpointName: 'DLT' }],
    estimands: [],
    endpoints: [{ name: 'DLT', role: 'primary', type: 'binary', definition: 'DLT in cycle 1' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'single_arm', controlType: 'none' },
    population: { targetDescription: 'adults with advanced solid tumours', analysisPopulations: [], eligibility: [] },
    arms: [{ name: 'ACM-7', interventions: [{ name: 'ACM-7', role: 'investigational' }] }],
    statisticalPlan: { plannedAnalyses: [] },
    safety: { dltDefinition: 'Grade ≥3 non-haematological toxicity in cycle 1', doseEscalation: escalation() },
  } as StudyDesign;
}

const clone = (d: StudyDesign): StudyDesign => JSON.parse(JSON.stringify(d));

describe('projectDoseEscalation — the engine\'s numbers', () => {
  it('reproduces the published BOIN boundaries for φ = 0.3', () => {
    const p = projectDoseEscalation(fihDesign());
    expect(p.status).toBe('rendered');
    // The paper prints three decimals (λd = 0.35852… is printed 0.358), so
    // within 0.001 of the printed value — not a looser two-decimal match.
    expect(Math.abs(p.boundaries!.lambdaE - 0.236)).toBeLessThan(0.001);
    expect(Math.abs(p.boundaries!.lambdaD - 0.358)).toBeLessThan(0.001);
    expect(p.basis).toBe(DOSE_ESCALATION_BASIS);
  });

  it('builds one row per cohort up to the per-dose cap, with the published escalate/de-escalate counts', () => {
    const p = projectDoseEscalation(fihDesign());
    expect(p.decisionTable.map((r) => r.n)).toEqual([3, 6, 9, 12]);
    expect(p.decisionTable.map((r) => [r.escalateIfAtMost, r.deescalateIfAtLeast])).toEqual([[0, 2], [1, 3], [2, 4], [2, 5]]);
  });

  it('elimination counts agree with the engine\'s own decision, cell by cell', () => {
    const p = projectDoseEscalation(fihDesign());
    for (const row of p.decisionTable) {
      const firstEliminating = Array.from({ length: row.n + 1 }, (_, x) => x).find(
        (x) => boinDecision({ nPatients: row.n, nDlt: x, target: 0.3 }).eliminated,
      );
      expect(row.eliminateIfAtLeast, `n=${row.n}`).toBe(firstEliminating ?? null);
    }
    expect(p.decisionTable[0].eliminateIfAtLeast).toBe(3); // 3/3 DLTs eliminates at φ = 0.3
  });

  it('caps the table at the maximum sample size when no per-dose cap is recorded', () => {
    const d = fihDesign();
    delete d.safety!.doseEscalation!.stopWhenAtDoseN;
    d.safety!.doseEscalation!.maxSampleSize = 7;
    expect(projectDoseEscalation(d).decisionTable.map((r) => r.n)).toEqual([3, 6]);
  });

  it('states the MTD rule the engine implements', () => {
    expect(projectDoseEscalation(fihDesign()).mtdSelection).toMatch(/isotonic.*closest to the target/);
  });
});

describe('projectDoseEscalation — defaults are labelled, never passed off as decisions', () => {
  it('labels φ1, φ2 and the elimination threshold as engine defaults when the design does not record them', () => {
    const p = projectDoseEscalation(fihDesign()).parameters!;
    expect(p.phi1).toEqual({ value: BOIN_DEFAULTS.phi1Factor * 0.3, source: 'engine default' });
    expect(p.phi2).toEqual({ value: BOIN_DEFAULTS.phi2Factor * 0.3, source: 'engine default' });
    expect(p.eliminationThreshold).toEqual({ value: 0.95, source: 'engine default' });
  });

  it('labels them design values when the design records them, and the boundaries move', () => {
    const d = fihDesign();
    Object.assign(d.safety!.doseEscalation!, { phi1: 0.2, phi2: 0.4, eliminationThreshold: 0.9 });
    const p = projectDoseEscalation(d);
    expect(p.parameters!.phi1.source).toBe('design');
    expect(p.parameters!.eliminationThreshold).toEqual({ value: 0.9, source: 'design' });
    expect(Math.abs(p.boundaries!.lambdaE - 0.236)).toBeGreaterThan(0.001);
  });
});

describe('projectDoseEscalation — applicability and gaps', () => {
  it('an escalation-phase design with no rules is missing, not not_applicable', () => {
    const d = fihDesign();
    delete d.safety!.doseEscalation;
    const p = projectDoseEscalation(d);
    expect(p.status).toBe('missing');
    expect(p.applicability.applicable).toBe(true);
    expect(p.applicability.reasons).toEqual(['phase FIH is a dose-escalation phase', 'the design defines dose-limiting toxicities']);
    expect(p.gaps[0]).toMatch(/states no dose-escalation rules/);
    expect(p.decisionTable).toEqual([]);
  });

  it('a phase 3 design with no DLT definition and no rules is not_applicable, with the reason', () => {
    const d = fihDesign();
    d.phase = '3';
    d.safety = {};
    const p = projectDoseEscalation(d);
    expect(p.status).toBe('not_applicable');
    expect(p.applicability.reasons[0]).toMatch(/not a dose-escalation phase/);
  });

  it('a phase 2 design that defines DLTs is still applicable', () => {
    const d = fihDesign();
    d.phase = '2';
    delete d.safety!.doseEscalation;
    expect(projectDoseEscalation(d).status).toBe('missing');
  });

  it('invalid parameters are gaps with no table — and never a throw', () => {
    const d = fihDesign();
    Object.assign(d.safety!.doseEscalation!, { targetToxicity: 1.2, cohortSize: 0, doseLevels: [{ label: 'only' }], startingDoseIndex: 5 });
    const p = projectDoseEscalation(d);
    expect(p.status).toBe('partial');
    expect(p.boundaries).toBeNull();
    expect(p.decisionTable).toEqual([]);
    expect(p.gaps).toEqual(expect.arrayContaining([
      expect.stringMatching(/target toxicity/),
      expect.stringMatching(/cohort size/),
      expect.stringMatching(/two dose levels/),
      expect.stringMatching(/starting dose/),
    ]));
  });

  it('an invalid recorded neighbourhood is a gap, not an exception', () => {
    const d = fihDesign();
    Object.assign(d.safety!.doseEscalation!, { phi1: 0.35, phi2: 0.4 });
    const p = projectDoseEscalation(d);
    expect(p.status).toBe('partial');
    expect(p.gaps[0]).toMatch(/neighbourhood is invalid/);
    expect(p.boundaries).toBeNull();
  });

  it('a method with no engine is named and nothing is computed', () => {
    const d = fihDesign();
    (d.safety!.doseEscalation as unknown as { method: string }).method = '3+3';
    const p = projectDoseEscalation(d);
    expect(p.status).toBe('partial');
    expect(p.method).toBeNull();
    expect(p.gaps[0]).toMatch(/"3\+3" has no engine here/);
  });

  it('flags rules that count DLTs the design never defines, and a missing starting dose', () => {
    const d = fihDesign();
    delete d.safety!.dltDefinition;
    delete d.safety!.doseEscalation!.startingDoseIndex;
    const p = projectDoseEscalation(d);
    expect(p.status).toBe('partial');
    expect(p.boundaries).not.toBeNull();
    expect(p.gaps).toEqual([
      'the escalation counts DLTs, but the design does not define a dose-limiting toxicity',
      'the starting dose is not recorded',
    ]);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(projectDoseEscalation(fihDesign()))).toBe(JSON.stringify(projectDoseEscalation(clone(fihDesign()))));
  });
});

/**
 * Dose-escalation projection.
 *
 * What the suite holds: the boundaries are the published BOIN values
 * (φ = 0.3 ⇒ λe 0.236, λd 0.358 — Liu & Yuan 2015, Table 1), because every
 * number is the stats engine's — the escalate/de-escalate columns ARE the
 * engine's `boinDecisionTable` and φ1/φ2 are what `boinBoundaries` returned
 * (spied, so a re-derivation fails here); the elimination column agrees with
 * the engine's own `boinDecision` cell by cell, under the design's threshold
 * when it records one; a default is labelled a default and its restated value
 * is pinned to the engine's behaviour; an escalation-phase design (FIH, 1, 1b)
 * with no rules is MISSING; a late-phase design with none is not_applicable
 * with its reason; every invalid parameter is a gap, never a throw and never
 * a table; the table is bounded (n ≤ 200) and never rendered empty; the MTD
 * text states what `selectMtd` does on each kind of tie.
 */
import { describe, expect, it, vi } from 'vitest';

import { boinBoundaries, boinDecision, boinDecisionTable, selectMtd } from '../../stats/dose-finding-boin';
import type { DoseEscalationDesign, StudyDesign } from '../study-design-types';
import { BOIN_DEFAULTS, DOSE_ESCALATION_BASIS, MAX_TABLE_N, projectDoseEscalation } from '../dose-escalation';

vi.mock('../../stats/dose-finding-boin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../stats/dose-finding-boin')>();
  return { ...actual, boinDecisionTable: vi.fn(actual.boinDecisionTable), boinBoundaries: vi.fn(actual.boinBoundaries) };
});

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
const withEscalation = (patch: Record<string, unknown>): StudyDesign => {
  const d = fihDesign();
  Object.assign(d.safety!.doseEscalation!, patch);
  return d;
};
/** The engine's own first eliminating count at n, by linear scan. */
const firstEliminating = (n: number, args: { target: number; phi1?: number; phi2?: number; eliminationThreshold?: number }): number | null =>
  Array.from({ length: n + 1 }, (_, x) => x).find((x) => boinDecision({ nPatients: n, nDlt: x, ...args }).eliminated) ?? null;

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

  it('the escalate/de-escalate columns are the engine\'s boinDecisionTable, called with the design\'s values — not re-derived', () => {
    vi.mocked(boinDecisionTable).mockClear();
    const p = projectDoseEscalation(fihDesign());
    expect(boinDecisionTable).toHaveBeenCalledTimes(1);
    expect(boinDecisionTable).toHaveBeenCalledWith(0.3, [3, 6, 9, 12], undefined, undefined);
    const engine = vi.mocked(boinDecisionTable).mock.results[0].value as ReturnType<typeof boinDecisionTable>;
    expect(p.decisionTable.map(({ n, escalateIfAtMost, deescalateIfAtLeast }) => ({ n, escalateIfAtMost, deescalateIfAtLeast }))).toEqual(engine);
  });

  it('elimination counts agree with the engine\'s own decision, cell by cell', () => {
    const p = projectDoseEscalation(fihDesign());
    for (const row of p.decisionTable) {
      expect(row.eliminateIfAtLeast, `n=${row.n}`).toBe(firstEliminating(row.n, { target: 0.3 }));
    }
    expect(p.decisionTable[0].eliminateIfAtLeast).toBe(3); // 3/3 DLTs eliminates at φ = 0.3
  });

  it('the elimination search agrees with a linear scan of the engine over every n up to the table bound', () => {
    const p = projectDoseEscalation(withEscalation({ cohortSize: 1, maxSampleSize: MAX_TABLE_N, stopWhenAtDoseN: undefined }));
    expect(p.decisionTable).toHaveLength(MAX_TABLE_N);
    for (const row of p.decisionTable) expect(row.eliminateIfAtLeast, `n=${row.n}`).toBe(firstEliminating(row.n, { target: 0.3 }));
  });

  it('caps the table at the maximum sample size when no per-dose cap is recorded', () => {
    const d = fihDesign();
    delete d.safety!.doseEscalation!.stopWhenAtDoseN;
    d.safety!.doseEscalation!.maxSampleSize = 7;
    expect(projectDoseEscalation(d).decisionTable.map((r) => r.n)).toEqual([3, 6]);
  });

  it('bounds the table at n = 200 and says so — a huge maximum sample size is neither a long computation nor a silent cut', () => {
    const mid = projectDoseEscalation(withEscalation({ cohortSize: 1, maxSampleSize: 2000, stopWhenAtDoseN: undefined }));
    expect(mid.decisionTable).toHaveLength(MAX_TABLE_N);
    expect(mid.status).toBe('partial');
    expect(mid.gaps).toEqual(['the per-dose limit of 2000 patients is beyond the 200 this table is computed to: rows above n = 200 are not shown']);
    const started = Date.now();
    const huge = projectDoseEscalation(withEscalation({ cohortSize: 1, maxSampleSize: 100000, stopWhenAtDoseN: undefined }));
    expect(Date.now() - started).toBeLessThan(2000);
    expect(huge.decisionTable.at(-1)!.n).toBe(MAX_TABLE_N);
  });

  it('a first cohort beyond the bound computes no row, and is never rendered empty', () => {
    const p = projectDoseEscalation(withEscalation({ cohortSize: 250, maxSampleSize: 500, stopWhenAtDoseN: undefined }));
    expect(p.decisionTable).toEqual([]);
    expect(p.status).toBe('partial');
    expect(p.gaps).toContain('no cohort completes within the rows computed: the decision table is empty');
  });

  it('states the MTD rule selectMtd implements — each tie clause is what the engine does on that tie', () => {
    const rule = projectDoseEscalation(fihDesign()).mtdSelection!;
    expect(rule).toMatch(/isotonic.*closest to the target/);
    // Smoothed rates 0.2 / 0.4 around φ = 0.3: a tie across the target → the dose below it.
    expect(selectMtd([{ nPatients: 10, nDlt: 2 }, { nPatients: 10, nDlt: 4 }], 0.3).mtdIndex).toBe(0);
    expect(rule).toContain('on a tie a dose below the target is preferred over one above it');
    // 0.2 / 0.2: both below → the higher dose.
    expect(selectMtd([{ nPatients: 10, nDlt: 2 }, { nPatients: 10, nDlt: 2 }], 0.3).mtdIndex).toBe(1);
    expect(rule).toContain('between two below the target the higher dose is chosen');
    // 0.4 / 0.4: both above → the lower dose.
    expect(selectMtd([{ nPatients: 10, nDlt: 4 }, { nPatients: 10, nDlt: 4 }], 0.3).mtdIndex).toBe(0);
    expect(rule).toContain('between two above it the lower');
  });

  it('states BOIN\'s safety stop: the lowest dose eliminated stops the trial', () => {
    expect(projectDoseEscalation(fihDesign()).safetyStopping).toMatch(/lowest dose is eliminated, the trial is stopped for safety and no MTD is selected/);
  });
});

describe('projectDoseEscalation — defaults are labelled, never passed off as decisions', () => {
  it('labels φ1, φ2 and the elimination threshold as engine defaults, with the values the engine used', () => {
    vi.mocked(boinBoundaries).mockClear();
    const p = projectDoseEscalation(fihDesign()).parameters!;
    // The engine chose φ1/φ2 — nothing here passed them in.
    expect(boinBoundaries).toHaveBeenCalledWith(0.3, undefined, undefined);
    const engine = vi.mocked(boinBoundaries).mock.results[0].value as ReturnType<typeof boinBoundaries>;
    expect(p.phi1).toEqual({ value: engine.phi1, source: 'engine default' });
    expect(p.phi2).toEqual({ value: engine.phi2, source: 'engine default' });
    expect(p.eliminationThreshold).toEqual({ value: BOIN_DEFAULTS.eliminationThreshold, source: 'engine default' });
    expect(p.minEliminationN).toEqual({ value: BOIN_DEFAULTS.minEliminationN, source: 'engine default' });
    expect(p.prior).toEqual({ value: 'Beta(1,1)', source: 'engine default' });
  });

  it('the restated elimination defaults are the engine\'s: its unparameterised decision is exactly the rule they state', () => {
    for (let n = 1; n <= 30; n += 1) {
      for (let x = 0; x <= n; x += 1) {
        const d = boinDecision({ nPatients: n, nDlt: x, target: 0.3 });
        const stated = n >= BOIN_DEFAULTS.minEliminationN && d.posteriorExceedance > BOIN_DEFAULTS.eliminationThreshold;
        expect(d.eliminated, `n=${n} x=${x}`).toBe(stated);
      }
    }
  });

  it('says why an elimination cell is empty: below the engine\'s minimum n, or no count reaching the threshold', () => {
    const p = projectDoseEscalation(withEscalation({ cohortSize: 1, maxSampleSize: 4, stopWhenAtDoseN: undefined }));
    expect(p.decisionTable.map((r) => r.eliminateIfAtLeast)).toEqual([null, null, 3, 3]);
    expect(p.decisionTable[0].eliminationNote).toBe('the engine eliminates a dose only once at least 3 patients have been treated at it');
    expect(p.decisionTable[2].eliminationNote).toBeNull();
    const high = projectDoseEscalation(withEscalation({ targetToxicity: 0.5, phi1: 0.4, phi2: 0.6 }));
    expect(high.decisionTable[0]).toMatchObject({ n: 3, eliminateIfAtLeast: null });
    expect(high.decisionTable[0].eliminationNote).toBe('even 3 DLTs in 3 patients do not take the posterior probability of exceeding the target above the elimination threshold');
  });

  it('labels them design values when the design records them, and the boundaries and elimination column move', () => {
    const p = projectDoseEscalation(withEscalation({ phi1: 0.2, phi2: 0.4, eliminationThreshold: 0.9 }));
    expect(p.parameters!.phi1).toEqual({ value: 0.2, source: 'design' });
    expect(p.parameters!.eliminationThreshold).toEqual({ value: 0.9, source: 'design' });
    expect(Math.abs(p.boundaries!.lambdaE - 0.236)).toBeGreaterThan(0.001);
    const design = p.decisionTable.map((r) => r.eliminateIfAtLeast);
    expect(design).toEqual(p.decisionTable.map((r) => firstEliminating(r.n, { target: 0.3, phi1: 0.2, phi2: 0.4, eliminationThreshold: 0.9 })));
    const atDefault = p.decisionTable.map((r) => firstEliminating(r.n, { target: 0.3, phi1: 0.2, phi2: 0.4 }));
    expect(design).not.toEqual(atDefault); // 0.9 eliminates 2/3 and 6/12; 0.95 does not
  });

  it('never computes a "default" from an invalid target', () => {
    for (const targetToxicity of [undefined, 1.2]) {
      const p = projectDoseEscalation(withEscalation({ targetToxicity }));
      expect(p.status).toBe('partial');
      expect(p.parameters!.phi1).toEqual({ value: null, source: 'not computed: target invalid' });
      expect(p.parameters!.phi2).toEqual({ value: null, source: 'not computed: target invalid' });
    }
  });

  it('a recorded φ that is not a rate is a gap and is never used', () => {
    const p = projectDoseEscalation(withEscalation({ phi1: '0.2' }));
    expect(p.status).toBe('partial');
    expect(p.gaps).toContain('the recorded φ1 must be a rate strictly between 0 and 1');
    expect(p.parameters!.phi1).toEqual({ value: null, source: 'not computed: recorded value invalid' });
    expect(p.decisionTable).toEqual([]);
  });
});

describe('projectDoseEscalation — applicability', () => {
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

  it('phases 1 and 1b are escalation phases on their own, with no DLT definition', () => {
    for (const phase of ['1', '1b'] as const) {
      const d = fihDesign();
      d.phase = phase;
      d.safety = {};
      const p = projectDoseEscalation(d);
      expect(p.status, phase).toBe('missing');
      expect(p.applicability.reasons).toEqual([`phase ${phase} is a dose-escalation phase`]);
    }
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

});

describe('projectDoseEscalation — invalid parameters are gaps', () => {
  it('invalid parameters are gaps with no table — and never a throw', () => {
    const p = projectDoseEscalation(withEscalation({ targetToxicity: 1.2, cohortSize: 0, doseLevels: [{ label: 'only' }], startingDoseIndex: 5 }));
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

  it.each([
    [{ stopWhenAtDoseN: 0 }, 'the per-dose stopping count must be a whole number of at least 1'],
    [{ stopWhenAtDoseN: 2 }, 'the per-dose stopping count is smaller than one cohort: no cohort completes at a dose'],
    [{ eliminationThreshold: 1.5 }, 'the elimination threshold must be a probability strictly between 0 and 1'],
    [{ maxSampleSize: 2 }, 'maximum sample size is smaller than one cohort'],
    [{ maxSampleSize: 0 }, 'maximum sample size must be a whole number of at least 1'],
  ])('%o is a gap, with no table', (patch, gap) => {
    const p = projectDoseEscalation(withEscalation(patch));
    expect(p.status).toBe('partial');
    expect(p.gaps).toContain(gap);
    expect(p.decisionTable).toEqual([]);
    expect(p.boundaries).toBeNull();
  });

  it('malformed shapes are gaps, never a throw', () => {
    const levels = projectDoseEscalation(withEscalation({ doseLevels: [null, { label: 'DL2', dose: 20 }, { dose: '5 mg' }] }));
    expect(levels.status).toBe('partial');
    expect(levels.gaps).toEqual(expect.arrayContaining([
      'dose level 1 has no text label',
      'dose level 2 records its dose as something other than text',
      'dose level 3 has no text label',
    ]));
    expect(levels.parameters!.doseLevels).toEqual([{ label: null, dose: null }, { label: 'DL2', dose: null }, { label: null, dose: '5 mg' }]);
    expect(levels.parameters!.startingDose).toBeNull();

    const dlt = fihDesign();
    (dlt.safety as unknown as { dltDefinition: unknown }).dltDefinition = 5;
    const p = projectDoseEscalation(dlt);
    expect(p.applicability.reasons).toEqual(['phase FIH is a dose-escalation phase']);
    expect(p.gaps).toContain('the escalation counts DLTs, but the design does not define a dose-limiting toxicity');

    for (const block of [5, 'boin', [], null]) {
      const d = fihDesign();
      (d.safety as unknown as { doseEscalation: unknown }).doseEscalation = block;
      expect(() => projectDoseEscalation(d), String(block)).not.toThrow();
    }
  });

  it('an invalid recorded neighbourhood is a gap, not an exception', () => {
    const p = projectDoseEscalation(withEscalation({ phi1: 0.35, phi2: 0.4 }));
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

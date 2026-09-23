/**
 * The registry filing engine.
 *
 * A trial-registry record is a regulatory obligation with a statutory
 * deadline, and most of these tests exist for the two ways an engine can put a
 * false clean bill on one:
 *
 *   1. reading an UNRECORDED field as "does not apply" — the same asymmetry
 *      `package-manifest.ts` was written around; and
 *   2. computing a deadline from a date nobody supplied. FDAAA 801's clocks
 *      run from first participant enrollment and primary completion, real-world
 *      events this platform does not observe. An engine that reaches for
 *      `Date.now()` there reports a statutory deadline as met because nobody
 *      recorded an enrollment.
 *
 * And one thing the engine must never say: that a record was submitted,
 * posted, accepted or transmitted. This platform does not talk to
 * ClinicalTrials.gov or CTIS (IRB design D3, `ci:action-overclaim`).
 */
import { describe, it, expect } from 'vitest';

import {
  buildRegistryFiling,
  timelinessObligations,
  OBLIGATION_STATUSES,
  type PlacedRecord,
  type RegistryFilingContext,
} from '../registry-filing';
import { projectAllRegistrations, type RegistrationRecord, type RegistrationModule } from '../registration-projection';
import { REGISTRY_MODULE_SLOTS, isRegistrySlot, REGISTRY_SLOT_CODES } from '../../../../shared/regulatory/placement-vocabulary';
import { type StudyDesign } from '../study-design-types';

function regDesign(): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
    productType: 'drug',
    targetRegions: ['United States', 'Germany'],
    objectives: [{ level: 'primary', order: 1, text: 'Demonstrate superiority on HbA1c', endpointName: 'HbA1c change' }],
    estimands: [],
    endpoints: [
      { name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c', timepoint: 'week 24' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: {
      targetDescription: 'adults with type 2 diabetes',
      analysisPopulations: [{ kind: 'ITT', definition: 'all randomized' }],
      eligibility: [{ type: 'inclusion', text: 'HbA1c 7.0-10.0%' }],
    },
    arms: [
      { name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational', dose: '10 mg' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo' }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double' },
    statisticalPlan: { alpha: 0.05, power: 0.9, plannedSampleSize: 400, plannedAnalyses: [] },
  };
}

/** A synthetic record whose content is complete, so readiness can be exercised. */
function completeRecord(modules: string[]): RegistrationRecord {
  const built: RegistrationModule[] = modules.map((name) => ({
    name,
    fields: [{ name: `${name} field`, value: 'a value', status: 'rendered', required: true }],
  }));
  return {
    registry: 'ClinicalTrials.gov',
    standard: 'FDAAA 801 / ClinicalTrials.gov PRS',
    modules: built,
    gaps: [],
    completeness: { requiredRendered: built.length, requiredTotal: built.length, percent: 100 },
    registrable: true,
    projectedFromObject: true,
  };
}

const CTGOV_MODULES = [
  'Study identification', 'Study status', 'Sponsor and oversight', 'Study design',
  'Conditions', 'Arms and interventions', 'Outcome measures', 'Eligibility',
];

function placed(slot: string, over: Partial<PlacedRecord> = {}): PlacedRecord {
  return { slot, leafId: 1, title: 'A registry record part', resolvable: true, ...over };
}

/** Every slot an expectation demands, filled with a resolvable placement. */
function fillAll(filing: ReturnType<typeof buildRegistryFiling>): PlacedRecord[] {
  return filing.rows
    .filter((r) => r.requirement === 'required' || r.requirement === 'conditional' || r.requirement === 'undetermined')
    .map((r, i) => placed(r.slot, { leafId: i + 1 }));
}

function ctx(over: Partial<RegistryFilingContext> = {}): RegistryFilingContext {
  return { ...over };
}

// ─── The slot list cannot drift from the projection ──────────────────────────

describe('the vocabulary cannot drift from the projection', () => {
  it('maps every module both projectors emit onto a declared registry slot', () => {
    const both = projectAllRegistrations(regDesign());
    const emitted = [...both.ctgov.modules, ...both.ctis.modules].map((m) => m.name);
    expect(emitted.length).toBeGreaterThan(10);

    for (const name of emitted) {
      const slot = REGISTRY_MODULE_SLOTS[name];
      expect(slot, `projection module "${name}" has no registry slot`).toBeTruthy();
      expect(isRegistrySlot(slot)).toBe(true);
    }
  });

  it('files every emitted module onto a row, for both registries', () => {
    const both = projectAllRegistrations(regDesign());
    for (const record of [both.ctgov, both.ctis]) {
      const filing = buildRegistryFiling(record, ctx(), []);
      const covered = filing.rows.flatMap((r) => r.modules);
      for (const m of record.modules) expect(covered).toContain(m.name);
      expect(filing.unexpectedModules).toEqual([]);
    }
  });

  it('declares no slot the engine cannot explain', () => {
    const filing = buildRegistryFiling(projectAllRegistrations(regDesign()).ctgov, ctx(), []);
    for (const row of filing.rows) {
      expect(REGISTRY_SLOT_CODES).toContain(row.slot);
      expect(row.basis.length).toBeGreaterThan(0);
    }
  });
});

// ─── Absent is never "no" ────────────────────────────────────────────────────

describe('an unrecorded fact is undetermined, not not-required', () => {
  it('cannot decide results reporting when the primary completion date is unrecorded', () => {
    const filing = buildRegistryFiling(completeRecord(CTGOV_MODULES), ctx({ isApplicableClinicalTrial: true }), []);
    const row = filing.rows.find((r) => r.slot === 'registry.results')!;
    expect(row.requirement).toBe('undetermined');
    expect(row.settledBy).toBe('primaryCompletionDate');
    expect(row.basis).toMatch(/not a record that it does not apply/i);
  });

  it('cannot decide anything when applicability is unrecorded', () => {
    const filing = buildRegistryFiling(completeRecord(CTGOV_MODULES), ctx(), []);
    const row = filing.rows.find((r) => r.slot === 'registry.results')!;
    expect(row.requirement).toBe('undetermined');
    expect(row.settledBy).toBe('isApplicableClinicalTrial');
  });

  it('takes results out of scope only on a RECORDED false', () => {
    const filing = buildRegistryFiling(completeRecord(CTGOV_MODULES), ctx({ isApplicableClinicalTrial: false }), []);
    const row = filing.rows.find((r) => r.slot === 'registry.results')!;
    expect(row.requirement).toBe('not_required');
    expect(row.settledBy).toBeUndefined();
  });

  it('makes results conditional-required on a RECORDED completion date', () => {
    const filing = buildRegistryFiling(
      completeRecord(CTGOV_MODULES),
      ctx({ isApplicableClinicalTrial: true, primaryCompletionDate: '2026-01-31' }),
      [],
    );
    const row = filing.rows.find((r) => r.slot === 'registry.results')!;
    expect(row.requirement).toBe('conditional');
    expect(row.basis).toMatch(/42 CFR 11\.44/);
  });

  it('marks the EU member-state slot not-required only because the record names its registry', () => {
    const ct = buildRegistryFiling(completeRecord(CTGOV_MODULES), ctx(), []);
    const memberStates = ct.rows.find((r) => r.slot === 'registry.member-states')!;
    expect(memberStates.requirement).toBe('not_required');
    expect(memberStates.basis).toMatch(/ClinicalTrials\.gov/);

    const ctis = buildRegistryFiling(projectAllRegistrations(regDesign()).ctis, ctx(), []);
    expect(ctis.rows.find((r) => r.slot === 'registry.member-states')!.requirement).toBe('required');
  });
});

// ─── Undetermined blocks readiness ───────────────────────────────────────────

describe('readiness', () => {
  it('is blocked by an undetermined requirement even when every placed slot is satisfied', () => {
    const record = completeRecord(CTGOV_MODULES);
    const first = buildRegistryFiling(record, ctx(), []);
    const filing = buildRegistryFiling(record, ctx(), fillAll(first));

    expect(filing.counts.required).toBe(filing.counts.requiredSatisfied);
    expect(filing.counts.unresolvable).toBe(0);
    expect(filing.counts.contentGaps).toBe(0);
    expect(filing.counts.undetermined).toBeGreaterThan(0);
    expect(filing.readyToFile).toBe(false);
  });

  it('is blocked by an undetermined OBLIGATION even when nothing in the table is undetermined', () => {
    const record = completeRecord(CTGOV_MODULES);
    const settled = ctx({ isApplicableClinicalTrial: false }); // every slot decided, no clock
    const first = buildRegistryFiling(record, settled, []);
    expect(first.rows.every((r) => r.requirement !== 'undetermined')).toBe(true);

    const filing = buildRegistryFiling(record, settled, fillAll(first));
    expect(filing.counts.undetermined).toBe(0);
    expect(filing.counts.undeterminedObligations).toBe(0); // a recorded false is not an open question
    expect(filing.readyToFile).toBe(true);

    // ...but leave applicability unrecorded and the obligation reopens.
    const open = buildRegistryFiling(record, ctx({ primaryCompletionDate: '2026-01-31' }), fillAll(first));
    expect(open.counts.undeterminedObligations).toBeGreaterThan(0);
    expect(open.readyToFile).toBe(false);
  });

  it('does not count a placeholder as a filing', () => {
    const record = completeRecord(CTGOV_MODULES);
    const settled = ctx({ isApplicableClinicalTrial: false });
    const first = buildRegistryFiling(record, settled, []);
    const placeholders = fillAll(first).map((p) => ({ ...p, resolvable: false }));

    const filing = buildRegistryFiling(record, settled, placeholders);
    expect(filing.counts.requiredSatisfied).toBe(0);
    expect(filing.counts.unresolvable).toBe(placeholders.length);
    expect(filing.rows.every((r) => !r.satisfied)).toBe(true);
    expect(filing.readyToFile).toBe(false);
  });

  it('does not call a slot satisfied while the projection cannot fill its required fields', () => {
    const record = projectAllRegistrations(regDesign()).ctgov; // real record: status/sponsor are gaps
    const filing = buildRegistryFiling(record, ctx({ isApplicableClinicalTrial: false }), [
      placed('registry.status'), placed('registry.sponsor', { leafId: 2 }),
    ]);
    const status = filing.rows.find((r) => r.slot === 'registry.status')!;
    expect(status.contentGaps.length).toBeGreaterThan(0);
    expect(status.contentComplete).toBe(false);
    expect(status.satisfied).toBe(false);
    expect(filing.counts.contentGaps).toBeGreaterThan(0);
    expect(filing.readyToFile).toBe(false);
  });
});

// ─── Deadlines are never invented ────────────────────────────────────────────

describe('timeliness', () => {
  it('computes no deadline from an absent enrollment date, and reports undetermined', () => {
    const obligations = timelinessObligations('ClinicalTrials.gov', ctx({ isApplicableClinicalTrial: true }));
    const registration = obligations.find((o) => o.id === 'ctgov-registration')!;
    expect(registration.status).toBe('undetermined');
    expect(registration.deadline).toBeNull();
    expect(registration.anchor).toBeNull();
    expect(registration.settledBy).toBe('firstEnrollmentDate');
  });

  it('has no status that means the obligation was discharged', () => {
    // This platform does not observe a registry posting, so there is no `met`.
    expect(OBLIGATION_STATUSES).not.toContain('met');
    expect(OBLIGATION_STATUSES).not.toContain('on_time');
    expect(OBLIGATION_STATUSES).not.toContain('complete');
  });

  it('computes the 21-day deadline only from a supplied enrollment date', () => {
    const o = timelinessObligations(
      'ClinicalTrials.gov',
      ctx({ isApplicableClinicalTrial: true, firstEnrollmentDate: '2026-03-01' }),
    ).find((x) => x.id === 'ctgov-registration')!;
    expect(o.deadline).toBe('2026-03-22'); // 21 days after
    expect(o.anchor).toEqual({ event: 'First participant enrolled', date: '2026-03-01' });
    expect(o.status).toBe('deadline_known'); // no as-of date: nothing is said about whether it has passed
  });

  it('says a deadline has elapsed only against a SUPPLIED as-of date', () => {
    const base = { isApplicableClinicalTrial: true, firstEnrollmentDate: '2026-03-01' };
    const before = timelinessObligations('ClinicalTrials.gov', ctx({ ...base, asOfDate: '2026-03-10' }));
    const after = timelinessObligations('ClinicalTrials.gov', ctx({ ...base, asOfDate: '2026-04-10' }));
    expect(before.find((o) => o.id === 'ctgov-registration')!.status).toBe('due');
    expect(after.find((o) => o.id === 'ctgov-registration')!.status).toBe('elapsed');
  });

  it('computes the results deadline one year after the primary completion date', () => {
    const o = timelinessObligations(
      'ClinicalTrials.gov',
      ctx({ isApplicableClinicalTrial: true, primaryCompletionDate: '2026-01-31' }),
    ).find((x) => x.id === 'ctgov-results')!;
    expect(o.deadline).toBe('2027-01-31');
    expect(o.basis).toMatch(/42 CFR 11\.44/);
  });

  it('reports every obligation undetermined when applicability is unrecorded', () => {
    const obligations = timelinessObligations('ClinicalTrials.gov', ctx({ firstEnrollmentDate: '2026-03-01' }));
    for (const o of obligations) {
      expect(o.status).toBe('undetermined');
      expect(o.settledBy).toBe('isApplicableClinicalTrial');
      expect(o.deadline).toBeNull();
    }
  });

  it('refuses to read an unparseable date as an anchor', () => {
    const o = timelinessObligations(
      'ClinicalTrials.gov',
      ctx({ isApplicableClinicalTrial: true, firstEnrollmentDate: 'sometime in March' }),
    ).find((x) => x.id === 'ctgov-registration')!;
    expect(o.status).toBe('undetermined');
    expect(o.deadline).toBeNull();
    expect(o.settledBy).toBe('firstEnrollmentDate');
  });

  it('gives CTIS its own obligation under Regulation (EU) 536/2014', () => {
    const obligations = timelinessObligations('EU CTIS', ctx({ endOfTrialDate: '2026-06-30' }));
    const results = obligations.find((o) => o.id === 'ctis-results-summary')!;
    expect(results.basis).toMatch(/536\/2014/);
    expect(results.deadline).toBe('2027-06-30');
    expect(obligations.some((o) => o.id === 'ctgov-registration')).toBe(false);
  });
});

// ─── The engine claims nothing about transmission ────────────────────────────

describe('no claim of transmission', () => {
  it('never says a record was submitted, posted, accepted or transmitted', () => {
    const record = projectAllRegistrations(regDesign()).ctgov;
    const filing = buildRegistryFiling(
      record,
      ctx({ isApplicableClinicalTrial: true, firstEnrollmentDate: '2026-03-01', primaryCompletionDate: '2026-01-31', asOfDate: '2026-09-22' }),
      [placed('registry.identification')],
    );
    const text = JSON.stringify(filing);
    expect(text).not.toMatch(/\b(submitted|posted|accepted|transmitted|acknowledged)\b/i);
    expect(filing.describesContentOnly).toBe(true);
  });

  it('says the same for the CTIS record', () => {
    const filing = buildRegistryFiling(projectAllRegistrations(regDesign()).ctis, ctx({ endOfTrialDate: '2026-06-30' }), []);
    expect(JSON.stringify(filing)).not.toMatch(/\b(submitted|posted|accepted|transmitted|acknowledged)\b/i);
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('returns the same filing for the same inputs', () => {
    const record = projectAllRegistrations(regDesign()).ctgov;
    const c = ctx({ isApplicableClinicalTrial: true, firstEnrollmentDate: '2026-03-01', asOfDate: '2026-04-01' });
    const p = [placed('registry.identification'), placed('registry.other', { leafId: 2 })];
    expect(buildRegistryFiling(record, c, p)).toEqual(buildRegistryFiling(record, c, p));
  });

  it('does not depend on the order placements arrive in', () => {
    const record = completeRecord(CTGOV_MODULES);
    const c = ctx({ isApplicableClinicalTrial: false });
    const a = [placed('registry.identification', { leafId: 1 }), placed('registry.design', { leafId: 2 })];
    expect(buildRegistryFiling(record, c, a)).toEqual(buildRegistryFiling(record, c, [...a].reverse()));
  });

  it('reports a placement at a slot no expectation covers, rather than ignoring it', () => {
    const filing = buildRegistryFiling(completeRecord(CTGOV_MODULES), ctx(), [placed('registry.made-up')]);
    expect(filing.unexpectedSlots).toEqual(['registry.made-up']);
    expect(filing.counts.unexpected).toBe(1);
  });
});

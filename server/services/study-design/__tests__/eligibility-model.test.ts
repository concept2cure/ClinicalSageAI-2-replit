/**
 * Tests for the structured eligibility layer.
 *
 * Two properties are under test and the second matters more than the first:
 *
 *  1. The parser produces the right structure for the narrow set of shapes it
 *     accepts, and the checks fire on the criterion pairs they exist to catch.
 *  2. The parser REFUSES everything else, and the assessment never presents a
 *     clean verdict over a set it could not structure. A mis-parsed eligibility
 *     threshold is a patient-safety defect, so every refusal here is an
 *     assertion, not an omission.
 *
 * RED-FIRST: this file was written and observed failing before
 * `../eligibility-model` existed — first on the unresolved import, then on the
 * parse-coverage contract and the not-assessed cases.
 */

import { describe, it, expect } from 'vitest';
import {
  assessEligibility,
  parseEligibilityCriterion,
  projectRegistryEligibility,
  structureEligibility,
  type EligibilityFinding,
  type StructuredEligibilityCriterion,
} from '../eligibility-model';
import type { EligibilityCriterion } from '../study-design-types';

// ─── helpers ─────────────────────────────────────────────────────────────────

const inc = (text: string, codes?: EligibilityCriterion['codes']): EligibilityCriterion =>
  codes ? { type: 'inclusion', text, codes } : { type: 'inclusion', text };
const exc = (text: string): EligibilityCriterion => ({ type: 'exclusion', text });

function finding(fs: EligibilityFinding[], id: string): EligibilityFinding {
  const f = fs.find((x) => x.id === id);
  if (!f) throw new Error(`no finding ${id} in ${fs.map((x) => x.id).join(',')}`);
  return f;
}

function one(text: string, type: 'inclusion' | 'exclusion' = 'inclusion'): StructuredEligibilityCriterion {
  return parseEligibilityCriterion({ type, text }, 0);
}

/**
 * Sixteen criteria in the shape a type-2 diabetes trial writes them. The exact
 * parsed/unparsed split is asserted as a number so the coverage claim in the
 * module doc is a contract and not a boast.
 */
const DIABETES_SET: EligibilityCriterion[] = [
  inc('Age >= 18 years'),
  inc('Type 2 diabetes mellitus diagnosed at least 180 days prior to screening'),
  inc('HbA1c 7.0-10.5%'),
  inc('BMI 20 to 45 kg/m2'),
  inc('eGFR >= 45 mL/min/1.73m2'),
  inc('On a stable dose of metformin for at least 90 days prior to screening'),
  inc('Fasting plasma glucose > 130 mg/dL'),
  inc('Body weight < 150 kg'),
  exc('Type 1 diabetes mellitus'),
  exc('History of diabetic ketoacidosis within 6 months'),
  exc('Serum creatinine > 2.0 mg/dL'),
  exc('ALT > 3 x ULN'),
  exc('Systolic blood pressure > 180 mmHg'),
  exc('Pregnancy or breastfeeding'),
  exc('Participation in another interventional study within 30 days'),
  exc('Age > 75'),
];

// ─── the shapes the parser accepts ───────────────────────────────────────────

describe('parseEligibilityCriterion — accepted shapes', () => {
  it('hyphenated range with a percent unit', () => {
    expect(one('HbA1c 7.0-10.5%').structure).toEqual({
      kind: 'threshold',
      concept: { label: 'HbA1c', key: 'hba1c' },
      unit: '%',
      bounds: [{ op: '>=', value: 7 }, { op: '<=', value: 10.5 }],
    });
  });

  it('"to" range with a compound unit', () => {
    expect(one('BMI 18.5 to 30 kg/m2').structure).toEqual({
      kind: 'threshold',
      concept: { label: 'BMI', key: 'bmi' },
      unit: 'kg/m2',
      bounds: [{ op: '>=', value: 18.5 }, { op: '<=', value: 30 }],
    });
  });

  it('en-dash range', () => {
    const s = one('Haemoglobin 9.0–11.0 g/dL').structure;
    expect(s.kind).toBe('threshold');
    expect(s.kind === 'threshold' && s.unit).toBe('g/dL');
  });

  it('single symbolic comparison with a compound unit', () => {
    expect(one('eGFR < 30 mL/min/1.73m2', 'exclusion').structure).toEqual({
      kind: 'threshold',
      concept: { label: 'eGFR', key: 'egfr' },
      unit: 'mL/min/1.73m2',
      bounds: [{ op: '<', value: 30 }],
    });
  });

  it('unicode >= and <= are read as the symbolic comparators', () => {
    expect(one('Platelet count ≥ 100 x10^9/L').structure).toEqual({
      kind: 'threshold',
      concept: { label: 'Platelet count', key: 'platelet count' },
      unit: 'x10^9/L',
      bounds: [{ op: '>=', value: 100 }],
    });
  });

  it('age with an explicit time unit becomes an age criterion, not a plain threshold', () => {
    expect(one('Age >= 18 years').structure).toEqual({
      kind: 'age',
      concept: { label: 'Age', key: 'age' },
      unit: 'years',
      bounds: [{ op: '>=', value: 18 }],
    });
  });

  it('an age range is an age criterion with both bounds', () => {
    expect(one('Age 18-75 years').structure).toEqual({
      kind: 'age',
      concept: { label: 'Age', key: 'age' },
      unit: 'years',
      bounds: [{ op: '>=', value: 18 }, { op: '<=', value: 75 }],
    });
  });

  it('ISO-8601 date comparison', () => {
    expect(one('Date of diagnosis >= 2020-01-01').structure).toEqual({
      kind: 'date',
      concept: { label: 'Date of diagnosis', key: 'date of diagnosis' },
      bounds: [{ op: '>=', date: '2020-01-01' }],
    });
  });

  it('caller-supplied codes are carried verbatim onto the concept', () => {
    const s = one('x').structure;
    expect(s.kind).toBe('free_text');
    const coded = parseEligibilityCriterion(
      inc('HbA1c 7.0-10.5%', [{ system: 'LOINC', code: '4548-4', label: 'Hemoglobin A1c' }]),
      0,
    ).structure;
    expect(coded.kind === 'threshold' && coded.concept.codings).toEqual([
      { system: 'LOINC', code: '4548-4', label: 'Hemoglobin A1c' },
    ]);
  });
});

// ─── what the parser refuses, and why ────────────────────────────────────────

describe('parseEligibilityCriterion — refusals', () => {
  const refusals: Array<[string, string]> = [
    ['Age >= 18', 'no-unit-written'],
    ['HbA1c 7.0-10.5', 'no-unit-written'],
    ['Type 1 diabetes mellitus', 'no-comparator-or-range'],
    ['Pregnancy or breastfeeding', 'no-comparator-or-range'],
    ['ECOG performance status 0 or 1', 'no-comparator-or-range'],
    ['Age at least 18 years', 'word-comparator-not-accepted'],
    ['Life expectancy of more than 12 weeks', 'word-comparator-not-accepted'],
    ['Total bilirubin <= 1.5 x ULN', 'trailing-text-after-unit'],
    ['Serum creatinine > 1.5 mg/dL at screening', 'trailing-text-after-unit'],
    ['Has been on a stable dose of a statin >= 90 days', 'concept-label-too-long'],
    ['Treatment with insulin for > 30 days', 'concept-label-ends-in-a-connective'],
    ['>= 18 years', 'concept-label-absent'],
    ['Date of diagnosis >= 01/02/2020', 'ambiguous-date-format'],
    ['   ', 'empty-text'],
  ];

  it.each(refusals)('refuses %j as %s', (text, reason) => {
    const s = one(text).structure;
    expect(s.kind).toBe('free_text');
    expect(s.kind === 'free_text' && s.unparsed).toBe(true);
    expect(s.kind === 'free_text' && s.reason).toBe(reason);
  });

  it('never infers a unit that was not written', () => {
    for (const t of ['Age >= 18', 'HbA1c 7.0-10.5', 'eGFR < 30']) {
      expect(JSON.stringify(one(t))).not.toMatch(/years|%|mL/);
    }
  });

  it('never guesses a clinical concept from wording: two spellings are two concepts', () => {
    const a = assessEligibility([inc('HbA1c 7.0-10.5%'), exc('Hemoglobin A1c >= 6.5%')]);
    expect(finding(a.findings, 'ELIG-001').status).toBe('not-assessed');
    expect(finding(a.findings, 'ELIG-002').status).toBe('not-assessed');
  });

  it('never converts between units: mg/dL and mmol/L are reported not comparable', () => {
    const a = assessEligibility([
      inc('Fasting plasma glucose >= 126 mg/dL'),
      exc('Fasting plasma glucose > 20 mmol/L'),
    ]);
    const f = finding(a.findings, 'ELIG-005');
    expect(f.status).toBe('attention');
    expect(f.message).toContain('not comparable');
    expect(finding(a.findings, 'ELIG-001').status).toBe('not-assessed');
    // The values survive exactly as written; nothing was rescaled.
    expect(JSON.stringify(a.criteria)).toContain('"value":126');
    expect(JSON.stringify(a.criteria)).toContain('"value":20');
  });
});

// ─── measured coverage on a realistic set ────────────────────────────────────

describe('parse coverage on a realistic diabetes criterion set', () => {
  it('structures exactly 8 of 16 criteria', () => {
    const a = assessEligibility(DIABETES_SET);
    expect(a.counts.total).toBe(16);
    expect(a.counts.structured).toBe(8);
    expect(a.counts.unstructured).toBe(8);
    expect(a.counts.checked).toBe(8);
    expect(a.coverage).toBe(0.5);
  });

  it('names every criterion it could not structure', () => {
    const rows = structureEligibility(DIABETES_SET).filter((c) => c.structure.kind === 'free_text');
    expect(rows.map((r) => r.index)).toEqual([1, 5, 8, 9, 11, 13, 14, 15]);
  });

  it('does not report a clean verdict over a half-structured set', () => {
    const a = assessEligibility(DIABETES_SET);
    expect(a.verdict).toBe('insufficiently-structured');
    expect(a.verdict).not.toBe('clean');
  });

  /**
   * `counts.checked` is what a caller reads to know how much of the set the
   * conflict checks actually saw. Counting an unparsed criterion as checked
   * would make a half-read set look fully read, so it is asserted twice: once
   * against the criteria that really structured, and once on a set where
   * nothing structured at all.
   */
  it('counts as checked only the criteria that structured', () => {
    const a = assessEligibility(DIABETES_SET);
    const structured = structureEligibility(DIABETES_SET).filter((c) => c.structure.kind !== 'free_text');
    expect(a.counts.checked).toBe(structured.length);
    expect(a.counts.checked).toBeLessThan(a.counts.total);
  });
});

// ─── the checks ──────────────────────────────────────────────────────────────

describe('conflict checks', () => {
  it('ELIG-001 fires when an exclusion covers the whole inclusion range', () => {
    const f = finding(assessEligibility([inc('HbA1c 7.0-10.5%'), exc('HbA1c >= 6.5%')]).findings, 'ELIG-001');
    expect(f.status).toBe('unmet');
    expect(f.severity).toBe('critical');
    expect(f.criterionIndexes).toEqual([0, 1]);
  });

  it('ELIG-002 fires when an exclusion range excludes nobody the inclusion admits', () => {
    const f = finding(assessEligibility([inc('HbA1c 7.0-10.5%'), exc('HbA1c < 5.0%')]).findings, 'ELIG-002');
    expect(f.status).toBe('unmet');
    expect(f.severity).toBe('warning');
  });

  it('a partially overlapping exclusion is neither unsatisfiable nor dead', () => {
    const a = assessEligibility([inc('HbA1c 7.0-10.5%'), exc('HbA1c > 10.0%')]);
    expect(finding(a.findings, 'ELIG-001').status).toBe('met');
    expect(finding(a.findings, 'ELIG-002').status).toBe('met');
  });

  it('ELIG-003 fires on an inclusion range whose lower bound is above its upper bound', () => {
    const f = finding(assessEligibility([inc('HbA1c 10.5-7.0%')]).findings, 'ELIG-003');
    expect(f.status).toBe('unmet');
    expect(f.severity).toBe('critical');
  });

  it('ELIG-004 fires when the same concept is constrained twice with incompatible bounds', () => {
    const f = finding(
      assessEligibility([inc('eGFR >= 60 mL/min'), inc('eGFR < 45 mL/min')]).findings,
      'ELIG-004',
    );
    expect(f.status).toBe('unmet');
    expect(f.severity).toBe('critical');
  });

  it('ELIG-006 counts what could not be structured', () => {
    const f = finding(assessEligibility(DIABETES_SET).findings, 'ELIG-006');
    expect(f.status).toBe('attention');
    expect(f.message).toContain('8 of 16');
  });
});

describe('checks that cannot run return not-assessed, never met', () => {
  const ALL_PROSE = [inc('Type 1 diabetes mellitus'), exc('Pregnancy or breastfeeding')];

  it('an all-free-text set checks nothing and says so', () => {
    const a = assessEligibility(ALL_PROSE);
    expect(a.counts.total).toBe(2);
    expect(a.counts.structured).toBe(0);
    expect(a.counts.checked).toBe(0);
    expect(a.coverage).toBe(0);
  });

  it('an all-free-text set assesses nothing', () => {
    const a = assessEligibility(ALL_PROSE);
    for (const id of ['ELIG-001', 'ELIG-002', 'ELIG-003', 'ELIG-004', 'ELIG-005']) {
      expect(finding(a.findings, id).status).toBe('not-assessed');
    }
    expect(a.findings.some((f) => f.status === 'met')).toBe(false);
    expect(a.verdict).toBe('insufficiently-structured');
  });

  it('an empty set assesses nothing at all', () => {
    const a = assessEligibility([]);
    expect(a.findings.every((f) => f.status === 'not-assessed')).toBe(true);
    expect(a.verdict).toBe('nothing-to-assess');
    expect(a.coverage).toBeNull();
  });

  it('ELIG-003 is not-assessed when no inclusion carries two bounds', () => {
    const a = assessEligibility([inc('eGFR >= 45 mL/min/1.73m2')]);
    expect(finding(a.findings, 'ELIG-003').status).toBe('not-assessed');
    expect(finding(a.findings, 'ELIG-004').status).toBe('not-assessed');
  });

  it('a fully structured, conflict-free set is the only way to reach a clean verdict', () => {
    const a = assessEligibility([inc('HbA1c 7.0-10.5%'), exc('eGFR < 30 mL/min/1.73m2')]);
    expect(a.counts.unstructured).toBe(0);
    expect(a.verdict).toBe('clean');
  });
});

// ─── registry projection ─────────────────────────────────────────────────────

describe('projectRegistryEligibility', () => {
  it('emits an age bound only when one was written, and carries its inclusivity', () => {
    const b = projectRegistryEligibility([inc('Age >= 18 years')]);
    expect(b.minimumAge).toEqual({ value: 18, unit: 'years', inclusive: true });
    expect(b.maximumAge).toBeNull();
  });

  it('omits minimum age rather than defaulting it to 18', () => {
    const b = projectRegistryEligibility([inc('HbA1c 7.0-10.5%')]);
    expect(b.minimumAge).toBeNull();
    expect(JSON.stringify(b)).not.toContain('18');
    expect(b.absent.map((a) => a.field)).toContain('Minimum age');
  });

  it('omits sex and healthy-volunteers rather than defaulting them', () => {
    const b = projectRegistryEligibility(DIABETES_SET);
    expect(b.sex).toBeNull();
    expect(b.healthyVolunteers).toBeNull();
    expect(b.absent.map((a) => a.field)).toEqual(
      expect.arrayContaining(['Sex', 'Accepts healthy volunteers', 'Maximum age']),
    );
  });

  it('emits sex and healthy-volunteers when the caller records them', () => {
    const b = projectRegistryEligibility([inc('Age 18-75 years')], { sex: 'all', healthyVolunteers: false });
    expect(b.sex).toBe('all');
    expect(b.healthyVolunteers).toBe(false);
    expect(b.maximumAge).toEqual({ value: 75, unit: 'years', inclusive: true });
    expect(b.absent.map((a) => a.field)).not.toContain('Sex');
  });

  it('carries every criterion as a row, structured where it parsed', () => {
    const b = projectRegistryEligibility(DIABETES_SET);
    expect(b.criteria).toHaveLength(16);
    expect(b.criteria.filter((r) => r.structure.kind !== 'free_text')).toHaveLength(8);
    expect(b.criteria[0].text).toBe('Age >= 18 years');
  });

  it('does not fold an exclusion age bound into the age limits', () => {
    const b = projectRegistryEligibility([inc('HbA1c 7.0-10.5%'), exc('Age > 75 years')]);
    expect(b.maximumAge).toBeNull();
    expect(b.minimumAge).toBeNull();
    expect(b.absent.map((a) => a.field)).toEqual(expect.arrayContaining(['Minimum age', 'Maximum age']));
  });

  it('emits no age limit at all for a set that records no age criterion', () => {
    for (const set of [[], [inc('eGFR >= 45 mL/min/1.73m2')], DIABETES_SET.slice(2, 8)]) {
      const b = projectRegistryEligibility(set);
      expect(b.minimumAge).toBeNull();
      expect(b.maximumAge).toBeNull();
    }
  });
});

// ─── determinism ─────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('the same input twice produces byte-identical output', () => {
    const a = JSON.stringify(assessEligibility(DIABETES_SET));
    const b = JSON.stringify(assessEligibility(DIABETES_SET));
    expect(a).toBe(b);
    expect(JSON.stringify(projectRegistryEligibility(DIABETES_SET))).toBe(
      JSON.stringify(projectRegistryEligibility(DIABETES_SET)),
    );
  });
});

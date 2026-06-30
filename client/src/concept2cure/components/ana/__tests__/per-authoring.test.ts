/**
 * E3 — IVDR PER authoring + verification. Focused unit tests for the data-join,
 * required_strings derivation (incl. 95% CI formatting), the Annex XIII section
 * skeleton, the verify pass/fail semantics when a recorded figure is missing or
 * mistyped, and the 21 CFR Part 11 / IVDR honesty guard (not_assessed / sample
 * never exportable; no fabricated figures).
 */

import { describe, it, expect } from 'vitest';
import {
  formatPct,
  formatPctWithCi,
  formatWithUnit,
  deriveRequiredStrings,
  requiredStringValues,
  materializePerSections,
  isSkeletonComplete,
  buildPerTemplateReplacements,
  assessPerExportability,
  assertPerExportable,
  buildPerAuthoringPlan,
  type PerStudyBundle,
  type AnalyticalPerformanceStudy,
  type ClinicalPerformanceStudy,
} from '../perAuthoring';
import {
  PER_TEMPLATE_BLOCKS,
  perTemplatePlaceholders,
  templateCoversAnnexXiii,
  renderPerSkeleton,
} from '../perTemplate';

// ── Fixtures: a fully-recorded PER (the green-in-isolation case). ───────────
const analytical: AnalyticalPerformanceStudy[] = [
  {
    study_type: 'limit_of_detection',
    title: 'LoD study (probit, 5 panel members)',
    acceptance_criterion: 'LoD ≤ 1.0 IU/mL',
    pass_fail: 'pass',
    metrics: [{ kind: 'lod', value: 0.42, unit: 'IU/mL' }],
  },
  {
    study_type: 'precision',
    title: 'Precision (20-day CLSI EP05)',
    pass_fail: 'pass',
    metrics: [
      { kind: 'loq', value: 1.5, unit: 'IU/mL' },
      { kind: 'precision_cv', value: 3.1, unit: '%' },
    ],
  },
];

const clinical: ClinicalPerformanceStudy[] = [
  {
    title: 'Pivotal clinical performance study',
    intended_population: 'Symptomatic adults',
    total_subjects: 480,
    sensitivity_pct: 96.4,
    sensitivity_lower: 92.1,
    sensitivity_upper: 98.7,
    specificity_pct: 98.9,
    specificity_lower: 97.0,
    specificity_upper: 99.7,
    ppv_pct: 95.2,
    npv_pct: 99.1,
    auc_roc: 0.972,
  },
];

function fullBundle(): PerStudyBundle {
  return {
    per: {
      device_name: 'Acme HBV Assay',
      per_version: 'v1.0',
      scientific_validity_done: true,
      benefit_risk_conclusion: 'The benefits outweigh the residual risks.',
      per_date: '2026-06-29',
      author_name: 'Dr. R. Vega',
      author_qualifications: 'PhD Clinical Chemistry',
    },
    analytical,
    clinical,
    scientificValiditySummary: 'The analyte is an established marker of HBV infection.',
  };
}

describe('number / 95% CI formatting', () => {
  it('formats percentages without trailing-zero noise', () => {
    expect(formatPct(96.4)).toBe('96.4%');
    expect(formatPct(98)).toBe('98%');
    expect(formatPct(99.0)).toBe('99%');
  });

  it('formats a value with its recorded unit', () => {
    expect(formatWithUnit(0.42, 'IU/mL')).toBe('0.42 IU/mL');
    expect(formatWithUnit(3.1, '%')).toBe('3.1%');
  });

  it('renders the canonical 95% CI with an en dash', () => {
    expect(formatPctWithCi(96.4, 92.1, 98.7)).toBe('96.4% (95% CI: 92.1–98.7%)');
  });

  it('falls back to the point estimate when the CI bounds are absent (no fabrication)', () => {
    expect(formatPctWithCi(96.4, null, null)).toBe('96.4%');
    expect(formatPctWithCi(96.4)).toBe('96.4%');
  });
});

describe('deriveRequiredStrings', () => {
  it('derives every recorded analytical + clinical figure incl. the 95% CI strings', () => {
    const values = requiredStringValues(fullBundle());
    expect(values).toContain('0.42 IU/mL'); // LoD
    expect(values).toContain('1.5 IU/mL'); // LoQ
    expect(values).toContain('3.1%'); // precision CV
    expect(values).toContain('96.4% (95% CI: 92.1–98.7%)'); // sensitivity + CI
    expect(values).toContain('98.9% (95% CI: 97–99.7%)'); // specificity + CI
    expect(values).toContain('95.2%'); // PPV
    expect(values).toContain('99.1%'); // NPV
    expect(values).toContain('0.972'); // AUC-ROC
  });

  it('traces each figure back to its source study/metric', () => {
    const derived = deriveRequiredStrings(fullBundle());
    const sens = derived.find(d => d.value.startsWith('96.4%'));
    expect(sens?.source).toContain('Sensitivity');
    expect(sens?.source).toContain('Pivotal clinical performance study');
  });

  it('de-duplicates a figure cited from two studies', () => {
    const b = fullBundle();
    b.clinical = [
      { title: 'Study A', sensitivity_pct: 96.4, sensitivity_lower: 92.1, sensitivity_upper: 98.7 },
      { title: 'Study B', sensitivity_pct: 96.4, sensitivity_lower: 92.1, sensitivity_upper: 98.7 },
    ];
    const values = requiredStringValues(b);
    expect(values.filter(v => v === '96.4% (95% CI: 92.1–98.7%)')).toHaveLength(1);
  });

  it('omits a CI when only the point estimate is recorded', () => {
    const b = fullBundle();
    b.clinical = [{ title: 'Study', sensitivity_pct: 90 }];
    const values = requiredStringValues(b);
    expect(values).toContain('90%');
    expect(values.some(v => v.includes('95% CI'))).toBe(false);
  });
});

describe('Annex XIII section skeleton', () => {
  it('the template covers all three pillars + benefit–risk', () => {
    expect(templateCoversAnnexXiii()).toBe(true);
    expect(perTemplatePlaceholders()).toContain('{{ANALYTICAL_PERFORMANCE}}');
    expect(PER_TEMPLATE_BLOCKS.some(b => b.pillar === 'clinical_performance')).toBe(true);
  });

  it('materialized sections are complete (3 pillars + conclusion)', () => {
    const sections = materializePerSections(fullBundle());
    expect(isSkeletonComplete(sections)).toBe(true);
    expect(sections.map(s => s.key)).toEqual([
      'scientific_validity',
      'analytical_performance',
      'clinical_performance',
      'benefit_risk',
    ]);
  });

  it('flags an incomplete skeleton when a pillar is dropped', () => {
    const sections = materializePerSections(fullBundle()).filter(s => s.key !== 'clinical_performance');
    expect(isSkeletonComplete(sections)).toBe(false);
  });

  it('injects the recorded numbers into the narrative verbatim', () => {
    const sections = materializePerSections(fullBundle());
    const clinicalBody = sections.find(s => s.key === 'clinical_performance')!.body;
    expect(clinicalBody).toContain('96.4% (95% CI: 92.1–98.7%)');
    const analyticalBody = sections.find(s => s.key === 'analytical_performance')!.body;
    expect(analyticalBody).toContain('0.42 IU/mL');
  });

  it('renders a "not assessed" statement rather than a fabricated figure for an empty pillar', () => {
    const b = fullBundle();
    b.clinical = [];
    const body = materializePerSections(b).find(s => s.key === 'clinical_performance')!.body;
    expect(body.toLowerCase()).toContain('has not been assessed');
    expect(body).not.toMatch(/\d%/);
  });

  it('renderPerSkeleton substitutes every placeholder', () => {
    const md = renderPerSkeleton(buildPerTemplateReplacements(fullBundle()));
    expect(md).toContain('Acme HBV Assay');
    expect(md).toContain('96.4% (95% CI: 92.1–98.7%)');
    expect(md).not.toContain('{{');
  });
});

describe('verify pass/fail semantics (required_strings vs. narrative)', () => {
  // Emulates verify_docx_against_source's exact-substring check.
  const verify = (docText: string, required: string[]) =>
    required.filter(s => !docText.includes(s));

  it('passes when the narrative reproduces every recorded figure', () => {
    const plan = buildPerAuthoringPlan(fullBundle());
    const narrative = plan.sections.map(s => `${s.heading}\n\n${s.body}`).join('\n\n');
    const missing = verify(narrative, plan.requiredStrings.map(r => r.value));
    expect(missing).toHaveLength(0);
  });

  it('fails when a recorded figure is missing from the narrative', () => {
    const required = requiredStringValues(fullBundle());
    const narrativeMissingLod = 'Sensitivity was 96.4% (95% CI: 92.1–98.7%).';
    const missing = verify(narrativeMissingLod, required);
    expect(missing).toContain('0.42 IU/mL');
  });

  it('fails when a recorded figure is mistyped in the narrative', () => {
    const required = requiredStringValues(fullBundle());
    // 92.1 mistyped as 92.7 in the CI.
    const mistyped = 'Sensitivity was 96.4% (95% CI: 92.7–98.7%). LoD 0.42 IU/mL.';
    const missing = verify(mistyped, required);
    expect(missing).toContain('96.4% (95% CI: 92.1–98.7%)');
  });
});

describe('honesty contract — exportability', () => {
  it('a fully-recorded, non-sample PER is exportable', () => {
    const verdict = assessPerExportability(fullBundle());
    expect(verdict.exportable).toBe(true);
    expect(verdict.blockers).toHaveLength(0);
  });

  it('blocks a sample PER from sealing/export', () => {
    const b = fullBundle();
    b.per.isSample = true;
    const verdict = assessPerExportability(b);
    expect(verdict.exportable).toBe(false);
    expect(verdict.blockers.join(' ')).toMatch(/sample data/i);
  });

  it('blocks export when an Annex XIII pillar is not assessed', () => {
    const b = fullBundle();
    b.clinical = [];
    const verdict = assessPerExportability(b);
    expect(verdict.exportable).toBe(false);
    expect(verdict.blockers.join(' ')).toMatch(/clinical performance has not been assessed/i);
  });

  it('blocks export when scientific validity is not finalized', () => {
    const b = fullBundle();
    b.per.scientific_validity_done = false;
    const verdict = assessPerExportability(b);
    expect(verdict.exportable).toBe(false);
    expect(verdict.blockers.join(' ')).toMatch(/scientific validity/i);
  });

  it('blocks a narrative that states a figure not present in the recorded data (fabrication guard)', () => {
    const verdict = assessPerExportability(
      fullBundle(),
      'Sensitivity was 99.9% in all subjects.', // 99.9% is not recorded
    );
    expect(verdict.exportable).toBe(false);
    expect(verdict.blockers.join(' ')).toContain('99.9%');
  });

  it('accepts a narrative that only cites recorded figures', () => {
    const verdict = assessPerExportability(
      fullBundle(),
      'Sensitivity was 96.4% (95% CI: 92.1–98.7%). PPV was 95.2%.',
    );
    expect(verdict.exportable).toBe(true);
  });

  it('assertPerExportable throws on a sample PER', () => {
    const b = fullBundle();
    b.per.isSample = true;
    expect(() => assertPerExportable(b)).toThrow(/not exportable/i);
  });

  it('buildPerAuthoringPlan reports its own materialized narrative as exportable', () => {
    const plan = buildPerAuthoringPlan(fullBundle());
    expect(plan.exportability.exportable).toBe(true);
  });
});

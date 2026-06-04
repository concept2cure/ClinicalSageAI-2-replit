/**
 * Smoke tests for the nonclinical & clinical-pharmacology ANA tool handlers:
 *   - compute_fih_dose                (NOAEL→HED→MRSD vs MABEL)
 *   - classify_tox_findings           (toxicologic-pathology adversity)
 *   - select_exposure_response_dose   (Project Optimus dose selection)
 *
 * The underlying engines are pure (no DB, no network), so these exercise the
 * full wiring offline: registration, needs-parameters behaviour, and a real
 * computed result through the handler.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const NEW_TOOLS = [
  'compute_fih_dose',
  'classify_tox_findings',
  'select_exposure_response_dose',
  'load_nonclinical_program',
  'get_nonclinical_template',
  'draft_nonclinical_overview_m2_4',
  'draft_nonclinical_summaries_m2_6',
  'assess_nonclinical_program',
  'assess_nonclinical_safety',
  'assess_ind_filing_readiness',
  'assess_concentration_qtc',
  'assess_ddi_risk',
  'characterize_pk',
  'draft_clinical_summary_m2_7',
] as const;

describe('nonclinical & clin-pharm tools — registration + exposure', () => {
  for (const name of NEW_TOOLS) {
    it(`registers a handler and exposes ${name} in ALL_ANA_TOOLS`, () => {
      expect(getToolHandler(name)).toBeDefined();
      expect(ALL_ANA_TOOLS.some(t => t.name === name)).toBe(true);
    });
  }
});

describe('compute_fih_dose handler', () => {
  it('returns needs_parameters when no species are supplied', async () => {
    const handler = getToolHandler('compute_fih_dose')!;
    const out = JSON.parse(await handler({ speciesNoaels: [] }));
    expect(out.status).toBe('needs_parameters');
  });

  it('computes the MABEL-limited worked example', async () => {
    const handler = getToolHandler('compute_fih_dose')!;
    const out = JSON.parse(
      await handler({
        speciesNoaels: [{ species: 'dog', noaelMgPerKg: 30 }],
        mabel: { minAnticipatedEffectiveExposure: 10, exposurePerMgDose: 1 },
      }),
    );
    expect(out.status).toBe('computed');
    expect(out.engine).toBe('deterministic');
    expect(out.limitedBy).toBe('MABEL');
    expect(out.recommendedStartingDoseMg).toBe(10);
  });
});

describe('classify_tox_findings handler', () => {
  it('returns needs_parameters without findings', async () => {
    const handler = getToolHandler('classify_tox_findings')!;
    const out = JSON.parse(await handler({ findings: [] }));
    expect(out.status).toBe('needs_parameters');
  });

  it('classifies hepatocellular hypertrophy as adaptive', async () => {
    const handler = getToolHandler('classify_tox_findings')!;
    const out = JSON.parse(
      await handler({ findings: [{ organ: 'liver', finding: 'hepatocellular hypertrophy' }] }),
    );
    expect(out.status).toBe('classified');
    expect(out.adaptiveFindings).toHaveLength(1);
    expect(out.overviewParagraph).toMatch(/adaptive|non-adverse/i);
  });
});

describe('select_exposure_response_dose handler', () => {
  it('returns needs_parameters without an exposure mapping', async () => {
    const handler = getToolHandler('select_exposure_response_dose')!;
    const out = JSON.parse(
      await handler({ dosesMg: [100], efficacy: { ec50: 50 }, safety: { thresholdExposure: 300 } }),
    );
    expect(out.status).toBe('needs_parameters');
  });

  it('accepts an array-form exposuresByDose and computes a result', async () => {
    const handler = getToolHandler('select_exposure_response_dose')!;
    const out = JSON.parse(
      await handler({
        dosesMg: [100, 200],
        exposuresByDose: [
          { doseMg: 100, exposure: 50 },
          { doseMg: 200, exposure: 400 },
        ],
        efficacy: { ec50: 60 },
        safety: { thresholdExposure: 300 },
        targetEfficacyFraction: 0.5,
      }),
    );
    expect(out.status).toBe('computed');
    expect(out.predictions.find((p: { doseMg: number }) => p.doseMg === 200)?.exposure).toBe(400);
  });
});

describe('draft_nonclinical_overview_m2_4 handler', () => {
  it('returns needs_parameters without studies', async () => {
    const handler = getToolHandler('draft_nonclinical_overview_m2_4')!;
    const out = JSON.parse(await handler({ studies: [] }));
    expect(out.status).toBe('needs_parameters');
  });

  it('drafts the M2.4 overview with gaps and an adversity profile', async () => {
    const handler = getToolHandler('draft_nonclinical_overview_m2_4')!;
    const out = JSON.parse(
      await handler({
        studies: [
          { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 13, glpCompliant: true, noael: '50 mg/kg/day' },
          { studyType: 'genotox', studyTitle: 'Ames', keyFindings: 'Negative' },
        ],
        findings: [{ organ: 'liver', finding: 'hepatocellular hypertrophy' }],
        drugSubstanceName: 'BX-115',
      }),
    );
    expect(out.status).toBe('drafted');
    expect(out.sectionKey).toBe('2.4');
    expect(out.content).toMatch(/NONCLINICAL OVERVIEW/);
    expect(out.gaps).toContain('primary pharmacology studies');
    expect(out.toxProfile.adaptive).toContain('hepatocellular hypertrophy');
  });
});

describe('get_nonclinical_template handler', () => {
  it('lists templates when no key is given', async () => {
    const handler = getToolHandler('get_nonclinical_template')!;
    const out = JSON.parse(await handler({}));
    expect(out.status).toBe('list');
    expect(out.templates.length).toBeGreaterThanOrEqual(5);
  });

  it('returns a specific template by section code', async () => {
    const handler = getToolHandler('get_nonclinical_template')!;
    const out = JSON.parse(await handler({ template: '4.2.3' }));
    expect(out.status).toBe('template');
    expect(out.content).toContain('[NOAEL]');
  });
});

describe('load_nonclinical_program handler', () => {
  it('returns needs_parameters without a valid program id', async () => {
    const handler = getToolHandler('load_nonclinical_program')!;
    const out = JSON.parse(await handler({ ctdProgramId: 0 }));
    expect(out.status).toBe('needs_parameters');
  });

  it('reports unavailable when the preclinical data layer is disabled', async () => {
    const handler = getToolHandler('load_nonclinical_program')!;
    const out = JSON.parse(await handler({ ctdProgramId: 123 }));
    expect(out.status).toBe('unavailable');
  });
});

describe('draft_nonclinical_summaries_m2_6 handler', () => {
  it('drafts the M2.6 summaries with tables', async () => {
    const handler = getToolHandler('draft_nonclinical_summaries_m2_6')!;
    const out = JSON.parse(
      await handler({
        studies: [
          { studyType: 'pharmacology', studyId: 'PD-1', species: 'rat', keyFindings: 'engaged' },
          { studyType: 'repeat_dose_tox', studyId: 'TX-1', species: 'rat', durationWeeks: 13, noael: '50 mg/kg/day' },
        ],
      }),
    );
    expect(out.status).toBe('drafted');
    expect(out.sectionKey).toBe('2.6');
    expect(Array.isArray(out.tables)).toBe(true);
  });
});

describe('assess_nonclinical_program handler', () => {
  it('returns needs_parameters without the clinical duration', async () => {
    const handler = getToolHandler('assess_nonclinical_program')!;
    const out = JSON.parse(await handler({ present: [] }));
    expect(out.status).toBe('needs_parameters');
  });

  it('flags gaps for a Phase 2 program', async () => {
    const handler = getToolHandler('assess_nonclinical_program')!;
    const out = JSON.parse(
      await handler({
        maxClinicalDurationWeeks: 4,
        targetPhase: 2,
        present: [
          { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 4 },
          { studyType: 'repeat_dose_tox', species: 'dog', durationWeeks: 4 },
          { studyType: 'safety_pharm' },
          { studyType: 'genotox', genotoxComponent: 'ames' },
          { studyType: 'genotox', genotoxComponent: 'in_vitro_mammalian' },
        ],
      }),
    );
    expect(out.status).toBe('assessed');
    // in-vivo genotox is due before Phase 2 and absent.
    expect(out.gaps.some((g: { key: string }) => g.key === 'genotox_in_vivo')).toBe(true);
  });
});

describe('assess_ind_filing_readiness handler', () => {
  it('reports gaps and per-module rollup for an empty status map', async () => {
    const handler = getToolHandler('assess_ind_filing_readiness')!;
    const out = JSON.parse(await handler({}));
    expect(out.status).toBe('assessed');
    expect(out.overallReadiness).toBe('gaps');
    expect(out.modules.map((m: { module: string }) => m.module)).toEqual(['M1', 'M2', 'M3', 'M4', 'M5']);
    expect(out.blockers.length).toBe(out.requiredCount);
  });
});

describe('assess_nonclinical_safety handler', () => {
  it('rolls up the integrated assessment with a readiness verdict', async () => {
    const handler = getToolHandler('assess_nonclinical_safety')!;
    const out = JSON.parse(
      await handler({
        fih: { speciesNoaels: [{ species: 'dog', noaelMgPerKg: 30 }], mabel: { minAnticipatedEffectiveExposure: 10, exposurePerMgDose: 1 } },
        program: { maxClinicalDurationWeeks: 4, targetPhase: 2 },
        presentStudies: [{ studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 4 }],
      }),
    );
    expect(out.status).toBe('assessed');
    expect(out.readiness).toBe('gaps_block_fih');
    expect(out.recommendedStartingDoseMg).toBe(10);
    expect(out.blockers.length).toBeGreaterThan(0);
  });
});

describe('assess_concentration_qtc handler', () => {
  it('returns a negative C-QTc verdict', async () => {
    const handler = getToolHandler('assess_concentration_qtc')!;
    const out = JSON.parse(
      await handler({ slope: 0.02, slopeSE: 0.005, intercept: 0.5, targetConcentration: 300, therapeuticCmax: 150 }),
    );
    expect(out.status).toBe('computed');
    expect(out.tqtWarranted).toBe(false);
    expect(out.upperBound90).toBeLessThan(10);
  });
});

describe('assess_ddi_risk handler', () => {
  it('flags a reversible CYP inhibitor and recommends a study', async () => {
    const handler = getToolHandler('assess_ddi_risk')!;
    const out = JSON.parse(await handler({ imaxUnbound: 0.5, ki: 10 }));
    expect(out.status).toBe('computed');
    expect(out.clinicalStudyRecommended).toBe(true);
  });
});

describe('characterize_pk handler', () => {
  it('returns needs_parameters when nothing is supplied', async () => {
    const handler = getToolHandler('characterize_pk')!;
    const out = JSON.parse(await handler({}));
    expect(out.status).toBe('needs_parameters');
  });

  it('characterizes dose proportionality and accumulation', async () => {
    const handler = getToolHandler('characterize_pk')!;
    const out = JSON.parse(
      await handler({
        doseProportionality: {
          dataPoints: [
            { dose: 50, exposure: 100 },
            { dose: 100, exposure: 200 },
            { dose: 200, exposure: 400 },
          ],
        },
        accumulation: { halfLifeHours: 18, dosingIntervalHours: 24 },
      }),
    );
    expect(out.status).toBe('computed');
    expect(out.doseProportionality.verdict).toBe('proportional');
    expect(out.accumulation.accumulationRatio).toBeCloseTo(1.66, 1);
  });
});

describe('draft_clinical_summary_m2_7 handler', () => {
  it('returns needs_parameters without CSRs', async () => {
    const handler = getToolHandler('draft_clinical_summary_m2_7')!;
    const out = JSON.parse(await handler({ csrs: [], indication: 'x', investigationalProduct: 'y' }));
    expect(out.status).toBe('needs_parameters');
  });

  it('drafts the M2.7 summary from a CSR', async () => {
    const handler = getToolHandler('draft_clinical_summary_m2_7')!;
    const out = JSON.parse(
      await handler({
        csrs: [{ studyId: 'S1', phase: '1', primaryEndpoint: 'safety', primaryResult: 'well tolerated', sampleSize: 48, saeCount: 0 }],
        indication: 'oncology',
        investigationalProduct: 'BX-115',
      }),
    );
    expect(out.status).toBe('drafted');
    expect(out.sectionKey).toBe('2.7');
  });
});

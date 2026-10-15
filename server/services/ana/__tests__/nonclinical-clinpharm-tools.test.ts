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

import { describe, it, expect, vi } from 'vitest';

// Module 2 tools read the program's completed CSRs (ana/module2-csr-inputs.ts);
// the loader is mocked so the M2.7 cases stay offline.
const csrRecords = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock('../../csr/load-csr-inputs-for-project.js', () => ({
  loadCsrInputsForProject: vi.fn(async () => csrRecords.rows),
}));

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
  'draft_quality_overall_summary_m2_3',
  'assess_nonclinical_program',
  'assess_nonclinical_safety',
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
  const ctx = { organizationId: 1 };

  it('refuses without an active organization context (tenant isolation)', async () => {
    const handler = getToolHandler('load_nonclinical_program')!;
    const out = JSON.parse(await handler({ ctdProgramId: 123 }));
    expect(out.status).toBe('needs_context');
  });

  it('returns needs_parameters without a valid program id', async () => {
    const handler = getToolHandler('load_nonclinical_program')!;
    const out = JSON.parse(await handler({ ctdProgramId: 0 }, ctx));
    expect(out.status).toBe('needs_parameters');
  });

  it('reports unavailable when the preclinical data layer is disabled', async () => {
    const handler = getToolHandler('load_nonclinical_program')!;
    const out = JSON.parse(await handler({ ctdProgramId: 123 }, ctx));
    expect(out.status).toBe('unavailable');
  });
});

describe('draft_quality_overall_summary_m2_3 handler', () => {
  // The composition from the open program's recorded data is proven in
  // cmc-quality-summary-tool.test.ts; here, that the registered handler is
  // the one that refuses model-supplied CMC data.
  it('refuses CMC data supplied in the call, rather than composing from it', async () => {
    const handler = getToolHandler('draft_quality_overall_summary_m2_3')!;
    const out = JSON.parse(
      await handler({
        cmcSources: [{ id: 'ds1', sourceType: 'drug_substance', sourcePayload: { name: 'BX-115' } }],
      }),
    );
    expect(out.error).toMatch(/never from data supplied in the call/);
    expect(out.engine).toBeUndefined();
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
    expect(out.programAssessed).toBe(true);
  });

  it('a dose with no program context is not ready_for_fih, and programGaps is null rather than []', async () => {
    // Dose-only input used to read 'ready_for_fih' and serialise programGaps
    // as [] — "assessed, no gaps" — when the study battery was never checked.
    const handler = getToolHandler('assess_nonclinical_safety')!;
    const out = JSON.parse(await handler({ drugSubstanceName: 'BX-115', fih: { speciesNoaels: [{ species: 'rat', noaelMgPerKg: 10 }] } }));
    expect(out.readiness).toBe('insufficient_input');
    expect(out.programAssessed).toBe(false);
    expect(out.programGaps).toBeNull();
    expect(out.summary).toMatch(/study battery was not assessed/);
  });
});

describe('assemble_briefing_book handler — no fixture content is passed off as the sponsor\'s', () => {
  /* These asserted a "SAMPLE DATA" banner over the fixture's questions when the
     sponsor supplied none. The banner covered the questions only; the fixture's
     Background and Supporting Data (an invented N=36 Phase 1, a complete-
     remission signal) sat below it under the caller's real product name. The
     handler no longer has a fixture: without the sponsor's own questions it
     builds nothing. */
  it('builds no book when the sponsor supplied no questions for the Agency', async () => {
    const handler = getToolHandler('assemble_briefing_book')!;
    const out = JSON.parse(await handler({ product_name: 'BX-115', indication: 'type 2 diabetes', meeting_type: 'pre_ind', run_premortem: false }));
    expect(out.content).toBeUndefined();
    expect(out.missing).toEqual(['key_questions']);
  });

  it('builds from the sponsor\'s own questions, with nothing borrowed', async () => {
    const handler = getToolHandler('assemble_briefing_book')!;
    const out = JSON.parse(await handler({ product_name: 'BX-115', meeting_type: 'pre_ind', key_questions: ['Does the Agency agree with the proposed primary endpoint?'], run_premortem: false }));
    expect(String(out.content)).toContain('Does the Agency agree with the proposed primary endpoint?');
    expect(String(out.content)).not.toMatch(/SAMPLE DATA|N=36|complete-remission/);
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

// 2026-10-05 (CLAUDE.md Rule 2): the summary's figures come from the program's
// completed CSR records, never from a csrs[] array in the tool input — which
// the model writes. These cases used to pass a model-supplied CSR and expect a
// draft built from it.
describe('draft_clinical_summary_m2_7 handler', () => {
  const MODEL_SUPPLIED = [
    { studyId: 'S1', phase: '1', primaryEndpoint: 'safety', primaryResult: 'well tolerated', sampleSize: 48, saeCount: 0 },
  ];

  it('composes nothing from figures in the tool input when no program is open', async () => {
    const handler = getToolHandler('draft_clinical_summary_m2_7')!;
    const out = JSON.parse(await handler({ csrs: MODEL_SUPPLIED, indication: 'oncology', investigationalProduct: 'BX-115' }));
    expect(out.ok).toBe(false);
    expect(out.status).toBe('needs_project');
    expect(out.ignoredSuppliedFigures).toBe(true);
    expect(out).not.toHaveProperty('content');
  });

  it('says so when the program has no completed CSR', async () => {
    csrRecords.rows = [];
    const handler = getToolHandler('draft_clinical_summary_m2_7')!;
    const out = JSON.parse(
      await handler({ indication: 'oncology', investigationalProduct: 'BX-115' }, { organizationId: 3, projectId: 9 } as never),
    );
    expect(out.status).toBe('needs_data');
  });

  it('drafts the M2.7 summary from the program’s CSR records, not from the tool input', async () => {
    csrRecords.rows = [
      { studyId: 'X-301', protocolNumber: 'X-301', phase: '3', studyDesign: 'randomized, double-blind', primaryEndpoint: 'ORR',
        primaryResult: 'See §11.4 (Efficacy Results) of the CSR for tabulated results.', sampleSize: 312, csrSections: [] },
    ];
    const handler = getToolHandler('draft_clinical_summary_m2_7')!;
    const out = JSON.parse(
      await handler(
        { csrs: MODEL_SUPPLIED, indication: 'oncology', investigationalProduct: 'BX-115' },
        { organizationId: 3, projectId: 9 } as never,
      ),
    );
    expect(out.status).toBe('drafted');
    expect(out.sectionKey).toBe('2.7');
    expect(out.source).toEqual({ csrBuildJobsForProject: 9, studies: 1 });
    expect(out.ignoredSuppliedFigures).toBe(true);
    expect(out.content).toContain('X-301');
    expect(out.content).toContain('312 subjects');
    expect(out.content).not.toContain('well tolerated');
    expect(out.content).not.toMatch(/\b48 subjects/);
  });
});


// 2026-10-15: the M2.4 and M2.7 drafts dropped the builders' tables from the
// tool result, although their text points at them (M2.7: "… are tabulated
// below"); the M2.5 handler already returned them. A draft carries the tables
// its narrative refers to.
describe('the M2.4 and M2.7 drafts return the tables their text refers to', () => {
  it('M2.7', async () => {
    csrRecords.rows = [
      { studyId: 'X-301', protocolNumber: 'X-301', phase: '3', studyDesign: 'randomized, double-blind', primaryEndpoint: 'ORR',
        primaryResult: 'See §11.4 (Efficacy Results) of the CSR for tabulated results.', sampleSize: 312, csrSections: [] },
    ];
    const out = JSON.parse(
      await getToolHandler('draft_clinical_summary_m2_7')!(
        { indication: 'oncology', investigationalProduct: 'BX-115' },
        { organizationId: 3, projectId: 9 } as never,
      ),
    );
    expect(out.status).toBe('drafted');
    expect(Array.isArray(out.tables)).toBe(true);
    expect(out.tables.length).toBeGreaterThan(0);
    expect(JSON.stringify(out.tables)).toContain('X-301');
  });

  it('M2.4', async () => {
    const out = JSON.parse(
      await getToolHandler('draft_nonclinical_overview_m2_4')!({
        studies: [{ studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 13, glpCompliant: true, noael: '50 mg/kg/day' }],
        drugSubstanceName: 'BX-115',
      }),
    );
    expect(out.status).toBe('drafted');
    expect(Array.isArray(out.tables)).toBe(true);
  });
});

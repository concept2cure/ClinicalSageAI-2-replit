/** Successful record readers and lookup/structure tools must not be relabeled as calculators. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  getPatterns: vi.fn(),
  estimateRecordedShelfLife: vi.fn(async () => ({ ok: true, data: { limitingParameter: 'Assay', sourceMarker: 'recorded-study' } })),
}));
vi.mock('../../../db.js', async original => ({
  ...await original<object>(),
  db: { select: () => ({ from: () => ({ where: async () => h.rows }) }) },
}));
vi.mock('../../cmc/study-composition-scope.js', async original => ({
  ...await original<object>(), studiesCompositionRefusal: vi.fn(async () => null),
}));
vi.mock('../../cmc/recorded-stability.js', async original => ({
  ...await original<object>(), estimateRecordedShelfLife: h.estimateRecordedShelfLife,
}));
vi.mock('../../intelligence/rim-pattern-store.js', async original => ({
  ...await original<object>(), getPatterns: h.getPatterns,
}));

import { getToolHandler } from '../AnaToolExecutor.js';

const CTX = { organizationId: 101, userId: 7 };
async function run(tool: string, input: Record<string, unknown>) {
  return JSON.parse(await getToolHandler(tool)!(input, CTX as never));
}
function notStated(out: Record<string, unknown>) {
  expect(out.basis).not.toBe('stated');
  expect(out.appliesTo).not.toBe('the inputs stated in this conversation');
  expect(String(out.instruction ?? '')).not.toMatch(/every input was stated|none read from a record/i);
}

beforeEach(() => {
  h.rows = [];
  h.estimateRecordedShelfLife.mockClear();
  h.getPatterns.mockReset().mockResolvedValue([{
    id: 'pattern-1', orgId: 101, domain: 'fda', signalType: 'deficiency', observation: 'A recorded pattern',
    confidence: 80, occurrences: 3, firstSeen: '2026-01-01', lastSeen: '2026-10-01',
  }]);
});

describe('successful record-backed computations', () => {
  it('keeps the recorded shelf-life source distinct from a stated-data estimate', async () => {
    h.rows = [{ id: 7, projectId: '6f1c2a7e-9c41-4b6a-8d3e-2f0a1b2c3d4e', stabilityData: {}, storageConditions: ['25C/60RH'] }];
    const out = await run('estimate_recorded_shelf_life', { study_id: 7 });
    expect(out.status).toBe('computed');
    expect(out.result.sourceMarker).toBe('recorded-study');
    expect(h.estimateRecordedShelfLife).toHaveBeenCalledTimes(1);
    notStated(out);
  });

  it('keeps a successful comparison of profiles on file distinct from pasted profiles', async () => {
    h.rows = [
      { id: 1, productName: 'Reference', batchNumber: 'R1', apparatus: 'USP II', medium: 'pH 6.8', rotationSpeed: 50, unitsTested: 12,
        results: [{ timepoint: 10, meanPercent: 40, rsdPercent: 5 }, { timepoint: 20, meanPercent: 65, rsdPercent: 5 }, { timepoint: 30, meanPercent: 80, rsdPercent: 5 }] },
      { id: 2, productName: 'Test', batchNumber: 'T1', apparatus: 'USP II', medium: 'pH 6.8', rotationSpeed: 50, unitsTested: 12,
        results: [{ timepoint: 10, meanPercent: 38, rsdPercent: 5 }, { timepoint: 20, meanPercent: 62, rsdPercent: 5 }, { timepoint: 30, meanPercent: 78, rsdPercent: 5 }] },
    ];
    const out = await run('compare_recorded_dissolution', { reference_profile_id: 1, test_profile_id: 2 });
    expect(out.status).toBe('computed');
    expect(out.reference.id).toBe(1);
    expect(out.test.id).toBe(2);
    expect(out.f2).toBe('79.4');
    notStated(out);
  });

  it.each(['query_rim_patterns_by_domain', 'summarize_rim_intelligence'])('%s does not claim its stored patterns were conversation inputs', async tool => {
    const out = await run(tool, { domain: 'fda' });
    expect(out.status).toBe('computed');
    expect(out.result.source).toBe('RIM Pattern Store');
    expect(h.getPatterns).toHaveBeenCalledWith(expect.objectContaining({ orgId: 101 }));
    notStated(out);
  });
});

describe('lookup and structure answers', () => {
  it('guidance-change radar returns dated registry changes rather than a stated-input assessment', async () => {
    const out = await run('guidance_change_radar', { draftedOn: '2023-01-01' });
    expect(out.status).toBe('computed');
    expect(out.result.driftCount).toBeGreaterThan(0);
    expect(out.result.drifts.find((drift: { fact: { id: string } }) => drift.fact.id === 'us-ldt-final-rule-void')).toBeTruthy();
    notStated(out);
  });

  it('an unavailable FDA guidance index is returned as unavailable, not as conversation facts', async () => {
    const out = await run('fetch_fda_guidance_list', { topic: 'clinical trials' });
    expect(out.status).toBe('computed');
    expect(out.result).toMatchObject({ status: 'unavailable', reason: 'no_guidance_index' });
    expect(out.result.message).toMatch(/No FDA guidance index is connected/);
    notStated(out);
  });

  it('ICH guideline updates retain their curated registry source', async () => {
    const out = await run('fetch_ich_guideline_updates', { category: 'Q' });
    expect(out.status).toBe('computed');
    expect(out.result).toMatchObject({ status: 'fetched', source: 'curated_registry' });
    expect(out.result.guidelines.map((guideline: { code: string }) => guideline.code)).toContain('Q12');
    notStated(out);
  });

  it('guidance freshness retains the dated-registry verification it performed', async () => {
    const out = await run('check_guidance_freshness', { citedGuidances: [{ title: 'ICH Q12', citedDate: '2019-11-20' }] });
    expect(out.status).toBe('computed');
    expect(out.result.status).toBe('checked');
    expect(out.result.results[0]).toMatchObject({ title: 'ICH Q12', verification: 'identified', current: true });
    notStated(out);
  });

  it('PSUR structure returns the ICH sections rather than a product verdict', async () => {
    const out = await run('generate_psur_structure', {
      productName: 'Synthetic Product', substanceName: 'Synthetic Substance',
      reportingPeriodStart: '2025-01-01', reportingPeriodEnd: '2025-12-31',
      marketingAuthorizations: [{ country: 'US', holderName: 'Synthetic Holder', approvalDate: '2020-06-15' }],
    });
    expect(out.status).toBe('computed');
    expect(out.result.status).toBe('structure_generated');
    expect(out.result.sections).toHaveLength(19);
    notStated(out);
  });

  it('DSUR structure returns the ICH sections rather than a product verdict', async () => {
    const out = await run('generate_dsur_structure', {
      productName: 'Synthetic Product', substanceName: 'Synthetic Substance', developmentPhase: 'Phase 3',
      reportingPeriodStart: '2025-01-01', reportingPeriodEnd: '2025-12-31',
    });
    expect(out.status).toBe('computed');
    expect(out.result.status).toBe('structure_generated');
    expect(out.result.sections.length).toBeGreaterThan(0);
    expect(out.result.reportingPeriod).toEqual({ start: '2025-01-01', end: '2025-12-31' });
    notStated(out);
  });

  it('PLR supplies its section catalog without claiming conversation figures as its source', async () => {
    const out = await run('assess_plr_structure', { productType: 'prescription_drug', applicationType: 'NDA', hasBoxedWarning: false });
    expect(out.status).toBe('computed');
    expect(out.result.fullPIStructure.find((section: { sectionNumber: string }) => section.sectionNumber === '1')).toBeTruthy();
    notStated(out);
  });

  it('SmPC supplies its QRD structure without a stated-input calculator label', async () => {
    const out = await run('structure_smpc', { productType: 'medicinal_product', procedure: 'centralized', hasAdditionalMonitoring: false });
    expect(out.status).toBe('computed');
    expect(out.result.smpcSections.find((section: { sectionNumber: string }) => section.sectionNumber === '4')).toBeTruthy();
    notStated(out);
  });

  it('the curated currency registry is not a worksheet over facts supplied in the conversation', async () => {
    const out = await run('check_regulatory_currency', { topic: 'LDT' });
    expect(out.status).toBe('computed');
    expect(out.result.facts.find((fact: { id: string }) => fact.id === 'us-ldt-final-rule-void')).toBeTruthy();
    notStated(out);
  });

  it('PLLR keeps its unassessed product statements and structure basis', async () => {
    const out = await run('assess_pregnancy_lactation_labeling', {});
    expect(out.result.status).toBe('not_assessed');
    expect(out.result.section8_1.requiredStatements).toBeNull();
    notStated(out);
  });
});

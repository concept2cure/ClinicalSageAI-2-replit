/**
 * draft_quality_overall_summary_m2_3 hands the model the completeness and gaps
 * of the open program's Module 3 as the composer recorded them, section by
 * section.
 *
 * What it used to do (until 2026-10-15): the QOS builder counted a section as
 * present whenever the composer returned an object for it — which it does for
 * every section, "has no source data available" ones included — so three CMC
 * records (a drug-substance name and manufacturer, a product description, one
 * acceptance criterion) reached the model as `completeness: 100, gaps: []`
 * with the instruction "State the completeness and the missing Module 3
 * sections (gaps) honestly".
 */
import { describe, expect, it } from 'vitest';

import { draftQualityOverallSummary } from '../cmc-quality-summary-tool';

const ORG = 7;
const PROGRAM = '9a4c4a2e-5d1e-4c6b-9c0a-1f2e3d4c5b6a';

const SOURCES = [
  { id: 'so-1', sourceType: 'drug_substance', sourcePayload: { name: 'BX-115', manufacturer: 'Acme', modality: 'small_molecule' }, sourceHash: 'h1' },
  { id: 'so-2', sourceType: 'drug_product', sourcePayload: { productName: 'BX-115 50 mg tablet', dosageFormDescription: 'tablet', composition: 'BX-115, MCC', strength: '50 mg' }, sourceHash: 'h2' },
  { id: 'so-3', sourceType: 'specification', sourcePayload: { acceptanceCriteria: { assay: '95.0-105.0%' } }, sourceHash: 'h3' },
];

/** Answers the program check and the program's source read; nothing else is recorded. */
const poolOf = async () => ({
  query: async (sql: string, params: unknown[] = []) => {
    if (/regulatory_programs/i.test(sql)) {
      return { rows: [{ id: PROGRAM, programType: 'ind', productType: 'drug', productName: 'BX-115', name: 'BX-115 IND', code: 'BX115' }] };
    }
    if (/FROM cmc_source_objects/i.test(sql)) return { rows: params[0] === ORG && params[1] === PROGRAM ? SOURCES : [] };
    return { rows: [] };
  },
});

describe('draft_quality_overall_summary_m2_3 reports the sections Module 3 has not completed', () => {
  it('three CMC records are not a 100%-complete QOS with no gaps', async () => {
    const out = JSON.parse(await draftQualityOverallSummary(poolOf, {}, { organizationId: ORG, projectRef: PROGRAM } as never));
    expect(out.drafted).toBe(true);
    // Only 3.2.S.1 (name and manufacturer, traced to so-1) is complete: 1 of the 15 sections the QOS summarizes.
    expect(out.completeness).toBe(7);
    expect(out.gaps).toHaveLength(14);
    expect(out.gaps.some((g: string) => g.startsWith('3.2.S.1'))).toBe(false);
    expect(out.gaps).toContain('3.2.P.1 — 75% complete; missing: formulationCompositionComplete');
    expect(out.gaps).toContain(
      '3.2.S.4 — 25% complete; missing: validationStatus, drugSubstanceBatchAnalyses, drugSubstanceImpurityProfileComplete',
    );
    expect(out.content).toContain('Open items: ');
  });
});

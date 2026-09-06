import { describe, expect, it } from 'vitest';
import { composeModule3FromCanonicalSources, impactedSectionsForSourceType } from '../module3Composer';

describe('module3Composer', () => {
  it('computes completeness and missing inputs deterministically', () => {
    const sections = composeModule3FromCanonicalSources([
      { id: '1', sourceType: 'drug_substance', sourcePayload: { name: 'API-1' } as any, sourceHash: 'h1' },
      { id: '2', sourceType: 'specification', sourcePayload: { acceptanceCriteria: 'ok' } as any, sourceHash: 'h2' },
    ] as any);

    const s41 = sections.find((s) => s.sectionKey === '3.2.S.1');
    expect(s41?.missingInputs).toContain('manufacturer');
    expect(s41?.completeness).toBeLessThan(100);

    const s44 = sections.find((s) => s.sectionKey === '3.2.S.4');
    expect(s44).toBeDefined();
    expect(typeof s44?.narrativeDraft).toBe('string');
  });

  it('maps impacted sections for changed source type', () => {
    const impacted = impactedSectionsForSourceType('stability');
    expect(impacted).toContain('3.2.S.7');
    expect(impacted).toContain('3.2.P.8');
  });
});

describe('3.2.P.2 dissolution tables — the Batch column is a batch number or nothing', () => {
  it('never prints the product name under "Batch" when no batch number was recorded', () => {
    const sections = composeModule3FromCanonicalSources([
      { id: 'd1', sourceType: 'dissolution_profile', sourceHash: 'h', sourcePayload: {
        purpose: 'development', productName: 'BX-115', apparatus: 'USP 2', medium: 'pH 6.8 phosphate',
        dissolutionResults: [{ timepoint: 15, meanPercentDissolved: 42, sd: 2.1, n: 12 }],
      } as any },
    ] as any);
    const p2 = sections.find((s) => s.sectionKey === '3.2.P.2');
    expect(p2).toBeDefined();
    const batchTables = (p2!.tables ?? []).filter((t: any) => t.headers?.[0] === 'Batch');
    expect(batchTables.length).toBeGreaterThan(0);
    for (const t of batchTables) {
      for (const row of t.rows) expect(row[0]).not.toBe('BX-115');
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  composeModule3FromCanonicalSources,
  impactedSectionsForSourceType,
  renderComposedSectionMarkdown,
  tablesToMarkdown,
} from '../module3Composer';

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

  it('marks the appendices (3.2.A.*) that require a changed source type impacted too', () => {
    /* The appendix rules live in module3-extensions with their own
       requiredSourceTypes; this walked MODULE3_SECTION_RULES only, so an
       approved 3.2.A.1 never went stale when the container closure it was
       composed from changed. One rule table per file, one answer here. */
    expect(impactedSectionsForSourceType('container_closure')).toContain('3.2.A.1');
    expect(impactedSectionsForSourceType('characterization')).toContain('3.2.A.2');
    expect(impactedSectionsForSourceType('formulation_record')).toContain('3.2.A.3');
    const forDrugProduct = impactedSectionsForSourceType('drug_product');
    expect(forDrugProduct).toContain('3.2.A.1');
    expect(forDrugProduct).toContain('3.2.A.3');
    // The core sections are still there, and no key is listed twice.
    expect(forDrugProduct).toContain('3.2.P.1');
    expect(new Set(forDrugProduct).size).toBe(forDrugProduct.length);
    // A source no appendix requires impacts no appendix.
    expect(impactedSectionsForSourceType('qc_result').filter((k) => k.startsWith('3.2.A.'))).toEqual([]);
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

/**
 * One renderer, two consumers: the governed-artifact bridge
 * (bridgeCompileToArtifact) and the IND placement snapshot
 * (placeModule3IntoSubmission). Both call this function, so the filed leaf and
 * the governed artifact are provably the same bytes. These assertions pin the
 * exact string the bridge used to build inline.
 */
describe('renderComposedSectionMarkdown', () => {
  const tables = [
    {
      title: 'Change History — Drug Product',
      headers: ['Change ID', 'Effective'],
      rows: [['CC-0001', '2026-01-04']],
    },
  ];

  it('is the label + narrative + rendered tables the bridge used to concatenate inline', () => {
    const expected =
      `## Manufacture (Drug Product)\n\nsee the change history table.` +
      '\n\n' + tablesToMarkdown(tables);
    expect(renderComposedSectionMarkdown('Manufacture (Drug Product)', 'see the change history table.', tables))
      .toBe(expected);
  });

  it('emits no table block and no trailing blank tail when the section composes no tables', () => {
    expect(renderComposedSectionMarkdown('General Information', 'Narrative.', [])).toBe(
      '## General Information\n\nNarrative.',
    );
    expect(renderComposedSectionMarkdown('General Information', 'Narrative.', undefined)).toBe(
      '## General Information\n\nNarrative.',
    );
  });
});

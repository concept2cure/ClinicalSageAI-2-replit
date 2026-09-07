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

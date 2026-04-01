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

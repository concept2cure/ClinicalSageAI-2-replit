import {
  buildRegulatoryEvidenceBrief,
  buildRegulatoryEvidenceBriefPackage,
} from '../services/research-intelligence/buildRegulatoryEvidenceBrief';

describe('buildRegulatoryEvidenceBrief', () => {
  test('builds regulatory drafting brief with signals', () => {
    const brief = buildRegulatoryEvidenceBrief([
      {
        id: 1,
        title: 'Trial Source',
        url: 'https://example.org/trial',
        metadata_json: {
          regulatorySignals: {
            nctIds: ['NCT12345678'],
            dois: ['10.1000/xyz123'],
            hasSafetyLanguage: true,
            hasEfficacyLanguage: true,
            hasRegulatoryLanguage: false,
          },
        },
      },
    ] as any);

    expect(brief).toContain('External Evidence Brief');
    expect(brief).toContain('NCT12345678');
    expect(brief).toContain('10.1000/xyz123');
    expect(brief).toContain('Medical writing notes');
  });

  test('returns structured package with sanitized summary fields', () => {
    const briefPackage = buildRegulatoryEvidenceBriefPackage([
      {
        id: 1,
        title: null,
        url: null,
        metadata_json: {
          regulatorySignals: {
            nctIds: ['NCT12345678', '', 1234, 'NCT12345678'],
            dois: ['10.1000/xyz123', undefined, ''],
            hasSafetyLanguage: 1,
            hasEfficacyLanguage: false,
            hasRegulatoryLanguage: 'yes',
          },
        },
      },
    ] as any);

    expect(briefPackage.summary.documentCount).toBe(1);
    expect(briefPackage.summary.nctIds).toEqual(['NCT12345678']);
    expect(briefPackage.summary.dois).toEqual(['10.1000/xyz123']);
    expect(briefPackage.summary.safetySources).toBe(1);
    expect(briefPackage.summary.efficacySources).toBe(0);
    expect(briefPackage.summary.regulatorySources).toBe(1);
    expect(briefPackage.sources).toEqual([{ id: 1, title: 'Untitled source', url: null }]);
    expect(briefPackage.markdown).toContain('External Evidence Brief');
  });
});

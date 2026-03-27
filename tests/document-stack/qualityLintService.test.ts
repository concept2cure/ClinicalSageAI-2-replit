import { describe, expect, it } from 'vitest';
import { DocumentQualityLintService } from '../../server/services/documentQuality/qualityLintService';

describe('DocumentQualityLintService', () => {
  it('returns Concept2Cure rule findings for promotional language', async () => {
    const service = new DocumentQualityLintService(
      { check: async () => [] } as any,
      { lint: async () => [] } as any
    );

    const report = await service.lint({
      artifactId: 'artifact-1',
      versionId: 'v1',
      text: 'This is a breakthrough therapy with zero risk.',
      advisoryMode: true,
      documentClass: '510k',
    });

    expect(report.issues.some((issue) => issue.checker === 'concept2cure')).toBe(true);
    expect(report.issues.some((issue) => issue.ruleId === 'C2C_510K_PREDICATE_001')).toBe(true);
  });
});

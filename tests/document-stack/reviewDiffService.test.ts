import { describe, expect, it } from 'vitest';
import { ReviewDiffService } from '../../server/services/reviewDiffs/reviewDiffService';

describe('ReviewDiffService', () => {
  it('returns diff artifact with fallback redline summary when sidecar unavailable', async () => {
    const service = new ReviewDiffService({ generate: async () => null } as any);

    const artifact = await service.buildDiff({
      artifactId: 'artifact-1',
      fromVersionId: 'v1',
      toVersionId: 'v2',
      previousText: 'Line A\nLine B',
      nextText: 'Line A\nLine B changed',
    });

    expect(artifact.redlinesJson.provider).toBe('native-fallback');
    expect(artifact.diff2html.length).toBeGreaterThan(0);
  });
});

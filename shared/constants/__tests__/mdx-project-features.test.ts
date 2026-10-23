import { describe, expect, it } from 'vitest';
import { getSurface } from '../ui-surface-registry';
import { MDX_PROJECT_FEATURE_SURFACE_IDS, isMdxProjectFeature } from '../mdx-project-features';

describe('MDX project feature boundary', () => {
  it('uses unique existing surface ids and keeps common services shared', () => {
    expect(new Set(MDX_PROJECT_FEATURE_SURFACE_IDS).size).toBe(MDX_PROJECT_FEATURE_SURFACE_IDS.length);
    for (const id of MDX_PROJECT_FEATURE_SURFACE_IDS) {
      expect(getSurface(id)).toBeTruthy();
      expect(isMdxProjectFeature(id)).toBe(true);
    }
    for (const id of ['projects', 'quality', 'vault', 'tasks', 'submission-center', 'unknown']) {
      expect(isMdxProjectFeature(id)).toBe(false);
    }
  });
});

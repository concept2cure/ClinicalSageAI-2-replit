import { describe, expect, it } from 'vitest';
import { CMC_CONVERGENCE_MAP } from '../cmcConvergenceMap';

describe('CMC convergence map (code authority)', () => {
  it('contains a canonical cmc-os schema owner entry', () => {
    const entry = CMC_CONVERGENCE_MAP.find((e) => e.path === 'shared/schema/cmc-os.ts');
    expect(entry?.state).toBe('canonical');
  });

  it('tracks transitional shared/cmc-schema ownership', () => {
    const entry = CMC_CONVERGENCE_MAP.find((e) => e.path === 'shared/cmc-schema.ts');
    expect(entry?.state).toBe('transitional');
  });
});

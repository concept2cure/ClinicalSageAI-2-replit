/**
 * Platform capabilities aggregator — cross-surface catalog shape + composition.
 */

import { describe, it, expect } from 'vitest';
import { getPlatformCatalog } from '../platform-capabilities';
import { getGlobalRiCatalog } from '../../global-ri/global-ri-capabilities';

describe('getPlatformCatalog', () => {
  const cat = getPlatformCatalog();

  it('composes at least the global-RI and submissions domains', () => {
    const ids = cat.domains.map((d) => d.id);
    expect(ids).toContain('global_ri');
    expect(ids).toContain('submissions');
  });

  it('total equals the sum of domain capability counts', () => {
    const sum = cat.domains.reduce((n, d) => n + d.capabilityCount, 0);
    expect(cat.total).toBe(sum);
    expect(cat.deterministicTotal).toBeGreaterThan(0);
    expect(cat.deterministicTotal).toBeLessThanOrEqual(cat.total);
  });

  it('surfaces the Claude-first AI provider summary', () => {
    expect(cat.aiProviders.defaultProvider).toBe('anthropic');
    expect(cat.aiProviders.selectable).toContain('anthropic');
    expect(cat.aiProviders.selectable).toContain('openai');
  });

  it('global-RI domain mirrors the global-RI catalog and uses absolute routes', () => {
    const gri = cat.domains.find((d) => d.id === 'global_ri')!;
    expect(gri.capabilityCount).toBe(getGlobalRiCatalog().total);
    const withRoute = gri.capabilities.find((c) => c.routes.length > 0)!;
    expect(withRoute.routes[0]).toMatch(/^(GET|POST) \/api\/global-ri\//);
  });

  it('every capability is normalized (id/label/routes/deterministic present)', () => {
    for (const d of cat.domains) {
      for (const c of d.capabilities) {
        expect(c.id.length).toBeGreaterThan(0);
        expect(c.label.length).toBeGreaterThan(0);
        expect(Array.isArray(c.routes)).toBe(true);
        expect(typeof c.deterministic).toBe('boolean');
        expect(Array.isArray(c.anaTools)).toBe(true);
      }
    }
  });

  it('is deterministic', () => {
    expect(getPlatformCatalog()).toEqual(getPlatformCatalog());
  });
});

/**
 * Capability-manifest tests.
 */

import { describe, it, expect } from 'vitest';
import { IVD_CAPABILITIES, listCapabilities } from '../ivd-capabilities';

describe('IVD capability manifest', () => {
  it('every capability is well-formed', () => {
    for (const c of IVD_CAPABILITIES) {
      expect(c.path.startsWith('/')).toBe(true);
      expect(['GET', 'POST']).toContain(c.method);
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(10);
      expect(typeof c.deterministic).toBe('boolean');
    }
  });

  it('paths are unique', () => {
    const paths = IVD_CAPABILITIES.map(c => `${c.method} ${c.path}`);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('listCapabilities returns a manifest with categories', () => {
    const m = listCapabilities();
    expect(m.count).toBe(IVD_CAPABILITIES.length);
    expect(m.categories).toContain('economics');
    expect(m.categories).toContain('simulation');
    expect(m.categories).toContain('governance');
  });

  it('filters by category', () => {
    const m = listCapabilities('economics');
    expect(m.capabilities.length).toBeGreaterThan(0);
    expect(m.capabilities.every(c => c.category === 'economics')).toBe(true);
  });

  it('marks Monte-Carlo capabilities as seeded (not deterministic)', () => {
    const mc = IVD_CAPABILITIES.find(c => c.path === '/time-to-market')!;
    expect(mc.deterministic).toBe(false);
    expect(mc.seeded).toBe(true);
  });
});

/**
 * Tests for the regulatory capabilities index — proves it is internally consistent
 * and that every listed AnA tool actually exists in the tool registry (no drift).
 */
import { describe, it, expect } from 'vitest';
import { REGULATORY_CAPABILITIES, regulatoryCapabilitiesIndex } from '../regulatory-capabilities-index';
import { ALL_ANA_TOOLS } from '../../ana/AnaToolDefinitions';

describe('regulatory capabilities index — consistency', () => {
  it('has unique ids, a category, and a description for every capability', () => {
    const ids = REGULATORY_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of REGULATORY_CAPABILITIES) {
      expect(c.label).toBeTruthy();
      expect(c.description).toBeTruthy();
      expect(['reference', 'classification', 'evidence', 'oversight', 'planning', 'enforcement']).toContain(c.category);
    }
  });

  it('index summary counts are consistent', () => {
    const idx = regulatoryCapabilitiesIndex();
    expect(idx.total).toBe(REGULATORY_CAPABILITIES.length);
    const sum = Object.values(idx.byCategory).reduce((a, b) => a + b, 0);
    expect(sum).toBe(idx.total);
  });

  it('every referenced AnA tool exists in the registry (no drift)', () => {
    const toolNames = new Set(ALL_ANA_TOOLS.map((t) => t.name));
    for (const c of REGULATORY_CAPABILITIES) {
      if (c.anaTool) {
        expect(toolNames.has(c.anaTool), `capability "${c.id}" references missing AnA tool "${c.anaTool}"`).toBe(true);
      }
    }
  });

  it('covers each capability category', () => {
    const idx = regulatoryCapabilitiesIndex();
    for (const cat of ['reference', 'classification', 'evidence', 'oversight', 'planning', 'enforcement'] as const) {
      expect(idx.byCategory[cat]).toBeGreaterThan(0);
    }
  });
});

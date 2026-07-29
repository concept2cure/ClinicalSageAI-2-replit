/**
 * Global-RI capability catalog — parity + shape tests. Keeps the UI-discovery
 * catalog in lock-step with the AnA tool registry and the shared group taxonomy.
 */

import { describe, it, expect } from 'vitest';
import {
  GLOBAL_RI_CAPABILITIES,
  capabilitiesByGroup,
  getGlobalRiCatalog,
} from '../global-ri-capabilities';
import { GLOBAL_RI_TOOL_NAMES } from '../ana-tools';
import { GLOBAL_RI_GROUP_IDS } from '@shared/constants/global-ri-ui';

describe('global-RI capability catalog', () => {
  it('every capability is well-formed', () => {
    for (const c of GLOBAL_RI_CAPABILITIES) {
      expect(c.id.length).toBeGreaterThan(0);
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
      expect(c.routes.length).toBeGreaterThan(0);
      expect(c.deterministic).toBe(true);
      expect(GLOBAL_RI_GROUP_IDS).toContain(c.group);
    }
  });

  it('capability ids are unique', () => {
    const ids = GLOBAL_RI_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every referenced AnA tool exists in the tool registry', () => {
    for (const c of GLOBAL_RI_CAPABILITIES) {
      for (const t of c.anaTools) expect(GLOBAL_RI_TOOL_NAMES).toContain(t);
    }
  });

  it('every AnA tool is surfaced by at least one capability (catalog completeness)', () => {
    const referenced = new Set(GLOBAL_RI_CAPABILITIES.flatMap((c) => c.anaTools));
    for (const name of GLOBAL_RI_TOOL_NAMES) expect(referenced).toContain(name);
  });

  it('routes look like "METHOD /path"', () => {
    for (const c of GLOBAL_RI_CAPABILITIES) {
      for (const r of c.routes) expect(r).toMatch(/^(GET|POST) \//);
    }
  });
});

describe('getGlobalRiCatalog', () => {
  it('returns a complete, grouped catalog with per-tool input schemas', () => {
    const cat = getGlobalRiCatalog();
    expect(cat.total).toBe(GLOBAL_RI_CAPABILITIES.length);
    expect(cat.anaToolCount).toBe(GLOBAL_RI_TOOL_NAMES.length);
    expect(cat.groups.length).toBe(GLOBAL_RI_GROUP_IDS.length);
    // byGroup counts sum to the total.
    const sum = Object.values(cat.byGroup).reduce((a, b) => a + b, 0);
    expect(sum).toBe(cat.total);
    // Enriched tools carry an input schema for dynamic forms.
    const withTool = cat.capabilities.find((c) => c.tools.length > 0)!;
    expect(withTool.tools[0].inputSchema).toBeTruthy();
  });

  it('capabilitiesByGroup buckets every capability under a known group', () => {
    const grouped = capabilitiesByGroup();
    const total = Object.values(grouped).reduce((a, b) => a + b.length, 0);
    expect(total).toBe(GLOBAL_RI_CAPABILITIES.length);
    for (const key of Object.keys(grouped)) expect(GLOBAL_RI_GROUP_IDS).toContain(key as any);
  });

  it('is deterministic', () => {
    expect(getGlobalRiCatalog()).toEqual(getGlobalRiCatalog());
  });
});

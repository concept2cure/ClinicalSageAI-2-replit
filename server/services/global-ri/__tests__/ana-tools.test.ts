/**
 * Global-RI tool adapter — validity tests.
 *
 * Audits the AnA tool toolkit that exposes the deterministic global-RI experts:
 * the spec catalog shape and uniqueness, the membership predicate, the dispatcher
 * routing for representative tools, unknown-tool rejection, and determinism.
 */

import { describe, it, expect } from 'vitest';
import {
  GLOBAL_RI_TOOL_SPECS,
  GLOBAL_RI_TOOL_NAMES,
  isGlobalRiTool,
  dispatchGlobalRiTool,
} from '../ana-tools';

describe('GLOBAL_RI_TOOL_SPECS catalog', () => {
  it('has exactly 24 entries', () => {
    expect(GLOBAL_RI_TOOL_SPECS).toHaveLength(24);
  });

  it('every spec has a non-empty name, description, and object input_schema', () => {
    for (const spec of GLOBAL_RI_TOOL_SPECS) {
      expect(typeof spec.name).toBe('string');
      expect(spec.name.length).toBeGreaterThan(0);
      expect(typeof spec.description).toBe('string');
      expect(spec.description.length).toBeGreaterThan(0);
      expect(spec.input_schema.type).toBe('object');
      expect(typeof spec.input_schema.properties).toBe('object');
    }
  });

  it('names are unique', () => {
    const unique = new Set(GLOBAL_RI_TOOL_NAMES);
    expect(unique.size).toBe(GLOBAL_RI_TOOL_NAMES.length);
  });

  it('GLOBAL_RI_TOOL_NAMES matches the spec names in order', () => {
    expect(GLOBAL_RI_TOOL_NAMES).toEqual(GLOBAL_RI_TOOL_SPECS.map((s) => s.name));
  });
});

describe('isGlobalRiTool', () => {
  it('is true for a known name and false for an unknown one', () => {
    expect(isGlobalRiTool('global_ri_exclusivity')).toBe(true);
    expect(isGlobalRiTool('nope')).toBe(false);
  });
});

describe('dispatchGlobalRiTool routing', () => {
  it('routes global_ri_exclusivity and returns bindingMonths', () => {
    const r = dispatchGlobalRiTool('global_ri_exclusivity', {
      market: 'FDA',
      productClass: 'new_chemical_entity',
    }) as { bindingMonths: number };
    expect(typeof r).toBe('object');
    expect(r.bindingMonths).toBe(60);
  });

  it('routes global_ri_device_classification and returns a pathway', () => {
    const r = dispatchGlobalRiTool('global_ri_device_classification', {
      region: 'FDA',
      deviceClass: 'II',
    }) as { pathway: string };
    expect(typeof r).toBe('object');
    expect(typeof r.pathway).toBe('string');
    expect(r.pathway.length).toBeGreaterThan(0);
  });

  it('routes global_ri_safety_reporting and returns reportable=true within 15 days', () => {
    const r = dispatchGlobalRiTool('global_ri_safety_reporting', {
      region: 'FDA',
      serious: true,
      unexpected: true,
      suspectedCausality: true,
    }) as { reportable: boolean; timelineDays: number };
    expect(r.reportable).toBe(true);
    expect(r.timelineDays).toBe(15);
  });

  it('routes global_ri_stability_conditions and returns a longTerm condition', () => {
    const r = dispatchGlobalRiTool('global_ri_stability_conditions', {
      storageCondition: 'room',
    }) as { longTerm: unknown };
    expect(typeof r).toBe('object');
    expect(r.longTerm).toBeTruthy();
  });

  it('throws for an unknown tool name', () => {
    expect(() => dispatchGlobalRiTool('global_ri_does_not_exist', {})).toThrow(
      'Unknown global-RI tool "global_ri_does_not_exist"',
    );
  });

  it('is deterministic for a given tool + input', () => {
    const input = { region: 'FDA', deviceClass: 'III' };
    const a = dispatchGlobalRiTool('global_ri_device_classification', { ...input });
    const b = dispatchGlobalRiTool('global_ri_device_classification', { ...input });
    expect(a).toEqual(b);
  });
});

/**
 * Unit tests for the pure NIH DMS Plan logic (Capability C2C-23).
 */

import { describe, it, expect } from 'vitest';
import {
  REQUIRED_DMSP_ELEMENTS,
  dmspElementTemplates,
  evaluateDmspCompleteness,
  type DmspElementView,
} from '../dmsp-logic';

function viewFrom(overrides: Partial<Record<string, { addressed: boolean; content?: string | null }>> = {}): DmspElementView[] {
  return REQUIRED_DMSP_ELEMENTS.map((e) => {
    const o = overrides[e.elementKey];
    return { elementKey: e.elementKey, required: e.required, addressed: o?.addressed ?? false, content: o?.content ?? null };
  });
}

function allSatisfied(): DmspElementView[] {
  return REQUIRED_DMSP_ELEMENTS.map((e) => ({ elementKey: e.elementKey, required: e.required, addressed: true, content: `Content for ${e.elementKey}.` }));
}

describe('REQUIRED_DMSP_ELEMENTS', () => {
  it('contains exactly the six required NIH DMS plan elements', () => {
    expect(REQUIRED_DMSP_ELEMENTS).toHaveLength(6);
    expect(REQUIRED_DMSP_ELEMENTS.every((e) => e.required)).toBe(true);
    expect(REQUIRED_DMSP_ELEMENTS.map((e) => e.elementKey)).toEqual([
      'data_type',
      'tools_software_code',
      'standards',
      'preservation_access_timelines',
      'access_distribution_reuse',
      'oversight',
    ]);
  });

  it('cites the NIH Final DMS Policy on every element', () => {
    expect(REQUIRED_DMSP_ELEMENTS.every((e) => /NOT-OD-21-013/.test(e.basis))).toBe(true);
  });

  it('dmspElementTemplates returns the canonical set', () => {
    expect(dmspElementTemplates()).toBe(REQUIRED_DMSP_ELEMENTS);
  });
});

describe('evaluateDmspCompleteness', () => {
  it('reports 0% with all six missing on a freshly seeded plan', () => {
    const r = evaluateDmspCompleteness(viewFrom());
    expect(r.addressedPct).toBe(0);
    expect(r.requiredTotal).toBe(6);
    expect(r.requiredAddressed).toBe(0);
    expect(r.missing).toHaveLength(6);
    expect(r.readyToFinalize).toBe(false);
    expect(r.findings.every((f) => f.severity === 'critical')).toBe(true);
  });

  it('does not count an addressed element with empty content', () => {
    const r = evaluateDmspCompleteness(viewFrom({ data_type: { addressed: true, content: '   ' } }));
    expect(r.requiredAddressed).toBe(0);
    expect(r.missing).toContain('data_type');
    const finding = r.findings.find((f) => f.message.includes('data_type'));
    expect(finding?.message).toMatch(/no content/);
  });

  it('counts an element that is both addressed and has content', () => {
    const r = evaluateDmspCompleteness(viewFrom({ standards: { addressed: true, content: 'We will use the CDISC standards.' } }));
    expect(r.requiredAddressed).toBe(1);
    expect(r.addressedPct).toBe(17);
    expect(r.missing).not.toContain('standards');
    expect(r.readyToFinalize).toBe(false);
  });

  it('is ready to finalize only when all six are satisfied', () => {
    const r = evaluateDmspCompleteness(allSatisfied());
    expect(r.addressedPct).toBe(100);
    expect(r.requiredAddressed).toBe(6);
    expect(r.missing).toHaveLength(0);
    expect(r.readyToFinalize).toBe(true);
    expect(r.findings).toHaveLength(0);
  });

  it('treats no elements as vacuously complete', () => {
    const r = evaluateDmspCompleteness([]);
    expect(r.addressedPct).toBe(100);
    expect(r.readyToFinalize).toBe(true);
  });
});

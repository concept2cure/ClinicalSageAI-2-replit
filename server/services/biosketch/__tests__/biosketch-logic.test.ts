/**
 * Unit tests for the pure NIH Biosketch logic (Capability C2C-24B).
 */

import { describe, it, expect } from 'vitest';
import {
  REQUIRED_BIOSKETCH_SECTIONS,
  biosketchSectionTemplates,
  evaluateBiosketchCompleteness,
  type BiosketchSectionView,
} from '../biosketch-logic';

function viewFrom(overrides: Partial<Record<string, { addressed: boolean; content?: string | null }>> = {}): BiosketchSectionView[] {
  return REQUIRED_BIOSKETCH_SECTIONS.map((s) => {
    const o = overrides[s.sectionKey];
    return { sectionKey: s.sectionKey, required: s.required, addressed: o?.addressed ?? false, content: o?.content ?? null };
  });
}

function allSatisfied(): BiosketchSectionView[] {
  return REQUIRED_BIOSKETCH_SECTIONS.map((s) => ({ sectionKey: s.sectionKey, required: s.required, addressed: true, content: `Content for ${s.sectionKey}.` }));
}

describe('REQUIRED_BIOSKETCH_SECTIONS', () => {
  it('contains exactly the three required NIH biosketch sections', () => {
    expect(REQUIRED_BIOSKETCH_SECTIONS).toHaveLength(3);
    expect(REQUIRED_BIOSKETCH_SECTIONS.every((s) => s.required)).toBe(true);
    expect(REQUIRED_BIOSKETCH_SECTIONS.map((s) => s.sectionKey)).toEqual([
      'personal_statement',
      'positions_honors',
      'contributions_to_science',
    ]);
  });

  it('cites the NIH biosketch format on every section', () => {
    expect(REQUIRED_BIOSKETCH_SECTIONS.every((s) => /FORMS-H/.test(s.basis))).toBe(true);
  });

  it('biosketchSectionTemplates returns the canonical set', () => {
    expect(biosketchSectionTemplates()).toBe(REQUIRED_BIOSKETCH_SECTIONS);
  });
});

describe('evaluateBiosketchCompleteness', () => {
  it('reports 0% with all three missing on a freshly seeded biosketch', () => {
    const r = evaluateBiosketchCompleteness(viewFrom());
    expect(r.addressedPct).toBe(0);
    expect(r.requiredTotal).toBe(3);
    expect(r.missing).toHaveLength(3);
    expect(r.readyToFinalize).toBe(false);
  });

  it('does not count an addressed section with empty content', () => {
    const r = evaluateBiosketchCompleteness(viewFrom({ personal_statement: { addressed: true, content: '   ' } }));
    expect(r.requiredAddressed).toBe(0);
    expect(r.missing).toContain('personal_statement');
  });

  it('counts a section that is both addressed and has content', () => {
    const r = evaluateBiosketchCompleteness(viewFrom({ positions_honors: { addressed: true, content: 'Professor of Medicine, 2015–present.' } }));
    expect(r.requiredAddressed).toBe(1);
    expect(r.addressedPct).toBe(33);
    expect(r.readyToFinalize).toBe(false);
  });

  it('is ready to finalize only when all three are satisfied', () => {
    const r = evaluateBiosketchCompleteness(allSatisfied());
    expect(r.addressedPct).toBe(100);
    expect(r.missing).toHaveLength(0);
    expect(r.readyToFinalize).toBe(true);
    expect(r.findings).toHaveLength(0);
  });
});

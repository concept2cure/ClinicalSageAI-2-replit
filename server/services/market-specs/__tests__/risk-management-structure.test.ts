/**
 * Tests for the ISO 14971 risk management file structure.
 */
import { describe, it, expect } from 'vitest';
import {
  RMF_SECTIONS,
  getRmfSection,
  rmfReviewerQuestions,
  assessRmfStructure,
} from '../risk-management-structure';

describe('risk management structure (ISO 14971)', () => {
  it('has the core RMF sections with reviewer questions', () => {
    const ids = RMF_SECTIONS.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['plan', 'analysis', 'evaluation', 'control', 'overall_residual_risk', 'review', 'report', 'post_production']));
    for (const s of RMF_SECTIONS) expect(s.reviewerQuestions.length).toBeGreaterThan(0);
  });

  it('asks about pre-defined acceptability criteria and foreseeable misuse', () => {
    const qs = rmfReviewerQuestions();
    expect(qs.some((q) => q.sectionId === 'plan' && /acceptability criteria/i.test(q.question))).toBe(true);
    expect(qs.some((q) => q.sectionId === 'analysis' && /misuse/i.test(q.question))).toBe(true);
    expect(qs.some((q) => q.sectionId === 'control' && /priority order|design first/i.test(q.question))).toBe(true);
  });

  it('assesses completeness deterministically', () => {
    const all = RMF_SECTIONS.map((s) => s.id);
    expect(assessRmfStructure(all).ready).toBe(true);
    const partial = assessRmfStructure(['plan', 'analysis']);
    expect(partial.ready).toBe(false);
    expect(partial.missingRequiredSections).toContain('control');
    expect(partial.missingRequiredSections).toContain('overall_residual_risk');
  });

  it('looks up a section', () => {
    expect(getRmfSection('control')?.number).toBe('4');
    expect(getRmfSection('nope')).toBeUndefined();
  });
});

/**
 * Medical-writing self-review — unit tests. Deterministic, no IO.
 */
import { describe, it, expect } from 'vitest';
import { reviewMedicalWriting } from '../medical-writing-review';

describe('reviewMedicalWriting', () => {
  it('returns a pre-draft checklist (structure as review) when no draft is given', () => {
    const r = reviewMedicalWriting('csr');
    expect(r.documentType).toBe('csr');
    expect(r.governingStandards.join(' ')).toContain('ICH E3');
    expect(r.structureCoverage).toBeUndefined();
    expect(r.checklist.some(c => c.category === 'structure' && c.status === 'review')).toBe(true);
    expect(r.checklist.some(c => c.category === 'requirement')).toBe(true);
    expect(r.checklist.some(c => c.category === 'pitfall')).toBe(true);
    expect(r.readiness).toMatch(/Pre-draft/i);
  });

  it('flags missing sections when a thin draft is reviewed', () => {
    const thin = 'Introduction. The objectives were met. Safety was acceptable.';
    const r = reviewMedicalWriting('csr', thin);
    expect(r.structureCoverage).toBeDefined();
    expect((r.missingSections ?? []).length).toBeGreaterThan(0);
    expect(r.readiness).toMatch(/NOT READY/);
  });

  it('reports structure complete when a draft covers the expected sections', () => {
    // Manuscript structure: title/abstract, introduction, methods, results,
    // discussion, limitations, conclusions, declarations, references.
    const full = [
      'Abstract: structured summary.',
      'Introduction and background.',
      'Methods: design and analysis.',
      'Results: outcomes reported.',
      'Discussion of findings.',
      'Limitations of the study.',
      'Conclusions.',
      'Declarations: funding, authorship, conflicts.',
      'References list.',
    ].join('\n');
    const r = reviewMedicalWriting('manuscript', full);
    expect(r.missingSections).toEqual([]);
    expect(r.readiness).toMatch(/Structure complete/);
  });

  it('handles an unknown document type without throwing', () => {
    const r = reviewMedicalWriting('not-a-doc');
    expect(r.documentType).toBeNull();
    expect(r.checklist).toEqual([]);
    expect(r.readiness).toMatch(/Unknown document type/i);
  });
});

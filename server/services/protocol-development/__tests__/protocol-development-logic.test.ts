/**
 * Protocol Development pure logic — section templates, completeness scoring,
 * version bump. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  templateFor,
  SECTION_TEMPLATES,
  evaluateCompleteness,
  nextVersion,
  type SectionView,
} from '../protocol-development-logic';

describe('templateFor', () => {
  it('provides cited templates per kind', () => {
    expect(templateFor('clinical').length).toBeGreaterThan(5);
    expect(templateFor('iacuc').some((s) => s.sectionKey === 'replacement')).toBe(true);
    expect(templateFor('irb').some((s) => s.sectionKey === 'risks_benefits')).toBe(true);
    expect(templateFor('ibc').some((s) => s.sectionKey === 'risk_assessment')).toBe(true);
    for (const s of SECTION_TEMPLATES.clinical) expect(s.basis).toBeTruthy();
  });
  it('returns empty for an unknown kind', () => {
    expect(templateFor('nope' as any)).toEqual([]);
  });
});

function sectionsAllComplete(kind: 'clinical' | 'irb' | 'iacuc' | 'ibc'): SectionView[] {
  return templateFor(kind).map((t) => ({ sectionKey: t.sectionKey, title: t.title, required: t.required, status: 'complete' as const }));
}

describe('evaluateCompleteness', () => {
  it('is ready when all required sections complete + objectives + eligibility + visits (clinical)', () => {
    const r = evaluateCompleteness({
      sections: sectionsAllComplete('clinical'),
      objectiveCount: 2,
      inclusionCount: 3,
      exclusionCount: 2,
      scheduleVisitCount: 4,
      kind: 'clinical',
    });
    expect(r.readyToFinalize).toBe(true);
    expect(r.requiredCompletionPct).toBe(100);
  });

  it('blocks finalize when a required section is incomplete', () => {
    const sections = sectionsAllComplete('clinical');
    sections[0] = { ...sections[0], status: 'draft' };
    const r = evaluateCompleteness({ sections, objectiveCount: 1, inclusionCount: 1, exclusionCount: 1, scheduleVisitCount: 1, kind: 'clinical' });
    expect(r.readyToFinalize).toBe(false);
    expect(r.findings.some((f) => f.severity === 'critical')).toBe(true);
    expect(r.requiredCompletionPct).toBeLessThan(100);
  });

  it('requires objectives and (clinical) a schedule of assessments', () => {
    const r = evaluateCompleteness({ sections: sectionsAllComplete('clinical'), objectiveCount: 0, inclusionCount: 1, exclusionCount: 1, scheduleVisitCount: 0, kind: 'clinical' });
    expect(r.readyToFinalize).toBe(false);
    expect(r.findings.some((f) => /objectives/i.test(f.message))).toBe(true);
    expect(r.findings.some((f) => /schedule of assessments/i.test(f.message))).toBe(true);
  });

  it('does not require eligibility/visits for IACUC', () => {
    const r = evaluateCompleteness({ sections: sectionsAllComplete('iacuc'), objectiveCount: 1, inclusionCount: 0, exclusionCount: 0, scheduleVisitCount: 0, kind: 'iacuc' });
    expect(r.readyToFinalize).toBe(true);
  });
});

describe('nextVersion', () => {
  it('bumps minor by default and major on release', () => {
    expect(nextVersion('0.1')).toBe('0.2');
    expect(nextVersion('1.4')).toBe('1.5');
    expect(nextVersion('0.9', true)).toBe('1.0');
    expect(nextVersion('garbage')).toBe('0.2');
    expect(nextVersion('garbage', true)).toBe('1.0');
  });
});

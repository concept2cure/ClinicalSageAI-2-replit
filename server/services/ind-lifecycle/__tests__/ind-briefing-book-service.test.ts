/**
 * FDA meeting briefing-book assembler — deterministic section model + gap
 * detection + numbered questions block. No DB, no AI.
 */

import { describe, it, expect } from 'vitest';
import { assembleBriefingBook, type BriefingBookInput } from '../ind-briefing-book-service';

function input(overrides: Partial<BriefingBookInput> = {}): BriefingBookInput {
  return {
    productName: 'C2C-001',
    indication: 'NSCLC',
    meetingType: 'pre_ind',
    proposedPhase: 'Phase 1',
    productBackground: 'First-in-class inhibitor.',
    nonclinicalSummary: 'GLP tox complete; NOAEL established.',
    proposedClinicalPlan: '3+3 dose escalation.',
    questions: [
      { number: 2, topic: 'Phase 1 design', question: 'Is the proposed starting dose acceptable?', sponsorPosition: '1/10 HNSTD.' },
      { number: 1, topic: 'Nonclinical package', question: 'Is the nonclinical package sufficient to support Phase 1?' },
    ],
    ...overrides,
  };
}

describe('assembleBriefingBook', () => {
  it('builds the standard section set with the meeting label and product info', () => {
    const model = assembleBriefingBook(input());
    expect(model.reportType).toBe('FDA_BRIEFING_BOOK');
    expect(model.questionCount).toBe(2);
    expect(model.sections.find((s) => s.key === 'cover')!.body).toContain('Pre-IND Meeting');
    expect(model.sections.find((s) => s.key === 'cover')!.body).toContain('C2C-001');
  });

  it('orders questions by number and includes the sponsor position', () => {
    const model = assembleBriefingBook(input());
    const q = model.sections.find((s) => s.key === 'questions')!.body;
    expect(q.indexOf('Question 1')).toBeLessThan(q.indexOf('Question 2'));
    expect(q).toContain('Sponsor position: 1/10 HNSTD.');
  });

  it('flags required empty sections as gaps (here: clinical plan missing)', () => {
    const model = assembleBriefingBook(input({ proposedClinicalPlan: undefined }));
    expect(model.gaps.some((g) => g.sectionKey === 'plan')).toBe(true);
  });

  it('requires at least one question', () => {
    const model = assembleBriefingBook(input({ questions: [] }));
    expect(model.gaps.some((g) => g.sectionKey === 'questions')).toBe(true);
    expect(model.questionCount).toBe(0);
  });

  it('a fully-populated package has no gaps', () => {
    const model = assembleBriefingBook(
      input({ clinicalSummary: 'n/a', cmcSummary: 'GMP material', protocolSynopsis: 'syn', regulatoryHistory: 'none' }),
    );
    expect(model.gaps).toHaveLength(0);
  });
});

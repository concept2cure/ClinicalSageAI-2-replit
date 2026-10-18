/**
 * IND cover letter (eCTD m1.2) — the FDA center and the submission type are
 * stated, never assumed.
 *
 * What the code used to do (until 2026-10-15):
 *   - every letter was addressed to the "Center for Drug Evaluation and
 *     Research": CoverLetterInput had no center, so a CBER-regulated IND (a
 *     cell or gene therapy, a vaccine) went to the wrong center and the letter
 *     reported no gap;
 *   - lifecycleStageToSubmissionType mapped stages to letter types by
 *     assumption: 'amendment' was always an Information Amendment (a protocol
 *     amendment must carry its 312.30(d) title), 'response' always an
 *     information-request response (never a clinical-hold response), and
 *     'planning', 'variation', 'withdrawal' and a missing stage all became
 *     "Initial Investigational New Drug Application".
 */
import { describe, it, expect } from 'vitest';
import { assembleCoverLetter, type CoverLetterInput } from '../ind-cover-letter-service';
import { assembleCoverLetterContext, lifecycleStageToSubmissionType } from '../cover-letter-context';

function input(over: Partial<CoverLetterInput> = {}): CoverLetterInput {
  return {
    sponsorName: 'Acme Therapeutics',
    sponsorAddress: '1 Main St, Boston, MA',
    drugName: 'C2C-001',
    submissionType: 'original',
    fdaDivision: 'Office of Therapeutic Products',
    signatoryName: 'John Doe',
    signatoryTitle: 'VP Regulatory',
    date: '2026-03-01T00:00:00.000Z',
    ...over,
  };
}

describe('assembleCoverLetter — the FDA center', () => {
  it('with no center stated, the letter carries a placeholder and a gap — not CDER', () => {
    const m = assembleCoverLetter(input());
    expect(m.body).not.toContain('Center for Drug Evaluation and Research');
    expect(m.body).toContain('[FDA Center]');
    expect(m.gaps).toContain('fdaCenter');
  });

  it('CBER is addressed to CBER', () => {
    const m = assembleCoverLetter(input({ fdaCenter: 'CBER' }));
    expect(m.body).toContain('Center for Biologics Evaluation and Research');
    expect(m.body).not.toContain('Center for Drug Evaluation and Research');
    expect(m.gaps).not.toContain('fdaCenter');
  });

  it('CDER is addressed to CDER', () => {
    const m = assembleCoverLetter(input({ fdaCenter: 'CDER' }));
    expect(m.body).toContain('Center for Drug Evaluation and Research');
    expect(m.gaps).not.toContain('fdaCenter');
  });

  it('a center outside CDER/CBER is not addressed to anyone — placeholder and gap', () => {
    const m = assembleCoverLetter(input({ fdaCenter: 'CDRH' as unknown as CoverLetterInput['fdaCenter'] }));
    expect(m.body).toContain('[FDA Center]');
    expect(m.gaps).toContain('fdaCenter');
  });
});

describe('assembleCoverLetter — the submission type', () => {
  it('with no submission type, the letter says so with a placeholder and a gap, and never prints "undefined"', () => {
    const m = assembleCoverLetter(input({ submissionType: undefined, fdaCenter: 'CDER' }));
    expect(m.body).not.toMatch(/undefined/);
    expect(m.body).toContain('[Submission Type]');
    expect(m.gaps).toContain('submissionType');
    expect(m.submissionType).toBeNull();
  });
});

describe('lifecycleStageToSubmissionType — only unambiguous stages map', () => {
  it('original and annual map; every other stage is left unstated', () => {
    expect(lifecycleStageToSubmissionType('original')).toBe('original');
    expect(lifecycleStageToSubmissionType('annual')).toBe('annual_report');
    for (const stage of ['planning', 'amendment', 'response', 'variation', 'withdrawal', null, undefined, 'nonsense']) {
      expect(lifecycleStageToSubmissionType(stage), String(stage)).toBeNull();
    }
  });

  it('a withdrawal submission from records is not lettered as an initial IND', () => {
    const { input: ctx } = assembleCoverLetterContext({ submission: { productName: 'D', lifecycleStage: 'withdrawal' } });
    const m = assembleCoverLetter(ctx);
    expect(m.body).not.toContain('Initial Investigational New Drug Application');
    expect(m.body).not.toContain('we are submitting this initial Investigational New Drug Application');
    expect(m.gaps).toContain('submissionType');
  });

  it('a caller-stated type still wins over the records', () => {
    const { input: ctx } = assembleCoverLetterContext({
      submission: { productName: 'D', lifecycleStage: 'amendment' },
      overrides: { submissionType: 'protocol_amendment', protocolAmendmentTitles: ['Protocol Amendment: New Protocol'] },
    });
    expect(ctx.submissionType).toBe('protocol_amendment');
    expect(assembleCoverLetter(ctx).body).toContain('Protocol Amendment: New Protocol');
  });
});

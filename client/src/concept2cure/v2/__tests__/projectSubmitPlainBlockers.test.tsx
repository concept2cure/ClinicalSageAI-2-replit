// @vitest-environment jsdom
/**
 * Submit says what must close before dispatch in plain sentences, and the
 * header's verdict opens it (2026-10-31 client demo).
 *
 * The Submit step drew the readiness detail as the engine states it: rule ids
 * (STRUCTURAL_GATE_CLEAR), finding codes, and documents named by store and id
 * ("points at vault_documents 4e487967-…"). The header's "Dispatch blocked ·
 * N blockers" was words with nowhere to go. Now:
 *   - each thing to do is one sentence, a document named by its title, with the
 *     act that opens where it is done (MarketBlockers.tsx);
 *   - the rules, codes and ids stay, behind "Rule detail";
 *   - the header's verdict is a button that opens Submit at that market.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { findingSentence, MarketBlockers, marketTodos } from '../surfaces/MarketBlockers';
import { ProjectStatusLine } from '../surfaces/ProjectMarkets';
import { consumeNavParams } from '../navParams';
import type { DispatchReadinessAssessment, ProgramMarket, ProgramMarkets, ReadinessFinding, RuleView } from '../surfaces/programSequence';

const rule = (id: string, title: string): RuleView => ({
  id, title, category: 'structure', regions: ['fda'], severity: 'high', source: 'corpus', enforcement: 'enforced',
  enforcementStatement: 'Enforced here — this assessment checks it every time it runs.',
});
const UUID = '4e487967-04f7-4b87-ae52-85524e1b9687';
const FINDINGS: ReadinessFinding[] = [
  { severity: 'warning', code: 'DOCUMENT_NOT_APPROVED', sectionCode: 'm1.14.4.1',
    message: `Leaf "Investigator's Brochure v3.0" (m1.14.4.1) points at vault_documents ${UUID}, which is not yet approved (not reviewed).`,
    rule: rule('DOCUMENT_NOT_APPROVED', 'Every leaf’s source document is approved for transmission') },
  { severity: 'error', code: 'MISSING_REQUIRED_SECTION', sectionCode: '1.1',
    message: 'Required section 1.1 has no leaf in this sequence.', rule: rule('MISSING_REQUIRED_SECTION', 'Region-required Module 1 sections are present') },
  { severity: 'info', code: 'DUPLICATE_NEW_SECTION', sectionCode: 'm5.3.5.1', message: 'Section m5.3.5.1 has 2 leaves with operation "new".', rule: null },
];
const ASSESSMENT = {
  sequenceId: 905, region: 'us', sequenceStatus: 'assembling', validationErrors: 1, unacknowledgedShadowCriticals: 0,
  shadowReviewRunCount: 0, shadowReviewMissing: true, leafCount: 6,
  externalValidation: { configured: false, ran: false, errorCount: 0, cleared: true, blockers: [] },
  readiness: { errors: 1, warnings: 1, infos: 1, findings: FINDINGS },
  gates: [
    { key: 'structural', rule: rule('STRUCTURAL_GATE_CLEAR', 'No open error-severity finding'), cleared: false, blockers: ['1 open error-severity validation finding(s) must be resolved before dispatch.'] },
    { key: 'shadowPresence', rule: rule('SHADOW_REVIEW_COMPLETED', 'At least one Shadow Review has completed'), cleared: false, blockers: ['No completed Shadow Review has run for this sequence.'] },
    { key: 'releaseSignature', rule: rule('RELEASE_SIGNATURE_VALID', 'A valid release signature binds this package'), cleared: false, blockers: ['No dispatch-intent signature is recorded on ectd-sequence:2.'] },
  ],
  gate: { cleared: false, blockers: ['1 open error-severity finding.', 'No Shadow Review.', 'No release signature.'] },
} as unknown as DispatchReadinessAssessment;
const MARKET: ProgramMarket = {
  submission: { id: 61, title: 'ONC-221 IND', productName: null, applicationType: 'ind', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original' },
  read: { state: 'verdict', sequence: { id: 905, sequenceNumber: '0000', status: 'assembling' }, assessment: ASSESSMENT, gate: ASSESSMENT.gate! },
};
const markets = (m: ProgramMarket[]): ProgramMarkets => ({
  list: { rows: m.map((x) => x.submission), loading: false, error: undefined } as unknown as ProgramMarkets['list'],
  notOffered: null, markets: m, retryList: vi.fn(), retryMarket: vi.fn(),
});

afterEach(() => cleanup());

describe('what must close before dispatch, in words', () => {
  it('names a document by its title and never by its store and id', () => {
    const sentence = findingSentence(FINDINGS[0]);
    expect(sentence).toBe('Approve “Investigator\'s Brochure v3.0” (section 1.14.4.1). Only approved documents are released.');
    expect(sentence).not.toMatch(/vault_documents|4e487967|_/);
  });

  it('lists errors first, then approvals, then the other gates; infos are not things to close', () => {
    expect(marketTodos(MARKET, false).map((t) => t.text)).toEqual([
      'Place a document at section 1.1. This application requires it.',
      'Approve “Investigator\'s Brochure v3.0” (section 1.14.4.1). Only approved documents are released.',
      'Run Shadow Review on this sequence. A sequence no one has reviewed is not cleared for dispatch.',
      'Sign the release of this sequence. The release signature is applied on its Dispatch tab.',
    ]);
  });

  it('keeps rule ids and codes behind "Rule detail", and each act opens where it is done', () => {
    const onNav = vi.fn();
    render(<MarketBlockers m={MARKET} onNav={onNav} center />);
    const todo = screen.getByTestId('pj-market-todo');
    const list = todo.querySelector('.pj-mkt-todo-list') as HTMLElement;
    expect(list.textContent).not.toMatch(/STRUCTURAL_GATE_CLEAR|SHADOW_REVIEW_COMPLETED|MISSING_REQUIRED_SECTION|vault_documents|ectd-sequence:/);
    const details = todo.querySelector<HTMLElement & { open: boolean }>('details.pj-mkt-rules')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toMatch(/^Rule detail/);
    expect(details.textContent).toContain('STRUCTURAL_GATE_CLEAR');
    fireEvent.click(within(list).getByRole('button', { name: /Open Shadow Review/ }));
    expect(onNav).toHaveBeenCalledWith('submission-center');
    expect(consumeNavParams('submission-center')).toMatchObject({ submissionId: '61', sequenceId: '905', ws: 'shadow-review' });
  });
});

describe('the header’s verdict opens Submit at that market', () => {
  const reviews = { state: { data: { queue: [] }, loading: false, empty: true }, retry: vi.fn(), cap: 100, inReview: () => false };

  it('is a button, named for its market and where it goes', () => {
    const onOpenMarket = vi.fn();
    render(<ProjectStatusLine markets={markets([MARKET])} reviews={reviews as never} onOpenMarket={onOpenMarket} />);
    const verdict = screen.getByRole('button', { name: /IND · FDA \(US\).*Dispatch blocked · 3 blockers.*Open it on Submit/ });
    fireEvent.click(verdict);
    expect(onOpenMarket).toHaveBeenCalledExactlyOnceWith(61);
  });

  it('is words only where nothing opens it', () => {
    render(<ProjectStatusLine markets={markets([MARKET])} reviews={reviews as never} />);
    expect(screen.queryByRole('button', { name: /Dispatch blocked/ })).toBeNull();
    expect(screen.getByTestId('pj-status-line').textContent).toContain('Dispatch blocked · 3 blockers');
  });
});

/**
 * The protocol portfolio reports the expiration the committee recorded, and
 * labels a date it computed as computed.
 *
 * continuingReviewState preferred its own arithmetic over the stored date —
 * `s.expirationDate ?? row.expiration_date` — so an IACUC protocol the committee
 * approved for one year read as current until approval + 3 years, and an IRB
 * approval the board set to lapse at six months read as current until approval
 * + 1 year. Nothing said which dates were computed. It also used the deprecated
 * two-boolean helpers, so an IACUC approval with no approval date reported
 * annualReviewDue false ("no annual review due"), and an IRB submission with no
 * review type reported continuing review as not required. Pure; no DB.
 */
import { describe, it, expect } from 'vitest';
import { continuingReviewState, summarizePortfolio, type PortfolioProtocolRow } from '../protocol-portfolio-logic';

const TODAY = '2026-06-10';

const row = (over: Partial<PortfolioProtocolRow>): PortfolioProtocolRow => ({
  id: 1, protocol_number: 'P-1', title: 'A protocol', status: 'approved', approval_date: null, expiration_date: null, ...over,
});

describe('the committee’s recorded expiration wins over the computed one', () => {
  it('IACUC: a one-year approval the committee recorded is expired, not current until the 3-year de novo date', () => {
    const s = summarizePortfolio([row({ id: 10, approval_date: '2025-01-01', expiration_date: '2026-01-01' })], [], TODAY);
    const item = s.needsAttention.find((i) => i.id === 10);
    expect(item, 'the expired protocol is not in needsAttention').toBeDefined();
    expect(item).toMatchObject({ bucket: 'expired', expirationDate: '2026-01-01', expirationSource: 'recorded' });
    expect(s.counts.iacuc.expired).toBe(1);
  });

  it('IRB: a six-month approval the board recorded is expired, not due within 90 days of a computed year', () => {
    const s = summarizePortfolio([], [row({ id: 20, review_type: 'full_board', approval_date: '2025-09-01', expiration_date: '2026-03-01' })], TODAY);
    const item = s.needsAttention.find((i) => i.id === 20);
    expect(item).toMatchObject({ bucket: 'expired', expirationDate: '2026-03-01', expirationSource: 'recorded' });
  });

  it('a date the portfolio computed is labelled computed', () => {
    const s = summarizePortfolio(
      [row({ id: 11, approval_date: '2023-07-01' })],
      [row({ id: 21, review_type: 'full_board', approval_date: '2025-07-01' })],
      TODAY,
    );
    expect(s.needsAttention.find((i) => i.id === 11)).toMatchObject({ expirationDate: '2026-07-01', expirationSource: 'computed', bucket: 'due_30' });
    expect(s.needsAttention.find((i) => i.id === 21)).toMatchObject({ expirationDate: '2026-07-01', expirationSource: 'computed', bucket: 'due_30' });
  });
});

describe('what the record cannot say is not reported as "no"', () => {
  it('IACUC with no approval date: annual review is undetermined (null), not "not due"', () => {
    const st = continuingReviewState('iacuc', row({}), TODAY);
    expect(st.annualReviewDue).toBeNull();
    expect(st.expired).toBeNull();
    expect(st.expirationSource).toBe('none');
  });

  it('IRB with no review type recorded: whether continuing review applies is undetermined (null), not "not required"', () => {
    const st = continuingReviewState('irb', row({ review_type: null, approval_date: '2025-07-01' }), TODAY);
    expect(st.continuingReviewRequired).toBeNull();
    expect(st.expirationSource).toBe('none');
  });

  it('an undated item carries no annual-review verdict either', () => {
    const s = summarizePortfolio([row({ id: 12 })], [], TODAY);
    expect(s.counts.iacuc.undated).toBe(1);
    // undated items are not in needsAttention; the state itself says null
    expect(continuingReviewState('iacuc', row({ id: 12 }), TODAY).annualReviewDue).toBeNull();
  });
});

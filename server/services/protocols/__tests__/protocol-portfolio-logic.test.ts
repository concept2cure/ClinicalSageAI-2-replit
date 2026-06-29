/**
 * Protocol-portfolio analytics pure logic — expiration bucketing + portfolio
 * summary across IACUC + IRB. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import { expirationBucket, summarizePortfolio, type PortfolioProtocolRow } from '../protocol-portfolio-logic';

const TODAY = '2026-06-10';

describe('expirationBucket', () => {
  it('buckets by days remaining', () => {
    expect(expirationBucket('2026-01-01', TODAY)).toBe('expired');
    expect(expirationBucket('2026-06-10', TODAY)).toBe('expired'); // on the day
    expect(expirationBucket('2026-06-25', TODAY)).toBe('due_30');
    expect(expirationBucket('2026-08-15', TODAY)).toBe('due_90');
    expect(expirationBucket('2027-01-01', TODAY)).toBe('current');
    expect(expirationBucket(null, TODAY)).toBe('undated');
  });
});

describe('summarizePortfolio', () => {
  const iacuc: PortfolioProtocolRow[] = [
    // approved 2023-06-01 → de novo 3yr expiry 2026-06-01 → expired
    { id: 10, protocol_number: 'IA-1', title: 'Murine study', status: 'approved', approval_date: '2023-06-01', expiration_date: '2026-06-01', pain_category: 'D' },
    { id: 11, protocol_number: 'IA-2', title: 'Zebrafish', status: 'approved', approval_date: '2025-06-01', expiration_date: '2028-06-01', pain_category: 'C' },
  ];
  const irb: PortfolioProtocolRow[] = [
    // full_board approved 2025-07-01 → annual expiry 2026-07-01 → due_30
    { id: 20, protocol_number: 'IRB-1', title: 'Survey study', status: 'approved', approval_date: '2025-07-01', expiration_date: null, review_type: 'full_board', risk_level: 'greater_than_minimal' },
  ];

  it('counts buckets per committee and combined, and prioritizes needs-attention', () => {
    const s = summarizePortfolio(iacuc, irb, TODAY);
    expect(s.counts.iacuc.total).toBe(2);
    expect(s.counts.irb.total).toBe(1);
    expect(s.counts.combined.total).toBe(3);
    expect(s.counts.iacuc.expired).toBe(1);
    // Needs-attention: expired IACUC first, then the due_30 IRB.
    expect(s.needsAttention[0].committee).toBe('iacuc');
    expect(s.needsAttention[0].bucket).toBe('expired');
    expect(s.overdue.some((i) => i.id === 10)).toBe(true);
    expect(s.expiringSoon.some((i) => i.id === 20)).toBe(true);
    // Citations present.
    expect(s.needsAttention[0].citation).toMatch(/PHS Policy|45 CFR/);
  });

  it('handles an empty portfolio', () => {
    const s = summarizePortfolio([], [], TODAY);
    expect(s.counts.combined.total).toBe(0);
    expect(s.needsAttention).toHaveLength(0);
  });
});

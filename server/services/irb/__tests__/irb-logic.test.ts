/**
 * IRB deterministic logic (C2C-06) — review-pathway routing, the 45 CFR 46.111
 * approval-criteria gate, and Common Rule continuing review. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  recommendReviewType,
  evaluateIrbCompleteness,
  continuingReviewStatus,
  type IrbCompletenessInput,
} from '../irb-logic';

const ok: IrbCompletenessInput = {
  riskLevel: 'minimal',
  reviewType: 'expedited',
  involvesVulnerablePopulations: false,
  vulnerablePopulationProtections: null,
  isSingleIrb: false,
  consentWaiverRequested: false,
  approvedConsentCount: 1,
  siteCount: 1,
};

describe('recommendReviewType', () => {
  it('routes greater-than-minimal risk to full board', () => {
    expect(recommendReviewType({ riskLevel: 'greater_than_minimal' }).reviewType).toBe('full_board');
  });
  it('allows expedited for minimal risk fitting an expedited category', () => {
    expect(recommendReviewType({ riskLevel: 'minimal', fitsExpeditedCategory: true }).reviewType).toBe('expedited');
  });
  it('marks exempt when a minimal-risk exempt category applies', () => {
    expect(recommendReviewType({ riskLevel: 'minimal', fitsExemptCategory: true }).reviewType).toBe('exempt');
  });
});

describe('evaluateIrbCompleteness', () => {
  it('passes a clean expedited submission (low risk)', () => {
    expect(evaluateIrbCompleteness(ok).riskLevel).toBe('low');
  });
  it('flags missing consent without a waiver as critical', () => {
    const r = evaluateIrbCompleteness({ ...ok, approvedConsentCount: 0, consentWaiverRequested: false });
    expect(r.riskLevel).toBe('high');
    expect(r.findings.some((f) => /consent/i.test(f.message))).toBe(true);
  });
  it('accepts a consent waiver in lieu of a consent document', () => {
    const r = evaluateIrbCompleteness({ ...ok, approvedConsentCount: 0, consentWaiverRequested: true });
    expect(r.findings.some((f) => /consent document is present/i.test(f.message))).toBe(false);
  });
  it('requires safeguards when vulnerable populations are involved', () => {
    const r = evaluateIrbCompleteness({ ...ok, involvesVulnerablePopulations: true, vulnerablePopulationProtections: null });
    expect(r.riskLevel).toBe('high');
  });
  it('flags a multi-site study with no sIRB (medium)', () => {
    const r = evaluateIrbCompleteness({ ...ok, siteCount: 3, isSingleIrb: false });
    expect(r.findings.some((f) => /single IRB/i.test(f.message))).toBe(true);
    expect(r.riskLevel).toBe('medium');
  });
  it('flags greater-than-minimal risk reviewed as expedited (critical)', () => {
    const r = evaluateIrbCompleteness({ ...ok, riskLevel: 'greater_than_minimal', reviewType: 'expedited' });
    expect(r.riskLevel).toBe('high');
  });
});

describe('continuingReviewStatus', () => {
  it('requires annual continuing review for full board and expires after 1 year', () => {
    const r = continuingReviewStatus('full_board', '2025-01-01', '2026-06-10');
    expect(r.continuingReviewRequired).toBe(true);
    expect(r.expirationDate).toBe('2026-01-01');
    expect(r.expired).toBe(true);
  });
  it('does not require continuing review for expedited approvals', () => {
    const r = continuingReviewStatus('expedited', '2025-01-01', '2026-06-10');
    expect(r.continuingReviewRequired).toBe(false);
    expect(r.expired).toBe(false);
  });
});

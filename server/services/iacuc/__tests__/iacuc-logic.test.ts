/**
 * IACUC deterministic logic (C2C-05) — review-type routing, the 3 Rs /
 * category-E completeness gate, and continuing-review/expiration. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  USDA_PAIN_CATEGORIES,
  recommendReviewType,
  evaluateProtocolCompleteness,
  reviewStatus,
  addYears,
  type ProtocolCompletenessInput,
} from '../iacuc-logic';

const complete: ProtocolCompletenessInput = {
  painCategory: 'C',
  threeRsReplacement: 'No non-animal model reproduces the systemic immune response.',
  threeRsReduction: 'Power analysis fixes n=24 per arm.',
  threeRsRefinement: 'Humane endpoints; analgesia per veterinary protocol.',
  speciesCount: 1,
  plannedAnimalTotal: 48,
};

describe('USDA_PAIN_CATEGORIES', () => {
  it('encodes B/C/D/E with citations', () => {
    expect(USDA_PAIN_CATEGORIES.map((c) => c.category)).toEqual(['B', 'C', 'D', 'E']);
    expect(USDA_PAIN_CATEGORIES.find((c) => c.category === 'E')!.requiresScientificJustification).toBe(true);
  });
});

describe('recommendReviewType', () => {
  it('routes category E to full committee review', () => {
    expect(recommendReviewType('E').reviewType).toBe('full_committee_review');
  });
  it('allows DMR for non-E categories', () => {
    expect(recommendReviewType('C').reviewType).toBe('designated_member_review');
  });
});

describe('evaluateProtocolCompleteness', () => {
  it('passes a complete category-C protocol (low risk)', () => {
    expect(evaluateProtocolCompleteness(complete).riskLevel).toBe('low');
  });
  it('requires scientific justification for category E (high risk)', () => {
    const r = evaluateProtocolCompleteness({ ...complete, painCategory: 'E', painJustification: null });
    expect(r.riskLevel).toBe('high');
    expect(r.findings.some((f) => /scientific justification/i.test(f.message))).toBe(true);
  });
  it('requires an analgesia plan for category D (high risk when refinement missing)', () => {
    const r = evaluateProtocolCompleteness({ ...complete, painCategory: 'D', threeRsRefinement: null });
    expect(r.riskLevel).toBe('high');
  });
  it('flags missing 3 Rs as medium risk', () => {
    const r = evaluateProtocolCompleteness({ ...complete, threeRsReduction: null });
    expect(r.findings.some((f) => /Reduction/i.test(f.message))).toBe(true);
    expect(r.riskLevel).toBe('medium');
  });
  it('flags missing animal numbers', () => {
    const r = evaluateProtocolCompleteness({ ...complete, speciesCount: 0, plannedAnimalTotal: 0 });
    expect(r.findings.some((f) => /cohorts/i.test(f.message))).toBe(true);
  });
});

describe('reviewStatus / addYears', () => {
  it('adds years correctly', () => {
    expect(addYears('2023-06-10', 3)).toBe('2026-06-10');
  });
  it('expires a protocol 3 years after approval', () => {
    const r = reviewStatus('2023-01-01', '2026-06-10');
    expect(r.expirationDate).toBe('2026-01-01');
    expect(r.expired).toBe(true);
  });
  it('flags annual continuing review due within the 3-year window', () => {
    const r = reviewStatus('2025-01-01', '2026-06-10');
    expect(r.expired).toBe(false);
    expect(r.annualReviewDue).toBe(true);
  });
  it('returns nulls for an unapproved protocol', () => {
    expect(reviewStatus(null, '2026-06-10')).toEqual({ expirationDate: null, expired: false, annualReviewDue: false });
  });
});

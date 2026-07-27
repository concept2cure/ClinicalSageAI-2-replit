/**
 * Shared onboarding-ingest proposal contract — honesty helpers.
 * (shared/types/onboarding-ingest.ts)
 */
import { describe, it, expect } from 'vitest';
import {
  NEEDS_REVIEW_THRESHOLD,
  initialStatus,
  isCommittable,
  type OnboardingProposalField,
} from '../onboarding-ingest';

const field = (over: Partial<OnboardingProposalField>): OnboardingProposalField => ({
  id: 'p1',
  entity: 'org_profile',
  targetField: 'org_profile.name',
  label: 'Organization name',
  value: 'Meridian Therapeutics',
  extractedValue: 'Meridian Therapeutics',
  provenance: { file: 'profile.pdf', page: 1 },
  confidence: 0.9,
  status: 'approved',
  ...over,
});

describe('onboarding-ingest contract helpers', () => {
  it('flags low-confidence extractions for human review', () => {
    expect(initialStatus(NEEDS_REVIEW_THRESHOLD - 0.01)).toBe('needs_review');
    expect(initialStatus(NEEDS_REVIEW_THRESHOLD)).toBe('proposed');
    expect(initialStatus(0.95)).toBe('proposed');
  });

  it('commits ONLY human-approved, non-empty fields (the approval gate)', () => {
    expect(isCommittable(field({ status: 'approved' }))).toBe(true);
    expect(isCommittable(field({ status: 'proposed' }))).toBe(false);
    expect(isCommittable(field({ status: 'needs_review' }))).toBe(false);
    expect(isCommittable(field({ status: 'rejected' }))).toBe(false);
    // Approved but blank is never committed (no fabricated empty write).
    expect(isCommittable(field({ status: 'approved', value: '' }))).toBe(false);
    expect(isCommittable(field({ status: 'approved', value: null }))).toBe(false);
  });
});

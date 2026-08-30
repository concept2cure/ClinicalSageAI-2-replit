/**
 * Tests for validateDraftSection — exposes AnA's evidence-discipline check for a
 * user's draft text. Deterministic; no DB.
 */

import { describe, it, expect } from 'vitest';
import { validateDraftSection } from '../section-validation.js';

describe('validateDraftSection', () => {
  it('returns a well-formed snapshot for empty / trivial text', () => {
    const snap = validateDraftSection('');
    // attempted: FALSE. Empty (or sub-threshold) text is UNASSESSED, not
    // verified — the claim and label extractors want sentence structure, and
    // running them on a fragment produces noise rather than a verdict. This
    // used to return attempted+validated true with every count zero, which
    // rendered downstream as "Verified · 0 grounded · 0 sources" and drew a
    // green "Claims grounded" check on an answer the grounding pipeline had
    // never run on. Declining to judge is fine; reporting the declined
    // judgement as a pass is not.
    expect(snap.verdict.attempted).toBe(false);
    expect(snap.compliant).toBe(false);
    expect(typeof snap.compliant).toBe('boolean');
    expect(typeof snap.trustSummary).toBe('string');
    expect(snap.trustSummary.length).toBeGreaterThan(0);
  });

  it('flags an unsupported absolute overclaim as not compliant', () => {
    const text =
      'This therapy definitively cures the disease in all patients and absolutely guarantees ' +
      'complete elimination of every adverse event. It is proven beyond any doubt to be the ' +
      'safest and most effective treatment ever developed, with zero risk to any patient.';
    const snap = validateDraftSection(text);
    expect(snap.compliant).toBe(false);
    expect(snap.trustSummary).toMatch(/⚠/);
  });

  it('exposes the full verdict (counts) for a UI to render', () => {
    const snap = validateDraftSection('The product met the primary endpoint. [KNOWN]');
    expect(snap.verdict).toHaveProperty('grounded_claim_count');
    expect(snap.verdict).toHaveProperty('weak_or_ungrounded_claim_count');
    expect(snap.verdict).toHaveProperty('missing_support_count');
  });
});

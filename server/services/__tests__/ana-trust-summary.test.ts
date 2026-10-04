/**
 * Tests for buildTrustSummary — the human-readable one-line reliability summary
 * derived from an evidence verdict. Honest by construction: never upgrades
 * confidence beyond what the verdict states.
 */

import { describe, it, expect } from 'vitest';
import {
  buildTrustSummary,
  buildEmptyEvidenceVerdict,
  type EvidenceVerdict,
} from '../ana-ri/response-contract.js';

function verdict(p: Partial<EvidenceVerdict>): EvidenceVerdict {
  return { ...buildEmptyEvidenceVerdict(), attempted: true, provider: 'ana-ri', ...p };
}

describe('buildTrustSummary', () => {
  it('flags when no evidence check ran', () => {
    expect(buildTrustSummary(undefined)).toMatch(/not run/i);
    expect(buildTrustSummary(buildEmptyEvidenceVerdict())).toMatch(/not run/i);
  });

  // Until 2026-10-04 a clean set of labels read "Verified · 8 grounded · 5
  // sources". The labels are AnA describing her own claims, and their count
  // is not a count of sources anything read, so the line now says whose they
  // are. What was checked against sources leads, from the engine's check.
  it('reports clean labels as AnA\'s labels, not as "Verified", and not as sources', () => {
    const out = buildTrustSummary(
      verdict({ validated: true, grounded_claim_count: 8, weak_or_ungrounded_claim_count: 0, missing_support_count: 0, source_count: 5 })
    );
    expect(out).toBe("AnA's labels: 8 labelled · 0 unlabelled or overclaimed · 0 marked missing");
    expect(out).not.toMatch(/Verified|source/);
  });

  it('marks labels with caveats, and says how many claims need verification', () => {
    const out = buildTrustSummary(
      verdict({ validated: true, grounded_claim_count: 5, weak_or_ungrounded_claim_count: 2, missing_support_count: 0, source_count: 1 })
    );
    expect(out).toMatch(/^⚠ AnA's labels: 5 labelled · 2 unlabelled or overclaimed/);
    expect(out).toContain('2 claims need verification');
  });

  it('marks labels that did not pass', () => {
    const out = buildTrustSummary(
      verdict({ validated: false, grounded_claim_count: 1, weak_or_ungrounded_claim_count: 3, missing_support_count: 1, source_count: 0 })
    );
    expect(out).toMatch(/^⚠ AnA's labels/);
  });

  it('leads with the engine\'s check when there is one', () => {
    const check = {
      engine: 'answer-check/1',
      basis: 'sources' as const,
      claims: 5,
      checked: 5,
      found: 3,
      notFound: [{ kind: 'nct' as const, text: 'NCT09999999' }, { kind: 'figure' as const, text: '31%' }],
      unchecked: [],
      sources: ['tool:get_trial_details'],
      unreadable: [],
      verdicts: [{ text: 'is ready to file', reason: 'States a readiness verdict.' }],
    };
    const out = buildTrustSummary(undefined, check);
    expect(out).toBe(
      "⚠ Checked against this turn's sources: 2 of 5 claims not found. States a verdict; verdicts come from engines.",
    );
    expect(buildTrustSummary(undefined, { ...check, basis: 'no_sources', found: 0, checked: 0, notFound: [], unchecked: check.notFound, verdicts: [] }))
      .toBe('No source consulted this turn: 2 claims unchecked.');
  });

  it('appends the reviewer risk summary when present', () => {
    const out = buildTrustSummary(
      verdict({ validated: false, weak_or_ungrounded_claim_count: 1, reviewer_risk_summary: 'Endpoint claim lacks a pivotal-trial citation.' })
    );
    expect(out).toContain('Endpoint claim lacks a pivotal-trial citation.');
  });
});

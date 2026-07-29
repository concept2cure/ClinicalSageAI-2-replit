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

  it('reports Verified with no caveats when validated and fully grounded', () => {
    const out = buildTrustSummary(
      verdict({ validated: true, grounded_claim_count: 8, weak_or_ungrounded_claim_count: 0, missing_support_count: 0, source_count: 5 })
    );
    expect(out).toMatch(/^Verified ·/);
    expect(out).toContain('8 grounded');
    expect(out).toContain('5 sources');
    expect(out).not.toContain('⚠');
  });

  it('warns "with caveats" when validated but some claims are weak', () => {
    const out = buildTrustSummary(
      verdict({ validated: true, grounded_claim_count: 5, weak_or_ungrounded_claim_count: 2, missing_support_count: 0, source_count: 1 })
    );
    expect(out).toContain('⚠ Verified with caveats');
    expect(out).toContain('2 claims need verification');
    expect(out).toContain('1 source'); // singular
  });

  it('warns "Unverified" when validation did not pass', () => {
    const out = buildTrustSummary(
      verdict({ validated: false, grounded_claim_count: 1, weak_or_ungrounded_claim_count: 3, missing_support_count: 1, source_count: 0 })
    );
    expect(out).toMatch(/⚠ Unverified/);
  });

  it('appends the reviewer risk summary when present', () => {
    const out = buildTrustSummary(
      verdict({ validated: false, weak_or_ungrounded_claim_count: 1, reviewer_risk_summary: 'Endpoint claim lacks a pivotal-trial citation.' })
    );
    expect(out).toContain('Endpoint claim lacks a pivotal-trial citation.');
  });
});

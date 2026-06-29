/**
 * Unit tests for mapVerificationResult — the client-side parse of a
 * verify_docx_against_source tool result into the Document Studio
 * VerificationResult shape.
 */

import { describe, it, expect } from 'vitest';
import { mapVerificationResult } from '../useAnaChat';

describe('mapVerificationResult', () => {
  it('maps a passing verification', () => {
    const out = mapVerificationResult({
      ok: true,
      missingRequiredStrings: [],
      requiredStringsChecked: 3,
      divergence: { additions: 0, deletions: 0, summary: {} },
      message: 'Verified — document reproduces the source.',
    });
    expect(out).toEqual({
      ok: true,
      missingRequiredStrings: [],
      requiredStringsChecked: 3,
      divergence: { additions: 0, deletions: 0, summary: {} },
      message: 'Verified — document reproduces the source.',
    });
  });

  it('maps a failing verification with missing strings and divergence', () => {
    const out = mapVerificationResult({
      ok: false,
      missingRequiredStrings: ['CAPTION A', 'CAPTION B'],
      requiredStringsChecked: 2,
      divergence: { additions: 5, deletions: 2 },
    });
    expect(out?.ok).toBe(false);
    expect(out?.missingRequiredStrings).toEqual(['CAPTION A', 'CAPTION B']);
    expect(out?.divergence).toEqual({ additions: 5, deletions: 2 });
  });

  it('returns null for an error envelope', () => {
    expect(mapVerificationResult({ error: 'verify_docx_against_source failed: …' })).toBeNull();
  });

  it('returns null for null / non-object input', () => {
    expect(mapVerificationResult(null)).toBeNull();
    expect(mapVerificationResult(undefined)).toBeNull();
  });

  it('is defensive: tolerates missing/garbage fields', () => {
    const out = mapVerificationResult({ ok: 1 as unknown as boolean, missingRequiredStrings: 'nope' as unknown as string[] });
    expect(out).toEqual({
      ok: true,
      missingRequiredStrings: [],
      requiredStringsChecked: undefined,
      divergence: undefined,
      message: undefined,
    });
  });
});

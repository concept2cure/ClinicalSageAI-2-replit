/**
 * No shared module offers "typical" enrollment ranges nobody sourced.
 * 2026-10-15.
 *
 * shared/constants/domain/mappings/phase-enrollment.ts held enrollment ranges
 * by phase and therapeutic area — "phase 3 oncology: min 200, typical 500,
 * max 2000", a { min: 10, typical: 100, max: 5000 } fallback for anything
 * unlisted — with no source, and isEnrollmentUnusual() flagged a sample size
 * 'low' or 'high' against them. Nothing but its own test imported it, so it
 * is deleted rather than labelled: a figure with no source is not a
 * benchmark.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('enrollment ranges', () => {
  it('the domain mappings export no enrollment range or "unusual enrollment" verdict', async () => {
    const mappings = await import('../mappings');
    expect(Object.keys(mappings)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/enrollment/i)]),
    );
  });

  it('the module is gone', () => {
    expect(existsSync(path.resolve(__dirname, '../mappings/phase-enrollment.ts'))).toBe(false);
  });
});

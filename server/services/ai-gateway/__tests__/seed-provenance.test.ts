/**
 * Every generation must record the sampling seed that produced it — and only
 * when that seed actually reached the provider.
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 * `seed` was plumbed the whole way — GatewayRequest → provider params → the
 * ai.gateway_audit_log column — and no caller ever set one, so the column was
 * structurally NULL on every row. The ledger's "Reproducibility" heading
 * described a field that could not describe anything.
 *
 * ── The second, subtler defect ───────────────────────────────────────────────
 * The ledger recorded `request.seed`: what the caller ASKED for. Anthropic's
 * API has no seed parameter and the Anthropic paths never set one, so a
 * caller-supplied seed on an Anthropic call was written into the provenance row
 * having never been transmitted. That is the same defect already fixed for
 * `temperature` (recorded for reasoning-only models that reject sampling): a
 * row that reads as reproducible while naming a parameter with no effect.
 *
 * The rule these tests pin: record what was SENT, not what was requested.
 */

import { describe, it, expect } from 'vitest';
import { resolveSeedForTest as resolveSeed } from '../gateway';

describe('resolveSeed', () => {
  it('honours a caller-supplied seed exactly', () => {
    expect(resolveSeed(12345)).toBe(12345);
    expect(resolveSeed(0)).toBe(0);
  });

  it('mints a seed when the caller supplies none', () => {
    const s = resolveSeed(undefined);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    // Signed 32-bit positive range: OpenAI documents seed as an integer, and
    // staying inside 2^31-1 avoids any 64-bit round-tripping question at the
    // JSON boundary.
    expect(s).toBeLessThanOrEqual(2 ** 31 - 1);
  });

  it('varies between calls — a constant seed would freeze Regenerate', () => {
    // Reproducibility means "this generation can be replayed", not "every
    // generation is identical". A fixed or prompt-derived seed would hand a
    // user the same draft every time they pressed Regenerate.
    const seeds = new Set(Array.from({ length: 25 }, () => resolveSeed(undefined)));
    expect(seeds.size).toBeGreaterThan(1);
  });

  it('ignores a non-finite requested seed rather than transmitting garbage', () => {
    expect(Number.isInteger(resolveSeed(Number.NaN))).toBe(true);
    expect(Number.isInteger(resolveSeed(Number.POSITIVE_INFINITY))).toBe(true);
  });
});

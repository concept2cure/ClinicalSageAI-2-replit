/**
 * The server-side reason floor (21 CFR 11.10(e)). Shown failing first: before
 * this helper existed, the section-save, freeze and review-verdict routes
 * accepted any string or none — the cases below that expect a refusal are the
 * cases that used to pass through to the ledger.
 */
import { describe, expect, it } from 'vitest';
import {
  GOVERNED_REASON_MIN,
  optionalGovernedReason,
  requireGovernedReason,
} from '../governed-reason';

describe('requireGovernedReason', () => {
  it('refuses a missing reason', () => {
    for (const v of [undefined, null, '', '   ']) {
      const r = requireGovernedReason(v);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/at least 8 characters/);
    }
  });

  it('refuses a reason shorter than the floor, counting trimmed characters', () => {
    const r = requireGovernedReason('  short ');
    expect(r.ok).toBe(false);
  });

  it('refuses a non-string (an object or number is not a reason)', () => {
    expect(requireGovernedReason({ text: 'Corrected the dosage table' }).ok).toBe(false);
    expect(requireGovernedReason(12345678).ok).toBe(false);
  });

  it('accepts a reason at the floor and returns it trimmed', () => {
    const r = requireGovernedReason('  Typo fix  ');
    expect(r).toEqual({ ok: true, reason: 'Typo fix' });
    expect('Typo fix'.length).toBe(GOVERNED_REASON_MIN);
  });

  it('never substitutes a placeholder', () => {
    const r = requireGovernedReason('');
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/frozen for compliance|via AnA/i);
  });
});

describe('optionalGovernedReason', () => {
  it('treats absent as null, not as a failure', () => {
    expect(optionalGovernedReason(undefined)).toEqual({ ok: true, reason: null });
    expect(optionalGovernedReason('')).toEqual({ ok: true, reason: null });
  });

  it('applies the same floor when a reason is given', () => {
    expect(optionalGovernedReason('meh').ok).toBe(false);
    expect(optionalGovernedReason('Looks good to me')).toEqual({ ok: true, reason: 'Looks good to me' });
  });
});

/**
 * Annual subscriptions must charge for a year.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * Both checkout paths computed a MONTHLY amount, applied the annual discount to
 * it, and handed the result to Stripe with `recurring: { interval: 'year' }`.
 * An annual subscriber was charged one discounted month, once a year.
 *
 * At $459/seat with a 15% annual discount and 5 seats, that is $1,950.75 a year
 * against $23,409 intended. The customer is not overcharged — the business is
 * simply not paid, and nothing anywhere reports an error, because Stripe accepts
 * whatever amount it is given.
 *
 * ── Why it survived reading ───────────────────────────────────────────────────
 * Every individual line is correct. `unitAmount = perUser * seats` is right.
 * `unitAmount * (1 - pct/100)` is right. `interval: 'year'` is right. The error
 * exists only in the relationship between the amount and the interval, and those
 * two sat forty lines apart, in two functions, neither of which is wrong on its
 * own terms.
 *
 * ── Why this is a unit test and not an integration test ───────────────────────
 * An integration test against Stripe would have passed. Stripe has no opinion
 * about whether $162.52 is a plausible year of service — it charges what it is
 * told. The only place this is checkable is the arithmetic, in cents, which is
 * why `amountForInterval` was extracted rather than fixed in place.
 */

import { describe, it, expect } from 'vitest';
import { amountForInterval } from '../billing';

describe('amountForInterval', () => {
  it('monthly is unchanged', () => {
    expect(amountForInterval(45900, 'monthly', 15)).toBe(45900);
  });

  it('annual charges twelve months, discounted — not one', () => {
    // $459/mo × 12 = $5,508; less 15% = $4,681.80
    expect(amountForInterval(45900, 'annual', 15)).toBe(468180);
  });

  it('the old behaviour is now impossible to produce', () => {
    // 45900 × 0.85 = 39,015 — the amount the previous code sent for a YEAR.
    // Naming it here means a future "simplification" back to it fails loudly
    // rather than quietly costing 91.7% of the revenue.
    expect(amountForInterval(45900, 'annual', 15)).not.toBe(39015);
  });

  it('a year costs more than a month, for every tier and discount in the table', () => {
    // The property that actually matters, stated as a property. Any arithmetic
    // that violates it is wrong however plausible its individual lines look.
    for (const monthly of [29900, 34900, 39900, 45900]) {
      for (const pct of [0, 10, 15, 20, 25]) {
        const annual = amountForInterval(monthly, 'annual', pct);
        expect(
          annual,
          `a year at $${(monthly / 100).toFixed(2)}/mo with ${pct}% off came to ${annual} cents — under one month`,
        ).toBeGreaterThan(monthly);
      }
    }
  });

  it('the discount is a discount, not a multiplier — annual never exceeds 12 months', () => {
    // The other direction. Overcharging a customer by 12× is the failure mode a
    // careless fix to the above would produce, and it is worse than undercharging.
    for (const monthly of [29900, 45900]) {
      for (const pct of [0, 15, 25]) {
        expect(amountForInterval(monthly, 'annual', pct)).toBeLessThanOrEqual(monthly * 12);
      }
    }
  });

  it('zero discount is exactly twelve months', () => {
    expect(amountForInterval(29900, 'annual', 0)).toBe(29900 * 12);
  });
});

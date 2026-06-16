/**
 * Regression tests for PowerSampleSizeService.calculateProportionSampleSize.
 *
 * The arcsin (variance-stabilizing) two-proportion sample size is
 *   n_per_group = (1 + 1/ratio) * (z_alpha + z_beta)^2
 *                 / (4 * (arcsin√p1 - arcsin√p2)^2)
 * because Var(arcsin(√p_hat)) = 1/(4n). Dropping the factor of 4 in the
 * denominator overstates the required N four-fold, materially mis-sizing any
 * binary-endpoint trial. These tests pin the textbook reference value.
 */

import { describe, it, expect } from 'vitest';
import { PowerSampleSizeService } from '../power-sample-size-service';

describe('PowerSampleSizeService.calculateProportionSampleSize (arcsin)', () => {
  const svc = new PowerSampleSizeService();

  it('matches the textbook per-group N for p1=0.6, p2=0.4, alpha=0.05, power=0.80', () => {
    // arcsin diff = asin(√0.6) - asin(√0.4) = 0.201358...
    // n = 2 * (1.95996 + 0.84162)^2 / (4 * 0.201358^2) = 96.79 -> 97 per group.
    // Agrees with the pooled normal-approximation answer (97 per group).
    const { n1, n2, total } = svc.calculateProportionSampleSize(0.6, 0.4, 0.05, 0.8);
    expect(n1).toBe(97);
    expect(n2).toBe(97);
    expect(total).toBe(194);
  });

  it('scales correctly with the allocation ratio', () => {
    // ratio = 2: n1 = (1 + 1/2) * (za+zb)^2 / (4 d^2) = 72.59 -> 73; n2 = 2*n1 = 146.
    const r2 = svc.calculateProportionSampleSize(0.6, 0.4, 0.05, 0.8, 2);
    expect(r2.n1).toBe(73);
    expect(r2.n2).toBe(146);
  });

  it('does not overstate N by the missing factor of 4', () => {
    // Guards against regressing to the un-divided denominator (which returned 388).
    const { n1 } = svc.calculateProportionSampleSize(0.6, 0.4, 0.05, 0.8);
    expect(n1).toBeLessThan(150);
  });
});

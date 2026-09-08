/**
 * Process capability over recorded batch results (ICH Q6A specifications;
 * capability indices per ISO 22514 / the PhRMA CMC statistics guidance).
 *
 * The register carries a series of batch results and the specification's
 * acceptance criterion; these pin the indices and, as much as the numbers,
 * every case where the analysis must REFUSE rather than answer.
 */
import { describe, expect, it } from 'vitest';

import { assessProcessCapability } from '../process-capability';
import { parseAcceptanceCriterion } from '../recorded-stability';

const twoSided = parseAcceptanceCriterion(['95.0 - 105.0%'])!;
const upperOnly = parseAcceptanceCriterion(['NMT 0.5%'])!;
const lowerOnly = parseAcceptanceCriterion(['NLT 98.0%'])!;

const batches = (values: number[]) => values.map((value, i) => ({ batch: `B-${String(i + 1).padStart(3, '0')}`, value }));

describe('assessProcessCapability — the indices', () => {
  it('computes Pp/Ppk from the overall sd and Cp/Cpk from the moving-range sd on a two-sided criterion', () => {
    // Ten assay results centred at 100.0 with sd 1.0 on 95-105 → Pp = 10/6 ≈ 1.67.
    const values = [99.0, 101.0, 100.5, 99.5, 100.0, 101.5, 98.5, 100.0, 99.0, 101.0];
    const r = assessProcessCapability(batches(values), twoSided);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.n).toBe(10);
    expect(r.mean).toBeCloseTo(100.0, 6);
    expect(r.limits).toEqual({ lower: 95, upper: 105 });
    expect(r.pp).toBeCloseTo((105 - 95) / (6 * r.sdOverall), 3);
    expect(r.ppk).toBeCloseTo(Math.min((105 - r.mean) / (3 * r.sdOverall), (r.mean - 95) / (3 * r.sdOverall)), 3);
    expect(r.cp).toBeCloseTo((105 - 95) / (6 * r.sdWithin), 3);
    expect(r.cpk).toBeCloseTo(Math.min((105 - r.mean) / (3 * r.sdWithin), (r.mean - 95) / (3 * r.sdWithin)), 3);
    // Moving-range sigma = mean(|x_i - x_{i-1}|) / d2(2) = MRbar / 1.128.
    const mr = values.slice(1).map((v, i) => Math.abs(v - values[i]));
    expect(r.sdWithin).toBeCloseTo(mr.reduce((a, b) => a + b, 0) / mr.length / 1.128, 6);
    expect(r.batchesOutOfSpecification).toEqual([]);
  });

  it('reports the one-sided index only, on the side the criterion has', () => {
    const upper = assessProcessCapability(batches([0.10, 0.12, 0.09, 0.11, 0.13, 0.10, 0.12, 0.11]), upperOnly);
    if (!upper.ok) throw new Error(upper.message);
    expect(upper.limits).toEqual({ lower: null, upper: 0.5 });
    expect(upper.cp).toBeNull();
    expect(upper.pp).toBeNull();
    expect(upper.cpk).toBeCloseTo((0.5 - upper.mean) / (3 * upper.sdWithin), 3);
    expect(upper.ppk).toBeCloseTo((0.5 - upper.mean) / (3 * upper.sdOverall), 3);

    const lower = assessProcessCapability(batches([99.1, 99.4, 99.0, 99.6, 99.2, 99.3, 99.5, 99.1]), lowerOnly);
    if (!lower.ok) throw new Error(lower.message);
    expect(lower.limits).toEqual({ lower: 98, upper: null });
    expect(lower.ppk).toBeCloseTo((lower.mean - 98) / (3 * lower.sdOverall), 3);
  });

  it('names the batches outside the specification and does not pretend capability over them', () => {
    const r = assessProcessCapability(batches([100, 101, 99, 100, 106, 100, 99, 101]), twoSided);
    if (!r.ok) throw new Error(r.message);
    expect(r.batchesOutOfSpecification).toEqual(['B-005']);
    expect(r.verdict).toBe('not-capable');
  });

  it('grades capability against the conventional 1.33 and 1.0 thresholds', () => {
    // sd ≈ 0.3 on ±5 → Ppk well above 1.33.
    const capable = assessProcessCapability(batches([100.0, 100.3, 99.7, 100.2, 99.8, 100.1, 99.9, 100.4, 99.6, 100.0]), twoSided);
    if (!capable.ok) throw new Error(capable.message);
    expect(capable.verdict).toBe('capable');
    // sd ≈ 2.3 on ±5 → Ppk below 1.0.
    const marginal = assessProcessCapability(batches([97, 103, 98, 102, 97.5, 102.5, 98.5, 101.5, 96.5, 103.5]), twoSided);
    if (!marginal.ok) throw new Error(marginal.message);
    expect(marginal.verdict).toBe('not-capable');
    expect(marginal.ppk).toBeLessThan(1.0);
  });

  it('marks an estimate on fewer than 25 batches as preliminary, and says so', () => {
    const r = assessProcessCapability(batches([99, 101, 100, 100, 99, 101, 100, 100]), twoSided);
    if (!r.ok) throw new Error(r.message);
    expect(r.preliminary).toBe(true);
    expect(r.notes.join(' ')).toMatch(/preliminary/i);
    const many = assessProcessCapability(batches(Array.from({ length: 30 }, (_, i) => 100 + ((i % 5) - 2) * 0.4)), twoSided);
    if (!many.ok) throw new Error(many.message);
    expect(many.preliminary).toBe(false);
  });
});

describe('assessProcessCapability — refusals', () => {
  it('refuses fewer than six batches rather than reporting an index over noise', () => {
    const r = assessProcessCapability(batches([100, 101, 99, 100, 100]), twoSided);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('INSUFFICIENT_BATCHES');
  });

  it('refuses without a criterion, and says the specification is what is missing', () => {
    const r = assessProcessCapability(batches([100, 101, 99, 100, 100, 101, 99, 100]), null);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('CRITERION_NOT_RECORDED');
  });

  it('refuses a series with no variation: a capability index over zero sigma is not a number', () => {
    const r = assessProcessCapability(batches([100, 100, 100, 100, 100, 100, 100]), twoSided);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('NO_VARIATION');
  });

  it('drops non-numeric results and names them, refusing if too few remain', () => {
    const r = assessProcessCapability(
      [
        { batch: 'B-001', value: 100 }, { batch: 'B-002', value: Number.NaN }, { batch: 'B-003', value: 101 },
        { batch: 'B-004', value: 99 }, { batch: 'B-005', value: 100 }, { batch: 'B-006', value: 101 },
        { batch: 'B-007', value: 99.5 },
      ],
      twoSided,
    );
    if (!r.ok) throw new Error(r.message);
    expect(r.n).toBe(6);
    expect(r.excludedBatches).toEqual(['B-002']);
  });
});

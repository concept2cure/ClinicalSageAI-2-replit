/**
 * A device precedent search reaches the FDA registry, and says so when it cannot.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Strategy 2 of `precedentEngine.search` — the cleared-510(k) universe — ran a
 * SELECT against `predicate.fda_510k_clearances` LEFT JOINed to
 * `predicate.fda_product_codes`. No migration in this repository creates either
 * relation and nothing writes to either; the only other mentions of the names
 * are in CI scripts that parse SQL looking for table references. So the query
 * raised `relation ... does not exist` on every call, the catch turned that
 * into `[]`, and the surface reported "no precedents".
 *
 * Searching product code BZH — one of the most cleared Class II codes in CDRH
 * history — returned zero. Not because the FDA has no BZH clearances, but
 * because the query could never succeed, and its failure was rendered as an
 * empty result (MDX_WORK_ORDER W2-8).
 *
 * ── What is guarded here ─────────────────────────────────────────────────────
 *   1. a device search actually reaches the FDA 510(k) registry, and real
 *      clearances come back as precedents;
 *   2. it does NOT go to the database for them — the relation is gone, and a
 *      regression that reinstated it would silently return zero again;
 *   3. an unreachable registry is REPORTED, never rendered as "no precedents";
 *   4. a drug submission type does not consult the device registry at all, and
 *      says that rather than claiming a clean answer;
 *   5. the eight existing `search()` callers still get a plain array.
 *
 * The openFDA client is stubbed: this is about the wiring, not about the FDA's
 * uptime. The client itself is honest by construction and separately covered.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.hoisted(() => vi.fn());
const openFda = vi.hoisted(() => vi.fn());

vi.mock('../../db.js', () => ({ pool: { query } }));
vi.mock('../../utils/logger', () => ({
  createScopedLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../integrations/openfda-device-client', () => ({
  search510kClearances: openFda,
}));

import { precedentEngine } from '../precedent-engine';

/** Two real BZH clearances, in the shape the openFDA client returns. */
const BZH_HITS = [
  {
    kNumber: 'K183282',
    deviceName: 'Dexcom G6 Continuous Glucose Monitoring System',
    applicant: 'Dexcom, Inc.',
    productCode: 'BZH',
    decisionDate: '20190329',
    decisionCode: 'SE',
    clearanceType: 'Traditional',
  },
  {
    kNumber: 'K162489',
    deviceName: 'FreeStyle Libre Flash Glucose Monitoring System',
    applicant: 'Abbott Diabetes Care Inc.',
    productCode: 'BZH',
    decisionDate: '20170927',
    decisionCode: 'SE',
    clearanceType: 'Traditional',
  },
];

const BZH = { submissionType: '510(k)', productCode: 'BZH', limit: 10 } as any;

beforeEach(() => {
  query.mockReset();
  openFda.mockReset();
  // Every other strategy's table is absent in this environment, exactly as it
  // is in a fresh one. The registry result must stand on its own.
  query.mockRejectedValue(new Error('relation does not exist'));
});

describe('a 510(k) search reaches the FDA registry', () => {
  it('returns the registry clearances for product code BZH', async () => {
    openFda.mockResolvedValue({ available: true, results: BZH_HITS, source: 'openfda' });

    const { records, registry } = await precedentEngine.searchWithSources(BZH);

    // The whole point: BZH is not zero.
    expect(records.length).toBe(2);
    expect(records.map((r) => r.clearanceNumber)).toEqual(['K183282', 'K162489']);
    expect(records[0].applicant).toBe('Dexcom, Inc.');
    expect(records[0].sourceType).toBe('FDA_510k');
    // SE is a clearance; the code is translated, not echoed.
    expect(records[0].decisionOutcome).toBe('CLEARED');
    // openFDA dates are YYYYMMDD and must not reach a reader in that form.
    expect(records[0].decisionDate).toBe('2019-03-29');

    expect(registry).toMatchObject({ consulted: true, available: true, resultCount: 2 });
    expect(openFda).toHaveBeenCalledWith(expect.objectContaining({ productCode: 'BZH' }));
  });

  it('does not look for clearances in the database', async () => {
    openFda.mockResolvedValue({ available: true, results: BZH_HITS, source: 'openfda' });
    await precedentEngine.searchWithSources(BZH);

    // The relation that could never exist must not be asked for again. Without
    // this, a regression that restored the SELECT would look identical from the
    // outside — zero clearances, no error — which is how it went unnoticed.
    const sql = query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).not.toContain('predicate.fda_510k_clearances');
    expect(sql).not.toContain('predicate.fda_product_codes');
  });

  it('keeps the records-only search() signature its callers depend on', async () => {
    openFda.mockResolvedValue({ available: true, results: BZH_HITS, source: 'openfda' });
    const records = await precedentEngine.search(BZH);
    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBe(2);
  });
});

describe('an unreachable registry is reported, never rendered as an empty result', () => {
  it('carries the reason out instead of swallowing it', async () => {
    openFda.mockResolvedValue({
      available: false,
      unavailableReason: 'openFDA device/510k timed out after 10000ms',
      results: [],
      source: 'openfda',
    });

    const { records, registry } = await precedentEngine.searchWithSources(BZH);

    expect(records).toEqual([]);
    expect(registry.consulted).toBe(true);
    expect(registry.available).toBe(false);
    expect(registry.reason).toContain('timed out');
  });

  it('an available registry with no match is NOT the same state', async () => {
    openFda.mockResolvedValue({ available: true, results: [], source: 'openfda' });
    const { records, registry } = await precedentEngine.searchWithSources(BZH);

    expect(records).toEqual([]);
    // Same empty array, opposite meaning — this is the distinction the surface
    // renders, and the reason the status is returned rather than logged.
    expect(registry.available).toBe(true);
    expect(registry.resultCount).toBe(0);
  });
});

describe('the registry is only consulted where it applies', () => {
  it('is not consulted for a drug submission, and says so', async () => {
    const { registry } = await precedentEngine.searchWithSources({
      submissionType: 'NDA',
      indication: 'Type 2 diabetes',
    } as any);

    expect(openFda).not.toHaveBeenCalled();
    expect(registry.consulted).toBe(false);
    expect(registry.available).toBe(false);
    expect(registry.reason).toMatch(/device submissions/i);
  });

  it('is not consulted when there is nothing to search it by', async () => {
    const { registry } = await precedentEngine.searchWithSources({
      submissionType: '510(k)',
      therapeuticArea: 'Cardiovascular',
    } as any);

    // A device pathway, but no product code and no device name: openFDA needs
    // one of them. Saying "consulted, found nothing" here would be a lie.
    expect(openFda).not.toHaveBeenCalled();
    expect(registry.consulted).toBe(false);
    expect(registry.reason).toMatch(/product code or device name/i);
  });
});

/* ── The claim check ─────────────────────────────────────────────────────────
 *
 * `supported: false` carried two unrelated meanings — "precedents were
 * consulted and they do not support this" and "nothing was consulted" — and the
 * surface rendered both as the same words. With the corpus structurally empty,
 * every claim came back looking adjudicated against. `basis` separates them.
 */
describe('a claim checked against nothing is not a claim that failed', () => {
  it('reports no-precedents rather than "not supported" when nothing was consulted', async () => {
    openFda.mockResolvedValue({ available: true, results: [], source: 'openfda' });
    const r = await precedentEngine.checkClaim('The device is substantially equivalent.', {
      submissionType: '510(k)',
      indication: 'Continuous glucose monitoring',
    });

    expect(r.basis).toBe('no-precedents');
    expect(r.precedents).toEqual([]);
    // The reasoning must say it was not assessed, not that it was rejected.
    expect(r.recommendation).toMatch(/not been assessed|has not been assessed either way/i);
  });

  it('names the unreachable registry as the reason it could not check', async () => {
    openFda.mockResolvedValue({
      available: false,
      unavailableReason: 'openFDA device/510k timed out after 10000ms',
      results: [],
      source: 'openfda',
    });
    const r = await precedentEngine.checkClaim('Substantially equivalent to the predicate.', {
      submissionType: '510(k)',
      productCode: 'BZH',
    });

    expect(r.basis).toBe('no-precedents');
    expect(r.recommendation).toContain('timed out');
    expect(r.recommendation).toContain('unchecked');
  });

  it('returns the precedents it checked against, so the reader can look at them', async () => {
    openFda.mockResolvedValue({ available: true, results: BZH_HITS, source: 'openfda' });
    const r = await precedentEngine.checkClaim('Substantially equivalent to the predicate device.', {
      submissionType: '510(k)',
      productCode: 'BZH',
    });

    expect(r.basis).toBe('checked');
    expect(r.precedents.length).toBeGreaterThan(0);
    expect(r.precedents[0].clearanceNumber).toBe('K183282');
    // Reasoning, not a bare verdict.
    expect(r.recommendation.length).toBeGreaterThan(20);
  });
});

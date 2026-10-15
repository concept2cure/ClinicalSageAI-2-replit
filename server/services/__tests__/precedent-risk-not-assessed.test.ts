/**
 * A risk analysis that could read nothing is not "low risk".
 *
 * analyzeRisk's three sources — historical objections, predicate safety
 * signals, toxic predicates — each swallowed a failed read and answered
 * "none found", so an analysis that read nothing reported 'low', score 0,
 * "No risk factors identified". The historical-objection store is not on any
 * deploy path, so that read fails in production every time.
 *
 * Also: a 510(k) registry match carried a constant 0.5 similarity, shown on
 * the board as a 50% match, and every historical objection a constant 0.7.
 *
 * The database and the openFDA client are the only things replaced.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const H = vi.hoisted(() => ({ query: vi.fn(), openFda: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query: H.query } }));
vi.mock('../../utils/logger', () => ({
  createScopedLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../integrations/openfda-device-client', () => ({ search510kClearances: H.openFda }));

import { precedentEngine } from '../precedent-engine';

const DEVICE = { submissionType: '510(k)', productCode: 'BZH', deviceName: 'glucose monitor' } as never;
const unreadable = () => Object.assign(new Error('relation does not exist'), { code: '42P01' });

beforeEach(() => {
  H.query.mockReset();
  H.openFda.mockReset();
});

describe('analyzeRisk', () => {
  it('is not assessed when no source could be read', async () => {
    H.query.mockRejectedValue(unreadable());
    const r = await precedentEngine.analyzeRisk(DEVICE);
    expect(r).toMatchObject({ overallRisk: 'not_assessed', riskScore: null, factors: [] });
    expect(r.sources).toEqual({
      adversarialPrecedents: { notRead: expect.stringMatching(/could not be read/) },
      safetySignals: { notRead: expect.stringMatching(/could not be read/) },
      toxicPredicates: { notRead: expect.stringMatching(/could not be read/) },
    });
  });

  it('is not assessed when the only applicable source failed and the others do not apply', async () => {
    H.query.mockRejectedValue(unreadable());
    const r = await precedentEngine.analyzeRisk({ submissionType: 'NDA' } as never);
    expect(r.overallRisk).toBe('not_assessed');
    expect(r.sources.safetySignals).toEqual({ notRead: 'no product code or device name to match on' });
    expect(r.sources.toxicPredicates).toEqual({ notRead: 'applies to a 510(k) with a product code' });
  });

  it('reads as low only over sources that were read and found nothing', async () => {
    H.query.mockImplementation(async (sql: string) =>
      /COUNT\(\*\)/.test(sql) ? { rows: [{ count: '0' }] } : { rows: [] });
    const r = await precedentEngine.analyzeRisk(DEVICE);
    expect(r).toMatchObject({ overallRisk: 'low', riskScore: 0 });
    expect(r.sources).toEqual({ adversarialPrecedents: 'read', safetySignals: 'read', toxicPredicates: 'read' });
  });

  it('scores what it read when one source failed, and says which', async () => {
    H.query.mockImplementation(async (sql: string) => {
      if (/regulatory_adversarial_precedents/.test(sql)) throw unreadable();
      if (/predicate_safety_signals/.test(sql)) {
        return { rows: [{ k_number: 'K1', device_name: 'G6', signal_type: 'recall', severity_score: 0.9, description: 'Class I recall' }] };
      }
      return { rows: [{ count: '0' }] };
    });
    const r = await precedentEngine.analyzeRisk(DEVICE);
    expect(r.factors.map((f) => f.category)).toEqual(['Safety Signal History']);
    expect(r.overallRisk).toBe('critical');
    expect(r.sources.adversarialPrecedents).toEqual({ notRead: expect.any(String) });
  });
});

describe('figures nothing measured', () => {
  it('a historical objection carries no similarity', async () => {
    H.query.mockImplementation(async (sql: string) =>
      /regulatory_adversarial_precedents/.test(sql)
        ? { rows: [{ historical_question: 'Justify the predicate', agency_code: 'FDA', failure_mode: 'Clinical Gap' }] }
        : /COUNT\(\*\)/.test(sql) ? { rows: [{ count: '0' }] } : { rows: [] });
    const r = await precedentEngine.analyzeRisk(DEVICE);
    expect(r.historicalObjections).toHaveLength(1);
    expect(r.historicalObjections[0]).not.toHaveProperty('similarity');
  });

  it('a 510(k) registry match carries no similarity score', async () => {
    H.query.mockResolvedValue({ rows: [] });
    H.openFda.mockResolvedValue({
      available: true,
      results: [{ kNumber: 'K183282', deviceName: 'Dexcom G6', applicant: 'Dexcom', productCode: 'BZH', decisionDate: '20190329', decisionCode: 'SE', clearanceType: 'Traditional' }],
    });
    const records = await precedentEngine.search({ submissionType: '510(k)', productCode: 'BZH', limit: 5 } as never);
    expect(records.map((p) => p.clearanceNumber)).toContain('K183282');
    expect(records.find((p) => p.clearanceNumber === 'K183282')?.similarityScore).toBeUndefined();
  });
});

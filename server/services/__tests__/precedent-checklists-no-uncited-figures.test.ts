/**
 * The precedent engine's CRL, RTF, EMA and advisory-committee answers are
 * curated checklists, and say so.
 *
 * AnA's analyze_crl_triggers (launch scope) answered "Identified risk factors
 * based on regulatory precedents" over a 34% "historical rate", a 0.92
 * confidence and "high" overall CRL risk — none with a cited source, and the
 * verdict set by the submission type alone: every NDA, BLA, ANDA and
 * 505(b)(2) 'high', every 510(k) and IND 'low'. Both AnA commands defaulted
 * the submission type to NDA. RTF frequencies, EMA frequencies and
 * confidences, and advisory-committee probabilities, overall risk and
 * "historical voting patterns" were the same kind of figure.
 *
 * The database is the only thing replaced.
 */
import { describe, it, expect, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../db', () => ({
  db: {},
  pool: { query },
  getPool: () => ({ query }),
  getDb: () => ({}),
}));
vi.mock('../../utils/logger', () => ({
  createScopedLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { precedentEngine } from '../precedent-engine';
import { analyzeCRLTriggers, analyzeRTFTriggers } from '../ana-ri/command-executor';

const UNCITED = /"(historicalRate|confidence|frequency|probability|overallCRLRisk|overallAdcomRisk|highProbabilityTriggers|votingInsights)"/;
const unprovisioned = () => query.mockRejectedValue(Object.assign(new Error('relation does not exist'), { code: '42P01' }));
const storeAnswers = (table: string, rows: Record<string, unknown>[]) =>
  query.mockImplementation(async (sql: string) => (String(sql).includes(table) ? { rows } : { rows: [] }));

describe('CRL triggers', () => {
  it.each(['NDA', 'BLA', 'ANDA', '510(k)'])('%s: categories, with no rate, confidence or overall risk', async (submissionType) => {
    unprovisioned();
    const r = await precedentEngine.analyzeCRLTriggers({ submissionType } as never);
    expect(r.triggers.length).toBeGreaterThan(0);
    expect(JSON.stringify(r)).not.toMatch(UNCITED);
    expect(r.triggers.every((t) => t.evidenceBasis === 'curated')).toBe(true);
  });

  it("serves no stored row's frequency_rate as a rate", async () => {
    storeAnswers('crl_trigger_patterns', [{
      pattern_name: 'Efficacy Endpoint Failure', category: 'clinical_efficacy',
      trigger_description: 'Primary endpoint missed', frequency_rate: '0.3400',
      resolution_difficulty: 'very_high', submission_types: ['NDA'], typical_fda_language: null,
    }]);
    const r = await precedentEngine.analyzeCRLTriggers({ submissionType: 'NDA' } as never);
    expect(r.triggers.map((t) => t.category)).toEqual(['Efficacy Endpoint Failure']);
    expect(JSON.stringify(r)).not.toMatch(/0\.34/);
    expect(JSON.stringify(r)).not.toMatch(UNCITED);
  });
});

describe('RTF triggers', () => {
  it('curated: no frequency', async () => {
    unprovisioned();
    const r = await precedentEngine.analyzeRTFTriggers({ submissionType: 'NDA' } as never);
    expect(r.triggers.length).toBeGreaterThan(0);
    expect(JSON.stringify(r)).not.toMatch(UNCITED);
  });

  it('stored: the curated severity the row encodes, and no frequency', async () => {
    storeAnswers('rtf_trigger_patterns', [{
      pattern_name: 'Missing or Incomplete Module 3 (CMC)', trigger_description: 'CMC deficiencies',
      frequency_rate: '0.3500', typical_fda_language: null,
    }]);
    const r = await precedentEngine.analyzeRTFTriggers({ submissionType: 'NDA' } as never);
    expect(r.triggers).toEqual([expect.objectContaining({ trigger: 'Missing or Incomplete Module 3 (CMC)', severity: 'critical' })]);
    expect(JSON.stringify(r)).not.toMatch(/0\.35/);
  });
});

describe('EMA question patterns and advisory-committee triggers', () => {
  it('EMA: curated, and labelled so, with no frequency or confidence', async () => {
    unprovisioned();
    const r = await precedentEngine.analyzeEMAPatterns({ submissionType: 'MAA', therapeuticArea: 'Oncology' } as never);
    expect(r.evidenceBasis).toBe('curated');
    expect(r.day120Questions.length).toBeGreaterThan(0);
    expect(JSON.stringify(r)).not.toMatch(UNCITED);
  });

  it('advisory committee: the triggers that apply, with no probability, overall risk or canned "voting patterns"', async () => {
    unprovisioned();
    const r = await precedentEngine.analyzeAdvisoryCommitteeRisk({ submissionType: 'NDA', therapeuticArea: 'Oncology' } as never);
    expect(r.totalTriggers).toBeGreaterThan(0);
    expect(JSON.stringify(r)).not.toMatch(UNCITED);
  });
});

describe("AnA's CRL and RTF commands", () => {
  const ctx = { organizationId: 3, userId: 7 } as never;

  it.each([
    ['analyze_crl_triggers', analyzeCRLTriggers],
    ['analyze_rtf_triggers', analyzeRTFTriggers],
  ])('%s asks for the submission type rather than assuming NDA', async (action, run) => {
    const r = await run(ctx, {});
    expect(r).toMatchObject({ success: false, action, error: 'submissionType is required' });
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('trigger_patterns'), expect.anything());
  });

  it('analyze_crl_triggers calls its answer a curated checklist, not a precedent analysis', async () => {
    unprovisioned();
    const r = await analyzeCRLTriggers(ctx, { submissionType: 'NDA' });
    expect(r.success).toBe(true);
    expect(r.message).toMatch(/^Curated CRL trigger checklist for NDA: \d+ categories/);
    expect(r.message).toMatch(/no historical rate or overall CRL risk is given/);
    expect(r.message).not.toMatch(/based on regulatory precedents/);
  });

  it('analyze_rtf_triggers calls its answer a curated checklist', async () => {
    unprovisioned();
    const r = await analyzeRTFTriggers(ctx, { submissionType: 'BLA' });
    expect(r.message).toMatch(/^Curated RTF checklist for BLA: \d+ items \(\d+ required\) and \d+ trigger categories/);
  });
});

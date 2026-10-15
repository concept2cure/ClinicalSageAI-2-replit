/**
 * An organisation's precedent library with nothing in it assesses nothing.
 *
 * POST /api/regulatory-precedent-intelligence/crl/risk-assessment and
 * /rtf/prevention-report answered an empty library with "low", risk 0 — the
 * ADR 0013 failure, "no CRL triggers found reads as low risk" — and the CRL
 * trajectory invented a 10% CRL probability, 1 cycle, 180 days and 0.2
 * confidence. With patterns but no recorded trajectories it computed a
 * probability of 1.5 x the mean pattern frequency and 300 days per cycle.
 *
 * The database is the only thing replaced.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const H = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: H.query } }));
vi.mock('../../../db', () => ({ pool: { query: H.query } }));

import { crlTriggerService } from '../crl-trigger-service';
import { rtfTriggerService } from '../rtf-trigger-service';

const PATTERN = {
  id: 'p1', organization_id: '7', pattern_code: 'ORG_CRL_1', pattern_name: 'Single pivotal trial', category: 'clinical_efficacy',
  trigger_description: 'One trial', deficiency_signals: [], typical_fda_language: [], frequency_rate: '0.2',
  resolution_difficulty: 'high', avg_cycles_to_resolve: '2', resolution_success_rate: '0.5',
  therapeutic_areas: [], submission_types: ['NDA'], applicable_divisions: ['CDER'],
};

beforeEach(() => {
  H.query.mockReset();
});

describe('CRL risk over an empty library', () => {
  it('is not assessed, with nothing invented', async () => {
    H.query.mockResolvedValue({ rows: [] });
    const r = await crlTriggerService.assessCRLRisk({ organizationId: '7', submissionType: 'NDA' });
    expect(r).toMatchObject({ overallRisk: 'not_assessed', riskScore: null, matchedPatterns: [], mitigationStrategies: [] });
    expect(r.reason).toMatch(/not assessed/);
    expect(r.trajectoryPrediction).toEqual({
      likelyCrlProbability: null, expectedCycles: null, expectedResolutionDays: null, mostLikelyDeficiencies: [], confidenceScore: null,
    });
  });

  it('with patterns but no recorded trajectory, gives no probability, days or confidence', async () => {
    H.query.mockImplementation(async (sql: string) =>
      /crl_trigger_patterns/.test(sql) ? { rows: [PATTERN] } : { rows: [] });
    const r = await crlTriggerService.assessCRLRisk({ organizationId: '7', submissionType: 'NDA' });
    expect(r.overallRisk).not.toBe('not_assessed');
    expect(r.trajectoryPrediction).toMatchObject({
      likelyCrlProbability: null, expectedCycles: 2, expectedResolutionDays: null, confidenceScore: null,
    });
  });
});

describe('RTF risk over an empty library', () => {
  it('is not assessed, with no recovery estimate', async () => {
    H.query.mockResolvedValue({ rows: [] });
    const r = await rtfTriggerService.generatePreventionReport({ organizationId: '7', submissionType: 'NDA' });
    expect(r).toMatchObject({ overallRisk: 'not_assessed', riskScore: null, estimatedRecoveryDays: null, preventionChecklist: [] });
  });
});

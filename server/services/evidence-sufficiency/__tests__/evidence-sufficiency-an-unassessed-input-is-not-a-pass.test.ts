/**
 * Evidence sufficiency: an input nobody assessed is not a pass.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 *   - Claim health, the PMA pivotal-endpoint result and the 510(k) defense
 *     readiness score are caller-supplied. Each check only ever ADDED a finding,
 *     so a caller that omitted one (the AnA command omits all three) skipped it
 *     silently: a PMA with every pillar covered came back
 *     `sufficient, blocksApproval: false, findings: []` although nobody had
 *     looked at whether the pivotal study met its endpoint.
 *   - `claimHealth: { contradictedClaimCount: 0 }` with no denominator read as
 *     a clean claim examination.
 *   - `isQuantitative` accepted `testResults: {}` (an empty object is `!= null`)
 *     and any relevance score above zero, so a pivotal trial with no results at
 *     all satisfied "requires a quantitative finding".
 *   - A persisted assessment with no caller-supplied actor was attributed to
 *     `triggered_by = 'system'`.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';

const insertCalls: Array<{ values: any }> = [];

vi.mock('../../../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
          then: (resolve: (rows: unknown[]) => void) => resolve([]),
        }),
      }),
    }),
    insert: () => ({
      values: (v: any) => {
        insertCalls.push({ values: v });
        return { returning: () => Promise.resolve([{ id: 'assess-1' }]) };
      },
    }),
  },
}));

import { assessSufficiency } from '../evidence-sufficiency.service';
import type { EvidenceObject } from '../../../../shared/schema/programs';

const ORG = 9;
const PROGRAM = '11111111-1111-1111-1111-111111111111';

const ev = (evidenceType: string, extras: Partial<EvidenceObject> = {}): EvidenceObject =>
  ({
    id: `ev-${Math.random().toString(36).slice(2, 8)}`,
    organizationId: ORG,
    programId: PROGRAM,
    evidenceType,
    status: 'approved',
    qualityScore: null,
    relevanceScore: null,
    testResults: { p_value: 0.001 },
    ...extras,
  }) as EvidenceObject;

/** Every PMA pillar covered by approved, quantitative evidence. */
const pmaEvidence = () => [
  ev('risk_assessment'), ev('device_profile'), ev('bench_test'), ev('clinical_trial'),
  ev('literature_article'), ev('clinical_trial'), ev('statistical_analysis'),
  ev('manufacturing_process'), ev('quality_control'),
  ev('regulatory_compliance'), ev('regulatory_compliance'), ev('project_deliverable'),
];
/** Every 510(k) pillar covered (no patient contact, not sterile/electrical/software). */
const k510Evidence = () => [
  ev('risk_assessment'), ev('device_profile'), ev('bench_test'), ev('regulatory_compliance'),
  ev('predicate_device'),
];
const PROFILE = { isSoftware: false, hasPatientContact: false, isElectrical: false, isSterile: false };
const CLAIMS_EXAMINED = {
  claimsRecorded: 12, assessed: true, orphanClaimCount: 0, contradictedClaimCount: 0, unsupportedClaimCount: 0,
};

beforeEach(() => {
  insertCalls.length = 0;
});

describe('a verdict that depends on an input nobody supplied is incomplete, not sufficient', () => {
  test('PMA with every pillar covered but no claim health and no pivotal result', async () => {
    const r = await assessSufficiency({
      organizationId: ORG, programId: PROGRAM, pathway: 'PMA', profile: PROFILE,
      evidenceOverride: pmaEvidence(), dryRun: true,
    });
    expect(r.verdict).toBe('incomplete');
    // Not cleared: nothing established that it may proceed.
    expect(r.blocksApproval).toBe(true);
    const codes = r.findings.map((f) => f.code);
    expect(codes).toContain('SUFF-CLAIM-HEALTH-NOT-ASSESSED');
    expect(codes).toContain('SUFF-PIVOTAL-NOT-ASSESSED');
    // An absence is not a defect found in the submission.
    expect(r.summary.criticalCount).toBe(0);
    expect(r.assessed).toEqual({
      pillars: 'assessed',
      claimHealth: 'not_assessed',
      pivotalEndpoints: 'not_assessed',
      defenseReadiness: 'not_applicable',
    });
  });

  test('510(k) with every pillar covered but no defense readiness score', async () => {
    const r = await assessSufficiency({
      organizationId: ORG, programId: PROGRAM, pathway: '510K', profile: PROFILE,
      evidenceOverride: k510Evidence(), claimHealth: CLAIMS_EXAMINED, dryRun: true,
    });
    expect(r.verdict).toBe('incomplete');
    expect(r.findings.map((f) => f.code)).toContain('SUFF-510K-READINESS-NOT-ASSESSED');
    expect(r.assessed.defenseReadiness).toBe('not_assessed');
    expect(r.assessed.pivotalEndpoints).toBe('not_applicable');
  });

  test('zero claim counts with no denominator are not a claim examination', async () => {
    const r = await assessSufficiency({
      organizationId: ORG, programId: PROGRAM, pathway: 'PMA', profile: PROFILE,
      evidenceOverride: pmaEvidence(), pivotalEndpointsMet: true,
      claimHealth: { orphanClaimCount: 0, contradictedClaimCount: 0 },
      dryRun: true,
    });
    expect(r.verdict).toBe('incomplete');
    expect(r.assessed.claimHealth).toBe('not_assessed');
  });

  test('says sufficient when every input was supplied and the evidence clears', async () => {
    // The other edge: the guard must not turn a complete assessment into "incomplete".
    const r = await assessSufficiency({
      organizationId: ORG, programId: PROGRAM, pathway: 'PMA', profile: PROFILE,
      evidenceOverride: pmaEvidence(), claimHealth: CLAIMS_EXAMINED, pivotalEndpointsMet: true,
      dryRun: true,
    });
    expect(r.verdict).toBe('sufficient');
    expect(r.blocksApproval).toBe(false);
    expect(r.findings).toEqual([]);
    // Supplied by the caller, not read from the program's records: say so.
    expect(r.assessed.claimHealth).toBe('caller_reported');
    expect(r.assessed.pivotalEndpoints).toBe('caller_reported');
  });

  test('an insufficient evidence base stays insufficient when inputs are also missing', async () => {
    const r = await assessSufficiency({
      organizationId: ORG, programId: PROGRAM, pathway: 'PMA', profile: PROFILE,
      evidenceOverride: [ev('risk_assessment')], dryRun: true,
    });
    expect(r.verdict).toBe('insufficient');
    expect(r.blocksApproval).toBe(true);
  });
});

describe('"quantitative" means the evidence carries a number', () => {
  const pivotalWith = async (extras: Partial<EvidenceObject>) => {
    const r = await assessSufficiency({
      organizationId: ORG, programId: PROGRAM, pathway: 'PMA', profile: PROFILE,
      evidenceOverride: [ev('clinical_trial', extras)], dryRun: true,
    });
    return r.pillarScores.find((p) => p.pillar === 'clinical_pivotal')!;
  };

  test('an empty testResults object is not a quantitative result', async () => {
    const p = await pivotalWith({ testResults: {} });
    expect(p.satisfied).toBe(false);
  });

  test('a relevance score is not a quantitative result', async () => {
    const p = await pivotalWith({ testResults: null, relevanceScore: '0.7' });
    expect(p.satisfied).toBe(false);
  });

  test('a numeric result is', async () => {
    const p = await pivotalWith({ testResults: { primary_endpoint: { hazard_ratio: 0.71 } } });
    expect(p.satisfied).toBe(true);
  });
});

describe('the persisted assessment records what it was given, and nothing else', () => {
  test('no caller-supplied actor is stored as null, not "system"', async () => {
    await assessSufficiency({
      organizationId: ORG, programId: PROGRAM, pathway: 'PMA', profile: PROFILE,
      evidenceOverride: pmaEvidence(),
    });
    expect(insertCalls).toHaveLength(1);
    const v = insertCalls[0].values;
    expect(v.triggeredBy).toBeNull();
    expect(v.verdict).toBe('incomplete');
    expect(v.blocksApproval).toBe(true);
    expect(v.inputsSnapshot.assessed.pivotalEndpoints).toBe('not_assessed');
  });
});

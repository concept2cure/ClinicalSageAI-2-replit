/**
 * Evidence-sufficiency analyzer tests.
 *
 * Mocks db.select/insert. Verifies pillar scoring, verdict thresholds,
 * inputsHash determinism, profile-driven applicability, and PMA-pivotal /
 * 510K-readiness cross-cutting findings.
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

const ev = (
  evidenceType: string,
  status: 'approved' | 'pending' | 'rejected' | 'superseded' = 'approved',
  extras: Partial<EvidenceObject> = {}
): EvidenceObject =>
  ({
    id: `ev-${Math.random().toString(36).slice(2, 8)}`,
    organizationId: ORG,
    programId: PROGRAM,
    title: 'evidence',
    code: null,
    description: null,
    evidenceType,
    evidenceCategory: 'clinical',
    evidenceLevel: null,
    sourceType: 'internal',
    sourceReference: null,
    sourceCitation: null,
    documentId: null,
    documentVersion: null,
    pageRange: null,
    excerpt: null,
    qualityScore: '0.8',
    relevanceScore: '0.7',
    validFrom: null,
    validUntil: null,
    isVerified: false,
    verifiedBy: null,
    verifiedAt: null,
    authors: null,
    publicationDate: null,
    journal: null,
    doi: null,
    pmid: null,
    abstract: null,
    testType: null,
    testLab: null,
    testDate: null,
    testResults: { p_value: 0.001 },
    status,
    metadata: null,
    tags: [],
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extras,
  }) as EvidenceObject;

beforeEach(() => {
  insertCalls.length = 0;
});

describe('assessSufficiency — verdict thresholds', () => {
  test('PMA with full evidence inventory yields sufficient verdict', async () => {
    const evidence = [
      ev('risk_assessment'),
      ev('device_profile'),
      ev('bench_test'),
      ev('clinical_trial'),
      ev('literature_article'),
      ev('clinical_trial'),
      ev('statistical_analysis'),
      ev('manufacturing_process'),
      ev('quality_control'),
      ev('regulatory_compliance'),
      ev('regulatory_compliance'),
      ev('project_deliverable'),
    ];
    const r = await assessSufficiency({
      organizationId: ORG,
      programId: PROGRAM,
      pathway: 'PMA',
      profile: { isSoftware: false, hasPatientContact: false, isElectrical: false, isSterile: false },
      evidenceOverride: evidence,
      dryRun: true,
    });
    expect(r.verdict).toBe('sufficient');
    expect(r.blocksApproval).toBe(false);
    expect(r.overallScore).toBeGreaterThanOrEqual(80);
    expect(r.summary.evidenceObjectCount).toBe(evidence.length);
  });

  test('PMA with only risk_management → insufficient', async () => {
    const r = await assessSufficiency({
      organizationId: ORG,
      programId: PROGRAM,
      pathway: 'PMA',
      profile: { hasPatientContact: false, isElectrical: false, isSterile: false, isSoftware: false },
      evidenceOverride: [ev('risk_assessment')],
      dryRun: true,
    });
    expect(r.verdict).toBe('insufficient');
    expect(r.blocksApproval).toBe(true);
    expect(r.summary.criticalCount).toBeGreaterThan(0);
  });
});

describe('assessSufficiency — profile applicability', () => {
  test('biocompatibility pillar skipped when no patient contact', async () => {
    const r = await assessSufficiency({
      organizationId: ORG,
      programId: PROGRAM,
      pathway: '510K',
      profile: { hasPatientContact: false, isSoftware: false, isElectrical: false },
      evidenceOverride: [],
      dryRun: true,
    });
    expect(r.pillarScores.find(p => p.pillar === 'biocompatibility')).toBeUndefined();
  });

  test('software pillars active when isSoftware=true', async () => {
    const r = await assessSufficiency({
      organizationId: ORG,
      programId: PROGRAM,
      pathway: '510K',
      profile: { isSoftware: true, hasPatientContact: false, isElectrical: false },
      evidenceOverride: [],
      dryRun: true,
    });
    expect(r.pillarScores.find(p => p.pillar === 'software_lifecycle')).toBeDefined();
    expect(r.pillarScores.find(p => p.pillar === 'cybersecurity')).toBeDefined();
  });
});

describe('assessSufficiency — quantitative requirement', () => {
  test('clinical_pivotal without testResults / qualityScore is partial-only', async () => {
    const nonQuantitative = ev('clinical_trial', 'approved', {
      testResults: null,
      qualityScore: null,
      relevanceScore: null,
    });
    const r = await assessSufficiency({
      organizationId: ORG,
      programId: PROGRAM,
      pathway: 'PMA',
      profile: { hasPatientContact: false, isSoftware: false, isElectrical: false },
      evidenceOverride: [nonQuantitative],
      dryRun: true,
    });
    const pivotal = r.pillarScores.find(p => p.pillar === 'clinical_pivotal');
    expect(pivotal).toBeDefined();
    expect(pivotal!.satisfied).toBe(false);
    expect(pivotal!.score).toBeLessThan(100);
  });
});

describe('assessSufficiency — cross-cutting findings', () => {
  test('PMA pivotalEndpointsMet=false yields critical SUFF-PIVOTAL-MISS', async () => {
    const r = await assessSufficiency({
      organizationId: ORG,
      programId: PROGRAM,
      pathway: 'PMA',
      profile: { hasPatientContact: false, isSoftware: false, isElectrical: false },
      evidenceOverride: [ev('clinical_trial')],
      pivotalEndpointsMet: false,
      dryRun: true,
    });
    expect(r.findings.some(f => f.code === 'SUFF-PIVOTAL-MISS' && f.severity === 'critical')).toBe(
      true
    );
    expect(r.blocksApproval).toBe(true);
  });

  test('510K with low defenseReadinessScore yields critical SUFF-510K-READINESS', async () => {
    const r = await assessSufficiency({
      organizationId: ORG,
      programId: PROGRAM,
      pathway: '510K',
      profile: { hasPatientContact: false, isSoftware: false, isElectrical: false },
      evidenceOverride: [ev('predicate_device'), ev('substantial_equivalence')],
      defenseReadinessScore: 35,
      dryRun: true,
    });
    expect(r.findings.some(f => f.code === 'SUFF-510K-READINESS')).toBe(true);
  });

  test('contradicting claims raise SUFF-CLAIM-CONTRADICT critical', async () => {
    const r = await assessSufficiency({
      organizationId: ORG,
      programId: PROGRAM,
      pathway: '510K',
      profile: {},
      evidenceOverride: [],
      claimHealth: { contradictedClaimCount: 2 },
      dryRun: true,
    });
    expect(r.findings.some(f => f.code === 'SUFF-CLAIM-CONTRADICT' && f.severity === 'critical')).toBe(
      true
    );
  });
});

describe('assessSufficiency — persistence', () => {
  test('non-dryRun inserts assessment row with verdict + scores', async () => {
    await assessSufficiency({
      organizationId: ORG,
      programId: PROGRAM,
      pathway: 'PMA',
      profile: { hasPatientContact: false, isSoftware: false, isElectrical: false },
      evidenceOverride: [ev('risk_assessment'), ev('clinical_trial'), ev('statistical_analysis')],
    });
    expect(insertCalls).toHaveLength(1);
    const v = insertCalls[0].values;
    expect(v.programId).toBe(PROGRAM);
    expect(v.pathway).toBe('PMA');
    expect(typeof v.verdict).toBe('string');
    expect(typeof v.overallScore).toBe('number');
    expect(typeof v.pillarScores).toBe('object');
    expect(Array.isArray(v.findings)).toBe(true);
  });

  test('dryRun skips persistence', async () => {
    await assessSufficiency({
      organizationId: ORG,
      programId: PROGRAM,
      pathway: 'PMA',
      profile: { hasPatientContact: false, isSoftware: false, isElectrical: false },
      evidenceOverride: [ev('risk_assessment')],
      dryRun: true,
    });
    expect(insertCalls).toHaveLength(0);
  });
});

describe('assessSufficiency — inputsHash', () => {
  test('inputsHash is sha256 hex (64 chars)', async () => {
    const r = await assessSufficiency({
      organizationId: ORG,
      programId: PROGRAM,
      pathway: 'PMA',
      profile: { hasPatientContact: false },
      evidenceOverride: [],
      dryRun: true,
    });
    expect(r.inputsHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('inputsHash stable across identical inputs', async () => {
    const a = await assessSufficiency({
      organizationId: ORG,
      programId: PROGRAM,
      pathway: 'PMA',
      profile: { hasPatientContact: false },
      evidenceOverride: [ev('risk_assessment')],
      dryRun: true,
    });
    const b = await assessSufficiency({
      organizationId: ORG,
      programId: PROGRAM,
      pathway: 'PMA',
      profile: { hasPatientContact: false },
      evidenceOverride: [ev('risk_assessment')],
      dryRun: true,
    });
    expect(a.inputsHash).toBe(b.inputsHash);
  });

  test('inputsHash differs when pathway changes', async () => {
    const a = await assessSufficiency({
      organizationId: ORG,
      programId: PROGRAM,
      pathway: 'PMA',
      profile: { hasPatientContact: false },
      evidenceOverride: [],
      dryRun: true,
    });
    const b = await assessSufficiency({
      organizationId: ORG,
      programId: PROGRAM,
      pathway: 'DE_NOVO',
      profile: { hasPatientContact: false },
      evidenceOverride: [],
      dryRun: true,
    });
    expect(a.inputsHash).not.toBe(b.inputsHash);
  });
});

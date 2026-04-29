/**
 * Reviewer simulator orchestration tests.
 *
 * Verifies persona scope filtering, aggregation, dedupe, sort, and
 * deterministic input hashing. DB writes are mocked.
 */

import { describe, expect, test, vi, beforeEach } from 'vitest';

const insertCalls: Array<{ values: any }> = [];

vi.mock('../../../db', () => ({
  db: {
    insert: () => ({
      values: (v: any) => {
        insertCalls.push({ values: v });
        return { returning: () => Promise.resolve([{ id: 'sim-run-1' }]) };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => Promise.resolve([]) }),
          limit: () => Promise.resolve([]),
        }),
      }),
    }),
  },
}));

import { runReviewerSimulation } from '../reviewer-simulator.service';
import type { PersonaProgramFacts } from '../reviewer-personas';

const ORG = 7;
const PROGRAM = '00000000-0000-0000-0000-000000000001';

const baseProgram: PersonaProgramFacts = {
  programType: '510K',
  productType: 'device',
  deviceClass: 'II',
  primaryAgency: 'FDA',
};

const baseIntel = {
  contradictionCount: 0,
  orphanClaimCount: 0,
  unsupportedClaimCount: 0,
  defensibilityScore: null,
  missingSections: [],
};

beforeEach(() => {
  insertCalls.length = 0;
});

describe('runReviewerSimulation', () => {
  test('runs only in-scope personas (FDA 510K + always-on)', async () => {
    const result = await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: baseProgram,
      intel: baseIntel,
      dryRun: true,
    });
    // FDA 510K applies; PMA does not; software/cyber off; EU off; IVDR off; biostat off.
    expect(result.personaScope).toContain('fda_510k_reviewer');
    expect(result.personaScope).toContain('labeling_reviewer');
    expect(result.personaScope).toContain('quality_systems_reviewer');
    expect(result.personaScope).not.toContain('fda_pma_reviewer');
    expect(result.personaScope).not.toContain('fda_software_reviewer');
    expect(result.personaScope).not.toContain('eu_notified_body_clinical');
    expect(result.personaScope).not.toContain('ivdr_performance_evaluator');
  });

  test('dryRun does not insert', async () => {
    await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: baseProgram,
      intel: baseIntel,
      dryRun: true,
    });
    expect(insertCalls).toHaveLength(0);
  });

  test('non-dryRun persists with counts and persona scope', async () => {
    const result = await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: { ...baseProgram, isSoftware: true, isAiMl: true },
      packet: {
        defenseReadinessScore: 40,
        topRisks: ['IU_MISMATCH', 'ML_ADAPTIVITY'],
        riskCodesUsed: [],
        predicateKNumber: 'K001',
      },
      intel: { ...baseIntel, unsupportedClaimCount: 2 },
      trigger: 'manual',
      triggeredBy: 'user-1',
    });
    expect(insertCalls).toHaveLength(1);
    const v = insertCalls[0].values;
    expect(v.programId).toBe(PROGRAM);
    expect(v.organizationId).toBe(ORG);
    expect(v.questionCount).toBe(result.questionCount);
    expect(v.criticalCount).toBe(result.criticalCount);
    expect(v.personaScope).toEqual(result.personaScope);
    expect(v.inputsHash).toBe(result.inputsHash);
    expect(v.trigger).toBe('manual');
    expect(v.triggeredBy).toBe('user-1');
  });

  test('inputsHash is stable for identical inputs', async () => {
    const a = await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: baseProgram,
      intel: baseIntel,
      dryRun: true,
    });
    const b = await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: { ...baseProgram }, // re-spread = same content
      intel: { ...baseIntel },
      dryRun: true,
    });
    expect(a.inputsHash).toBe(b.inputsHash);
    expect(a.inputsHash.length).toBe(64); // sha256 hex
  });

  test('inputsHash differs when intel changes', async () => {
    const a = await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: baseProgram,
      intel: baseIntel,
      dryRun: true,
    });
    const b = await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: baseProgram,
      intel: { ...baseIntel, contradictionCount: 5 },
      dryRun: true,
    });
    expect(a.inputsHash).not.toBe(b.inputsHash);
  });

  test('explicit persona list filters scope', async () => {
    const result = await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: baseProgram,
      intel: baseIntel,
      personas: ['fda_510k_reviewer'],
      dryRun: true,
    });
    expect(result.personaScope).toEqual(['fda_510k_reviewer']);
  });

  test('questions are sorted critical→warning→info', async () => {
    const result = await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: { ...baseProgram, isSoftware: true },
      packet: {
        defenseReadinessScore: 30,
        topRisks: ['IU_MISMATCH', 'TECH_DIFFERENCE', 'CYBERSECURITY_SURFACE_INCREASED'],
        riskCodesUsed: [],
        predicateKNumber: 'K001',
      },
      intel: { ...baseIntel, contradictionCount: 1, unsupportedClaimCount: 3 },
      dryRun: true,
    });
    const severities = result.questions.map(q => q.severity);
    const rank = { critical: 0, warning: 1, info: 2 } as const;
    for (let i = 1; i < severities.length; i++) {
      expect(rank[severities[i]]).toBeGreaterThanOrEqual(rank[severities[i - 1]]);
    }
  });
});

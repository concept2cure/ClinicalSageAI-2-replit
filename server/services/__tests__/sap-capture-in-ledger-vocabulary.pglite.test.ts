/**
 * SAP generation and the defensibility assessment record into the assumption
 * registry and the decision ledger in the ledger's own vocabulary, with no
 * confidence that nobody stated.
 *
 * captureFromSapGeneration wrote category 'analysis_population' / 'attrition',
 * source_type 'ana_generated' / 'manual' and confidence 'provisional' /
 * 'uncertain' — every one outside the CHECK constraints of assumption_records —
 * so its first INSERT failed, sap-generator-service caught that as "non-fatal",
 * and every SAP came back with no assumption captured and nobody told. The
 * decision it wrote carried confidence 'provisional', and the defensibility
 * capture turned a verdict into a confidence ('adequate' -> 'strong',
 * 'marginal' -> 'moderate', anything else -> 'uncertain'). A verdict is not a
 * confidence, and three of those four are not in decision_records' CHECK either.
 *
 * Runs the real services against the real DDL
 * (db/migrations/20260323_assumption_decision_contradiction.sql) in PGlite.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const H = vi.hoisted(() => {
  const h = { pg: null as unknown as import('@electric-sql/pglite').PGlite };
  /** node-postgres's result shape over PGlite, for the raw-SQL services. */
  const pool = {
    query: async (text: string, params?: unknown[]) => {
      const r = await h.pg.query(text, params);
      return { rows: r.rows, rowCount: r.rows.length || (r.affectedRows ?? 0) };
    },
  };
  return { h, pool };
});
vi.mock('../../db.js', () => ({ pool: H.pool, db: null }));
vi.mock('../../db', () => ({ pool: H.pool, db: null }));
// Drift detection runs after every create; it is the contradiction engine's
// concern, not this test's.
vi.mock('../contradiction-engine-service', () => ({
  contradictionEngineService: { detectAssumptionDrift: async () => [] },
}));

import { OperatingSystemIntegration } from '../operating-system-integration';
import SapGenerator from '../sap-generator-service';

const MIGRATION = fs.readFileSync(
  path.join(process.cwd(), 'db/migrations/20260323_assumption_decision_contradiction.sql'),
  'utf8',
);

const SAP = {
  organizationId: 3,
  projectId: 12,
  indication: 'NSCLC',
  phase: 'Phase 3',
  sampleSize: 450,
  primaryEndpoint: 'Overall survival',
  createdById: 41,
};

type AssumptionRow = {
  category: string;
  source_type: string;
  confidence_level: string | null;
  assumed_value: string;
  created_by: string;
};
const assumptionRows = async () =>
  (
    await H.h.pg.query<AssumptionRow>(
      `SELECT category, source_type, confidence_level, assumed_value, created_by
         FROM assumption_records ORDER BY category`,
    )
  ).rows;
const decisionRows = async () =>
  (
    await H.h.pg.query<{ confidence_level: string | null; decided_by: string; related_assumption_ids: string[] }>(
      'SELECT confidence_level, decided_by, related_assumption_ids FROM decision_records',
    )
  ).rows;

const integration = () => OperatingSystemIntegration.getInstance();

beforeAll(async () => {
  H.h.pg = new PGlite();
  await H.h.pg.exec(MIGRATION);
}, 60_000);
afterAll(async () => {
  await H.h.pg.close();
});
beforeEach(async () => {
  await H.h.pg.exec('TRUNCATE assumption_records, decision_records');
});

describe('captureFromSapGeneration', () => {
  it('records each stated SAP input in a category and source the registry accepts, with no confidence', async () => {
    const out = await integration().captureFromSapGeneration({ ...SAP, dropoutRate: 0.2, effectSize: 0.35 });

    expect(await assumptionRows()).toEqual([
      { category: 'dropout', source_type: 'sponsor_decision', confidence_level: null, assumed_value: '0.2', created_by: '41' },
      { category: 'effect_size', source_type: 'sap', confidence_level: null, assumed_value: '0.35', created_by: '41' },
      { category: 'endpoint', source_type: 'sponsor_decision', confidence_level: null, assumed_value: 'Overall survival', created_by: '41' },
      { category: 'enrollment', source_type: 'sap', confidence_level: null, assumed_value: '450', created_by: '41' },
    ]);
    const decisions = await decisionRows();
    expect(decisions).toHaveLength(1);
    expect(decisions[0].confidence_level).toBeNull();
    expect(decisions[0].decided_by).toBe('41');
    expect([...decisions[0].related_assumption_ids].sort()).toEqual(out.assumptions.map((a) => a.id).sort());
    expect(out.notCaptured).toEqual([]);
  }, 30_000);

  it('records only what the SAP request stated, and names what it did not', async () => {
    const out = await integration().captureFromSapGeneration(SAP);

    expect((await assumptionRows()).map((a) => a.category)).toEqual(['endpoint', 'enrollment']);
    expect(out.notCaptured).toEqual([
      'dropout rate (not specified in the SAP request)',
      'minimum detectable effect (not specified in the SAP request)',
    ]);
  }, 30_000);
});

describe('generateSAP, end to end', () => {
  it('returns a SAP whose inputs are in the registry, and says so', async () => {
    const out = await SapGenerator.generateSAP({
      indication: 'NSCLC',
      phase: 'Phase 3',
      sample_size: 450,
      primary_endpoint: 'Overall survival',
      dropout_rate: 0.1,
      organizationId: 3,
      projectId: 12,
      createdById: 41,
    });

    expect(out.assumptionCapture).toMatchObject({ recorded: true, notCaptured: [
      'minimum detectable effect (not specified in the SAP request)',
    ] });
    expect((await assumptionRows()).map((a) => a.category)).toEqual(['dropout', 'endpoint', 'enrollment']);
    expect(await decisionRows()).toHaveLength(1);
  }, 30_000);
});

const assessment = (verdict: 'adequate' | 'marginal' | 'inadequate' | 'insufficient_information') => ({
  organizationId: 3,
  projectId: 12,
  overallVerdict: verdict,
  overallRisk: 'moderate' as const,
  actionRecommendation: 'revise' as const,
  inadequateDimensions: [],
  marginalDimensions: [],
  escalationReasons: [],
  createdById: 41,
});

describe('captureFromDefensibilityAssessment', () => {
  it.each(['adequate', 'marginal', 'inadequate', 'insufficient_information'] as const)(
    'records a %s verdict as the verdict, not as a confidence',
    async (verdict) => {
      await integration().captureFromDefensibilityAssessment(assessment(verdict));

      const decisions = await decisionRows();
      expect(decisions).toHaveLength(1);
      expect(decisions[0].confidence_level).toBeNull();
    },
    30_000,
  );
});

describe('a capture with no authenticated user', () => {
  it('records nothing, rather than recording it as "system"', async () => {
    await expect(
      integration().captureFromDefensibilityAssessment({ ...assessment('marginal'), createdById: undefined }),
    ).rejects.toThrow(/no authenticated user/);
    await expect(integration().captureFromSapGeneration({ ...SAP, createdById: undefined })).rejects.toThrow(
      /no authenticated user/,
    );
    expect(await decisionRows()).toEqual([]);
    expect(await assumptionRows()).toEqual([]);
  }, 30_000);
});

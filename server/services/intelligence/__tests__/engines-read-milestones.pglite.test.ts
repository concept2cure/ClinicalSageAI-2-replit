/**
 * The readiness and recommendation engines read a project's milestones
 * through the project's linked program (ana-15).
 *
 * Both engines selected
 *
 *   program_milestones WHERE program_id IN (
 *     SELECT id FROM regulatory_programs WHERE project_id = $project …)
 *
 * and regulatory_programs has no project_id column: no migration creates it.
 * Every call raised 42703. The engines' catch treats only 42P01 as an empty,
 * so the error propagated:
 *
 *   • computeReadinessScore fails closed on a failed milestone read, so it
 *     threw for every project on every estate — the live readiness score was
 *     never available, and its callers fell back to stored memory or null.
 *   • generateRecommendations runs its generators under allSettled, so the
 *     milestone generator's rejection was logged and dropped — overdue and
 *     due-soon milestones never became recommendations.
 *
 * The link that exists is projects.regulatory_program_id (uuid) →
 * regulatory_programs.id → program_milestones.program_id
 * (migrations/20260814_projects_regulatory_program_anchor.sql).
 *
 * Fixing the read made the readiness score live for the first time, and with
 * it the dimensions the engine filled in when no twin assessment existed:
 * quality 65 ± profile counts, consistency the constant 70, compliance
 * 80 − 5 per risk, trend 'stable' from no data. The last describe block pins
 * that an unmeasured dimension is null, the overall score covers only what
 * was measured, and the trend is unknown without recorded scores.
 *
 * Real DDL on PGlite: the program tables from their creator migration, the
 * projects and documents tables as the base migration creates them, the
 * anchor column and its same-organization key from their migrations, and the
 * push-surface intelligence profile table from its drizzle definition, and
 * the twin assessment tables from the runtime DDL in
 * submission-readiness-twin-service.ts (no migration creates them).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { extractTableDdl } from '../../../../tests/golden-journeys/harness';
import { projectIntelligenceProfiles } from '../../../../shared/schema';

const holder = vi.hoisted(() => ({ pg: null as any, db: null as any }));
const dbDouble = vi.hoisted(() => ({
  get db() {
    return holder.db;
  },
  pool: { query: async (text: string, params?: unknown[]) => holder.pg.query(text, params) },
  getDb: () => holder.db,
  getPool: () => ({ query: async (text: string, params?: unknown[]) => holder.pg.query(text, params) }),
}));
vi.mock('../../../db', () => dbDouble);
vi.mock('../../../db.js', () => dbDouble);

import { computeReadinessScore, weightMeasured } from '../readiness-scoring-engine';
import { generateRecommendations } from '../recommendation-engine';

const ROOT = join(__dirname, '..', '..', '..', '..');
const sqlFile = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const ORG = 1;
const OTHER_ORG = 2;
const PROGRAM = '11111111-1111-4111-8111-111111111111'; // organization 1
const DELETED_PROGRAM = '22222222-2222-4222-8222-222222222222'; // organization 1, soft-deleted
const LINKED = 10; // project linked to PROGRAM
const UNLINKED = 11; // project with no linked program
const LINKED_TO_DELETED = 12; // project linked to DELETED_PROGRAM
const DOCUMENTED = 13; // unlinked project with four documents
const TWIN_PROGRAM = '33333333-3333-4333-8333-333333333333'; // has a twin assessment row

/** CREATE TABLE from the drizzle definition: the push-surface table no migration creates. */
function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}`);
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

/** The innovation twin tables, as submission-readiness-twin-service.ts creates them at runtime. */
function twinDdl(): string {
  const src = sqlFile('server/services/innovation/submission-readiness-twin-service.ts');
  const grab = (table: string) => {
    // nosemgrep: detect-non-literal-regexp -- table is a test literal; the subject is a repo migration file
    const m = src.match(new RegExp(`CREATE TABLE IF NOT EXISTS innovation\\.${table} \\([\\s\\S]*?\\n\\s*\\)\\s*\``));
    if (!m) throw new Error(`twin DDL for ${table} not found`);
    return m[0].slice(0, -1) + ';';
  };
  return `CREATE SCHEMA IF NOT EXISTS innovation;\n${grab('readiness_twin_assessments')}\n${grab('readiness_trends')}`;
}

beforeAll(async () => {
  const pg = new PGlite();
  holder.pg = pg;
  holder.db = drizzle(pg);
  await pg.exec(`CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
    INSERT INTO organizations (id, name) VALUES (1, 'acme'), (2, 'other');`);
  await pg.exec(sqlFile('migrations/20260524_program_workbench_schema.sql'));
  await pg.exec(extractTableDdl('migrations/0000_sweet_joseph.sql', ['projects', 'documents']));
  await pg.exec(sqlFile('migrations/20260814_projects_regulatory_program_anchor.sql'));
  await pg.exec(sqlFile('migrations/20260926b_program_same_org_keys.sql'));
  await pg.exec(ddlOf(projectIntelligenceProfiles));

  await pg.exec(`
    INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name, deleted_at) VALUES
      ('${PROGRAM}', ${ORG}, 'Alpha IND', 'A-1', 'ind', 'drug', 'FDA', 'Alpha', NULL),
      ('${DELETED_PROGRAM}', ${ORG}, 'Retired IND', 'R-1', 'ind', 'drug', 'FDA', 'Retired', NOW()),
      ('${TWIN_PROGRAM}', ${ORG}, 'Assessed IND', 'T-1', 'ind', 'drug', 'FDA', 'Assessed', NULL);
    INSERT INTO projects (id, organization_id, client_workspace_id, name, type, regulatory_program_id) VALUES
      (${LINKED}, ${ORG}, 1, 'Alpha project', 'ind', '${PROGRAM}'),
      (${UNLINKED}, ${ORG}, 1, 'Unlinked project', 'ind', NULL),
      (${LINKED_TO_DELETED}, ${ORG}, 1, 'Retired project', 'ind', '${DELETED_PROGRAM}'),
      (${DOCUMENTED}, ${ORG}, 1, 'Documented project', 'ind', NULL);
    INSERT INTO documents (organization_id, client_workspace_id, project_id, document_code, title, document_type, status, owner_id, created_by_id) VALUES
      (${ORG}, 1, ${DOCUMENTED}, 'D-1', 'Protocol', 'protocol', 'approved', 1, 1),
      (${ORG}, 1, ${DOCUMENTED}, 'D-2', 'IB', 'ib', 'approved', 1, 1),
      (${ORG}, 1, ${DOCUMENTED}, 'D-3', 'CMC summary', 'cmc', 'in_review', 1, 1),
      (${ORG}, 1, ${DOCUMENTED}, 'D-4', 'Cover letter', 'letter', 'draft', 1, 1);
    INSERT INTO program_milestones (program_id, name, category, target_date, status, progress) VALUES
      ('${PROGRAM}', 'Pre-IND meeting package', 'regulatory', NOW() - INTERVAL '3 days', 'in_progress', 40),
      ('${PROGRAM}', 'CMC section draft', 'cmc', NOW() + INTERVAL '5 days', 'pending', 10),
      ('${PROGRAM}', 'Nonclinical summary', 'nonclinical', NOW() + INTERVAL '60 days', 'pending', 0),
      ('${PROGRAM}', 'Kickoff', 'planning', NOW() - INTERVAL '30 days', 'completed', 100),
      ('${DELETED_PROGRAM}', 'Retired deadline', 'regulatory', NOW() - INTERVAL '3 days', 'pending', 0);
  `);
  await pg.exec(twinDdl());
  // A recorded assessment that measured quality and compliance and left
  // consistency and the review-time prediction empty; one trend point.
  await pg.exec(`
    INSERT INTO innovation.readiness_twin_assessments
      (program_id, submission_type, target_agency, overall_readiness_score,
       quality_score, consistency_score, compliance_score,
       predicted_approval_probability, predicted_review_time_days, predicted_deficiency_count)
    VALUES ('${TWIN_PROGRAM}', 'ind', 'FDA', 50, 80, NULL, 90, NULL, NULL, 3);
    INSERT INTO innovation.readiness_trends (program_id, overall_score) VALUES ('${TWIN_PROGRAM}', 50);
  `);
}, 60_000);

afterAll(async () => {
  await holder.pg?.close();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const milestoneGaps = (gaps: readonly { module: string; description: string; severity: string }[]) =>
  gaps.filter((g) => g.module === 'milestones');

describe('computeReadinessScore — milestones come from the project’s linked program', () => {
  it('scores a linked project and lists its overdue milestone as a critical gap', async () => {
    const score = await computeReadinessScore({ organizationId: ORG, projectId: LINKED });
    expect(milestoneGaps(score.gaps)).toEqual([
      expect.objectContaining({
        module: 'milestones',
        description: 'Milestone "Pre-IND meeting package" is overdue',
        severity: 'critical',
      }),
    ]);
  });

  it('scores a project with no linked program: no milestones, not an error', async () => {
    const score = await computeReadinessScore({ organizationId: ORG, projectId: UNLINKED });
    expect(milestoneGaps(score.gaps)).toEqual([]);
  });

  it('milestones feed the gap list only: the figure is the same with or without them', async () => {
    const linked = await computeReadinessScore({ organizationId: ORG, projectId: LINKED });
    const unlinked = await computeReadinessScore({ organizationId: ORG, projectId: UNLINKED });
    expect(linked.overallScore).toBe(unlinked.overallScore);
    expect(linked.dimensions).toEqual(unlinked.dimensions);
  });

  it('reads nothing for another organization, or for a soft-deleted program', async () => {
    const foreign = await computeReadinessScore({ organizationId: OTHER_ORG, projectId: LINKED });
    expect(milestoneGaps(foreign.gaps)).toEqual([]);
    const retired = await computeReadinessScore({ organizationId: ORG, projectId: LINKED_TO_DELETED });
    expect(milestoneGaps(retired.gaps)).toEqual([]);
  });
});

describe('generateRecommendations — the milestone generator runs', () => {
  it('turns the linked program’s overdue and due-soon milestones into recommendations', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const set = await generateRecommendations({ organizationId: ORG, projectId: LINKED, triggeredBy: 'test' });
    const milestoneRecs = set.recommendations.filter((r) => r.targetObjectType === 'milestone');
    expect(milestoneRecs.map((r) => [r.severity, r.reason])).toEqual([
      ['critical', 'Milestone "Pre-IND meeting package" is overdue (40% complete)'],
      ['high', 'Milestone "CMC section draft" due within 14 days (10% complete)'],
    ]);
    expect(warn.mock.calls.filter(([msg]) => String(msg).includes('Generator failed'))).toEqual([]);
  });

  it('a project with no linked program yields no milestone recommendations, and no failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const set = await generateRecommendations({ organizationId: ORG, projectId: UNLINKED, triggeredBy: 'test' });
    expect(set.recommendations.filter((r) => r.targetObjectType === 'milestone')).toEqual([]);
    expect(warn.mock.calls.filter(([msg]) => String(msg).includes('Generator failed'))).toEqual([]);
  });

  it('reads nothing for another organization, or for a soft-deleted program', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const foreign = await generateRecommendations({ organizationId: OTHER_ORG, projectId: LINKED, triggeredBy: 'test' });
    const retired = await generateRecommendations({ organizationId: ORG, projectId: LINKED_TO_DELETED, triggeredBy: 'test' });
    expect(foreign.recommendations.filter((r) => r.targetObjectType === 'milestone')).toEqual([]);
    expect(retired.recommendations.filter((r) => r.targetObjectType === 'milestone')).toEqual([]);
    expect(warn.mock.calls.filter(([msg]) => String(msg).includes('Generator failed'))).toEqual([]);
  });
});

describe('computeReadinessScore — a dimension nobody measured is null, not a placeholder', () => {
  const NOT_MEASURED = ['quality', 'consistency', 'compliance'];

  it('without a twin assessment, quality, consistency and compliance are null (they were 65, 70, 80)', async () => {
    const score = await computeReadinessScore({ organizationId: ORG, projectId: UNLINKED });
    expect(score.dimensions).toEqual({ completeness: 0, quality: null, consistency: null, compliance: null });
    expect(score.scoreBasis).toEqual({
      source: 'no_assessment_on_record',
      measured: ['completeness'],
      notMeasured: NOT_MEASURED,
    });
  });

  it('an empty project scores 0, not 46 from the placeholders', async () => {
    const score = await computeReadinessScore({ organizationId: ORG, projectId: UNLINKED });
    expect(score.overallScore).toBe(0);
  });

  it('the overall score covers only what was measured: document completeness', async () => {
    // 2 approved + 1 in review (0.7) + 1 draft (0.3) of 4 = 75.
    const score = await computeReadinessScore({ organizationId: ORG, projectId: DOCUMENTED });
    expect(score.dimensions.completeness).toBe(75);
    expect(score.overallScore).toBe(75);
  });

  it('the trend is unknown with no recorded scores, not stable with a delta of 0', async () => {
    const score = await computeReadinessScore({ organizationId: ORG, projectId: UNLINKED });
    expect(score.trend).toEqual({ direction: 'unknown', delta: null, dataPoints: 0 });
  });

  it('a twin assessment supplies what it recorded; a column it left empty stays null', async () => {
    const score = await computeReadinessScore({ organizationId: ORG, projectId: UNLINKED, programId: TWIN_PROGRAM });
    expect(score.dimensions).toEqual({ completeness: 0, quality: 80, consistency: null, compliance: 90 });
    expect(score.scoreBasis).toEqual({
      source: 'twin_assessment',
      measured: ['completeness', 'quality', 'compliance'],
      notMeasured: ['consistency'],
    });
    // (0×0.35 + 80×0.25 + 90×0.20) / 0.80 = 47.5
    expect(score.overallScore).toBe(48);
    // Empty prediction columns are null, not 0 % and 180 days.
    expect(score.predictions).toEqual({
      approvalProbability: null,
      estimatedReviewDays: null,
      estimatedDeficiencies: 3,
      basis: 'twin_assessment',
    });
    // One recorded score is not a trend.
    expect(score.trend).toEqual({ direction: 'unknown', delta: null, dataPoints: 1 });
  });

  it('another organization reads no twin assessment for a program it does not own', async () => {
    const score = await computeReadinessScore({ organizationId: OTHER_ORG, projectId: UNLINKED, programId: TWIN_PROGRAM });
    expect(score.dimensions).toEqual({ completeness: 0, quality: null, consistency: null, compliance: null });
    expect(score.scoreBasis.source).toBe('no_assessment_on_record');
    expect(score.predictions.basis).toBe('no_assessment_on_record');
  });

  it('with all four dimensions measured the overall score is the original weighted formula', () => {
    for (const [c, q, k, m] of [[0, 0, 0, 0], [100, 100, 100, 100], [75, 80, 60, 90], [33, 47, 91, 12]]) {
      expect(weightMeasured({ completeness: c, quality: q, consistency: k, compliance: m }).overallScore)
        .toBe(Math.round(c * 0.35 + q * 0.25 + k * 0.20 + m * 0.20));
    }
  });
});

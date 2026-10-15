/**
 * GET /api/governed-intelligence-inconsistency/projects/:projectId/inconsistency
 * returns the submission gate counted over EVERY finding of the project.
 *
 * The board's `findings` is a page — `limit` rows (200 by default), most severe
 * first. The Inconsistency surface used to count the gate from that page, after
 * re-scoring each finding in the browser, so a low-severity finding recorded
 * with blocks_promotion that sorted past the page was not counted and the
 * screen could read "clear" over a project checkPromotionBlocked holds. The
 * gate is now counted here, by contradictionEngineService.projectGate, from the
 * authority each finding was recorded with.
 *
 * Run against real Postgres (PGlite), with contradiction_findings taken from
 * its creating migration, through the real router and service. The assumption
 * and decision registries are stubbed empty: they are not under test here (a
 * failed read of either fails the board — see
 * governed-intelligence-inconsistency-supporting-reads-fail-closed.test.ts).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';

const pg = new PGlite();

const run = async (sql: string, params?: unknown[]) => {
  const r = await pg.query(sql, (params ?? []) as unknown[]);
  return { rows: r.rows as any[], rowCount: (r as { affectedRows?: number }).affectedRows ?? r.rows.length };
};

const H = vi.hoisted(() => ({ failGateCount: false }));

vi.mock('../../db', () => ({
  db: {},
  pool: {
    query: (sql: string, params?: unknown[]) => {
      if (H.failGateCount && /GROUP BY review_state, authority_state/.test(sql)) {
        return Promise.reject(new Error('Connection terminated unexpectedly'));
      }
      return run(sql, params);
    },
  },
  query: (sql: string, params?: unknown[]) => run(sql, params),
}));
vi.mock('../../services/assumption-registry-service', () => ({
  assumptionRegistryService: { search: async () => [] },
}));
vi.mock('../../services/decision-record-service', () => ({
  decisionRecordService: { search: async () => [] },
}));

import createGovernedIntelligenceInconsistencyRoutes from '../governed-intelligence-inconsistency-routes';
import { projectGateFromCounts } from '../../services/contradiction-engine-service';

const ORG = 9;
const OTHER_ORG = 4;
const PROJECT = 3;
const OVERLAY_RULE = '6c1d3e5f-7a8b-4c9d-8e0f-1a2b3c4d5e6f';

function app() {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 7, organizationId: ORG, role: 'member' };
    next();
  });
  a.use('/api/governed-intelligence-inconsistency', createGovernedIntelligenceInconsistencyRoutes());
  return a;
}

const readBoard = () =>
  request(app()).get(`/api/governed-intelligence-inconsistency/projects/${PROJECT}/inconsistency`);

/** n findings of one shape for the project, in `org`. */
async function insert(n: number, row: { org?: number; severity: string; authority: string; review?: string; regulator?: string | null; overlay?: string | null }) {
  await pg.query(
    `INSERT INTO contradiction_findings
       (organization_id, project_id, object_a_type, object_a_id, object_b_type, object_b_id,
        contradiction_type, severity, title, authority_state, review_state, regulator_body, overlay_rule_id)
     SELECT $1, $2, 'section', 'a' || g, 'section', 'b' || g, 'parameter_mismatch', $3,
            'Finding ' || g, $4, $5, $6, $7::uuid
       FROM generate_series(1, $8::int) AS g`,
    [row.org ?? ORG, PROJECT, row.severity, row.authority, row.review ?? 'unresolved', row.regulator ?? null, row.overlay ?? null, n],
  );
}

beforeAll(async () => {
  const migration = readFileSync(
    path.resolve(process.cwd(), 'migrations/20260524_contradiction_engine_schema.sql'),
    'utf8',
  );
  const ddl = migration.match(/CREATE TABLE IF NOT EXISTS contradiction_findings \([\s\S]*?\n\);/);
  if (!ddl) throw new Error('contradiction_findings DDL not found in its creating migration');
  await pg.exec(ddl[0]);
  // The header read needs a project row in the caller's organisation; it is not under test.
  await pg.exec(`CREATE TABLE projects (
    id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL,
    code TEXT, name TEXT NOT NULL, status TEXT, therapeutic_area TEXT)`);
  await pg.exec(`INSERT INTO projects VALUES (${PROJECT}, ${ORG}, 'BX-204', 'Bexarone in advanced NSCLC', 'active', 'NSCLC')`);
}, 60_000);

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  H.failGateCount = false;
  await pg.exec('DELETE FROM contradiction_findings;');
});

describe('the board counts the gate over every finding', () => {
  it('counts a blocker that sorted past the page, and the page does not hold it', async () => {
    await insert(201, { severity: 'critical', authority: 'advisory_only' });
    await insert(1, { severity: 'low', authority: 'blocks_promotion' });
    await insert(1, { severity: 'medium', authority: 'requires_review' });
    await insert(1, { severity: 'medium', authority: 'requires_signoff' });
    await insert(1, { severity: 'low', authority: 'blocks_promotion', review: 'approved_resolution' });
    await insert(1, { severity: 'low', authority: 'blocks_promotion', review: 'superseded' });
    // Another tenant's finding filed against the same project id is not this gate's.
    await insert(1, { org: OTHER_ORG, severity: 'critical', authority: 'blocks_promotion' });

    const res = await readBoard();
    expect(res.status).toBe(200);
    const { gate, findings } = res.body.data;

    expect(findings).toHaveLength(200);
    expect(
      findings.some((f: { authorityState: string; reviewState: string }) =>
        f.authorityState === 'blocks_promotion' && f.reviewState === 'unresolved'),
      'the page this assertion relies on holds no open blocker',
    ).toBe(false);

    expect(gate).toEqual({
      total: 206,
      open: 204,
      resolved: 1,
      superseded: 1,
      blocking: 1,
      needApproval: 0,
      needEscalation: 0,
      needReview: 1,
      advisory: 201,
      unrecognized: 1,
      blocked: true,
    });
  });

  it('carries each finding\'s recorded regulator body and overlay rule', async () => {
    await insert(1, { severity: 'high', authority: 'requires_approval', regulator: 'EMA', overlay: OVERLAY_RULE });

    const res = await readBoard();
    expect(res.status).toBe(200);
    expect(res.body.data.findings[0]).toMatchObject({
      authorityState: 'requires_approval',
      regulatorBody: 'EMA',
      overlayRuleId: OVERLAY_RULE,
    });
    expect(res.body.data.gate).toMatchObject({ total: 1, open: 1, needApproval: 1, blocked: false });
  });

  it('fails closed when the gate cannot be counted — never an empty gate', async () => {
    await insert(1, { severity: 'low', authority: 'blocks_promotion' });
    H.failGateCount = true;

    const res = await readBoard();
    expect(res.status).toBe(503);
    expect(res.body.data).toBeUndefined();
  });
});

describe('projectGateFromCounts', () => {
  it('takes counts as numbers or strings, and ignores empty groups', () => {
    const gate = projectGateFromCounts([
      { review_state: 'unresolved', authority_state: 'blocks_promotion', n: '2' },
      { review_state: 'under_review', authority_state: 'requires_escalation', n: 1 },
      { review_state: 'reviewed', authority_state: 'requires_approval', n: 1 },
      { review_state: 'approved_resolution', authority_state: 'blocks_promotion', n: 3 },
      { review_state: 'unresolved', authority_state: 'advisory_only', n: 0 },
    ]);
    expect(gate).toEqual({
      total: 7, open: 4, resolved: 3, superseded: 0,
      blocking: 2, needApproval: 1, needEscalation: 1, needReview: 0, advisory: 0, unrecognized: 0,
      blocked: true,
    });
  });

  it('is clear only when no open finding blocks', () => {
    expect(projectGateFromCounts([
      { review_state: 'superseded', authority_state: 'blocks_promotion', n: 1 },
      { review_state: 'unresolved', authority_state: 'requires_review', n: 1 },
    ]).blocked).toBe(false);
  });
});

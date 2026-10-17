/**
 * An unvalidated agency requirement is visible only to the organization whose
 * member wrote it. A validated one is served to every tenant.
 *
 * intelligence.agency_requirements had no organization column, and
 * GET /api/regulatory-intelligence/agency-requirements served unvalidated rows
 * by default (includeUnvalidated defaulted to true) with no tenant predicate. A
 * member of any organization could POST /patterns/:id/promote free text, and
 * every other tenant read it back as a discovered agency requirement.
 *
 * Now the table records the writer's organization (organization_id, amended
 * into its creating migration), the promote route binds it from the session,
 * and the read binds the caller's: unvalidated rows are the writer's own,
 * validated rows are everyone's, and a row written before the column existed
 * (no writer recorded) is served to no one until a curator validates it.
 *
 * Real DDL on PGlite: the creating migration, applied twice on an empty
 * database and once more over the table's earlier shape. The route and the
 * store are real; the session and the platform-role lookup are doubles.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({
  pg: null as unknown as import('@electric-sql/pglite').PGlite,
  orgId: 7,
  userId: 5,
  platform: (() => undefined) as unknown as import('vitest').Mock,
}));

vi.mock('../../db/runtime', async () => {
  const { pglitePool } = await import('../../services/ana-ri/__tests__/pglite-pool.fixture');
  const pool = pglitePool(() => h.pg);
  return { pool, getPool: () => pool, db: pool, getDb: () => pool };
});
vi.mock('../../middleware/requirePlatformAdmin', () => ({ holdsPlatformRole: (...a: unknown[]) => h.platform(...a) }));

import router from '../regulatory-intelligence';

const MIGRATION = fs.readFileSync(path.join(process.cwd(), 'db/migrations/20260520_ana_failure_learning.sql'), 'utf8');
const ORG_A = 7;
const ORG_B = 8;
const CURATOR_ORG = 9;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = { id: h.userId, userId: h.userId, role: 'admin', organizationId: h.orgId };
  (req as any).userId = h.userId;
  next();
});
app.use('/api/regulatory-intelligence', router);

const as = (orgId: number, userId = 5) => {
  h.orgId = orgId;
  h.userId = userId;
  return request(app);
};

let patternId = '';

async function promote(orgId: number, summary: string, validate = false) {
  const res = await as(orgId)
    .post(`/api/regulatory-intelligence/patterns/${patternId}/promote`)
    .send({ requirementSummary: summary, ...(validate ? { validateImmediately: true } : {}) });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data as { requirementId: string; validationStatus: string };
}

async function visibleTo(orgId: number, query = ''): Promise<string[]> {
  const res = await as(orgId).get(`/api/regulatory-intelligence/agency-requirements?agency=ema${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return (res.body.data as Array<{ requirementSummary: string }>).map(r => r.requirementSummary).sort();
}

const columns = async () =>
  (await h.pg.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'intelligence' AND table_name = 'agency_requirements'`,
  )).rows.map(r => r.column_name);

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(MIGRATION);
  await h.pg.exec(MIGRATION); // every file in the set re-runs on every deploy
}, 60_000);

afterAll(async () => {
  await h.pg.close();
});

beforeEach(async () => {
  h.platform = vi.fn().mockResolvedValue(false);
  await h.pg.exec(`DELETE FROM intelligence.agency_requirements; DELETE FROM intelligence.failure_patterns;`);
  const p = await h.pg.query<{ id: string }>(
    `INSERT INTO intelligence.failure_patterns
       (pattern_fingerprint, agency, document_type, intent_class, suggested_correction,
        failure_count, tenant_count, correction_quorum, confidence, extractor_version)
     VALUES ('fp-1', 'ema', 'cmc', 'draft', 'Add the PIP statement', 9, 4, 0.7, 0.71, 'failure-learning@1.0.0')
     RETURNING id`,
  );
  patternId = p.rows[0].id;
});

describe('the creating migration', () => {
  it('gives agency_requirements a writer organization, replayably', async () => {
    expect(await columns()).toContain('organization_id');
  });

  it('adds the column to a table created before it, leaving earlier rows with no writer recorded', async () => {
    // Reconstruct the earlier, unprotected shape before replaying its creator.
    await h.pg.exec(`DROP POLICY tenant_isolation_policy ON intelligence.agency_requirements;
      DROP POLICY agency_requirements_insert_own_org ON intelligence.agency_requirements;`);
    await h.pg.exec(`ALTER TABLE intelligence.agency_requirements DROP COLUMN organization_id`);
    await h.pg.query(
      `INSERT INTO intelligence.agency_requirements
         (agency, document_type, requirement_summary, source_pattern_id, tenant_count, occurrence_count, confidence)
       VALUES ('ema', 'cmc', 'written before the column', $1, 4, 9, 0.71)`,
      [patternId],
    );
    await h.pg.exec(MIGRATION);
    expect(await columns()).toContain('organization_id');
    const legacy = await h.pg.query<{ organization_id: unknown }>(
      `SELECT organization_id FROM intelligence.agency_requirements WHERE requirement_summary = 'written before the column'`,
    );
    expect(legacy.rows).toEqual([{ organization_id: null }]);
  });

  it('forces command-specific tenant protection without granting update or deletion', async () => {
    const table = await h.pg.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
       WHERE oid = 'intelligence.agency_requirements'::regclass`,
    );
    expect(table.rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
    const policies = await h.pg.query<{ policyname: string; cmd: string }>(
      `SELECT policyname, cmd FROM pg_policies
       WHERE schemaname = 'intelligence' AND tablename = 'agency_requirements' ORDER BY policyname`,
    );
    expect(policies.rows).toEqual([
      { policyname: 'agency_requirements_insert_own_org', cmd: 'INSERT' },
      { policyname: 'tenant_isolation_policy', cmd: 'SELECT' },
    ]);
  });
});

describe('GET /agency-requirements across two organizations', () => {
  it("does not serve one tenant's unvalidated requirement to another", async () => {
    const written = await promote(ORG_A, 'Org A: EMA wants the PIP statement in 1.10');
    expect(written.validationStatus).toBe('unvalidated');

    expect(await visibleTo(ORG_B), 'organization B was served organization A\'s unvalidated requirement').toEqual([]);
    expect(await visibleTo(ORG_A)).toEqual(['Org A: EMA wants the PIP statement in 1.10']);
  });

  it('records the writer organization from the session', async () => {
    const written = await promote(ORG_A, 'Org A: recorded against its writer');
    const row = await h.pg.query<{ organization_id: string | number }>(
      `SELECT organization_id FROM intelligence.agency_requirements WHERE id = $1`,
      [written.requirementId],
    );
    expect(Number(row.rows[0].organization_id)).toBe(ORG_A);
  });

  it('serves a curator-validated requirement to every tenant', async () => {
    h.platform = vi.fn().mockResolvedValue(true);
    const validated = await promote(CURATOR_ORG, 'Validated: EMA requires the PIP statement', true);
    expect(validated.validationStatus).toBe('validated');
    h.platform = vi.fn().mockResolvedValue(false);
    await promote(ORG_A, 'Org A: unvalidated note');

    expect(await visibleTo(ORG_B)).toEqual(['Validated: EMA requires the PIP statement']);
    expect(await visibleTo(ORG_A)).toEqual(['Org A: unvalidated note', 'Validated: EMA requires the PIP statement']);
    expect(await visibleTo(ORG_A, '&includeUnvalidated=false')).toEqual(['Validated: EMA requires the PIP statement']);
  });

  it('serves an unvalidated requirement with no recorded writer to no one', async () => {
    await h.pg.query(
      `INSERT INTO intelligence.agency_requirements
         (agency, document_type, requirement_summary, source_pattern_id, tenant_count, occurrence_count, confidence)
       VALUES ('ema', 'cmc', 'writer unknown', $1, 4, 9, 0.71)`,
      [patternId],
    );
    expect(await visibleTo(ORG_A)).toEqual([]);
    expect(await visibleTo(ORG_B)).toEqual([]);
  });
});

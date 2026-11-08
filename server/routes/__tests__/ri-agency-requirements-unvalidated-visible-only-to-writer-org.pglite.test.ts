/**
 * Failure learning retains client content inside its writer organization.
 * Curator validation is not reviewed de-identification, so even validated
 * client-derived requirements remain tenant-local (architecture v0.5 §27).
 * Real creating DDL and real route/service SQL run on PGlite; platform-role
 * lookup and authenticated identity are fixtures. A dedicated non-superuser
 * case also proves the database policy under a NOSUPERUSER/NOBYPASSRLS role.
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
  await h.pg.exec(`CREATE ROLE learning_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA intelligence TO learning_runtime;
    GRANT SELECT, INSERT ON intelligence.agency_requirements TO learning_runtime;
    GRANT SELECT ON intelligence.failure_patterns TO learning_runtime;`);
}, 60_000);

afterAll(async () => {
  await h.pg.close();
});

beforeEach(async () => {
  h.platform = vi.fn().mockResolvedValue(false);
  await h.pg.exec(`DELETE FROM intelligence.agency_requirements; DELETE FROM intelligence.failure_patterns; DELETE FROM intelligence.ana_interactions;`);
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

  it('quarantines legacy raw correction text at the database boundary without rewriting it', async () => {
    const secret = 'LEGACY_OWNERLESS_CMC_TRADE_SECRET_492';
    await h.pg.query('UPDATE intelligence.failure_patterns SET suggested_correction = $1 WHERE id = $2', [secret, patternId]);
    // Existing installations had neither flag; creator replay must protect them.
    await h.pg.exec('ALTER TABLE intelligence.failure_patterns DISABLE ROW LEVEL SECURITY');
    await h.pg.exec(MIGRATION);
    await h.pg.exec(MIGRATION);
    const flags = await h.pg.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'intelligence.failure_patterns'::regclass",
    );
    expect(flags.rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
    expect((await h.pg.query("SELECT policyname FROM pg_policies WHERE schemaname = 'intelligence' AND tablename = 'failure_patterns'")).rows).toEqual([]);
    for (const organizationId of [ORG_A, ORG_B, null]) {
      await h.pg.exec('BEGIN; SET LOCAL ROLE learning_runtime');
      try {
        await h.pg.query("SELECT set_config('app.current_tenant_id', $1, true)", [organizationId === null ? '' : String(organizationId)]);
        expect((await h.pg.query('SELECT suggested_correction FROM intelligence.failure_patterns WHERE id = $1', [patternId])).rows).toEqual([]);
      } finally {
        await h.pg.exec('ROLLBACK');
      }
    }
    // Privileged remediation retains the original record; no ownership guessed.
    expect((await h.pg.query<{ suggested_correction: string }>('SELECT suggested_correction FROM intelligence.failure_patterns WHERE id = $1', [patternId])).rows)
      .toEqual([{ suggested_correction: secret }]);
  });

  it('denies direct foreign and missing-tenant reads of validated rows under a real non-bypass role, including after replay', async () => {
    h.platform = vi.fn().mockResolvedValue(true);
    const a = await promote(ORG_A, 'TENANT_A_PRIVATE_MOLECULE', true);
    const b = await promote(ORG_B, 'TENANT_B_PRIVATE_PROCESS', true);
    // Recreate the formerly deployed broad policy, then prove the amended
    // creator tightens an existing policy rather than only fresh databases.
    await h.pg.exec(`ALTER POLICY tenant_isolation_policy ON intelligence.agency_requirements
      USING (validation_status = 'validated' OR organization_id =
        NULLIF(current_setting('app.current_tenant_id', true), '')::bigint);`);
    await h.pg.exec(MIGRATION);
    await h.pg.exec(MIGRATION);
    for (const [orgId, visibleIds] of [[ORG_A, [a.requirementId]], [ORG_B, [b.requirementId]], [null, []]] as const) {
      await h.pg.exec('BEGIN; SET LOCAL ROLE learning_runtime');
      try {
        await h.pg.query("SELECT set_config('app.current_tenant_id', $1, true)", [orgId === null ? '' : String(orgId)]);
        const identity = await h.pg.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
          'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
        );
        expect(identity.rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
        const visible = await h.pg.query<{ id: string }>(
          'SELECT id FROM intelligence.agency_requirements WHERE id = ANY($1::uuid[]) ORDER BY id',
          [[a.requirementId, b.requirementId]],
        );
        expect(visible.rows.map(row => row.id)).toEqual(visibleIds);
      } finally {
        await h.pg.exec('ROLLBACK');
      }
    }
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

  it('retains a curator-validated requirement in its writer tenant without de-identification evidence', async () => {
    h.platform = vi.fn().mockResolvedValue(true);
    const validated = await promote(CURATOR_ORG, 'Validated: EMA requires the PIP statement', true);
    expect(validated.validationStatus).toBe('validated');
    h.platform = vi.fn().mockResolvedValue(false);
    await promote(ORG_A, 'Org A: unvalidated note');

    expect(await visibleTo(ORG_B)).toEqual([]);
    expect(await visibleTo(ORG_A)).toEqual(['Org A: unvalidated note']);
    expect(await visibleTo(ORG_A, '&includeUnvalidated=false')).toEqual([]);
    expect(await visibleTo(CURATOR_ORG, '&includeUnvalidated=false')).toEqual(['Validated: EMA requires the PIP statement']);
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


describe('v0.5 shared-learning promotion boundary', () => {
  const SECRET_A = 'TENANT_A_MOLECULE_47_UNBLINDED_RESULT';
  const SECRET_B = 'TENANT_B_CMC_PROCESS_86_TRADE_SECRET';

  it('keeps unique corrections from two tenants out of extraction, suggestions and legacy replay', async () => {
    for (const [orgId, secret] of [[ORG_A, SECRET_A], [ORG_B, SECRET_B]] as const) {
      const recorded = await as(orgId).post('/api/regulatory-intelligence/interactions').send({
        agency: 'ema', documentType: 'cmc', intent: 'draft', outcome: 'edited',
        promptSummary: 'Draft Module 3', correctionText: secret,
      });
      expect(recorded.status, JSON.stringify(recorded.body)).toBe(201);
    }
    const retained = await h.pg.query<{ organization_id: number; correction_text: string }>(
      'SELECT organization_id::integer, correction_text FROM intelligence.ana_interactions ORDER BY organization_id',
    );
    expect(retained.rows).toEqual([
      { organization_id: ORG_A, correction_text: SECRET_A },
      { organization_id: ORG_B, correction_text: SECRET_B },
    ]);

    // Even an existing legacy row, marked active with a large cohort, cannot
    // establish either de-identification or named human artifact approval.
    await h.pg.query(
      `UPDATE intelligence.failure_patterns SET suggested_correction = $1,
         tenant_count = 999, failure_count = 999 WHERE id = $2`, [SECRET_A, patternId],
    );
    const extracted = await as(ORG_A).post('/api/regulatory-intelligence/patterns/extract').send({
      minTenantCount: 1, minFailureCount: 1, correctionQuorum: 0,
      deidentified: true, approvedBy: 'request-body-cannot-grant-promotion',
    });
    expect(extracted.status).toBe(200);
    expect(extracted.body.data).toEqual({ evaluated: 0, promoted: 0, suppressed: 0,
      holdReason: 'deidentification_and_human_promotion_required' });

    for (const orgId of [ORG_A, ORG_B]) {
      const corrections = await as(orgId).get('/api/regulatory-intelligence/corrections?agency=ema&documentType=cmc&intent=draft');
      expect(corrections.status).toBe(200);
      expect(corrections.body.data).toEqual([]);
      expect(JSON.stringify(corrections.body)).not.toContain(SECRET_A);
      expect(JSON.stringify(corrections.body)).not.toContain(SECRET_B);
    }
    const { replayPattern, replayRecentlyPromoted, getActiveWarnings } = await import('../../services/intelligence/counterfactual-replay');
    expect(await replayPattern(patternId)).toMatchObject({ warningsCreated: 0, tenantsWarned: 0,
      holdReason: 'deidentification_and_human_promotion_required' });
    expect(await replayRecentlyPromoted()).toMatchObject({ patternsReplayed: 0, warningsCreated: 0,
      holdReason: 'deidentification_and_human_promotion_required' });
    expect(await getActiveWarnings({ organizationId: ORG_B })).toEqual([]);
    const count = await h.pg.query<{ count: number }>('SELECT count(*)::integer FROM intelligence.failure_patterns');
    expect(count.rows[0].count).toBe(1); // extraction wrote no shared correction
  });

  it('does not disclose tenant-specific content merely because a curator validated it', async () => {
    h.platform = vi.fn().mockResolvedValue(true);
    await promote(ORG_A, SECRET_A, true);
    await promote(ORG_B, SECRET_B, true);
    expect(await visibleTo(ORG_A)).toEqual([SECRET_A]);
    expect(await visibleTo(ORG_B)).toEqual([SECRET_B]);
    expect(await visibleTo(CURATOR_ORG)).toEqual([]);
  });
});

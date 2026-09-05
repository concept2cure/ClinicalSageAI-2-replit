/**
 * Contract: the Clinical Operations surface reads a store that MIGRATIONS
 * create — not one the router creates on the first request.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * server/routes/clinical-operations-routes.ts opened every handler with
 * `await ensureTables()`, which ran CREATE SCHEMA IF NOT EXISTS clinical_ops
 * and six CREATE TABLEs on the request's own connection. That connection is the
 * non-superuser runtime role in every deployment that uses one, and it may not
 * create schemas. Verified live against a fully provisioned database with
 * RLS_ENFORCE=on:
 *
 *   GET /api/clinical-operations/studies  → 500 CLINOPS_STUDIES_FAIL
 *   GET /api/clinical-operations/overview → 500 CLINOPS_OVERVIEW_FAIL
 *   log: 42501 permission denied for database
 *        at ensureTables (clinical-operations-routes.ts:116)
 *
 * The "created once" flag is set only after the DDL succeeds, so the failure
 * repeated on every request. client/src/concept2cure/v2/surfaces/ClinicalOps.tsx
 * reads /api/clinical-operations/studies, so a shipped surface could not load.
 *
 * ── What this proves ──────────────────────────────────────────────────────────
 *   - the router issues NO DDL: not in its source, and not at runtime;
 *   - against the canonical migration the read and write paths work;
 *   - org_id is the INTEGER every other tenant key in this database is, and a
 *     study is stamped with the caller's organization;
 *   - a caller from another organization sees none of it.
 *
 * @compliance 21 CFR Part 11 §11.10(a) — validation of systems to ensure
 *             accuracy and reliability. A surface whose store is created by
 *             whichever request arrives first is neither.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import request from 'supertest';
import { createJourneyDb, type JourneyDb } from '../golden-journeys/harness';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROUTER_SRC = path.join(REPO_ROOT, 'server/routes/clinical-operations-routes.ts');
const T = 60_000;

const ORG_A = 1;
const ORG_B = 2;

const PREREQ = `
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
  INSERT INTO organizations (id, name) VALUES (${ORG_A}, 'Meridian'), (${ORG_B}, 'Other Sponsor');
`;

let jdb: JourneyDb;
let app: express.Express;
/** The tenant the next request presents. */
let actingOrg: number | null = ORG_A;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: ['db/migrations/20260902_clinical_ops_schema.sql'],
  });

  const { default: createClinicalOperationsRoutes } = await import(
    '../../server/routes/clinical-operations-routes'
  );
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).tenantId = actingOrg;
    (req as any).tenantContext = { organizationId: actingOrg };
    next();
  });
  app.use('/api/clinical-operations', createClinicalOperationsRoutes(jdb.pool as never));
}, T);

afterAll(async () => {
  await jdb?.close();
});

describe('the router does not provision its own store', () => {
  it('issues no DDL in its source', () => {
    const src = fs
      .readFileSync(ROUTER_SRC, 'utf8')
      // Strip comments: the note explaining why the DDL is gone names it.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/CREATE\s+SCHEMA/i);
    expect(src).not.toMatch(/CREATE\s+TABLE/i);
    expect(src).not.toMatch(/ALTER\s+TABLE/i);
    expect(src).not.toMatch(/ensureTables/);
  });

  it('issues no DDL at runtime either — reading is only reading', async () => {
    // A source scan cannot see DDL built at run time, so record what the two
    // endpoints the surface calls actually send to the database.
    const executed: string[] = [];
    const realQuery = (jdb.pool as never as { query: Function }).query.bind(jdb.pool);
    const patched = vi
      .spyOn(jdb.pool as never, 'query' as never)
      .mockImplementation(((sql: unknown, params?: unknown) => {
        executed.push(String(typeof sql === 'string' ? sql : (sql as { text: string }).text));
        return realQuery(sql, params);
      }) as never);
    try {
      await request(app).get('/api/clinical-operations/overview').expect(200);
      await request(app).get('/api/clinical-operations/studies').expect(200);
    } finally {
      patched.mockRestore();
    }

    expect(executed.length).toBeGreaterThan(0);
    expect(executed.filter(s => /CREATE\s+(SCHEMA|TABLE)|ALTER\s+TABLE/i.test(s))).toEqual([]);
  }, T);
});

describe('against the canonical migration, the surface works', () => {
  it('lists studies on a store that has never been written to', async () => {
    const res = await request(app).get('/api/clinical-operations/studies').expect(200);
    expect(res.body).toMatchObject({ success: true, data: [], total: 0 });
  }, T);

  it('creates a study stamped with the caller’s organization, as an INTEGER', async () => {
    actingOrg = ORG_A;
    const res = await request(app)
      .post('/api/clinical-operations/studies')
      .send({
        name: 'MER-204 First-in-Human',
        protocol: 'MER-204-001',
        phase: 'Phase 1',
        status: 'recruiting',
        indication: 'Advanced solid tumours',
        targetEnrollment: 48,
        sites: 3,
      })
      .expect(201);
    expect(res.body.data.org_id).toBe(ORG_A);
    // Not '1'. The column is INTEGER, and the RLS predicate casts to ::INT.
    expect(typeof res.body.data.org_id).toBe('number');

    const stored = await jdb.pool.query(
      `SELECT org_id, pg_typeof(org_id)::text AS type FROM clinical_ops.studies`,
    );
    expect(stored.rows[0]).toMatchObject({ org_id: ORG_A, type: 'integer' });
  }, T);

  it('the overview KPIs are derived from the rows, not from a fixture', async () => {
    const res = await request(app).get('/api/clinical-operations/overview').expect(200);
    expect(res.body.data.kpis).toMatchObject({ totalStudies: 1, totalTarget: 48, totalEnrolled: 0 });
  }, T);

  it('another organization sees none of it', async () => {
    actingOrg = ORG_B;
    const res = await request(app).get('/api/clinical-operations/studies').expect(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);

    // …and cannot reach the row by id either.
    const { rows } = await jdb.pool.query(`SELECT id FROM clinical_ops.studies LIMIT 1`);
    await request(app)
      .get(`/api/clinical-operations/studies/${rows[0].id}`)
      .expect(404);
    actingOrg = ORG_A;
  }, T);
});

describe('the store the service reads, not just the one the router writes', () => {
  it('endpoint_results exists — the trial-card metric had no table to read', async () => {
    // server/services/regulatory-programs.service.ts reads
    // `SELECT … FROM clinical_ops.endpoint_results WHERE study_id = $1` behind
    // an is-undefined-table catch, so the endpoints-achieved figure was null on
    // every card. The router never created it; the migration does.
    const { rows } = await jdb.pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'clinical_ops' AND table_name = 'endpoint_results'
        ORDER BY column_name`,
    );
    expect(rows.map((r: { column_name: string }) => r.column_name)).toEqual(
      expect.arrayContaining(['study_id', 'status', 'endpoint_name']),
    );
  }, T);

  it('deviations carries severity — the adverse-event rate reads it', async () => {
    const { rows } = await jdb.pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'clinical_ops' AND table_name = 'deviations'
          AND column_name = 'severity'`,
    );
    expect(rows).toHaveLength(1);
  }, T);

  it('every child table is reachable only through a study (FK + parent-scoped policy)', async () => {
    const children = [
      'sites',
      'enrollment_records',
      'monitoring_visits',
      'deviations',
      'milestones',
      'endpoint_results',
    ];
    const fks = await jdb.pool.query(
      `SELECT c.relname AS child
         FROM pg_constraint con
         JOIN pg_class c ON c.oid = con.conrelid
         JOIN pg_class ref ON ref.oid = con.confrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'clinical_ops' AND con.contype = 'f' AND ref.relname = 'studies'`,
    );
    const withParentFk = new Set(fks.rows.map((r: { child: string }) => r.child));
    for (const child of children) expect(withParentFk.has(child)).toBe(true);

    const policies = await jdb.pool.query(
      `SELECT tablename FROM pg_policies
        WHERE schemaname = 'clinical_ops' AND policyname = 'tenant_isolation_policy'`,
    );
    const policied = new Set(policies.rows.map((r: { tablename: string }) => r.tablename));
    for (const t of ['studies', ...children]) expect(policied.has(t)).toBe(true);
  }, T);
});

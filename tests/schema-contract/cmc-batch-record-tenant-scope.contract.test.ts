/**
 * Security contract: a NULL-tenant cmc_batch_records row belongs to its
 * organization, not to every organization — and a batch release must never be
 * signed over a record the UPDATE did not touch.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * server/api/cmc/batchRecordRoutes.ts carried the same three faults that
 * specificationRoutes.ts carried for quality_specifications, on a path with a
 * higher consequence: batch disposition.
 *
 *   1. `(tenant_id = $2 OR tenant_id IS NULL)` on the list read, the PUT's
 *      existence check, and the RELEASE existence check. `tenant_id` is a
 *      nullable TEXT column added by db/migrations/20260401_cmc_convergence_os.sql
 *      to an ALREADY POPULATED table (created by migrations/0006 without it), so
 *      every pre-20260401 row carries NULL forever. Under OR-NULL those rows
 *      were readable — and releasable — by every organization.
 *
 *      Unlike quality_specifications, this table already HAS a true tenant
 *      column: `organization_id INTEGER NOT NULL REFERENCES organizations(id)`
 *      (migrations/0006). A legacy row is therefore not unattributed at all —
 *      its owner is recorded, just in the other column. So the repair is not
 *      "drop OR-NULL and orphan the legacy rows"; it is to resolve them through
 *      the column that actually names their owner:
 *      `(tenant_id = $2 OR organization_id = $2)`. That is the predicate
 *      server/services/cmc/contradiction-registers.ts already uses for this
 *      same table.
 *
 *   2. Both UPDATEs (PUT and RELEASE) carried `WHERE id = $n` with NO tenant
 *      predicate at all. Once the existence SELECT let a caller through, the
 *      write was scoped by primary key alone.
 *
 *   3. The release path took `updateResult.rows[0]` unguarded. If the UPDATE
 *      matched nothing the handler continued: it recorded a governed
 *      e-signature against `batch:${id}`, COMMITted, and returned 200 with
 *      `batchRecord: undefined` — a release signature manifested over a record
 *      the transaction did not write.
 *
 * A batch release is the GMP disposition decision (21 CFR 211.22, 211.192) and
 * its e-signature is a 21 CFR 11.50 manifestation. Releasing another sponsor's
 * batch, or signing a release that wrote nothing, is the failure this file
 * exists to make impossible.
 *
 * ── Why this test executes SQL ────────────────────────────────────────────────
 * Which rows a predicate returns is decided by the database, not by a grep. So
 * this builds the table from the REAL migrations, drives the REAL router over
 * supertest against a PGlite-backed pool, and asserts on rows.
 *
 * @compliance 21 CFR 211.22/211.192 (batch disposition); 21 CFR 11.50/11.70
 *             (signature manifestation and record linking); tenant isolation.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const PARITY = 'migrations/20260823_cmc_register_store_parity.sql';

// ── PGlite-backed pool shim, hoisted so vi.mock can close over it ────────────
const h = vi.hoisted(() => {
  const holder: { pg: any; afterQuery: null | ((sql: string) => Promise<void>) } = {
    pg: null,
    // Seam for modelling a concurrent writer: invoked after each statement
    // resolves, so a test can change the table BETWEEN two statements of the
    // route's transaction.
    afterQuery: null,
  };
  const wrap = async (sql: string, params?: unknown[]) => {
    const r = await holder.pg.query(sql, params as unknown[]);
    if (holder.afterQuery) await holder.afterQuery(sql);
    return {
      rows: r.rows as any[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  };
  const pool = {
    query: (s: string, p?: unknown[]) => wrap(s, p),
    connect: async () => ({
      query: (s: string, p?: unknown[]) => wrap(s, p),
      release: () => undefined,
    }),
  };
  return { holder, wrap, pool };
});

vi.mock('../../server/db', () => ({
  getPool: () => h.pool,
  pool: h.pool,
  db: {},
  getDb: () => ({}),
  query: (s: string, p?: unknown[]) => h.pool.query(s, p),
  transaction: async (fn: any) => fn(h.pool),
  healthCheck: async () => true,
  runMigrations: async () => undefined,
  ensureAuthTables: async () => undefined,
  dbStatus: { connected: true },
  createFallbackResult: (rows: any[] = []) => ({ rows, rowCount: rows.length }),
}));

// The canonical write-through and the governance gate are stubbed so that a 404
// is attributable to tenant scope and nothing else. The signature counter is
// what proves no e-signature was recorded for a refused release.
const gov = vi.hoisted(() => ({ signatures: 0 }));
vi.mock('../../server/services/cmc-write-through', () => ({
  // The real signature returns a WriteThroughOutcome; linkToModule3 reads
  // `.ok` off it, so `undefined` here 500s the route under test.
  writeThroughBatchRecord: async () => ({ ok: true }),
}));
vi.mock('../../server/routes/c2c/actions', () => ({
  verifyReauth: async () => ({ ok: true }),
  recordGovernedAction: async () => {
    gov.signatures += 1;
    return { actionId: 'a', sha256Chain: 'h' };
  },
}));

import batchRecordRouter from '../../server/api/cmc/batchRecordRoutes';

const PROJECT = '22222222-2222-4222-8222-222222222222';
const OWNED_BATCH = 'B-OWNED-001';
const LEGACY_BATCH = 'B-LEGACY-002';
const RELEASE = {
  decision: 'approved',
  reason: 'All release specifications met; batch approved for use.',
  releasedBy: 'QA Head',
  reauth: { password: 'correct horse battery staple' },
  releaseTesting: { appearance: 'pass', assay: 'pass' },
};

let currentTenant: number = 1;
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).tenantId = currentTenant;
  (req as any).user = { id: 42 };
  next();
});
app.use('/api/cmc/batch-records', batchRecordRouter);

/**
 * The real cmc_batch_records shape, assembled the way a deployed database gets
 * it: migrations/0006 creates it WITHOUT tenant_id, the convergence migration
 * adds tenant_id nullable afterwards, and the parity migration adds the columns
 * the routes write. Reduced to this table (0006 carries FKs to organizations,
 * cmc_projects and stability_studies, which are not what is under test) but
 * with the nullability and the two tenant columns preserved exactly, because
 * those are the properties the predicate is judged against.
 */
const BASE_DDL = `
CREATE TABLE IF NOT EXISTS cmc_batch_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  project_id UUID,
  batch_number TEXT NOT NULL,
  manufacturing_date DATE,
  expiry_date DATE,
  batch_size TEXT,
  deviations JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
`;
/** db/migrations/20260401_cmc_convergence_os.sql:121 — nullable, no backfill. */
const TENANT_COLUMN_DDL = `ALTER TABLE cmc_batch_records ADD COLUMN IF NOT EXISTS tenant_id TEXT;`;

/** The route-shape columns, sliced out of the real parity migration. */
function parityBatchDdl(): string {
  const src = read(PARITY);
  const stmts = src
    .split(';')
    .map((s) => s.trim())
    .filter((s) => /cmc_batch_records/.test(s) && /ADD COLUMN/i.test(s));
  expect(stmts.length, `no cmc_batch_records ADD COLUMN found in ${PARITY}`).toBeGreaterThan(0);
  // The migration wraps them in a DO $$ block guarded on to_regclass; the table
  // exists here, so the guarded statements are replayed directly.
  return stmts
    .map((s) => s.replace(/^[\s\S]*?(ALTER TABLE)/i, '$1'))
    .map((s) => s + ';')
    .join('\n');
}

const opened: PGlite[] = [];
let ownedId = '';
let legacyId = '';

beforeEach(async () => {
  const pg = new PGlite();
  opened.push(pg);
  await pg.exec(BASE_DDL);
  await pg.exec(TENANT_COLUMN_DDL);
  await pg.exec(parityBatchDdl());
  h.holder.pg = pg;
  h.holder.afterQuery = null;
  gov.signatures = 0;
  currentTenant = 1;

  const owned = await pg.query<{ id: string }>(
    `INSERT INTO cmc_batch_records (project_id, organization_id, tenant_id, batch_number, product_name, status)
     VALUES ($1, 1, '1', $2, 'Owned product', 'in-progress') RETURNING id`,
    [PROJECT, OWNED_BATCH],
  );
  ownedId = owned.rows[0].id;

  // A row that predates the tenant_id column: organization_id names its owner,
  // tenant_id is NULL forever.
  const legacy = await pg.query<{ id: string }>(
    `INSERT INTO cmc_batch_records (project_id, organization_id, tenant_id, batch_number, product_name, status)
     VALUES ($1, 1, NULL, $2, 'Legacy product', 'in-progress') RETURNING id`,
    [PROJECT, LEGACY_BATCH],
  );
  legacyId = legacy.rows[0].id;
});

afterAll(async () => {
  for (const pg of opened) {
    try {
      await pg.close();
    } catch {
      /* noop */
    }
  }
});

async function batchRow(id: string): Promise<any> {
  const r = await h.holder.pg.query(`SELECT * FROM cmc_batch_records WHERE id = $1`, [id]);
  return r.rows[0];
}

describe('cmc_batch_records is scoped to the caller organization, and only to it', () => {
  it('does not list a legacy NULL-tenant row to a foreign organization', async () => {
    currentTenant = 2;
    const res = await request(app).get(`/api/cmc/batch-records/${PROJECT}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: any) => r.batch_number)).toEqual([]);
  }, 60_000);

  it('refuses a foreign-organization PUT on a legacy row, and leaves the row untouched', async () => {
    currentTenant = 2;
    const res = await request(app)
      .put(`/api/cmc/batch-records/${legacyId}`)
      .send({ productName: 'hijacked' });
    expect(res.status).toBe(404);
    expect((await batchRow(legacyId)).product_name).toBe('Legacy product');
  }, 60_000);

  it('refuses a foreign-organization RELEASE on a legacy row, and signs nothing', async () => {
    currentTenant = 2;
    const res = await request(app)
      .post(`/api/cmc/batch-records/${legacyId}/release`)
      .send(RELEASE);
    expect(res.status).toBe(404);
    const row = await batchRow(legacyId);
    // Another sponsor's batch must not be dispositioned.
    expect(row.release_status ?? null).toBeNull();
    expect(row.released_by ?? null).toBeNull();
    expect(gov.signatures, 'a release signature was recorded against a foreign batch').toBe(0);
  }, 60_000);

  // ── Positive controls: the fix must not be "scope everything to nothing" ──
  it('still lists the owning organization BOTH its rows, legacy included', async () => {
    currentTenant = 1;
    const res = await request(app).get(`/api/cmc/batch-records/${PROJECT}`);
    expect(res.status).toBe(200);
    const numbers = res.body.data.map((r: any) => r.batch_number).sort();
    // The legacy row is not orphaned by the repair — organization_id names its
    // owner, so its owner keeps seeing it.
    expect(numbers).toEqual([OWNED_BATCH, LEGACY_BATCH].sort());
  }, 60_000);

  it('lets the owning organization release its own legacy row', async () => {
    currentTenant = 1;
    const res = await request(app)
      .post(`/api/cmc/batch-records/${legacyId}/release`)
      .send(RELEASE);
    expect(res.status).toBe(200);
    expect((await batchRow(legacyId)).release_status).toBe('released');
    expect(gov.signatures).toBe(1);
  }, 60_000);

  it('lets the owning organization update its own row', async () => {
    currentTenant = 1;
    const res = await request(app)
      .put(`/api/cmc/batch-records/${ownedId}`)
      .send({ productName: 'Owned product rev B' });
    expect(res.status).toBe(200);
    expect((await batchRow(ownedId)).product_name).toBe('Owned product rev B');
  }, 60_000);
});

/**
 * The UPDATE must carry the tenant predicate itself, not inherit it from the
 * SELECT that ran before it. A SELECT is not a lock, and a write scoped by
 * primary key alone is one refactor away from being reachable without it.
 */
describe('the writes are tenant-scoped in their own right', () => {
  /** Re-tenant the row as soon as the handler's existence SELECT has returned. */
  function stealAfterExistenceSelect(id: string): void {
    let fired = false;
    h.holder.afterQuery = async (sql: string) => {
      if (fired) return;
      if (!/SELECT \* FROM cmc_batch_records WHERE id/.test(sql)) return;
      fired = true;
      await h.holder.pg.query(
        `UPDATE cmc_batch_records SET organization_id = 9, tenant_id = '9' WHERE id = $1`,
        [id],
      );
    };
  }

  it('PUT does not write a row that stopped being the caller\'s between SELECT and UPDATE', async () => {
    currentTenant = 1;
    stealAfterExistenceSelect(ownedId);

    await request(app).put(`/api/cmc/batch-records/${ownedId}`).send({ productName: 'hijacked' });
    h.holder.afterQuery = null;

    expect((await batchRow(ownedId)).product_name).toBe('Owned product');
  }, 60_000);

  it('RELEASE does not disposition a row that stopped being the caller\'s, and signs nothing', async () => {
    currentTenant = 1;
    stealAfterExistenceSelect(ownedId);

    const res = await request(app).post(`/api/cmc/batch-records/${ownedId}/release`).send(RELEASE);
    h.holder.afterQuery = null;

    // Not a 200 carrying `batchRecord: undefined` — a release that did not happen.
    expect(res.status, 'a release over an untouched record must not read as success').toBe(404);
    const row = await batchRow(ownedId);
    expect(row.release_status ?? null).toBeNull();
    expect(gov.signatures, 'a 21 CFR 11.50 release signature was manifested over a record the UPDATE did not write').toBe(0);
  }, 60_000);
});

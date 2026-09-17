/**
 * Security contract: a NULL-tenant quality_specifications row belongs to
 * nobody, not to everybody.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * server/api/cmc/specificationRoutes.ts scoped every read of
 * quality_specifications with `(tenant_id = $n OR tenant_id IS NULL)`. The
 * column is nullable with no default and no backfill
 * (migrations/20260823_cmc_register_store_parity.sql), and
 * db/migrations/20260401_cmc_convergence_os.sql added it to an ALREADY
 * POPULATED table on legacy installs — so every row that predates the parity
 * file carries NULL forever. Under that predicate those rows were readable by
 * every organization, and the PUT's UPDATE carried NO tenant predicate at all
 * (`WHERE id = $k`), so they were writable by every organization too. The
 * governed approve path would then e-sign another sponsor's specification and
 * record the signature under the wrong org.
 *
 * Nothing in the repo produces a deliberately global specification: the only
 * INSERT stamps the caller's tenant behind a 401 guard, and no seeder, script
 * or fixture writes this table. So OR-NULL bought nothing and leaked
 * everything. server/routes/part11-compliance.ts:479-486 already records the
 * same rationale for removing `OR es.organization_id IS NULL`.
 *
 * ── Why this test executes SQL ────────────────────────────────────────────────
 * Which rows a predicate returns is decided by the database, not by a grep. So
 * this file builds the table from the REAL migration (which is also what pins
 * the column's nullability rather than restating it), drives the REAL router
 * over supertest against a PGlite-backed pool, and asserts on rows.
 *
 * @compliance 21 CFR Part 11 / ICH E6(R2) — tenant isolation of submission-bound
 *             Module 3 specification content and its e-signature trail.
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
const EVIDENCE = 'db/migrations/20260730_cmc_evidence_tables.sql';
const TENANT_REQUIRED = 'migrations/20260907_quality_specifications_tenant_required.sql';

/** The real specification_audit_log DDL, sliced out of its own migration. */
function auditLogDdl(): string {
  const src = read(EVIDENCE);
  const m = src.match(
    /CREATE TABLE IF NOT EXISTS specification_audit_log[\s\S]*?;\s*\nCREATE INDEX IF NOT EXISTS specification_audit_log_spec_idx[^;]*;/,
  );
  expect(m, 'specification_audit_log DDL not found in ' + EVIDENCE).toBeTruthy();
  return m![0];
}

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
// is attributable to tenant scope and nothing else.
vi.mock('../../server/services/cmc-write-through', () => ({
  // The real signature returns a WriteThroughOutcome; linkToModule3 reads
  // `.ok` off it, so `undefined` here 500s the route under test.
  writeThroughSpecification: async () => ({ ok: true }),
}));
const gov = vi.hoisted(() => ({ signatures: 0 }));
vi.mock('../../server/routes/c2c/actions', () => ({
  verifyReauth: async () => ({ ok: true }),
  recordGovernedAction: async () => {
    gov.signatures += 1;
    return { actionId: 'a', sha256Chain: 'h' };
  },
}));

import specificationRouter from '../../server/api/cmc/specificationRoutes';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const OWNED_NAME = 'Tenant-1 API spec';
const ORPHAN_NAME = 'Legacy unattributed spec';
const SIGNATURE = {
  reason: 'Release the specification for filing.',
  meaning: 'approval',
  reauth: { password: 'correct horse battery staple' },
};

let currentTenant: number = 1;
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).tenantId = currentTenant;
  (req as any).user = { id: 42 };
  next();
});
app.use('/api/cmc/specifications', specificationRouter);

const opened: PGlite[] = [];
async function freshDb(extraMigrations: string[] = []): Promise<PGlite> {
  const pg = new PGlite();
  opened.push(pg);
  await pg.exec(read(PARITY));
  await pg.exec(auditLogDdl());
  for (const rel of extraMigrations) await pg.exec(read(rel));
  return pg;
}

let ownedId = '';
let orphanId = '';

beforeEach(async () => {
  const pg = await freshDb();
  h.holder.pg = pg;
  h.holder.afterQuery = null;
  gov.signatures = 0;
  currentTenant = 1;

  const owned = await pg.query<{ id: string }>(
    `INSERT INTO quality_specifications (project_id, tenant_id, material_type, material_name)
     VALUES ($1, 1, 'drug-substance', $2) RETURNING id`,
    [PROJECT, OWNED_NAME],
  );
  ownedId = owned.rows[0].id;

  const orphan = await pg.query<{ id: string }>(
    `INSERT INTO quality_specifications (project_id, tenant_id, material_type, material_name)
     VALUES ($1, NULL, 'drug-product', $2) RETURNING id`,
    [PROJECT, ORPHAN_NAME],
  );
  orphanId = orphan.rows[0].id;

  await pg.query(
    `INSERT INTO specification_audit_log (specification_id, action, changed_by) VALUES ($1, 'created', 'legacy')`,
    [orphanId],
  );
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

async function specRow(id: string): Promise<any> {
  const r = await h.holder.pg.query(`SELECT * FROM quality_specifications WHERE id = $1`, [id]);
  return r.rows[0];
}

describe('quality_specifications is scoped to the caller tenant, and only to it', () => {
  it('does not list a NULL-tenant row to a foreign tenant', async () => {
    currentTenant = 2;
    const res = await request(app).get(`/api/cmc/specifications/${PROJECT}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  }, 60_000);

  it('refuses a foreign tenant PUT on a NULL-tenant row, and leaves the row untouched', async () => {
    currentTenant = 2;
    const res = await request(app)
      .put(`/api/cmc/specifications/${orphanId}`)
      .send({ materialName: 'hijacked' });
    expect(res.status).toBe(404);
    const row = await specRow(orphanId);
    expect(row.material_name).toBe(ORPHAN_NAME);
  }, 60_000);

  it('refuses a foreign tenant approve on a NULL-tenant row, and leaves it in draft', async () => {
    currentTenant = 2;
    const res = await request(app)
      .post(`/api/cmc/specifications/${orphanId}/approve`)
      .send(SIGNATURE);
    expect(res.status).toBe(404);
    const row = await specRow(orphanId);
    expect(row.approval_status).toBe('draft');
  }, 60_000);

  it('does not return the audit history of a NULL-tenant row to a foreign tenant', async () => {
    currentTenant = 2;
    const res = await request(app).get(`/api/cmc/specifications/${orphanId}/history`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  }, 60_000);

  // ── Positive controls: the fix must not be "scope everything to nothing" ──
  it('still lists the owning tenant its own row', async () => {
    // A positive control: it passes before AND after the fix, so "scope
    // everything to nothing" cannot be mistaken for a repair.
    currentTenant = 1;
    const res = await request(app).get(`/api/cmc/specifications/${PROJECT}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: any) => r.material_name)).toContain(OWNED_NAME);
  }, 60_000);

  it('lets the owning tenant update its own row', async () => {
    currentTenant = 1;
    const res = await request(app)
      .put(`/api/cmc/specifications/${ownedId}`)
      .send({ materialName: 'Tenant-1 API spec rev B' });
    expect(res.status).toBe(200);
    const row = await specRow(ownedId);
    expect(row.material_name).toBe('Tenant-1 API spec rev B');
  }, 60_000);

  it('lets the owning tenant approve its own row', async () => {
    currentTenant = 1;
    const res = await request(app)
      .post(`/api/cmc/specifications/${ownedId}/approve`)
      .send(SIGNATURE);
    expect(res.status).toBe(200);
    const row = await specRow(ownedId);
    expect(row.approval_status).toBe('approved');
  }, 60_000);

  it('returns the owning tenant its own audit history', async () => {
    currentTenant = 1;
    await h.holder.pg.query(
      `INSERT INTO specification_audit_log (specification_id, action, changed_by) VALUES ($1, 'created', 'system')`,
      [ownedId],
    );
    const res = await request(app).get(`/api/cmc/specifications/${ownedId}/history`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  }, 60_000);
});

describe('the store refuses a tenant-less specification', () => {
  it('ships a migration that requires tenant_id', () => {
    expect(
      fs.existsSync(path.join(REPO_ROOT, TENANT_REQUIRED)),
      `${TENANT_REQUIRED} is missing: nothing stops a new tenant-less row`,
    ).toBe(true);
  });

  it('rejects an INSERT with no tenant_id', async () => {
    const extra = fs.existsSync(path.join(REPO_ROOT, TENANT_REQUIRED)) ? [TENANT_REQUIRED] : [];
    const pg = await freshDb(extra);
    await expect(
      pg.query(
        `INSERT INTO quality_specifications (project_id, material_type, material_name)
         VALUES ($1, 'drug-substance', 'no tenant')`,
        [PROJECT],
      ),
    ).rejects.toThrow(/quality_specifications_tenant_id_required/);
  }, 60_000);

  it('leaves legacy NULL rows in place rather than deleting them', async () => {
    const extra = fs.existsSync(path.join(REPO_ROOT, TENANT_REQUIRED)) ? [TENANT_REQUIRED] : [];
    const pg = new PGlite();
    opened.push(pg);
    await pg.exec(read(PARITY));
    await pg.query(
      `INSERT INTO quality_specifications (project_id, tenant_id, material_type, material_name)
       VALUES ($1, NULL, 'drug-product', $2)`,
      [PROJECT, ORPHAN_NAME],
    );
    for (const rel of extra) await pg.exec(read(rel));
    const r = await pg.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM quality_specifications WHERE tenant_id IS NULL`,
    );
    expect(r.rows[0].n).toBe(1);
  }, 60_000);
});

/**
 * The approve path must fail closed when its UPDATE matches nothing.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The handler checked existence with a SELECT and then ran the UPDATE, taking
 * `updateResult.rows[0]` unguarded. A SELECT is not a lock. If the row goes
 * away between the two statements — a concurrent delete, a tenant re-key — the
 * UPDATE matches nothing, `updatedSpec` is `undefined`, and the handler
 * continued: it recorded a governed e-signature, wrote a
 * specification_audit_log row whose `new_values` is `null`, COMMITted, and
 * returned 200 with `data: undefined`.
 *
 * Under 21 CFR 11.50 a signature manifestation names the record it applies to.
 * A signature recorded against a specification that is not there is a falsified
 * one, and the 200 tells the caller their filing content is approved when no
 * such record exists. CLAUDE.md: fail closed, never fabricate.
 *
 * The window is narrow, so it is opened deliberately here rather than waited
 * for: the pool seam deletes the row the moment the handler's existence SELECT
 * returns.
 */
describe('approve fails closed when the record vanishes mid-transaction', () => {
  /** Delete the row as soon as the handler's existence SELECT has returned. */
  function deleteAfterExistenceSelect(id: string): void {
    let fired = false;
    h.holder.afterQuery = async (sql: string) => {
      if (fired) return;
      if (!/SELECT \* FROM quality_specifications WHERE id/.test(sql)) return;
      fired = true;
      await h.holder.pg.query(`DELETE FROM quality_specifications WHERE id = $1`, [id]);
    };
  }

  it('returns 404 and records no signature when the UPDATE matches no row', async () => {
    currentTenant = 1;
    deleteAfterExistenceSelect(ownedId);

    const res = await request(app)
      .post(`/api/cmc/specifications/${ownedId}/approve`)
      .send(SIGNATURE);

    // Not a 200 carrying `data: undefined` — an approval that did not happen.
    expect(res.status, 'an approval over a vanished record must not read as success').toBe(404);
    expect(res.body.success).toBe(false);
    // No e-signature may be attributed to a record that is not there.
    expect(gov.signatures, 'a governed signature was recorded for a nonexistent specification').toBe(0);
  }, 60_000);

  it('writes no audit-log row attesting the phantom approval', async () => {
    currentTenant = 1;
    deleteAfterExistenceSelect(ownedId);

    await request(app).post(`/api/cmc/specifications/${ownedId}/approve`).send(SIGNATURE);
    h.holder.afterQuery = null;

    const log = await h.holder.pg.query(
      `SELECT action, new_values FROM specification_audit_log WHERE specification_id = $1`,
      [ownedId],
    );
    expect(log.rows, 'an "approved" audit entry with new_values NULL was written').toEqual([]);
  }, 60_000);

  // Positive control: the guard must refuse only the vanished case. Re-run of
  // the ordinary approval with the seam armed for a DIFFERENT row, so the
  // interceptor is live and the approval still succeeds.
  it('still approves normally while the seam is armed for another row', async () => {
    currentTenant = 1;
    deleteAfterExistenceSelect(orphanId);

    const res = await request(app)
      .post(`/api/cmc/specifications/${ownedId}/approve`)
      .send(SIGNATURE);
    h.holder.afterQuery = null;

    expect(res.status).toBe(200);
    expect((await specRow(ownedId)).approval_status).toBe('approved');
    expect(gov.signatures).toBe(1);
  }, 60_000);
});

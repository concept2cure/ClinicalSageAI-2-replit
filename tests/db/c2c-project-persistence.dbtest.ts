/**
 * `POST /api/c2c/projects` against real PostgreSQL — the W0-1 acceptance gate.
 *
 * ── Why this cannot be a unit test ───────────────────────────────────────────
 * server/routes/c2c/__tests__/projects-create.test.ts already covers this
 * handler with a mocked pool, and all twenty of its cases passed throughout the
 * outage this file exists to close. They had to: the reported defect was a 503
 * carrying `PENDING_STORE`, which the handler returns when Postgres raises
 * 42P01 (undefined_table). A mock has no catalog, so it cannot be missing a
 * table, so the one condition that actually broke project creation in a
 * customer-visible way is unreachable from the mocked suite by construction.
 *
 * What was really wrong was never the handler. It was that no provisioning path
 * applied the whole schema, so the tables the handler writes were absent in the
 * environment under test. That is a property of a real database, and only a
 * real database can witness it.
 *
 * So this suite asserts the end-to-end contract the work order names:
 *   1. a device program is CREATED (201) and carries the portfolio display shape
 *   2. it is RETRIEVABLE afterwards through the same projection the list uses
 *   3. the creation left a hash-chained `audit_logs` row — a program a regulated
 *      tenant cannot evidence is not a record they can defend
 *   4. the fail-closed 503 discloses NO schema object to the client
 *
 * (4) is the one that would otherwise regress silently. The 503 body is correct
 * fail-closed behaviour and must stay; what must never come back is the table
 * name riding along in the user-facing copy.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

/** Marks every row this suite creates, so cleanup never touches anything else. */
const PROBE_PREFIX = 'dbtest-w01 ';

let owner: Pool;
let orgId: number;
let userId: number;
let app: express.Express;

/**
 * The router under test, mounted behind a stub that supplies exactly the
 * request fields the real `authMiddleware` populates
 * (server/bootstrap/register-inline-routes.ts:829). Authentication is not what
 * is being tested; persistence is.
 *
 * `establishRequestTenantScope` is the REAL middleware, not a stub, and that is
 * deliberate: this project runs with `RLS_ENFORCE=on` (tests/setup.db.ts), so
 * every `pool.query` fails closed without an active tenant scope. Faking the
 * scope would test the handler against a permission model production does not
 * have — and row-level security is precisely the kind of guarantee that only a
 * real database can witness.
 */
async function buildApp(): Promise<express.Express> {
  const router = (await import('../../server/routes/c2c/projects')).default;
  const { establishRequestTenantScope } = await import(
    '../../server/middleware/establishRequestTenantScope'
  );
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.tenantId = orgId;
    r.userRole = 'admin';
    r.user = { id: userId, organizationId: orgId, role: 'admin' };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/c2c/projects', router);
  return a;
}

async function cleanupProbeRows(): Promise<void> {
  await owner.query(
    `DELETE FROM c2c_document_sections WHERE document_id IN (
       SELECT d.id FROM c2c_documents d
        JOIN regulatory_programs p ON p.id = d.project_id
       WHERE p.name LIKE $1)`,
    [`${PROBE_PREFIX}%`],
  );
  await owner.query(
    `DELETE FROM c2c_documents WHERE project_id IN (
       SELECT id FROM regulatory_programs WHERE name LIKE $1)`,
    [`${PROBE_PREFIX}%`],
  );
  await owner.query(
    `DELETE FROM audit_logs WHERE action = 'c2c.project.create'
       AND record_id IN (SELECT id::text FROM regulatory_programs WHERE name LIKE $1)`,
    [`${PROBE_PREFIX}%`],
  );
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE_PREFIX}%`]);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });

  // A tenant and an actor to create under. Both are upserted rather than
  // assumed: this suite provisions its own fixture so it does not depend on
  // whatever seed the surrounding CI job happened to run.
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [`${PROBE_PREFIX}tenant`, 'dbtest-w01-tenant'],
  );
  orgId = Number(org.rows[0].id);

  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    ['dbtest-w01@example.test', `${PROBE_PREFIX}actor`, 'not-a-real-hash'],
  );
  userId = Number(user.rows[0].id);

  await cleanupProbeRows();
  app = await buildApp();
});

afterAll(async () => {
  await cleanupProbeRows().catch(() => {});
  await owner.end().catch(() => {});
});

describe('POST /api/c2c/projects — persistence against real PostgreSQL', () => {
  it('creates a 510(k) device program and returns 201 with the portfolio shape', async () => {
    const res = await request(app).post('/api/c2c/projects').send({
      name: `${PROBE_PREFIX}AeroFlow Smart Peak Flow Meter`,
      productName: 'AeroFlow AF-1000',
      programType: '510k',
      primaryAgency: 'FDA',
    });

    expect(res.status).toBe(201);
    // The display contract the Projects grid renders — every field the list
    // projection promises, so a created project can be shown without a refetch.
    expect(res.body.data).toMatchObject({
      title: `${PROBE_PREFIX}AeroFlow Smart Peak Flow Meter`,
      ws: 'MDX',
      status: 'active',
    });
    expect(res.body.data.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(res.body.meta.created).toBe(true);
  });

  it('persists the device program as a device, never as a biologic', async () => {
    const { rows } = await owner.query(
      `SELECT program_type, product_type FROM regulatory_programs
        WHERE organization_id = $1 AND name = $2`,
      [orgId, `${PROBE_PREFIX}AeroFlow Smart Peak Flow Meter`],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].program_type).toBe('510k');
    // The work order's domain invariant: a 510(k) is a device submission. It is
    // not a biologic, and no path may resolve it to one.
    expect(rows[0].product_type).toBe('device');
    expect(rows[0].product_type).not.toBe('biologic');
  });

  it('makes the created program retrievable through the list projection', async () => {
    const res = await request(app).get('/api/c2c/projects');
    expect(res.status).toBe(200);
    const titles = (res.body.data as Array<{ title: string }>).map((r) => r.title);
    expect(titles).toContain(`${PROBE_PREFIX}AeroFlow Smart Peak Flow Meter`);
  });

  it('writes a hash-chained audit row for the creation', async () => {
    const { rows } = await owner.query(
      `SELECT al.action, al.target_type, al.payload_hash, al.sha256_chain, al.actor_id
         FROM audit_logs al
         JOIN regulatory_programs p ON p.id::text = al.record_id
        WHERE al.action = 'c2c.project.create' AND p.name = $1`,
      [`${PROBE_PREFIX}AeroFlow Smart Peak Flow Meter`],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].target_type).toBe('regulatory_program');
    expect(Number(rows[0].actor_id)).toBe(userId);
    // Part 11: the row is sealed, not merely present.
    expect(rows[0].payload_hash).toMatch(/^[0-9a-f]{64}$/i);
    expect(rows[0].sha256_chain).toMatch(/^[0-9a-f]{64}$/i);
  });

  it('creates an EU MDR technical file as a device, in the MDX workstream', async () => {
    // The regression this pins. `mdr` was absent from every branch of the
    // server's product-class derivation and fell through to a bare
    // `return 'drug'`, so an EU MDR Class IIb technical file — a device
    // conformity assessment — persisted as a drug programme. It was also absent
    // from the workstream bucketing, so it listed under a "Mdr" workstream that
    // matches none of the portfolio's filter tabs and was invisible in MDX.
    const res = await request(app).post('/api/c2c/projects').send({
      name: `${PROBE_PREFIX}AeroFlow EU Technical File`,
      programType: 'mdr',
      primaryAgency: 'EMA',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.ws).toBe('MDX');

    const { rows } = await owner.query(
      `SELECT program_type, product_type FROM regulatory_programs
        WHERE organization_id = $1 AND name = $2`,
      [orgId, `${PROBE_PREFIX}AeroFlow EU Technical File`],
    );
    expect(rows[0].program_type).toBe('mdr');
    expect(rows[0].product_type).toBe('device');
    expect(rows[0].product_type).not.toBe('drug');
  });

  it('creates an EU IVDR technical file as an IVD', async () => {
    const res = await request(app).post('/api/c2c/projects').send({
      name: `${PROBE_PREFIX}Companion Assay EU`,
      programType: 'ivdr',
      primaryAgency: 'EMA',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.ws).toBe('MDX');

    const { rows } = await owner.query(
      `SELECT product_type FROM regulatory_programs WHERE organization_id = $1 AND name = $2`,
      [orgId, `${PROBE_PREFIX}Companion Assay EU`],
    );
    expect(rows[0].product_type).toBe('ivd');
  });

  it('refuses to record a device filing as a medicinal product', async () => {
    // The exact payload the wizard used to send: a 510(k) with the product
    // class read off the UI segment. The server accepted it and stored
    // `510K · biologic`. A filing type is a regulatory fact; a client may not
    // contradict it, so this is now a 400 rather than a persisted mistake.
    const res = await request(app).post('/api/c2c/projects').send({
      name: `${PROBE_PREFIX}Should Not Persist`,
      programType: '510k',
      productType: 'biologic',
      primaryAgency: 'FDA',
    });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/device submission/i);

    const { rows } = await owner.query(
      `SELECT 1 FROM regulatory_programs WHERE organization_id = $1 AND name = $2`,
      [orgId, `${PROBE_PREFIX}Should Not Persist`],
    );
    expect(rows).toHaveLength(0);
  });

  it('accepts the new device-family classes', async () => {
    for (const [suffix, productType] of [['SaMD', 'samd'], ['CDx', 'cdx']] as const) {
      const res = await request(app).post('/api/c2c/projects').send({
        name: `${PROBE_PREFIX}Class ${suffix}`,
        programType: '510k',
        productType,
        primaryAgency: 'FDA',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.ws).toBe('MDX');
    }
  });

  it('creates an IVD 510(k) as an IVD', async () => {
    const res = await request(app).post('/api/c2c/projects').send({
      name: `${PROBE_PREFIX}Companion Assay`,
      programType: '510k',
      productType: 'ivd',
      primaryAgency: 'FDA',
    });
    expect(res.status).toBe(201);

    const { rows } = await owner.query(
      `SELECT product_type FROM regulatory_programs WHERE organization_id = $1 AND name = $2`,
      [orgId, `${PROBE_PREFIX}Companion Assay`],
    );
    expect(rows[0].product_type).toBe('ivd');
  });
});

describe('the fail-closed 503 discloses no schema object', () => {
  /**
   * Guardrail 2 of the remediation programme: no backend exception text, SQL,
   * table name, file path, env var or API route may reach client-facing UI.
   *
   * The 503 itself is correct and stays — an unprovisioned store must fail
   * closed rather than report a fabricated success. What is asserted here is
   * that its user-facing copy names none of the above. The store name is an
   * operator fact and belongs in the server log, keyed by the correlation id
   * the response carries.
   *
   * Driven against a program type whose quota probe hits a table that does not
   * exist, so the 42P01 is real rather than simulated.
   */
  it('returns a human message and a correlation id, and names no relation', async () => {
    await owner.query('ALTER TABLE organizations RENAME TO organizations__w01_probe');
    try {
      const res = await request(app).post('/api/c2c/projects').send({
        name: `${PROBE_PREFIX}Unprovisioned`,
        programType: '510k',
        primaryAgency: 'FDA',
      });

      expect(res.status).toBe(503);

      const body = JSON.stringify(res.body);
      // The enum stays as a machine-readable code…
      expect(res.body.error).toBe('PENDING_STORE');
      // …and the human copy is a sentence, not a token.
      expect(typeof res.body.message).toBe('string');
      expect(res.body.message.length).toBeGreaterThan(20);
      // A support handle the user can quote, so the outage stays diagnosable
      // without disclosing the schema.
      expect(res.body.correlationId).toMatch(/^[0-9a-z-]{6,}$/i);

      // Nothing anywhere in the envelope names a schema object or an internal.
      expect(body).not.toMatch(/organizations__w01_probe/);
      expect(body).not.toMatch(/relation "/i);
      expect(body).not.toMatch(/\bselect\s+"/i);
      expect(body).not.toMatch(/Failed query/i);
      expect(body).not.toMatch(/\/api\//);
      expect(body).not.toMatch(/DATABASE_URL|process\.env/);
    } finally {
      await owner.query('ALTER TABLE organizations__w01_probe RENAME TO organizations');
    }
  });
});

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
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { activeJwtSecret } from '../../server/utils/jwtVerify';
import { databaseUrl } from '../setup.db';
import type { RequestDb } from '../../server/db/requestDb';

const RUN_ID = randomUUID();
/** Every run owns fresh QA rows; history is retained. */
const PROBE_PREFIX = `dbtest-w01 ${RUN_ID} `;

let owner: Pool;
let orgId: number;
let orgUuid: string;
let ambiguousOrgUuid: string;
/** An organisation with two workspaces, neither its own: P-19's refusal case. */
let ambiguousOrgId: number;
/** The organization of the explicit authenticated actor for this request. */
let actingOrgId: number;
let userId: number;
let app: express.Express;
/** The first program this suite creates, and its project record. */
let createdProgramId = '';
let createdAnchorId = 0;

/**
 * The router under test, mounted behind canonical requireTenantContext with
 * a signed token for the explicit real fixture actor
 * (server/bootstrap/register-inline-routes.ts:829). Authentication is not what
 * is being tested; persistence is.
 *
 * `requireTenantContext` verifies actual organization membership and attaches
 * the real request SQL client. That boundary is
 * deliberate: this project runs with `RLS_ENFORCE=on` (tests/setup.db.ts), so
 * every `pool.query` fails closed without an active tenant scope. Faking the
 * scope would test the handler against a permission model production does not
 * have — and row-level security is precisely the kind of guarantee that only a
 * real database can witness.
 */
async function buildApp(): Promise<express.Express> {
  const router = (await import('../../server/routes/c2c/projects')).default;
  const { requireTenantContext } = await import('../../server/middleware/tenantContext');
  const a = express();
  a.use(express.json());
  a.use(requireTenantContext);
  a.use('/api/c2c/projects', router);
  return a;
}

/** Explicit current fixture actor; the canonical middleware reads its real OU. */
function actingRequest() {
  const token = jwt.sign({ type: 'access', userId: String(userId), organizationId: String(actingOrgId),
    organizationUuid: actingOrgId === orgId ? orgUuid : ambiguousOrgUuid }, activeJwtSecret(), { expiresIn: '15m' });
  const authorization = `Bearer ${token}`;
  return { post: (url: string) => request(app).post(url).set('Authorization', authorization),
    get: (url: string) => request(app).get(url).set('Authorization', authorization) };
}

/**
 * Give an organisation its own workspace through the writer every organisation
 * creator calls (signup, first-run setup, the boot seed), on an owner
 * connection, as they do. This fixture inserts its organisation directly, the
 * one shape no in-product path produces: before P-19 the program was created
 * here with no project record (NO_CLIENT_WORKSPACE), and this suite passed on
 * exactly the state the QA walk of 2026-10-08 found broken.
 */
async function giveOrganizationItsWorkspace(id: number, name: string, slug: string): Promise<void> {
  const { ensureOrganizationDefaultWorkspace, poolClientWorkspaceStore } = await import(
    '../../server/services/c2c/organization-default-workspace'
  );
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await ensureOrganizationDefaultWorkspace(poolClientWorkspaceStore(client), { orgId: id, orgName: name, orgSlug: slug });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });

  // A tenant and an actor to create under. Both are fresh and explicitly recorded rather than
  // assumed: this suite provisions its own fixture so it does not depend on
  // whatever seed the surrounding CI job happened to run.
  const org = await owner.query(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id,uuid`,
    [`${PROBE_PREFIX}tenant`, `dbtest-w01-${RUN_ID}-tenant`],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String(org.rows[0].uuid);
  actingOrgId = orgId;
  await giveOrganizationItsWorkspace(orgId, `${PROBE_PREFIX}tenant`, `dbtest-w01-${RUN_ID}-tenant`);

  // Two client workspaces and neither the organisation's own: intake cannot
  // choose where the program's project record belongs, so it must refuse.
  const ambiguous = await owner.query(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id,uuid`,
    [`${PROBE_PREFIX}two-workspace tenant`, `dbtest-w01-${RUN_ID}-two-ws`],
  );
  ambiguousOrgId = Number(ambiguous.rows[0].id);
  ambiguousOrgUuid = String(ambiguous.rows[0].uuid);
  await owner.query(
    `INSERT INTO client_workspaces (organization_id, name, slug, status) VALUES
       ($1, 'Client A', 'dbtest-w01-a', 'active'), ($1, 'Client B', 'dbtest-w01-b', 'active')
     ON CONFLICT (organization_id, slug) DO NOTHING`,
    [ambiguousOrgId],
  );

  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, $2, $3, 'active') RETURNING id`,
    [`dbtest-w01-${RUN_ID}@example.invalid`, `${PROBE_PREFIX}actor`, 'not-a-real-hash'],
  );
  userId = Number(user.rows[0].id);

  await owner.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$3,'admin'),($2,$3,'admin')", [orgId, ambiguousOrgId, userId]);
  app = await buildApp();
});

afterAll(async () => {
  await owner.end().catch(() => {});
});

describe('POST /api/c2c/projects — persistence against real PostgreSQL', () => {
  it('creates a 510(k) device program and returns 201 with the portfolio shape', async () => {
    const res = await actingRequest().post('/api/c2c/projects').send({
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
    createdProgramId = String(res.body.data.id);
    createdAnchorId = Number(res.body.meta.projectAnchorId);
  });

  it('gives the program its project record in the same creation, and it resolves strict (P-19)', async () => {
    const { rows } = await owner.query(
      `SELECT p.id, p.organization_id, p.type, w.organization_id AS workspace_org,
              (w.metadata::jsonb ->> 'defaultForOrganization') AS own_workspace
         FROM projects p JOIN client_workspaces w ON w.id = p.client_workspace_id
        WHERE p.regulatory_program_id = $1`,
      [createdProgramId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ organization_id: orgId, workspace_org: orgId, type: 'regulatory', own_workspace: 'true' });
    expect(Number(rows[0].id)).toBe(createdAnchorId);

    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { resolveProgramProjectAnchor } = await import('../../server/services/c2c/program-project-anchor');
    const resolved = await resolveProgramProjectAnchor(drizzle(owner) as unknown as RequestDb, {
      programId: createdProgramId, orgId, context: 'dbtest-w01', strict: true,
    });
    expect(resolved).toBe(createdAnchorId);
  });

  it('refuses a program whose project record has no workspace to go in, and writes nothing (P-19)', async () => {
    const held = async () => (await owner.query(
      `SELECT (SELECT count(*)::int FROM regulatory_programs WHERE organization_id = $1) AS programs,
              (SELECT count(*)::int FROM projects WHERE organization_id = $1) AS projects,
              (SELECT count(*)::int FROM audit_logs WHERE action = 'c2c.project.create' AND tenant_id = $1) AS audit_rows`,
      [ambiguousOrgId],
    )).rows[0];
    const before = await held();
    actingOrgId = ambiguousOrgId;
    try {
      const res = await actingRequest().post('/api/c2c/projects').send({
        name: `${PROBE_PREFIX}No Workspace To Choose`,
        programType: '510k',
        primaryAgency: 'FDA',
      });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ error: 'PROJECT_RECORD_UNAVAILABLE', reason: 'AMBIGUOUS_CLIENT_WORKSPACE' });
      expect(res.body.correlationId).toEqual(expect.any(String));
      expect(JSON.stringify(res.body)).not.toMatch(/client_workspace_id|regulatory_program_id|projects\./);
    } finally {
      actingOrgId = orgId;
    }
    expect(await held()).toEqual(before);
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
    const res = await actingRequest().get('/api/c2c/projects');
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
    const res = await actingRequest().post('/api/c2c/projects').send({
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
    const res = await actingRequest().post('/api/c2c/projects').send({
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
    const res = await actingRequest().post('/api/c2c/projects').send({
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
      const res = await actingRequest().post('/api/c2c/projects').send({
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
    const res = await actingRequest().post('/api/c2c/projects').send({
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
   * The admitted actor remains verifiable while the quota count’s program store
   * is temporarily absent. This real DDL fault requires an exclusive disposable
   * native target; it is not executed during preparation.
   */
  it('returns a human message and a correlation id, and names no relation', async () => {
    await owner.query('ALTER TABLE regulatory_programs RENAME TO regulatory_programs__w01_probe');
    try {
      const res = await actingRequest().post('/api/c2c/projects').send({
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
      await owner.query('ALTER TABLE regulatory_programs__w01_probe RENAME TO regulatory_programs');
    }
  });
});

/**
 * `POST /api/vault/ingest` against real PostgreSQL — the W0-6 acceptance gate.
 *
 * ── Why a real database is the only thing that could have caught this ────────
 * This route is the ONLY endpoint in the product that persists uploaded bytes,
 * computes a SHA-256 of them, and writes a document row. It has never worked.
 *
 * `vault.documents` had two definitions that never agreed: an 11-column table
 * from `db/migrations/044c_gcc_vault_schema.sql` (created with CREATE TABLE IF
 * NOT EXISTS, so it wins), and the 28-column Drizzle model in
 * `shared/schema/vault.ts` that the route is written against. Against a
 * provisioned database the INSERT raised
 *
 *     ERROR:  column "document_code" of relation "documents" does not exist
 *
 * so every upload in the product returned 500. A mocked pool cannot witness
 * that — it has no catalog, so it cannot be missing a column, and the mocked
 * suites were green throughout. The divergence is a property of a real
 * database, and only a real database can see it.
 *
 * ── What this suite pins ─────────────────────────────────────────────────────
 *   1. an upload SUCCEEDS and the row carries the SHA-256 of the actual bytes
 *   2. the bytes are on disk at the key the row records — a hash for bytes
 *      nobody holds is a record that lies, and the route used to produce
 *      exactly that by treating the write as best-effort
 *   3. the ingestion left a hash-chained `audit_logs` row naming the actor and
 *      the content hash — a document that entered the governed corpus with no
 *      record of who put it there is not evidence a tenant can defend
 *   4. the document and its audit row are ATOMIC — neither can exist alone
 *   5. a caller from another organization is refused and writes nothing
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { databaseUrl } from '../setup.db';

/** Marks every row this suite creates, so cleanup never touches anything else. */
const PROBE_PREFIX = 'dbtest-w06 ';
const PROBE_CODE = 'DBTEST-W06-DOC';

let owner: Pool;
let orgId: number;
let otherOrgId: number;
let userId: number;
let programId: string;
let otherProgramId: string;
let app: express.Express;

/** A real PDF, minimal but with the magic bytes the upload-safety check needs. */
const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'utf8',
);
const PDF_SHA256 = createHash('sha256').update(PDF_BYTES).digest('hex');

/**
 * The router under test behind a stub supplying exactly what the real
 * `authMiddleware` populates. Authentication is not what is being tested;
 * ingestion is. `req.user.organizationId` is what the route's ownership guard
 * reads, so switching it is how the cross-tenant case below is expressed.
 */
let actingOrgId: () => number;

async function buildApp(): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const { establishRequestTenantScope } = await import(
    '../../server/middleware/establishRequestTenantScope'
  );
  const a = express();
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.tenantId = actingOrgId();
    r.userRole = 'admin';
    r.user = { id: userId, organizationId: actingOrgId(), role: 'admin' };
    next();
  });
  /* The REAL middleware, not a stub. This project runs with RLS_ENFORCE=on
     (tests/setup.db.ts), so a bare `pool.query` fails closed without an active
     tenant scope — which is exactly what the route's ownership check does. In
     production `authMiddleware` (server/auth.ts:113 → :215) establishes the
     scope for every authenticated /api route before the handler runs, so
     omitting it here would have tested the route against a permission model
     production does not have. It cost six red tests to notice, and the red was
     the harness, not the route. */
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  return a;
}

async function cleanupProbeRows(): Promise<void> {
  /* audit_logs is append-only at the database level
     (db/migrations/20260617_audit_logs_immutability.sql); the retention path's
     per-transaction opt-in is the one authorized door, and a suite tearing down
     its own probe rows is that kind of caller. SET LOCAL keeps it to this
     transaction. */
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.audit_archive_bypass = 'on'`);
    await client.query(
      `DELETE FROM audit_logs WHERE action = 'vault.document.ingest'
         AND record_id IN (SELECT id::text FROM vault.documents WHERE document_code LIKE $1)`,
      [`${PROBE_CODE}%`],
    );
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
  }
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${PROBE_CODE}%`]);
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE_PREFIX}%`]);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });

  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PROBE_PREFIX}tenant`, 'dbtest-w06-tenant'],
  );
  orgId = Number(org.rows[0].id);

  const other = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PROBE_PREFIX}other tenant`, 'dbtest-w06-other'],
  );
  otherOrgId = Number(other.rows[0].id);

  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    ['dbtest-w06@example.test', `${PROBE_PREFIX}actor`, 'not-a-real-hash'],
  );
  userId = Number(user.rows[0].id);

  await cleanupProbeRows();

  const prog = await owner.query(
    /* Every NOT NULL column without a default. The suite provisions its own
       fixture rather than depending on whatever seed the surrounding CI job ran. */
    `INSERT INTO regulatory_programs
       (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, '510k', 'device', 'FDA', $4) RETURNING id`,
    [`${PROBE_PREFIX}device program`, 'DBTEST-W06-A', orgId, 'AeroFlow AF-1000'],
  );
  programId = String(prog.rows[0].id);

  const otherProg = await owner.query(
    `INSERT INTO regulatory_programs
       (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, '510k', 'device', 'FDA', $4) RETURNING id`,
    [`${PROBE_PREFIX}other tenant program`, 'DBTEST-W06-B', otherOrgId, 'Other AF-2000'],
  );
  otherProgramId = String(otherProg.rows[0].id);

  actingOrgId = () => orgId;
  app = await buildApp();
});

afterAll(async () => {
  await cleanupProbeRows().catch(() => {});
  await owner.end().catch(() => {});
});

describe('POST /api/vault/ingest — the document actually lands', () => {
  it('accepts the upload and records the SHA-256 of the bytes that were sent', async () => {
    const res = await request(app)
      .post('/api/vault/ingest')
      .field('programId', programId)
      .field('documentCode', PROBE_CODE)
      .field('documentTitle', 'Design History File extract')
      .field('documentType', 'OTHER')
      .attach('file', PDF_BYTES, 'dhf-extract.pdf');

    expect(res.status).toBe(201);
    expect(res.body.document.contentHash).toBe(PDF_SHA256);
    expect(res.body.document.fileSize).toBe(PDF_BYTES.length);
  });

  it('persisted a row carrying the canonical columns the route writes', async () => {
    /* Each of these was one of the sixteen columns that did not exist. Asserting
       the VALUES rather than the row count is what makes this a regression test
       for the schema divergence rather than for the handler. */
    const { rows } = await owner.query(
      `SELECT document_code, document_title, document_type, s3_bucket, s3_key,
              file_name, file_size, mime_type, content_hash, classification,
              processing_status, created_by
         FROM vault.documents WHERE document_code = $1`,
      [PROBE_CODE],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      document_code: PROBE_CODE,
      document_title: 'Design History File extract',
      document_type: 'OTHER',
      s3_bucket: 'local',
      file_name: 'dhf-extract.pdf',
      mime_type: 'application/pdf',
      content_hash: PDF_SHA256,
      classification: 'INTERNAL',
      processing_status: 'PENDING',
    });
    /* created_by is an INTEGER matching users.id. As the model's original uuid
       this column could never have held a real value. */
    expect(Number(rows[0].created_by)).toBe(userId);
  });

  it('the bytes are on disk at the key the row records', async () => {
    /* The route used to catch a failed write, log it at warn, and INSERT
       anyway — committing a real SHA-256 for bytes that are not anywhere. The
       row and the file have to agree, so read the file the row points at and
       hash it back. */
    const { rows } = await owner.query(
      `SELECT s3_key FROM vault.documents WHERE document_code = $1`,
      [PROBE_CODE],
    );
    const onDisk = await fs.readFile(path.resolve(process.cwd(), rows[0].s3_key));
    expect(createHash('sha256').update(onDisk).digest('hex')).toBe(PDF_SHA256);
  });
});

describe('POST /api/vault/ingest — the Part 11 record of who put it there', () => {
  it('wrote a hash-chained audit row naming the actor and the content hash', async () => {
    const { rows } = await owner.query(
      `SELECT a.action, a.actor_id, a.tenant_id, a.sha256_chain, a.payload_hash, a.new_values
         FROM audit_logs a
         JOIN vault.documents d ON d.id::text = a.record_id
        WHERE d.document_code = $1 AND a.action = 'vault.document.ingest'`,
      [PROBE_CODE],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].actor_id)).toBe(userId);
    expect(Number(rows[0].tenant_id)).toBe(orgId);
    /* The chain link and the payload digest are what make the entry evidence
       rather than a log line. */
    expect(rows[0].sha256_chain).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].payload_hash).toMatch(/^[0-9a-f]{64}$/);

    const details =
      typeof rows[0].new_values === 'string' ? JSON.parse(rows[0].new_values) : rows[0].new_values;
    /* WHICH bytes were admitted, not merely that an upload happened — this is
       the link that makes a later integrity check mean anything. */
    expect(JSON.stringify(details)).toContain(PDF_SHA256);
  });

  it('a document and its audit row cannot exist without each other', async () => {
    const docs = await owner.query(
      `SELECT count(*)::int AS n FROM vault.documents WHERE document_code LIKE $1`,
      [`${PROBE_CODE}%`],
    );
    const audits = await owner.query(
      `SELECT count(*)::int AS n FROM audit_logs a
         JOIN vault.documents d ON d.id::text = a.record_id
        WHERE d.document_code LIKE $1 AND a.action = 'vault.document.ingest'`,
      [`${PROBE_CODE}%`],
    );
    /* Both writes share one transaction, so the counts move together. Before
       this change the second was structurally always zero. */
    expect(audits.rows[0].n).toBe(docs.rows[0].n);
    expect(docs.rows[0].n).toBeGreaterThan(0);
  });
});

describe('POST /api/vault/ingest — another tenant cannot write into your program', () => {
  it('refuses the upload and leaves nothing behind', async () => {
    const before = await owner.query(
      `SELECT count(*)::int AS n FROM vault.documents WHERE program_id = $1`,
      [otherProgramId],
    );

    /* The caller is authenticated as the FIRST org and targets the SECOND
       org's program. `vault.documents` has no organization_id column, so the
       route's guard against regulatory_programs is the only thing standing
       between the two tenants. */
    const res = await request(app)
      .post('/api/vault/ingest')
      .field('programId', otherProgramId)
      .field('documentCode', `${PROBE_CODE}-CROSS`)
      .field('documentTitle', 'Should never land')
      .field('documentType', 'OTHER')
      .attach('file', PDF_BYTES, 'cross-tenant.pdf');

    expect(res.status).toBe(403);
    /* The refusal names no table, no column and no query. */
    expect(JSON.stringify(res.body)).not.toMatch(/vault\.|regulatory_programs|SELECT|relation/i);

    const after = await owner.query(
      `SELECT count(*)::int AS n FROM vault.documents WHERE program_id = $1`,
      [otherProgramId],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});

/**
 * The half-on state: catalog enabled, passage index NOT.
 *
 * ── Why this suite exists ────────────────────────────────────────────────────
 * The two flags behind AnA's client-files surface are independent, and the
 * combination that will actually be common — catalog on (it costs nothing extra
 * at ingest) and chunking off (it embeds every upload, so it costs money) — is
 * the one nobody had exercised. The startup line this workstream added tells an
 * operator, in so many words, that in this state "the tools and recall work,
 * and passage search has no index until vault chunking is on, and says so
 * rather than returning nothing."
 *
 * That was a claim in an operator-facing message with nothing behind it. This
 * suite is what makes it true or finds out it is not:
 *
 *   1. a document ingested with chunking off still gets its extraction tier —
 *      the catalog half genuinely works alone;
 *   2. it gets NO chunk rows, and the chunking ledger does not pretend
 *      otherwise;
 *   3. search_document_passages returns zero passages AND says the index is
 *      empty, with the count of documents not in it — because "no passage
 *      matched" over an index holding nothing is the lie this whole workstream
 *      exists to stop;
 *   4. the other document tools are unaffected — the file is listed and
 *      readable.
 *
 * Only a real database can witness 2: "no rows were written" is a statement
 * about a table.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

/* Catalog ON, chunking deliberately OFF. The delete matters: these files run
   sequentially in one worker and a sibling suite sets the chunking override at
   module scope, so inheriting it would silently test the both-on state and
   report it as this one. */
process.env.ANA_DOCUMENT_CATALOG_FORCE_ON = 'true';
delete process.env.ANA_VAULT_CHUNKING_FORCE_ON;

const PROBE_PREFIX = 'dbtest-chunkoff ';
const PROBE_CODE = 'DBTEST-CHUNKOFF-DOC';

const BODY =
  'Stability Summary for drug product batch 23-104 stored at 25 degrees Celsius. ' +
  'Assay at the six month timepoint was 98.4 percent of label claim. ' +
  'Dissolution met the acceptance criterion at every timepoint tested.';

let owner: Pool;
let orgId: number;
let orgUuid: string;
let userId: number;
let programId: string;
let documentId: string;
let app: express.Express;

async function inTenantScope<T>(fn: () => Promise<T>): Promise<T> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  return runWithTenantScope(
    {
      tenantId: String(orgId),
      orgUuid,
      role: 'admin',
      source: 'request',
      caller: 'tests/db/vault-chunking-off.dbtest.ts',
    },
    fn,
  );
}

async function callTool(name: string, input: Record<string, unknown>) {
  const { getToolHandler } = await import('../../server/services/ana/AnaToolExecutor');
  const handler = getToolHandler(name);
  if (!handler) throw new Error(`${name} is not registered`);
  const raw = await inTenantScope(() =>
    handler(input, { organizationId: orgId, organizationUuid: orgUuid, userId }),
  );
  return JSON.parse(raw);
}

async function buildApp(): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const { establishRequestTenantScope } = await import(
    '../../server/middleware/establishRequestTenantScope'
  );
  const a = express();
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.tenantId = orgId;
    r.userRole = 'admin';
    r.user = { id: userId, organizationId: orgId, organizationUuid: orgUuid, role: 'admin' };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  return a;
}

async function cleanupProbeRows(): Promise<void> {
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
  await owner.query(
    `DELETE FROM vault.document_chunks WHERE document_id IN
       (SELECT id FROM vault.documents WHERE document_code LIKE $1)`,
    [`${PROBE_CODE}%`],
  );
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${PROBE_CODE}%`]);
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE_PREFIX}%`]);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });

  // The toggle row must not be enabled either, or the env delete above buys
  // nothing — this suite asserts the OFF state, so it has to establish it.
  await owner
    .query(`UPDATE feature_toggles SET enabled = FALSE WHERE feature_key = 'ana.vault_chunking'`)
    .catch(() => undefined);

  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE_PREFIX}tenant`, 'dbtest-chunkoff-tenant'],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String(org.rows[0].uuid);

  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    ['dbtest-chunkoff@example.test', `${PROBE_PREFIX}actor`, 'not-a-real-hash'],
  );
  userId = Number(user.rows[0].id);

  await cleanupProbeRows();

  const prog = await owner.query(
    `INSERT INTO regulatory_programs
       (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', $4) RETURNING id`,
    [`${PROBE_PREFIX}program`, 'DBTEST-CHUNKOFF-A', orgId, 'Chunkoffin 5mg'],
  );
  programId = String(prog.rows[0].id);

  app = await buildApp();

  const res = await request(app)
    .post('/api/vault/ingest')
    .field('programId', programId)
    .field('documentCode', PROBE_CODE)
    .field('documentTitle', 'Stability summary batch 23-104')
    .field('documentType', 'REPORT')
    .attach('file', Buffer.from(BODY, 'utf8'), 'stability.txt');
  expect(res.status).toBe(201);
  documentId = String(res.body.document.id);
}, 120_000);

afterAll(async () => {
  await cleanupProbeRows().catch(() => {});
  await owner.end().catch(() => {});
});

describe('the catalog half works on its own', () => {
  it('records the extraction tier even with the passage index off', async () => {
    const { rows } = await owner.query(
      `SELECT catalog_status, char_count, word_count FROM vault.document_catalog WHERE document_id = $1`,
      [documentId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].catalog_status).toBe('extracted');
    expect(Number(rows[0].char_count)).toBeGreaterThan(0);
  });

  it('still lists and reads the document through the tools', async () => {
    const listed = await callTool('list_project_documents', {});
    expect(listed.ok).toBe(true);
    const mine = (listed.documents as Array<{ id: string }>).find(d => d.id === documentId);
    expect(mine, 'the ingested document must be listed').toBeTruthy();

    const read = await callTool('read_project_document', { document_id: documentId });
    expect(read.ok).toBe(true);
    expect(read.window.text).toContain('98.4');
  });
});

describe('the passage index is absent, and says so', () => {
  it('wrote no chunks and left the ledger unclaimed rather than claiming success', async () => {
    const { rows } = await owner.query(
      `SELECT (SELECT COUNT(*)::int FROM vault.document_chunks c WHERE c.document_id = d.id) AS chunks,
              cat.chunk_status, cat.chunk_count
         FROM vault.documents d
         LEFT JOIN vault.document_catalog cat ON cat.document_id = d.id
        WHERE d.id = $1`,
      [documentId],
    );
    expect(Number(rows[0].chunks)).toBe(0);
    // Not 'chunked' with a zero count — that would read as "indexed, nothing in it".
    expect(rows[0].chunk_status).not.toBe('chunked');
  });

  it('search_document_passages reports an empty index, not an absent answer', async () => {
    const out = await callTool('search_document_passages', {
      query: 'assay result at the six month timepoint',
    });
    expect(out.ok, `expected an honest empty-index answer, got: ${JSON.stringify(out)}`).toBe(true);
    expect(out.passages).toEqual([]);
    // The load-bearing assertion: the response must distinguish "nothing is
    // indexed" from "the documents do not say that". The text IS in the
    // document — a bare empty result here would be a false statement about it.
    expect(out.coverage.total).toBeGreaterThan(0);
    expect(out.coverage.indexed).toBe(0);
    expect(out.message).toContain('are in the passage index');
    expect(out.message).toContain('nothing was searched');
    expect(out.message).toContain('ana.vault_chunking');
    expect(out.message).toContain('read_project_document');
    // And specifically NOT the provider-blame message it used to give: with the
    // index empty there is nothing to embed, so no provider is consulted.
    expect(out.unavailable).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain('embedding provider');
  });
});

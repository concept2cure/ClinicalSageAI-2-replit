/** Sealed /export reaches the real document projection, saved-source verifier,
 * current-version/disposition SQL, XML renderer and export-history SQL. Auth
 * membership and audit persistence are explicit seams; no audit-HMAC/RLS PQ. */
import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDispositionHarness, insertVaultSuccessor,
  type DispositionFixture, type DispositionHarness,
} from '../../services/document-data-disposition/__tests__/disposition-fixture';

const h = vi.hoisted(() => ({ pool: null as unknown, sql: [] as string[], audit: vi.fn(),
  clients: [] as unknown[], auditSqlOffsets: [] as number[] }));
vi.mock('../../db', () => ({
  get pool() { return h.pool; }, getPool: () => h.pool, db: {},
  query: (sql: string, params?: unknown[]) =>
    (h.pool as { query(sql: string, params?: unknown[]): Promise<unknown> }).query(sql, params),
}));
vi.mock('../../middleware/orgMembership', () => ({
  enforceOrgMembership: (_req: unknown, _res: unknown, next: () => void) => next(),
  invalidateOrgMembershipCache: () => undefined,
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn() }, writeChainedAuditRow: vi.fn(),
}));
vi.mock('../../services/authoring/authoring-evidence', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/authoring/authoring-evidence')>();
  return { ...actual, writeAuthoringAuditTrail: h.audit };
});

const ORIGINAL_TEXT = 'Exact study evidence';
const SECTION_CONTENT = '<p>Source-linked findings.</p>';
const SOURCE_HASH = 'a'.repeat(64);
const PRE_FIX_DOCUMENT_SELECT = 'SELECT id, title, module, product_code, locale, status, created_at, updated_at, created_by, template_id, submitted_at, current_workflow_id, approved_at, frozen_at, locked_at, locked_by, tenant_id, version FROM authoring_documents WHERE id = $1 AND tenant_id = $2';

let harness: DispositionHarness;
let app: express.Express;

beforeAll(async () => {
  harness = await createDispositionHarness();
  await harness.pg.exec(`
    ALTER TABLE authoring_documents ADD COLUMN title text, ADD COLUMN module text,
      ADD COLUMN product_code text, ADD COLUMN locale text, ADD COLUMN created_at timestamptz DEFAULT now(),
      ADD COLUMN updated_at timestamptz DEFAULT now(), ADD COLUMN created_by text,
      ADD COLUMN template_id uuid, ADD COLUMN submitted_at timestamptz,
      ADD COLUMN current_workflow_id uuid, ADD COLUMN locked_by text, ADD COLUMN version text;
    ALTER TABLE authoring_sections ADD COLUMN code text, ADD COLUMN title text,
      ADD COLUMN content text, ADD COLUMN order_index integer, ADD COLUMN track_changes jsonb,
      ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN updated_at timestamptz DEFAULT now();
    CREATE TABLE authoring_signatures (doc_id uuid, tenant_id integer, signer_email text,
      signer_name text, meaning text, reason text, method text, content_hash text,
      covered_freeze_version text, pin_verified boolean, signed_at timestamptz DEFAULT now());
    CREATE TABLE authoring_export_history (id uuid DEFAULT gen_random_uuid(), document_id uuid,
      export_type text, doc_sha256 text, exported_by text, file_name text, file_size bigint,
      metadata jsonb, tenant_id integer, exported_at timestamptz DEFAULT now());
    ALTER TABLE vault.documents ADD COLUMN document_code text, ADD COLUMN document_type text,
      ADD COLUMN file_name text, ADD COLUMN mime_type text, ADD COLUMN folder_id text,
      ADD COLUMN evidence_kind text, ADD COLUMN ctd_section text, ADD COLUMN placement_status text;
    ALTER TABLE vault.document_catalog ADD COLUMN catalog_status text DEFAULT 'extracted',
      ADD COLUMN extraction_method text DEFAULT 'pdf-text', ADD COLUMN extraction_confidence double precision,
      ADD COLUMN extraction_error text, ADD COLUMN char_count integer, ADD COLUMN word_count integer,
      ADD COLUMN page_count integer, ADD COLUMN document_kind text, ADD COLUMN purpose text,
      ADD COLUMN summary text, ADD COLUMN cataloged_at timestamptz;
  `);
  const query = async (sql: string, params?: unknown[]) => {
    h.sql.push(sql);
    // Isolated mutation proof of the actual old projection. The shared route
    // remains untouched; the query still executes against real PostgreSQL.
    const statement = process.env.SAVED_SOURCE_EXPORT_PROJECTION_MUTANT === '1'
      && /^SELECT id, title, module, product_code/.test(sql)
      && /FROM authoring_documents WHERE id = \$1 AND tenant_id = \$2/.test(sql)
      ? PRE_FIX_DOCUMENT_SELECT : sql;
    const result = await harness.pg.query(statement, params);
    return { ...result, rowCount: result.rows.length };
  };
  h.pool = { query, connect: async () => {
    const client = { query, release: () => undefined };
    h.clients.push(client);
    return client;
  } };
  const { default: router } = await import('../authoring.router');
  app = express(); app.use(express.json()); app.use('/api/authoring', router);
}, 180_000);
afterAll(async () => { await harness?.close(); });
beforeEach(() => {
  h.sql.length = 0; h.clients.length = 0; h.auditSqlOffsets.length = 0;
  h.audit.mockReset();
  h.audit.mockImplementation(async () => { h.auditSqlOffsets.push(h.sql.length); });
});

async function sealed(f: DispositionFixture, provenance?: unknown) {
  const docId = randomUUID();
  const stored = provenance ?? { source: 'ana', projectSourceReferences: [{
    sectionCode: '12', qualification: 'unassessed', verification: 'current_at_save',
    sources: [{ documentId: f.vault, programId: f.program, contentHash: SOURCE_HASH,
      span: { start: 0, end: ORIGINAL_TEXT.length, totalChars: ORIGINAL_TEXT.length } }],
  }] };
  await f.pg.query(`INSERT INTO authoring_documents (id,tenant_id,status,title,module,client_program_id,provenance)
    VALUES ($1,$2,'APPROVED','Source-linked CSR','M5',$3,$4)`, [docId, f.org, f.program, JSON.stringify(stored)]);
  await f.pg.query(`INSERT INTO authoring_sections (id,doc_id,tenant_id,code,title,content,order_index)
    VALUES ($1,$2,$3,'12','Efficacy',$4,1)`, [randomUUID(), docId, f.org, SECTION_CONTENT]);
  await f.pg.query(`INSERT INTO authoring_signatures
      (doc_id,tenant_id,signer_email,signer_name,meaning,reason,method,content_hash,pin_verified)
    VALUES ($1,$2,'reviewer@example.test','Reviewer','APPROVER','Reviewed source-linked draft','PIN',$3,true)`,
  [docId, f.org, createHash('sha256').update(`12:${SECTION_CONTENT}`).digest('hex')]);
  return docId;
}

async function sourceFixture() {
  const f = await harness.seed();
  await f.pg.query(`UPDATE vault.documents SET extracted_text=$2, document_code='validated-tlfs',
    file_name='validated-tlfs.pdf', document_type='OTHER', mime_type='application/pdf' WHERE id=$1`, [f.vault, ORIGINAL_TEXT]);
  return f;
}

async function exportDoc(f: DispositionFixture, docId: string) {
  const token = await new SignJWT({ sub: '42', organizationId: f.org, email: 'author@example.test' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m')
    .sign(new TextEncoder().encode(process.env.JWT_SECRET_DEV ?? process.env.JWT_SECRET));
  return request(app).post(`/api/authoring/docs/${docId}/export`)
    .set('Authorization', `Bearer ${token}`).send({ format: 'xml' });
}

async function expectNoExportRecord(f: DispositionFixture, docId: string) {
  expect(h.audit).not.toHaveBeenCalled();
  expect((await f.pg.query('SELECT id FROM authoring_export_history WHERE document_id=$1 AND tenant_id=$2', [docId, f.org])).rows).toEqual([]);
}

describe('sealed source-linked /export uses persisted source receipts', () => {
  it('reads actual saved provenance and refuses withdrawn data before audit/history', async () => {
    const f = await sourceFixture();
    await f.apply('remove_data');
    const docId = await sealed(f);
    const result = await exportDoc(f, docId);
    expect(result.status).toBe(409);
    expect(result.body.code).toBe('SOURCE_REFERENCES_UNAVAILABLE');
    await expectNoExportRecord(f, docId);
  });

  it('refuses a noncurrent source version without inventing a disposition', async () => {
    const f = await sourceFixture();
    const successor = await insertVaultSuccessor(f);
    await f.pg.query("UPDATE vault.documents SET document_code='validated-tlfs' WHERE id=$1", [successor]);
    const docId = await sealed(f);
    const result = await exportDoc(f, docId);
    expect(result.status).toBe(409);
    expect(result.body.code).toBe('SOURCE_REFERENCES_UNAVAILABLE');
    await expectNoExportRecord(f, docId);
  });

  it('refuses recorded extraction failure before audit/history', async () => {
    const f = await sourceFixture();
    await f.pg.query("UPDATE vault.document_catalog SET catalog_status='extraction_failed' WHERE document_id=$1", [f.vault]);
    const docId = await sealed(f);
    const result = await exportDoc(f, docId);
    expect(result.status).toBe(409);
    expect(result.body.code).toBe('SOURCE_REFERENCES_UNAVAILABLE');
    await expectNoExportRecord(f, docId);
  });

  it.each([false, true])('exports valid current evidence with retained-original=%s', async retained => {
    const f = await sourceFixture();
    if (retained) await f.apply('keep_data');
    const docId = await sealed(f);
    const result = await exportDoc(f, docId);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.text).toContain(SECTION_CONTENT);
    expect(h.audit).toHaveBeenCalledOnce();
    const rows = (await f.pg.query('SELECT metadata FROM authoring_export_history WHERE document_id=$1 AND tenant_id=$2', [docId, f.org])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toHaveProperty('artifactSha256');
    const begin = h.sql.findIndex(sql => /^BEGIN/.test(sql));
    const reservation = h.sql.findIndex(sql => /LOCK TABLE vault\.documents, vault\.document_catalog IN SHARE MODE/.test(sql));
    const firstSourceRead = h.sql.findIndex(sql => /FROM vault.documents d/.test(sql) && /succ\.supersedes_id = d\.id/.test(sql));
    const history = h.sql.findIndex(sql => /INSERT INTO authoring_export_history/.test(sql));
    const commit = h.sql.findIndex(sql => /^COMMIT/.test(sql));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(reservation).toBeGreaterThan(begin);
    expect(firstSourceRead).toBeGreaterThan(reservation);
    expect(h.auditSqlOffsets[0]).toBeGreaterThan(firstSourceRead);
    expect(history).toBeGreaterThanOrEqual(h.auditSqlOffsets[0]);
    expect(commit).toBeGreaterThan(history);
    expect(h.audit.mock.calls[0][1].executor).toBe(h.clients[0]);
  });

  it('refuses malformed persisted groups without treating them as manually authored', async () => {
    const f = await sourceFixture();
    const docId = await sealed(f, { projectSourceReferences: [{ sectionCode: '12', sources: 'not-a-source-list' }] });
    const result = await exportDoc(f, docId);
    expect(result.status).toBe(409);
    expect(result.body.code).toBe('SOURCE_REFERENCES_UNAVAILABLE');
    await expectNoExportRecord(f, docId);
  });
});

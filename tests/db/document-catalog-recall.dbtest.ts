/**
 * Recall over the document catalog and memory ingestion — real PostgreSQL and
 * a real (stub) embedding endpoint through the governed provider seam.
 *
 * What this suite pins, failure-first where the defect lived:
 *   1. ingestProjectDocument writes EMBEDDED memory entries. Before the fix,
 *      every entry the ingest paths created had embedding NULL — durable but
 *      invisible to semantic recall (which filters `embedding IS NOT NULL`);
 *      with the fix reverted, the NOT NULL assertion here fails.
 *   2. catalog_project_document embeds the comprehension record
 *      (embeddingStatus 'embedded' — not 'failed' — when a provider exists),
 *      and search_project_documents then finds the document, org-checked,
 *      reporting how many documents are NOT searchable so absence is never
 *      read as nonexistence.
 *   3. search fails CLOSED: when the embedding endpoint errors, the tool says
 *      the index is unavailable — it never returns an empty hit list that
 *      reads as "nothing matched".
 *   4. list_project_documents surfaces chat uploads from the evidence spine
 *      with the file_id that reopens them, and a superseded upload
 *      (is_current = FALSE) is excluded rather than listed as live.
 *
 * The embedding endpoint is an in-process HTTP stub speaking the OpenAI
 * embeddings shape, reached via EMBEDDING_PROVIDER=local — the same governed
 * seam production uses, no client mocking. It returns a constant unit vector
 * (similarity math is not under test here; the write/read plumbing is), and
 * returns HTTP 500 for any input containing FAIL_EMBEDDING so the fail-closed
 * path is driven by a real provider failure.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'node:http';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

process.env.ANA_DOCUMENT_CATALOG_FORCE_ON = 'true';
process.env.ANA_VAULT_CHUNKING_FORCE_ON = 'true';

const PROBE_PREFIX = 'dbtest-recall ';
const PROBE_CODE = 'DBTEST-RECALL-DOC';

const TOX_BODY =
  'GLP 28-Day Repeat-Dose Toxicology Study TOX-77-A in Sprague-Dawley rats. ' +
  'NOAEL 50 mg/kg/day. No test-article-related mortality. Reversible hepatocellular hypertrophy at 150 mg/kg/day.';

const CONST_VEC = ((): number[] => {
  const v = new Array(1536).fill(0);
  v[0] = 1;
  return v;
})();

let embedServer: http.Server;
let owner: Pool;
let orgId: number;
let orgUuid: string;
let userId: number;
let workspaceId: number;
let projectId: number;
let profileId: number;
let programId: string;
let app: express.Express;

function startEmbeddingStub(): Promise<string> {
  return new Promise(resolve => {
    embedServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        const parsed = JSON.parse(body || '{}');
        const inputs: string[] = Array.isArray(parsed.input) ? parsed.input : [String(parsed.input ?? '')];
        if (inputs.some(t => t.includes('FAIL_EMBEDDING'))) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'stub: embedding refused' } }));
          return;
        }
        // The OpenAI SDK requests encoding_format=base64 and decodes the
        // payload as packed float32s; honor it like a real TEI/vLLM server
        // (a plain JSON array would be misread as raw bytes → 384 dims).
        const embedding =
          parsed.encoding_format === 'base64'
            ? Buffer.from(new Float32Array(CONST_VEC).buffer).toString('base64')
            : CONST_VEC;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            object: 'list',
            model: parsed.model ?? 'stub-embedder',
            data: inputs.map((_, index) => ({ object: 'embedding', index, embedding })),
            usage: { prompt_tokens: inputs.length, total_tokens: inputs.length },
          }),
        );
      });
    });
    embedServer.listen(0, '127.0.0.1', () => {
      const addr = embedServer.address() as { port: number };
      resolve(`http://127.0.0.1:${addr.port}/v1`);
    });
  });
}

async function inTenantScope<T>(fn: () => Promise<T>): Promise<T> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  return runWithTenantScope(
    {
      tenantId: String(orgId),
      orgUuid,
      role: 'admin',
      source: 'request',
      caller: 'tests/db/document-catalog-recall.dbtest.ts',
    },
    fn,
  );
}

async function callTool(name: string, input: Record<string, unknown>) {
  const { getToolHandler } = await import('../../server/services/ana/AnaToolExecutor');
  const handler = getToolHandler(name);
  if (!handler) throw new Error(`tool ${name} is not registered`);
  const raw = await inTenantScope(() =>
    handler(input, { organizationId: orgId, userId, projectId }),
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
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${PROBE_CODE}%`]);
  await owner.query(
    `DELETE FROM cre_evidence_sources WHERE organization_id = $1 AND title LIKE $2`,
    [orgId, `${PROBE_PREFIX}%`],
  );
  await owner.query(
    `DELETE FROM project_memory_entries WHERE organization_id = $1`,
    [orgId],
  );
  await owner.query(
    `DELETE FROM project_ingested_documents WHERE organization_id = $1`,
    [orgId],
  );
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE_PREFIX}%`]);
}

beforeAll(async () => {
  // The stub must exist before anything resolves the provider seam.
  const baseUrl = await startEmbeddingStub();
  process.env.EMBEDDING_PROVIDER = 'local';
  process.env.EMBEDDING_LOCAL_BASE_URL = baseUrl;
  const { resetEmbeddingProvider } = await import(
    '../../server/services/ai-gateway/embeddings/embedding-provider'
  );
  resetEmbeddingProvider();

  owner = new Pool({ connectionString: databaseUrl, max: 4 });

  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PROBE_PREFIX}tenant`, 'dbtest-recall-tenant'],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String(
    (await owner.query('SELECT uuid FROM organizations WHERE id = $1', [orgId])).rows[0].uuid,
  );
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    ['dbtest-recall@example.test', `${PROBE_PREFIX}actor`, 'not-a-real-hash'],
  );
  userId = Number(user.rows[0].id);

  await cleanupProbeRows();

  const prog = await owner.query(
    `INSERT INTO regulatory_programs
       (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', $4) RETURNING id`,
    [`${PROBE_PREFIX}program`, 'DBTEST-RECALL-A', orgId, 'Recallin 5mg'],
  );
  programId = String(prog.rows[0].id);

  const ws = await owner.query(
    `INSERT INTO client_workspaces (organization_id, name, slug) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING RETURNING id`,
    [orgId, `${PROBE_PREFIX}workspace`, 'dbtest-recall-ws'],
  );
  workspaceId =
    Number(ws.rows[0]?.id) ||
    Number((await owner.query(`SELECT id FROM client_workspaces WHERE slug = 'dbtest-recall-ws'`)).rows[0].id);

  const proj = await owner.query(
    `INSERT INTO projects (organization_id, client_workspace_id, name, type, regulatory_program_id)
     VALUES ($1, $2, $3, 'IND', $4) RETURNING id`,
    [orgId, workspaceId, `${PROBE_PREFIX}project`, programId],
  );
  projectId = Number(proj.rows[0].id);

  const profile = await owner.query(
    `INSERT INTO project_intelligence_profiles (project_id, organization_id)
     VALUES ($1, $2) RETURNING id`,
    [projectId, orgId],
  );
  profileId = Number(profile.rows[0].id);

  app = await buildApp();
});

afterAll(async () => {
  await cleanupProbeRows().catch(() => {});
  await owner.query('DELETE FROM project_intelligence_profiles WHERE id = $1', [profileId]).catch(() => {});
  await owner.query('DELETE FROM projects WHERE id = $1', [projectId]).catch(() => {});
  await owner.end().catch(() => {});
  await new Promise<void>(resolve => embedServer.close(() => resolve()));
});

describe('memory ingestion writes embedded entries', () => {
  it('ingestProjectDocument leaves NO entry invisible to semantic recall', async () => {
    const { ingestProjectDocument } = await import(
      '../../server/services/client-intelligence-memory'
    );
    const result = await inTenantScope(() =>
      ingestProjectDocument(
        profileId,
        projectId,
        orgId,
        {
          buffer: Buffer.from(TOX_BODY, 'utf8'),
          originalname: 'tox-77a-summary.txt',
          mimetype: 'text/plain',
          size: TOX_BODY.length,
        },
        userId,
      ),
    );
    expect(result.status).toBe('completed');
    expect(result.memoryEntriesCreated).toBeGreaterThan(0);

    // The defect this pins: these rows used to be written with embedding NULL,
    // which semantic recall (`embedding IS NOT NULL`) can never return.
    const { rows } = await owner.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int AS embedded
         FROM project_memory_entries WHERE project_profile_id = $1`,
      [profileId],
    );
    expect(rows[0].total).toBe(result.memoryEntriesCreated);
    expect(rows[0].embedded).toBe(rows[0].total);
  });
});

describe('semantic search over the catalog', () => {
  let docId: string;

  it('a cataloged document is embedded and findable; uncataloged ones are counted, not hidden', async () => {
    const res = await request(app)
      .post('/api/vault/ingest')
      .field('programId', programId)
      .field('documentCode', `${PROBE_CODE}-TOX`)
      .field('documentTitle', 'TOX-77-A study report')
      .field('documentType', 'OTHER')
      .attach('file', Buffer.from(TOX_BODY, 'utf8'), 'tox-77a.txt');
    expect(res.status).toBe(201);
    docId = res.body.document.id;

    const read = await callTool('read_project_document', { document_id: docId, max_chars: 80000 });
    expect(read.coverage.complete).toBe(true);

    const done = await callTool('catalog_project_document', {
      document_id: docId,
      document_kind: 'GLP 28-day repeat-dose toxicology study report',
      purpose: 'Supports Module 4 repeat-dose toxicology for Recallin.',
      summary: 'TOX-77-A in rats; NOAEL 50 mg/kg/day; reversible hepatocellular hypertrophy at 150.',
      key_data: { study: 'TOX-77-A', noaelMgKgDay: 50 },
    });
    expect(done.ok).toBe(true);
    expect(done.embeddingStatus).toBe('embedded');

    // A second document, never cataloged — it must show up in the honesty
    // count, not silently vanish from the searchable world.
    const res2 = await request(app)
      .post('/api/vault/ingest')
      .field('programId', programId)
      .field('documentCode', `${PROBE_CODE}-COA`)
      .field('documentTitle', 'CoA batch 12')
      .field('documentType', 'OTHER')
      .attach('file', Buffer.from('Certificate of Analysis, batch 12. Assay 99.9%.', 'utf8'), 'coa-12.txt');
    expect(res2.status).toBe(201);

    const found = await callTool('search_project_documents', { query: 'repeat-dose toxicology NOAEL' });
    expect(found.ok).toBe(true);
    expect(found.hits.map((h: { documentId: string }) => h.documentId)).toContain(docId);
    expect(found.searchedCount).toBe(1);
    expect(found.unsearchableCount).toBeGreaterThanOrEqual(1);
    expect(found.message).toContain('not searchable');
  });

  it('an embedding-provider failure is said as unavailability — never an empty result', async () => {
    const out = await callTool('search_project_documents', { query: 'FAIL_EMBEDDING anything' });
    expect(out.ok).toBe(false);
    expect(out.unavailable).toBe(true);
    expect(out.error).toMatch(/unavailable/i);
    expect(out.hits).toBeUndefined();
  });
});

describe('chat-upload discovery', () => {
  it('lists the current upload with its reopenable file_id and excludes the superseded one', async () => {
    const { createSource, createSupersedingSource } = await import(
      '../../server/services/clinical-regulatory-evidence/evidence-spine.service'
    );
    const v1 = await inTenantScope(() =>
      createSource(orgId, {
        sourceType: 'client_document',
        clientProgramId: programId,
        title: `${PROBE_PREFIX}protocol draft`,
        checksum: 'a'.repeat(64),
        version: '1.0',
        ingestionStatus: 'ingested',
        extractionStatus: 'extracted',
        provenance: { origin: 'chat_upload', fileUploadId: 'file_recall_v1' },
        metadata: { originalName: 'protocol-draft-v1.docx' },
      }),
    );
    const v2 = await inTenantScope(() =>
      createSupersedingSource(
        orgId,
        {
          sourceType: 'client_document',
          clientProgramId: programId,
          title: `${PROBE_PREFIX}protocol draft`,
          checksum: 'b'.repeat(64),
          version: '2.0',
          ingestionStatus: 'ingested',
          extractionStatus: 'extracted',
          provenance: { origin: 'chat_upload', fileUploadId: 'file_recall_v2' },
          metadata: { originalName: 'protocol-draft-v2.docx' },
        },
        v1.id,
      ),
    );

    const listed = await callTool('list_project_documents', { program_id: programId });
    expect(listed.ok).toBe(true);
    expect(listed.chatUploads).not.toBeNull();
    const fileIds = listed.chatUploads.map((u: { fileId: string | null }) => u.fileId);
    expect(fileIds).toContain('file_recall_v2');
    // The superseded v1 must not be presented as a live file.
    expect(fileIds).not.toContain('file_recall_v1');
    const v2Row = listed.chatUploads.find((u: { sourceId: number }) => u.sourceId === v2.source.id);
    expect(v2Row.fileName).toBe('protocol-draft-v2.docx');
    expect(listed.message).toContain('chat-uploaded');
  });
});

describe('vault passage retrieval — the reader finally has a writer', () => {
  it('an ingested document is chunked, embedded, ledgered, and retrievable through ragRouter', async () => {
    const BODY = Array.from({ length: 12 }, (_, i) =>
      `Section ${i}. The dissolution profile of batch 44-B met Q=80 in 30 minutes at pH 6.8. ` +
      'Filler sentence to give the chunker real paragraphs to cut. '.repeat(20),
    ).join('\n\n');
    const res = await request(app)
      .post('/api/vault/ingest')
      .field('programId', programId)
      .field('documentCode', `${PROBE_CODE}-DISSO`)
      .field('documentTitle', 'Dissolution study batch 44-B')
      .field('documentType', 'OTHER')
      .attach('file', Buffer.from(BODY, 'utf8'), 'dissolution-44b.txt');
    expect(res.status).toBe(201);
    const docId = res.body.document.id;

    // The chunk store the RAG reader queries now actually holds this document.
    const chunks = await owner.query(
      `SELECT COUNT(*)::int AS n, COUNT(embedding)::int AS embedded,
              MIN(char_start) AS first_start, MAX(char_end) AS last_end
         FROM vault.document_chunks WHERE document_id = $1`,
      [docId],
    );
    expect(chunks.rows[0].n).toBeGreaterThan(1);
    expect(chunks.rows[0].embedded).toBe(chunks.rows[0].n);
    expect(chunks.rows[0].first_start).toBe(0);

    // The ledger says so — and the spans cover the exact extracted length
    // (extraction trims, so the catalog's char_count is the ground truth).
    const ledger = await owner.query(
      `SELECT chunk_status, chunk_count, chunk_error, char_count FROM vault.document_catalog WHERE document_id = $1`,
      [docId],
    );
    expect(chunks.rows[0].last_end).toBe(ledger.rows[0].char_count);
    expect(ledger.rows[0]).toMatchObject({ chunk_status: 'chunked', chunk_count: chunks.rows[0].n, chunk_error: null });

    // End to end: the vault corpus returns the passage through the single router.
    const { ragRetrieve } = await import('../../server/services/ragRouter');
    const ctx = await inTenantScope(() =>
      ragRetrieve({
        query: 'dissolution profile batch 44-B',
        organizationUuid: orgUuid,
        strategy: 'basic',
        useReranking: false,
        useMmr: false,
        useCompression: false,
        useSelfQuery: false,
        useContextExpansion: false,
        threshold: 0.2,
        limit: 3,
      }),
    );
    expect(ctx.documents.length).toBeGreaterThan(0);
    expect(ctx.documents[0].content).toContain('dissolution profile');
  });

  it('an embedding failure leaves ZERO chunks and a chunk_failed ledger row — never a partial index', async () => {
    const BODY =
      'Opening section that embeds fine. '.repeat(50) +
      '\n\nFAIL_EMBEDDING poison paragraph that the stub refuses. ' +
      'More text so several chunks exist. '.repeat(100);
    const res = await request(app)
      .post('/api/vault/ingest')
      .field('programId', programId)
      .field('documentCode', `${PROBE_CODE}-POISON`)
      .field('documentTitle', 'Poison embed doc')
      .field('documentType', 'OTHER')
      .attach('file', Buffer.from(BODY, 'utf8'), 'poison.txt');
    expect(res.status).toBe(201); // the upload is admitted…

    const docId = res.body.document.id;
    const chunks = await owner.query(
      `SELECT COUNT(*)::int AS n FROM vault.document_chunks WHERE document_id = $1`,
      [docId],
    );
    expect(chunks.rows[0].n).toBe(0); // …but nothing half-indexed exists…

    const ledger = await owner.query(
      `SELECT chunk_status, chunk_error FROM vault.document_catalog WHERE document_id = $1`,
      [docId],
    );
    // …and the ledger states the failure with its reason.
    expect(ledger.rows[0].chunk_status).toBe('chunk_failed');
    expect(ledger.rows[0].chunk_error).toMatch(/Embedding failed/);
  });
});

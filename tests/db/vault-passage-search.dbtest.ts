/**
 * search_document_passages against real PostgreSQL — the corpus becomes
 * reachable.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Every vault upload has been chunked and embedded into vault.document_chunks
 * since the corpus was built, and the legacy backlog was swept into it. No tool
 * AnA can call ever read it. project_knowledge_search looks like the one and is
 * not — it passes an artifactScope, which routes retrieval to the project ATOM
 * index, never to the client's uploaded documents. The only readers of the
 * vault corpus were the Cortex query route and the RAG eval harness. So the
 * passages of the client's own evidence were indexed and unreachable: the same
 * shape as the defect that created them (a reader with no store), with the
 * halves swapped.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 *   1. a document uploaded through the real ingest route is searchable BY ITS
 *      CONTENTS within the same session — the end-to-end claim, which no unit
 *      test can make (it needs the chunk rows, pgvector, and the tenant join);
 *   2. retrieval discriminates: a query about the tox study returns the tox
 *      passage, not the stability passage, so a hit means something;
 *   3. another organization's document is never returned — the corpus join is
 *      the tenant boundary, and a mocked pool has no rows to filter;
 *   4. the coverage figures are read from the chunking ledger, so an answer
 *      states what it could not see;
 *   5. a request with no organization identity REFUSES rather than returning
 *      an empty list — the pipeline's own refusal is an empty array, which is
 *      indistinguishable from "nothing matched" by the time a model reads it.
 *
 * The embedding endpoint is an in-process HTTP stub speaking the OpenAI
 * embeddings shape, reached through EMBEDDING_PROVIDER=local — the governed
 * seam, no client mocking. Unlike the recall suite's constant vector, this one
 * is a deterministic bag-of-words projection, because case 2 is about whether
 * similarity SELECTS and a constant vector makes everything equidistant.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'node:http';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

process.env.ANA_DOCUMENT_CATALOG_FORCE_ON = 'true';
process.env.ANA_VAULT_CHUNKING_FORCE_ON = 'true';

/* ── The planner is forced onto the vector index ─────────────────────────────
   vault.document_chunks carries an approximate (ivfflat) index on the
   embedding, and the dense arm of the vault reader asked for
   `ORDER BY embedding <=> $q LIMIT k` with the tenant and distance predicates
   in the same WHERE. An approximate index scan picks its candidates from ONE
   list (ivfflat.probes defaults to 1) and the WHERE then filters them — so when
   that list holds another tenant's chunks, or none that pass the threshold,
   the search returns nothing while the tenant's own matching passages sit in
   lists it never probed. Passage search then answered "No passage matched"
   beside a coverage line saying every document was indexed: a miss presented
   as an exhaustive search.

   Whether the planner reaches for the index depends on table statistics. On a
   near-empty test database it usually prefers a sequential scan, which is why
   this case passed for weeks and then failed 3 of 3 on 2026-09-24 once enough
   rows had come and gone. Production, with every tenant's chunks in one table,
   is the index-scan case. So the suite forces it — for its own connections
   only — and the search must still find the passage. */
process.env.PGOPTIONS = [process.env.PGOPTIONS, '-c enable_seqscan=off'].filter(Boolean).join(' ');

const PROBE_PREFIX = 'dbtest-passage ';
const PROBE_CODE = 'DBTEST-PASSAGE-DOC';

const TOX_BODY =
  'GLP 28-Day Repeat-Dose Toxicology Study TOX-77-A in Sprague-Dawley rats. ' +
  'The NOAEL was 50 mg per kg per day. No test-article-related mortality was observed. ' +
  'Reversible hepatocellular hypertrophy was seen at 150 mg per kg per day in males and females. ' +
  'Clinical pathology showed no toxicologically significant changes in haematology parameters.';

const STABILITY_BODY =
  'Stability Summary for drug product batch 23-104 stored at 25 degrees Celsius and 60 percent relative humidity. ' +
  'Assay at the six month timepoint was 98.4 percent of label claim. Total degradation products remained below ' +
  'the qualification threshold throughout. Dissolution met the acceptance criterion at every timepoint tested.';

/**
 * A deterministic bag-of-words embedding: each token is hashed to a dimension
 * and the vector is L2-normalised, so cosine similarity between two texts rises
 * with the words they share. Crude, and exactly enough for "does retrieval pick
 * the right passage" — which a constant vector cannot answer.
 */
function bagOfWords(text: string): number[] {
  const v = new Array(1536).fill(0);
  for (const token of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    let h = 2166136261;
    for (let i = 0; i < token.length; i += 1) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    v[Math.abs(h) % 1536] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map(x => x / norm);
}

let embedServer: http.Server;
let owner: Pool;
let orgId: number;
let orgUuid: string;
let otherOrgId: number;
let otherOrgUuid: string;
let userId: number;
let programId: string;
let otherProgramId: string;
let app: express.Express;
let actingOrg: () => { id: number; uuid: string };

function startEmbeddingStub(): Promise<string> {
  return new Promise(resolve => {
    embedServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        const parsed = JSON.parse(body || '{}');
        const inputs: string[] = Array.isArray(parsed.input)
          ? parsed.input
          : [String(parsed.input ?? '')];
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            object: 'list',
            model: parsed.model ?? 'stub-embedder',
            data: inputs.map((text, index) => {
              const embedding = bagOfWords(text);
              return {
                object: 'embedding',
                index,
                // The SDK asks for base64 and decodes packed float32s; honour it
                // like a real TEI/vLLM server (a JSON array is misread as bytes).
                embedding:
                  parsed.encoding_format === 'base64'
                    ? Buffer.from(new Float32Array(embedding).buffer).toString('base64')
                    : embedding,
              };
            }),
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

async function inTenantScope<T>(org: { id: number; uuid: string }, fn: () => Promise<T>): Promise<T> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  return runWithTenantScope(
    { tenantId: String(org.id), orgUuid: org.uuid, role: 'admin', source: 'request', caller: 'tests/db/vault-passage-search.dbtest.ts' },
    fn,
  );
}

async function callSearch(
  input: Record<string, unknown>,
  ctx?: { organizationId: number; organizationUuid?: string },
) {
  const { getToolHandler } = await import('../../server/services/ana/AnaToolExecutor');
  const handler = getToolHandler('search_document_passages');
  if (!handler) throw new Error('search_document_passages is not registered');
  const scope = ctx ?? { organizationId: orgId, organizationUuid: orgUuid };
  const raw = await inTenantScope({ id: scope.organizationId, uuid: scope.organizationUuid ?? orgUuid }, () =>
    handler(input, { organizationId: scope.organizationId, organizationUuid: scope.organizationUuid, userId }),
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
    const org = actingOrg();
    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.tenantId = org.id;
    r.userRole = 'admin';
    r.user = { id: userId, organizationId: org.id, organizationUuid: org.uuid, role: 'admin' };
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
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await client.query(
      `DELETE FROM audit_logs WHERE action = 'vault.document.ingest'
         AND record_id IN (SELECT id::text FROM vault.documents WHERE document_code LIKE $1)`,
      [`${PROBE_CODE}%`],
    );
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
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

async function upload(code: string, title: string, body: string): Promise<string> {
  const res = await request(app)
    .post('/api/vault/ingest')
    .field('programId', actingOrg().id === orgId ? programId : otherProgramId)
    .field('documentCode', code)
    .field('documentTitle', title)
    .field('documentType', 'REPORT')
    .attach('file', Buffer.from(body, 'utf8'), `${code}.txt`);
  expect(res.status).toBe(201);
  return String(res.body.document.id);
}

beforeAll(async () => {
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
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE_PREFIX}tenant`, 'dbtest-passage-tenant'],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String(org.rows[0].uuid);

  const other = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE_PREFIX}other tenant`, 'dbtest-passage-other'],
  );
  otherOrgId = Number(other.rows[0].id);
  otherOrgUuid = String(other.rows[0].uuid);

  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    ['dbtest-passage@example.test', `${PROBE_PREFIX}actor`, 'not-a-real-hash'],
  );
  userId = Number(user.rows[0].id);

  await cleanupProbeRows();

  const prog = await owner.query(
    `INSERT INTO regulatory_programs
       (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', $4) RETURNING id`,
    [`${PROBE_PREFIX}program`, 'DBTEST-PASSAGE-A', orgId, 'Passagen 5mg'],
  );
  programId = String(prog.rows[0].id);

  const otherProg = await owner.query(
    `INSERT INTO regulatory_programs
       (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', $4) RETURNING id`,
    [`${PROBE_PREFIX}other program`, 'DBTEST-PASSAGE-B', otherOrgId, 'Otherin 5mg'],
  );
  otherProgramId = String(otherProg.rows[0].id);

  actingOrg = () => ({ id: orgId, uuid: orgUuid });
  app = await buildApp();

  await upload(`${PROBE_CODE}-TOX`, 'TOX-77-A 28-day rat study', TOX_BODY);
  await upload(`${PROBE_CODE}-STAB`, 'Stability summary batch 23-104', STABILITY_BODY);

  actingOrg = () => ({ id: otherOrgId, uuid: otherOrgUuid });
  await upload(`${PROBE_CODE}-OTHER`, 'Another sponsor 28-day rat study', TOX_BODY);
  actingOrg = () => ({ id: orgId, uuid: orgUuid });
}, 120_000);

afterAll(async () => {
  await cleanupProbeRows().catch(() => {});
  await owner.end().catch(() => {});
  await new Promise<void>(resolve => embedServer?.close(() => resolve()));
});

describe('the chunk corpus is written by ingest', () => {
  it('chunked and embedded both uploads, and the catalog ledger says so', async () => {
    const { rows } = await owner.query(
      `SELECT d.document_code, c.chunk_status, c.chunk_count,
              (SELECT COUNT(*)::int FROM vault.document_chunks ch
                WHERE ch.document_id = d.id AND ch.embedding IS NOT NULL) AS embedded
         FROM vault.documents d
         LEFT JOIN vault.document_catalog c ON c.document_id = d.id
        WHERE d.document_code LIKE $1 AND d.program_id = $2
        ORDER BY d.document_code`,
      [`${PROBE_CODE}%`, programId],
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.chunk_status).toBe('chunked');
      expect(Number(r.chunk_count)).toBeGreaterThan(0);
      expect(Number(r.embedded)).toBeGreaterThan(0);
    }
  });
});

describe('search_document_passages reaches it', () => {
  it('returns the passage that answers the question, from the right document', async () => {
    const out = await callSearch({ query: 'assay result at the six month timepoint' });
    expect(out.ok).toBe(true);
    expect(out.passages.length).toBeGreaterThan(0);
    // Selection, not just reachability: the stability document, not the tox one.
    expect(out.passages[0].documentTitle).toContain('Stability');
    expect(out.passages[0].text).toContain('98.4');
  }, 60_000);

  it('answers a tox question from the tox document', async () => {
    const out = await callSearch({ query: 'NOAEL and hepatocellular hypertrophy in rats' });
    expect(out.ok).toBe(true);
    expect(out.passages.length).toBeGreaterThan(0);
    expect(out.passages[0].documentTitle).toContain('TOX-77-A');
  }, 60_000);

  it('never returns another organization\'s document, even for identical text', async () => {
    const out = await callSearch({ query: 'NOAEL and hepatocellular hypertrophy in rats' });
    const titles = (out.passages as Array<{ documentTitle: string }>).map(p => p.documentTitle);
    expect(titles.some(t => t.includes('Another sponsor'))).toBe(false);
  }, 60_000);

  it('states the coverage it searched, read from the chunking ledger', async () => {
    const out = await callSearch({ query: 'dissolution acceptance criterion' });
    expect(out.coverage.total).toBe(2);
    expect(out.coverage.indexed).toBe(2);
    expect(out.message).toContain('All 2 document(s) are in the passage index');
  }, 60_000);

  it('REFUSES without an organization identity rather than reporting no matches', async () => {
    // The pipeline's own refusal for a missing tenant is an empty array, which
    // by the time a model reads it is indistinguishable from "the documents do
    // not say that". The tool must say which one happened.
    const out = await callSearch(
      { query: 'NOAEL and hepatocellular hypertrophy in rats' },
      { organizationId: orgId, organizationUuid: undefined },
    );
    expect(out.ok).toBe(false);
    expect(out.unavailable).toBe(true);
    expect(out.error).toContain('no organization identity');
    expect(out.message).toContain('Do not report that the documents do not mention it');
  }, 60_000);
});

describe('a retrieved passage can be cited', () => {
  /* Runs last on purpose: it ingests a third document, and the coverage
     assertion above counts every document this organization holds. */
  it('carries a real page number, derived from the PDF and not from arithmetic', async () => {
    /* The chunk INSERT omitted page_number and section_title entirely, so every
       passage came back with a null locator — while the tool's own description
       promises "the sentences that answer the question, with the document and
       page they came from". A citation nobody can turn to is not a citation.

       Each page carries well over the 4,000-character chunk target, so the
       pages land in DIFFERENT chunks and the assertion is that the chunk
       quoting page three says page three — not merely that some number is
       present, which a single-chunk document would satisfy by accident. */
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const MARKERS = ['Leiden building four', 'twenty five degrees', 'ninety eight point four'];
    const filler = (marker: string, n: number) =>
      Array.from({ length: n }, (_, i) => `Line ${i} of this section mentions ${marker} in context.`);
    for (const marker of MARKERS) {
      // ~54 lines of ~60 chars each, drawn small, is comfortably past 4,000.
      const lines = filler(marker, 54);
      const page = pdf.addPage([612, 792]);
      lines.forEach((line, i) => page.drawText(line, { x: 24, y: 760 - i * 14, size: 8, font }));
    }
    const bytes = Buffer.from(await pdf.save());

    const res = await request(app)
      .post('/api/vault/ingest')
      .field('programId', programId)
      .field('documentCode', `${PROBE_CODE}-PAGED`)
      .field('documentTitle', 'Three section report')
      .field('documentType', 'REPORT')
      .attach('file', bytes, 'three-sections.pdf');
    expect(res.status).toBe(201);
    const docId = String(res.body.document.id);

    const { rows } = await owner.query(
      `SELECT c.chunk_index, c.page_number, c.char_start, d.extracted_text
         FROM vault.document_chunks c
         JOIN vault.documents d ON d.id = c.document_id
        WHERE c.document_id = $1 ORDER BY c.chunk_index`,
      [docId],
    );
    expect(rows.length).toBeGreaterThan(1);
    // The column is no longer uniformly NULL, which is what it was before.
    expect(rows.every(r => r.page_number != null)).toBe(true);

    /* The page is the RIGHT one, derived here INDEPENDENTLY of the code under
       test: each page's marker appears only on that page, so the first
       occurrence of markers two and three in the stored text are the page
       boundaries. A chunk beginning before boundary two is on page one, and so
       on. Re-deriving the answer from the document itself is what makes this a
       test of the mapping rather than a restatement of it. */
    const text = String(rows[0].extracted_text);
    const startOfPage2 = text.indexOf(MARKERS[1]);
    const startOfPage3 = text.indexOf(MARKERS[2]);
    expect(startOfPage2).toBeGreaterThan(0);
    expect(startOfPage3).toBeGreaterThan(startOfPage2);
    const expectedPage = (charStart: number): number =>
      charStart < startOfPage2 ? 1 : charStart < startOfPage3 ? 2 : 3;

    for (const r of rows) {
      expect(
        Number(r.page_number),
        `chunk ${r.chunk_index} starts at ${r.char_start}`,
      ).toBe(expectedPage(Number(r.char_start)));
    }
    // And every page is actually reached — a mapping stuck on page 1 would
    // satisfy the per-chunk check on a document whose chunks all began there.
    expect(new Set(rows.map(r => Number(r.page_number)))).toEqual(new Set([1, 2, 3]));
  }, 120_000);
});

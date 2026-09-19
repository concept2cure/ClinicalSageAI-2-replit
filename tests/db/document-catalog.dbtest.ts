/**
 * Document catalog against real PostgreSQL — ingest-time extraction tier plus
 * the read-coverage gate, end to end through the actual AnA tool handlers.
 *
 * What this suite pins, failure-first:
 *   1. an upload whose extraction produces NOTHING lands as
 *      catalog_status='extraction_failed' WITH a recorded reason — the state
 *      that used to be indistinguishable from "empty document";
 *   2. catalog_project_document REFUSES a partial read (the sampled-page
 *      "review" this feature exists to stop), naming the unread ranges;
 *   3. after windowed reads cover the whole text, the same call succeeds and
 *      the comprehension record (kind / purpose / summary / key_data) is on
 *      durable record — embedding_status recorded honestly ('failed' is a
 *      legitimate outcome in an environment with no embedding provider);
 *   4. a successful text upload gets its extraction tier written in the same
 *      ingest that admitted the document;
 *   5. another tenant's org context cannot see the document at all.
 *
 * Runs with ANA_DOCUMENT_CATALOG_FORCE_ON=true — the env override the flag
 * helper honors — so no toggle row is needed.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

process.env.ANA_DOCUMENT_CATALOG_FORCE_ON = 'true';

const PROBE_PREFIX = 'dbtest-catalog ';
const PROBE_CODE = 'DBTEST-CAT-DOC';

const TXT_BODY =
  'Stability Study ST-23-104. Batch 23-104 stored at 25C/60RH. ' +
  'Twelve-month assay result 99.2 percent of label claim. No out-of-specification results. ' +
  'Conclusion: a 24-month retest period is supported.';
const TXT_BYTES = Buffer.from(TXT_BODY, 'utf8');

/** Magic bytes only — no page tree, no text layer; extraction can yield nothing. */
const OPAQUE_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'utf8',
);

let owner: Pool;
let orgId: number;
let orgUuid: string;
let otherOrgId: number;
let otherOrgUuid: string;
let userId: number;
let programId: string;
let app: express.Express;

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

/** Run a service/tool call the way a request would: inside the tenant scope. */
async function inTenantScope<T>(org: { id: number; uuid: string }, fn: () => Promise<T>): Promise<T> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  return runWithTenantScope(
    {
      tenantId: String(org.id),
      orgUuid: org.uuid,
      role: 'admin',
      source: 'request',
      caller: 'tests/db/document-catalog.dbtest.ts',
    },
    fn,
  );
}

/** The registered tool handlers, resolved through the real executor registry. */
async function callTool(name: string, input: Record<string, unknown>, asOrg?: { id: number; uuid: string }) {
  const { getToolHandler } = await import('../../server/services/ana/AnaToolExecutor');
  const handler = getToolHandler(name);
  if (!handler) throw new Error(`tool ${name} is not registered`);
  const org = asOrg ?? { id: orgId, uuid: orgUuid };
  const raw = await inTenantScope(org, () =>
    handler(input, { organizationId: org.id, userId }),
  );
  return JSON.parse(raw);
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
  // document_catalog and document_read_receipts follow by ON DELETE CASCADE.
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${PROBE_CODE}%`]);
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE_PREFIX}%`]);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });

  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PROBE_PREFIX}tenant`, 'dbtest-catalog-tenant'],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String(
    (await owner.query('SELECT uuid FROM organizations WHERE id = $1', [orgId])).rows[0].uuid,
  );

  const other = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PROBE_PREFIX}other tenant`, 'dbtest-catalog-other'],
  );
  otherOrgId = Number(other.rows[0].id);
  otherOrgUuid = String(
    (await owner.query('SELECT uuid FROM organizations WHERE id = $1', [otherOrgId])).rows[0].uuid,
  );

  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    ['dbtest-catalog@example.test', `${PROBE_PREFIX}actor`, 'not-a-real-hash'],
  );
  userId = Number(user.rows[0].id);

  await cleanupProbeRows();

  const prog = await owner.query(
    `INSERT INTO regulatory_programs
       (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', $4) RETURNING id`,
    [`${PROBE_PREFIX}program`, 'DBTEST-CAT-A', orgId, 'Catalogin 10mg'],
  );
  programId = String(prog.rows[0].id);

  app = await buildApp();
});

afterAll(async () => {
  await cleanupProbeRows().catch(() => {});
  await owner.end().catch(() => {});
});

let txtDocId: string;
let pdfDocId: string;

describe('ingest with the catalog on — the extraction tier is recorded', () => {

  it('a readable upload lands with catalog_status=extracted and real counts', async () => {
    const res = await request(app)
      .post('/api/vault/ingest')
      .field('programId', programId)
      .field('documentCode', `${PROBE_CODE}-TXT`)
      .field('documentTitle', 'Stability study ST-23-104')
      .field('documentType', 'OTHER')
      .attach('file', TXT_BYTES, 'stability-st-23-104.txt');
    expect(res.status).toBe(201);
    txtDocId = res.body.document.id;

    const { rows } = await owner.query(
      `SELECT catalog_status, extraction_method, extraction_error, char_count, content_hash
         FROM vault.document_catalog WHERE document_id = $1`,
      [txtDocId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      catalog_status: 'extracted',
      extraction_method: 'utf8',
      extraction_error: null,
      char_count: TXT_BODY.length,
    });

    /* The tenant key must be written at ingest. vault.documents gained
       organization_id with a one-time backfill from the program, but the
       retrieval path filters on it — so a row the INSERT leaves NULL is an
       orphan that belongs to no tenant and is returned to none. Nothing
       backfills a row written after the migration, which made every new upload
       silently unretrievable. */
    const tenant = await owner.query(
      `SELECT organization_id FROM vault.documents WHERE id = $1`,
      [txtDocId],
    );
    expect(tenant.rows[0].organization_id).toBe(orgId);
  });

  it('a real PDF records its actual page count, not null', async () => {
    /* page_count was declared at ingest and never assigned, so every document
       reported NULL — a column reading "unknown" for a number that was one
       call away. A text file legitimately has no pages; a PDF does, and says
       so. */
    const { PDFDocument } = await import('pdf-lib');
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();
    pdf.addPage();
    const bytes = Buffer.from(await pdf.save());

    const res = await request(app)
      .post('/api/vault/ingest')
      .field('programId', programId)
      .field('documentCode', `${PROBE_CODE}-PAGES`)
      .field('documentTitle', 'Three page report')
      .field('documentType', 'REPORT')
      .attach('file', bytes, 'three-pages.pdf');
    expect(res.status).toBe(201);

    const { rows } = await owner.query(
      `SELECT d.page_count AS doc_pages, c.page_count AS catalog_pages
         FROM vault.documents d
         LEFT JOIN vault.document_catalog c ON c.document_id = d.id
        WHERE d.id = $1`,
      [res.body.document.id],
    );
    expect(rows[0].doc_pages).toBe(3);
    expect(rows[0].catalog_pages).toBe(3);
  }, 60_000);

  it('an upload extraction cannot read is recorded as a FAILURE with a reason', async () => {
    const res = await request(app)
      .post('/api/vault/ingest')
      .field('programId', programId)
      .field('documentCode', `${PROBE_CODE}-PDF`)
      .field('documentTitle', 'Opaque scan')
      .field('documentType', 'OTHER')
      .attach('file', OPAQUE_PDF, 'opaque-scan.pdf');
    expect(res.status).toBe(201); // the document is still admitted…
    pdfDocId = res.body.document.id;

    const { rows } = await owner.query(
      `SELECT catalog_status, extraction_error, char_count
         FROM vault.document_catalog WHERE document_id = $1`,
      [pdfDocId],
    );
    // …but the catalog says the truth: nothing was extracted, and why.
    expect(rows).toHaveLength(1);
    expect(rows[0].catalog_status).toBe('extraction_failed');
    expect(rows[0].extraction_error).toBeTruthy();
    expect(rows[0].char_count).toBe(0);
  }, 60_000);

  it('read_project_document refuses to pretend the opaque document has content', async () => {
    const out = await callTool('read_project_document', { document_id: pdfDocId });
    expect(out.ok).toBe(false);
    expect(out.extractionFailed).toBe(true);
    expect(out.reason).toBeTruthy();
  });

  it('list_project_documents shows both files with honest catalog states', async () => {
    const out = await callTool('list_project_documents', { program_id: programId });
    expect(out.ok).toBe(true);
    const byCode = Object.fromEntries(out.documents.map((d: any) => [d.documentCode, d]));
    expect(byCode[`${PROBE_CODE}-TXT`].catalogStatus).toBe('extracted');
    expect(byCode[`${PROBE_CODE}-PDF`].catalogStatus).toBe('extraction_failed');
    expect(byCode[`${PROBE_CODE}-PDF`].extractionError).toBeTruthy();
  });

});

describe('a listing reports the scope, not the page it happened to return', () => {
  /* ── A page is not an inventory ─────────────────────────────────────────
     The listing has always applied a LIMIT (100 by default, 200 at most) and
     returned a bare array, so the only number a caller could report was
     `rows.length` — and the tool reported exactly that, as `count`. An
     organization with more documents than the limit was told it had precisely
     as many files as the query returned, and the ones it was NOT told about
     were the oldest, because the listing is ORDER BY created_at DESC. Session
     recall, which samples twelve, inherited the same lie under a heading that
     reads as the complete set.

     These cases drive the real SQL: the totals must describe the scope, and a
     page must say what it left out. Reverting the window aggregates to
     `documents.length` turns them red. */
  it('reports the scope total while the page stays at the limit', async () => {
    const truth = await owner.query(
      `SELECT COUNT(*)::int AS n FROM vault.documents
        WHERE program_id = $1 AND deleted_at IS NULL`,
      [programId],
    );
    const scopeTotal: number = truth.rows[0].n;
    expect(scopeTotal).toBeGreaterThan(1);

    const page = await callTool('list_project_documents', { program_id: programId, limit: 1 });
    expect(page.returned).toBe(1);
    expect(page.documents).toHaveLength(1);
    expect(page.total).toBe(scopeTotal);
    expect(page.withheld).toBe(scopeTotal - 1);
    expect(page.message).toContain(`${scopeTotal} document(s)`);
    expect(page.message).toContain(`${scopeTotal - 1} not returned`);
    expect(page.message).toContain('Do not answer "no such document" from this page');
  });

  it('counts what needs attention across the scope, not across the page', async () => {
    const truth = await owner.query(
      `SELECT COUNT(*) FILTER (
                WHERE c.catalog_status IS NULL OR c.catalog_status = 'extracted'
              )::int AS unstudied,
              COUNT(*) FILTER (WHERE c.catalog_status = 'extraction_failed')::int AS failed,
              COUNT(*) FILTER (WHERE d.placement_status = 'unfiled')::int AS unfiled
         FROM vault.documents d
         LEFT JOIN vault.document_catalog c ON c.document_id = d.id
        WHERE d.program_id = $1 AND d.deleted_at IS NULL`,
      [programId],
    );
    const { unstudied, failed, unfiled } = truth.rows[0];
    // Limit 1: the page holds one document, so any count above 1 is reachable
    // only from the scope aggregate.
    const page = await callTool('list_project_documents', { program_id: programId, limit: 1 });
    expect(page.notYetStudied).toBe(unstudied);
    expect(page.extractionFailed).toBe(failed);
    expect(page.unfiled).toBe(unfiled);
    expect(failed).toBeGreaterThan(0);
    expect(page.message).toContain(`${failed} with failed extraction`);
  });

  it('claims completeness only when the page really is the whole scope', async () => {
    const page = await callTool('list_project_documents', { program_id: programId, limit: 200 });
    expect(page.withheld).toBe(0);
    expect(page.returned).toBe(page.total);
    expect(page.message).toContain('all of them are listed here');
    expect(page.message).not.toContain('not returned');
  });

  it('the session-start digest carries the scope it sampled from', async () => {
    const svc = await import('../../server/services/vault/document-catalog.service');
    const digest = await inTenantScope({ id: orgId, uuid: orgUuid }, () =>
      svc.getCatalogBootstrapDigest(orgId, 1),
    );
    expect(digest.files).toHaveLength(1);
    expect(digest.total).toBeGreaterThan(1);
    expect(digest.withheld).toBe(digest.total - 1);

    const { formatVaultScopeLine } = await import(
      '../../server/services/ana-session-bootstrap-format'
    );
    const line = formatVaultScopeLine(digest);
    expect(line).toContain(`Showing 1 of ${digest.total} files on record`);
    expect(line).toContain('no such document');
  });
});

describe('the read-coverage gate, end to end through the tool handlers', () => {
  it('catalog_project_document REFUSES a partial read and names what is unread', async () => {
    // Read only the first 40 characters — the sampled-page anti-pattern.
    const first = await callTool('read_project_document', {
      document_id: txtDocId,
      offset: 0,
      max_chars: 1000,
    });
    // max_chars floor is 1000, which covers this small fixture entirely — so
    // force partial coverage the way it happens on real documents: wipe the
    // receipts and record a genuinely partial one.
    expect(first.ok).toBe(true);
    await owner.query(`DELETE FROM vault.document_read_receipts WHERE document_id = $1`, [txtDocId]);
    const hash = (
      await owner.query(`SELECT content_hash FROM vault.documents WHERE id = $1`, [txtDocId])
    ).rows[0].content_hash;
    const svc = await import('../../server/services/vault/document-catalog.service');
    await inTenantScope({ id: orgId, uuid: orgUuid }, () =>
      svc.recordReadReceipt({
        documentId: txtDocId,
        contentHash: hash,
        span: { start: 0, end: 40 },
        readBy: userId,
      }),
    );

    const refused = await callTool('catalog_project_document', {
      document_id: txtDocId,
      document_kind: 'Stability study report',
      purpose: 'Supports the retest period.',
      summary: 'Twelve-month stability data for batch 23-104.',
    });
    expect(refused.ok).toBe(false);
    expect(refused.refused).toBe(true);
    expect(refused.reason).toMatch(/only \d+ of \d+ characters/);
  });

  it('after reading ALL of it, the catalog write succeeds and is durable', async () => {
    const read = await callTool('read_project_document', {
      document_id: txtDocId,
      offset: 0,
      max_chars: 80_000,
    });
    expect(read.ok).toBe(true);
    expect(read.coverage.complete).toBe(true);
    expect(read.window.text).toContain('24-month retest period');

    const done = await callTool('catalog_project_document', {
      document_id: txtDocId,
      document_kind: 'Stability study report',
      purpose: 'Supports the 24-month retest period for batch 23-104.',
      summary:
        'Twelve-month 25C/60RH stability data for batch 23-104; assay 99.2% of label claim; no OOS; supports a 24-month retest period.',
      key_data: { batch: '23-104', assayPct: 99.2, retestMonths: 24 },
    });
    expect(done.ok).toBe(true);
    // No embedding provider in this environment — 'failed' is the honest
    // outcome; 'embedded' would mean one is configured. Both are legitimate.
    expect(['embedded', 'failed']).toContain(done.embeddingStatus);

    const { rows } = await owner.query(
      `SELECT catalog_status, document_kind, purpose, key_data->>'batch' AS batch
         FROM vault.document_catalog WHERE document_id = $1`,
      [txtDocId],
    );
    expect(rows[0]).toMatchObject({
      catalog_status: 'cataloged',
      document_kind: 'Stability study report',
      batch: '23-104',
    });
  });

  it('hands the comprehension record BACK on the next read, instead of starting from zero', async () => {
    /* key_data — the batch, the assay figure, the retest period AnA extracted
       after reading the whole document — was written, embedded into the vector
       the catalog search matches on, and then returned by nothing. Every
       re-read began from raw text, re-deriving numbers the record already held:
       the client re-explaining their own file, which is the thing this whole
       workstream exists to stop. */
    const read = await callTool('read_project_document', { document_id: txtDocId });
    expect(read.ok).toBe(true);
    expect(read.comprehension, 'a cataloged document must return what was learned').toBeTruthy();
    expect(read.comprehension.documentKind).toBe('Stability study report');
    expect(read.comprehension.keyData).toMatchObject({ batch: '23-104', retestMonths: 24 });
    expect(read.comprehension.catalogedAt).toBeTruthy();
  });

  it('another tenant cannot list or read the document', async () => {
    const listed = await callTool(
      'list_project_documents',
      { program_id: programId },
      { id: otherOrgId, uuid: otherOrgUuid },
    );
    expect(listed.ok).toBe(true);
    expect(listed.documents).toHaveLength(0);

    const read = await callTool(
      'read_project_document',
      { document_id: txtDocId },
      { id: otherOrgId, uuid: otherOrgUuid },
    );
    // Refused, and the refusal must not confirm the document exists elsewhere:
    // "no vault document with this id is in YOUR programs" is all a foreign
    // caller may learn.
    expect(read.ok).toBe(false);
    expect(read.error).toMatch(/No vault document with id/);
    expect(read.error).not.toMatch(/another organization|belongs to|exists/i);
  });
});

/**
 * The retrieval atom records what it holds, in a real column.
 *
 * Both chat-upload paths wrote ONE `lumen_data_atoms` row per file carrying
 * `extractedText.substring(0, 16000)`, and nothing recorded that the row was a
 * prefix. A retrieval hit returned those characters as the document's content.
 * The bound is unchanged — one atom is one embedding — but it is now written
 * into `structured_data`, which only a real database can prove accepts it.
 */
describe('a chat upload knows it is indexed by its opening only', () => {
  const ATOM_SOURCE = 'dbtest-catalog:upload-atom';

  afterAll(async () => {
    await owner
      .query('DELETE FROM lumen_data_atoms WHERE source_id = $1', [ATOM_SOURCE])
      .catch(() => {});
  });

  it('writes the file length and the embedded length onto the row', async () => {
    const { writeUploadRetrievalAtom, ATOM_CONTENT_LIMIT } = await import(
      '../../server/services/uploads/upload-retrieval-atom'
    );
    const text = Array.from(
      { length: 200 },
      (_, i) => `Paragraph ${i}. ${'Protocol body filler sentence. '.repeat(20)}`,
    ).join('\n\n');
    expect(text.length).toBeGreaterThan(ATOM_CONTENT_LIMIT);

    const res = await writeUploadRetrievalAtom(owner as any, {
      organizationId: orgId,
      sourceId: ATOM_SOURCE,
      fileName: 'protocol-v3.pdf',
      text,
      tags: ['source', 'chat_upload'],
    });
    expect(res.atomId).not.toBeNull();
    expect(res.truncated).toBe(true);

    const { rows } = await owner.query(
      `SELECT content, structured_data FROM lumen_data_atoms WHERE source_id = $1`,
      [ATOM_SOURCE],
    );
    expect(rows).toHaveLength(1);
    // The row holds the bounded content…
    expect(rows[0].content.length).toBe(res.embeddedChars);
    expect(rows[0].content.length).toBeLessThan(text.length);
    // …and says so, with the number that was previously unavailable anywhere.
    const rec = rows[0].structured_data;
    expect(rec.retrieval.truncated).toBe(true);
    expect(rec.retrieval.extractedChars).toBe(text.length);
    expect(rec.retrieval.embeddedChars).toBe(res.embeddedChars);
    expect(rec.retrieval.note).toContain('opening of the file only');
  });

  it('a second write for the same source is a no-op, not a duplicate', async () => {
    const { writeUploadRetrievalAtom } = await import(
      '../../server/services/uploads/upload-retrieval-atom'
    );
    const again = await writeUploadRetrievalAtom(owner as any, {
      organizationId: orgId,
      sourceId: ATOM_SOURCE,
      fileName: 'protocol-v3.pdf',
      text: 'anything',
      tags: ['source', 'chat_upload'],
    });
    expect(again.atomId).toBeNull();
    const { rows } = await owner.query(
      `SELECT COUNT(*)::int AS n FROM lumen_data_atoms WHERE source_id = $1`,
      [ATOM_SOURCE],
    );
    expect(rows[0].n).toBe(1);
  });
});

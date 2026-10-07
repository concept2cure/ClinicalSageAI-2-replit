/**
 * `draft_authoring_document` — the AnA tool, through its REGISTERED handler,
 * against the canonical authoring DDL on in-process Postgres (WM, 2026-09-21).
 *
 * No AI provider exists here, so the tool is exercised the way the executor
 * dispatches it: `approvedToolHandler(name)(input, ctx)`. Without an open project
 * it refuses verbatim and writes nothing; with one, the document, its sections
 * and its provenance exist in the authoring store and the result carries what
 * the stream's artifact_draft event needs (authoringDocId, programId, content).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createJourneyDb, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { PREREQ, VAULT_DDL, PROGRAM, PROGRAM_B, OTHER_PROGRAM, ORG, AUTHOR, M25_SECTIONS } from '../../../routes/__tests__/_authoring-canvas-fixture';
import { DRAFT_AUTHORING_DOCUMENT_NO_PROJECT } from '../../authoring/authoring-draft-tool';
import { approvedToolHandler } from './support/approved-tool-handler';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown, beforeEmbedding: null as (() => Promise<void>) | null }));
vi.mock('../../enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({ embed: async () => {
  await h.beforeEmbedding?.();
  throw new Error('Test embedding unavailable');
} }) }));
vi.mock('../../../db.js', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

const T = 240_000;
let jdb: JourneyDb;
let handler: (input: Record<string, unknown>, ctx?: Record<string, unknown>) => Promise<string>;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ + VAULT_DDL,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
      'db/migrations/20260813_audit_tamper_proof_log.sql',
      'db/migrations/20260725_authoring_signatures_and_workflow.sql',
      'db/migrations/20260725_authoring_signature_freeze_binding.sql',
      'db/migrations/20260730_authoring_runtime_ddl.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'db/migrations/20260727_authoring_object_permissions.sql',
      'db/migrations/20260803_document_span_lineage.sql',
      'migrations/20260907_span_lineage_accepted_machine_draft.sql',
      'migrations/20260908_span_lineage_machine_draft.sql',
      'migrations/20260728_authoring_comments_threading.sql',
      'migrations/20260727_authoring_document_program_scope.sql',
      'migrations/20260728_authoring_document_governed_binding.sql',
      'migrations/20260814d_document_alias_map.sql',
      'migrations/20260921_audit_logs_chain_seq.sql',
      'migrations/20260921_authoring_document_provenance.sql',
      'migrations/20260905_document_catalog.sql',
      'migrations/20261006_document_data_dispositions.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  for (const [id, program, hash] of [[SOURCE_ID, PROGRAM, 'a'], [OTHER_SOURCE_ID, PROGRAM_B, 'b'], [FOREIGN_SOURCE_ID, OTHER_PROGRAM, 'c']]) {
    await jdb.pool.query(`INSERT INTO vault.documents
      (id, program_id, document_code, document_title, document_type, file_name, content_hash, extracted_text)
      VALUES ($1::uuid,$2,$1::text,'Processed CSR','csr','csr.pdf',$3,$4)`, [id, program, hash.repeat(64), SOURCE_TEXT]);
    await jdb.pool.query(`INSERT INTO vault.document_catalog
      (document_id,content_hash,catalog_status,extraction_method,char_count)
      VALUES ($1,$2,'extracted','pdf-text',$3)`, [id, hash.repeat(64), SOURCE_TEXT.length]);
  }
  // Importing the executor registers every handler as an import side effect.
  await import('../AnaToolExecutor');
  const found = approvedToolHandler('draft_authoring_document');
  expect(found, 'draft_authoring_document is not registered').toBeDefined();
  handler = found as typeof handler;
}, T);

afterAll(async () => {
  await jdb?.close();
});

const input = {
  title: 'Module 2.5 Clinical Overview — AnA draft',
  module: 'M2',
  documentType: 'clinical_overview',
  sections: M25_SECTIONS,
};

const SOURCE_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_SOURCE_ID = '10000000-0000-4000-8000-000000000002';
const FOREIGN_SOURCE_ID = '10000000-0000-4000-8000-000000000003';
const SOURCE_TEXT = 'Processed study report: endpoint observed in 12 of 30 subjects.';
const sourceRef = (documentId = SOURCE_ID, hash = 'a') => ({ documentId, contentHash: hash.repeat(64),
  span: { start: 0, end: SOURCE_TEXT.length, totalChars: SOURCE_TEXT.length } });
const sourcedInput = (reference = sourceRef()) => ({ ...input,
  sections: [{ ...M25_SECTIONS[0], sourceReferences: [reference] }] });

describe('draft_authoring_document — durable project source references', () => {
  it('retains current, project-verified source references in saved provenance and CREATE audit metadata', async () => {
    const out = JSON.parse(await handler(sourcedInput(), { organizationId: ORG, userId: Number(AUTHOR.id), projectRef: PROGRAM, humanConfirmed: true }));
    expect(out.saved).toBe(true);
    const saved = await jdb.pool.query('SELECT provenance FROM authoring_documents WHERE id=$1 AND tenant_id=$2', [out.authoringDocId, ORG]);
    const savedRow = saved.rows[0] as { provenance: { projectSourceReferences: unknown } };
    expect(savedRow.provenance.projectSourceReferences).toEqual(out.projectSourceReferences);
    expect(out.projectSourceReferences[0]).toMatchObject({ sectionCode: M25_SECTIONS[0].code, verification: 'current_at_save', qualification: 'unassessed',
      sources: [{ documentId: SOURCE_ID, contentHash: 'a'.repeat(64), completeText: true }] });
    const audit = await jdb.pool.query('SELECT metadata FROM authoring_audit_trail WHERE doc_id=$1 AND tenant_id=$2', [out.authoringDocId, ORG]);
    const auditRow = audit.rows[0] as { metadata: { provenance: { projectSourceReferences: unknown } } };
    expect(auditRow.metadata.provenance.projectSourceReferences).toEqual(out.projectSourceReferences);
    expect(JSON.stringify(out.projectSourceReferences)).not.toContain(SOURCE_TEXT);
  });

  it.each([[OTHER_SOURCE_ID, 'b'], [FOREIGN_SOURCE_ID, 'c'], [SOURCE_ID, 'd']])('refuses wrong-project, foreign-tenant or stale-version source %s before creating anything', async (id, hash) => {
    const before = await jdb.pool.query('SELECT COUNT(*)::int AS n FROM authoring_documents');
    const out = JSON.parse(await handler(sourcedInput(sourceRef(id, hash)), { organizationId: ORG, userId: Number(AUTHOR.id), projectRef: PROGRAM, humanConfirmed: true }));
    expect(out.error).toMatch(/source references.*could not be verified/i);
    expect(out.saved).toBeUndefined();
    const after = await jdb.pool.query('SELECT COUNT(*)::int AS n FROM authoring_documents');
    expect((after.rows[0] as { n: number }).n).toBe((before.rows[0] as { n: number }).n);
  });

  it.each(['failed-extraction', 'stale-extraction'])('refuses a %s catalog record without creating a document', async kind => {
    const before = await jdb.pool.query('SELECT COUNT(*)::int AS n FROM authoring_documents');
    await jdb.pool.query('UPDATE vault.document_catalog SET catalog_status=$1,content_hash=$2 WHERE document_id=$3',
      [kind === 'failed-extraction' ? 'extraction_failed' : 'extracted', (kind === 'stale-extraction' ? 'd' : 'a').repeat(64), SOURCE_ID]);
    try {
      const out = JSON.parse(await handler(sourcedInput(), { organizationId: ORG, userId: Number(AUTHOR.id), projectRef: PROGRAM, humanConfirmed: true }));
      expect(out.error).toMatch(/source references.*could not be verified/i);
      const after = await jdb.pool.query('SELECT COUNT(*)::int AS n FROM authoring_documents');
      expect((after.rows[0] as { n: number }).n).toBe((before.rows[0] as { n: number }).n);
    } finally {
      await jdb.pool.query("UPDATE vault.document_catalog SET catalog_status='extracted',content_hash=$1 WHERE document_id=$2", ['a'.repeat(64), SOURCE_ID]);
    }
  });

});

describe('project catalog — source-version truth', () => {
  it('refuses stale comprehension without read receipts or backfill, and lists the file as unstudied', async () => {
    const { loadDocumentForOrg, listProjectDocuments, completeCatalog } = await import('../../vault/document-catalog.service');
    await jdb.pool.query("UPDATE vault.document_catalog SET content_hash=$1,catalog_status='cataloged',char_count=4,summary='stale endpoint 9 of 10',key_data='{\"n\":999}' WHERE document_id=$2", ['d'.repeat(64), SOURCE_ID]);
    try {
      const loaded = await loadDocumentForOrg(SOURCE_ID, ORG);
      expect(loaded?.catalog?.contentHash).toBe('d'.repeat(64)); // Mismatch is NOT disguised as no catalog.
      const { getToolHandler } = await import('../AnaToolExecutor');
      const read = JSON.parse(await getToolHandler('read_project_document')!({ document_id: SOURCE_ID }, { organizationId: ORG, userId: Number(AUTHOR.id), projectRef: PROGRAM }));
      expect(read).toMatchObject({ ok: false, code: 'SOURCE_VERSION_CHANGED' });
      expect(JSON.stringify(read)).not.toContain('9 of 10');
      const receipts = await jdb.pool.query('SELECT COUNT(*)::int AS n FROM vault.document_read_receipts WHERE document_id=$1', [SOURCE_ID]);
      expect((receipts.rows[0] as { n: number }).n).toBe(0);
      const listing = await listProjectDocuments(ORG, { programId: PROGRAM });
      expect(listing).toMatchObject({ total: 1, notYetStudied: 1 });
      expect(listing.documents[0].catalogStatus).toBe('uncataloged');
      const completed = await completeCatalog({ documentId: SOURCE_ID, organizationId: ORG, documentKind: 'CSR', purpose: 'Review', summary: 'New summary' });
      expect(completed).toMatchObject({ ok: false, refusal: expect.stringContaining('another source version') });
      const unchanged = await loadDocumentForOrg(SOURCE_ID, ORG);
      expect(unchanged?.catalog?.contentHash).toBe('d'.repeat(64));
      expect(unchanged?.catalog?.summary).toBe('stale endpoint 9 of 10');
    } finally {
      await jdb.pool.query("UPDATE vault.document_catalog SET content_hash=$1,catalog_status='extracted',char_count=$2,summary=NULL,key_data=NULL WHERE document_id=$3", ['a'.repeat(64), SOURCE_TEXT.length, SOURCE_ID]);
    }
  });

  it('does not report success when the non-vector catalog compare-and-set updates zero rows', async () => {
    const { recordReadReceipt, completeCatalog, loadDocumentForOrg } = await import('../../vault/document-catalog.service');
    await recordReadReceipt({ documentId: SOURCE_ID, contentHash: 'a'.repeat(64), span: { start: 0, end: SOURCE_TEXT.length }, readBy: Number(AUTHOR.id) });
    h.beforeEmbedding = async () => { await jdb.pool.query('UPDATE vault.document_catalog SET content_hash=$1 WHERE document_id=$2', ['d'.repeat(64), SOURCE_ID]); };
    try {
      const outcome = await completeCatalog({ documentId: SOURCE_ID, organizationId: ORG, documentKind: 'CSR', purpose: 'Review', summary: 'Must not report saved' });
      expect(outcome).toMatchObject({ ok: false, refusal: expect.stringContaining('changed before the write') });
      expect((await loadDocumentForOrg(SOURCE_ID, ORG))?.catalog?.summary).toBeNull();
    } finally {
      h.beforeEmbedding = null;
      await jdb.pool.query('UPDATE vault.document_catalog SET content_hash=$1 WHERE document_id=$2', ['a'.repeat(64), SOURCE_ID]);
    }
  });
});

describe('draft_authoring_document', () => {
  it('is in the tool catalog the model sees', async () => {
    const { ALL_ANA_TOOLS } = await import('../AnaToolDefinitions');
    const def = ALL_ANA_TOOLS.find((t) => t.name === 'draft_authoring_document');
    expect(def).toBeDefined();
    expect(def!.input_schema.required).toEqual(['title', 'sections']);
  });

  it('refuses verbatim without an open project, and writes nothing', async () => {
    const before = await jdb.pool.query('SELECT COUNT(*)::int AS n FROM authoring_documents');
    const out = JSON.parse(await handler(input, { organizationId: ORG, userId: Number(AUTHOR.id), humanConfirmed: true }));
    expect(out).toEqual({ error: DRAFT_AUTHORING_DOCUMENT_NO_PROJECT });
    const after = await jdb.pool.query('SELECT COUNT(*)::int AS n FROM authoring_documents');
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('refuses a project another organization owns as "no project" — never a cross-tenant write', async () => {
    const out = JSON.parse(await handler(input, { organizationId: ORG, userId: Number(AUTHOR.id), humanConfirmed: true, projectRef: OTHER_PROGRAM }));
    expect(out).toEqual({ error: DRAFT_AUTHORING_DOCUMENT_NO_PROJECT });
  });

  it('with the open program (uuid projectRef): the document, its sections and its provenance exist', async () => {
    const out = JSON.parse(
      await handler(input, { organizationId: ORG, userId: Number(AUTHOR.id), humanConfirmed: true, projectRef: PROGRAM, projectId: null, threadId: 'thread_42' }),
    );
    expect(out.error, JSON.stringify(out)).toBeUndefined();
    expect(out).toMatchObject({ status: 'generated', saved: true, documentStatus: 'draft', programId: PROGRAM, title: input.title, sectionCount: 3, documentType: 'clinical_overview' });
    expect(out.authoringDocId).toMatch(/^[0-9a-f-]{36}$/);
    // A text summary for the artifact_draft rail — the stream needs content to render.
    expect(out.content).toContain('# Module 2.5 Clinical Overview — AnA draft');
    expect(out.content).toContain('## 2.5.2 Overview of Biopharmaceutics');

    const doc = await jdb.pool.query(
      'SELECT title, status, client_program_id, provenance FROM authoring_documents WHERE id = $1 AND tenant_id = $2',
      [out.authoringDocId, ORG],
    );
    expect(doc.rows).toHaveLength(1);
    const row = doc.rows[0] as { status: string; client_program_id: string; provenance: Record<string, unknown> };
    expect(row.status).toBe('draft');
    expect(row.client_program_id).toBe(PROGRAM);
    expect(row.provenance).toMatchObject({ source: 'ana', conversationId: 'thread_42' });
    expect(row.provenance.model).toBeUndefined();

    const sections = await jdb.pool.query(
      'SELECT code, content FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index',
      [out.authoringDocId, ORG],
    );
    expect((sections.rows as { code: string }[]).map((s) => s.code)).toEqual(['2.5.1', '2.5.2', '2.5.3']);
    expect(String((sections.rows[1] as { content: string }).content)).toContain('<strong>62%</strong>');
  });

  it('resolves a legacy integer project through its regulatory_program_id anchor', async () => {
    const out = JSON.parse(await handler({ ...input, title: 'Legacy anchor draft' }, { organizationId: ORG, userId: Number(AUTHOR.id), humanConfirmed: true, projectId: 42 }));
    expect(out.error, JSON.stringify(out)).toBeUndefined();
    expect(out.programId).toBe(PROGRAM);
  });

  it('refuses a legacy project whose anchor names another organization’s program, and writes nothing (PF-04 P2)', async () => {
    // projects.regulatory_program_id is a soft link with no key: nothing stops
    // a row of this organization naming another organization's program. The
    // anchor is checked like any other project reference, never trusted.
    await jdb.pool.query(
      `INSERT INTO projects (id, organization_id, name, regulatory_program_id) VALUES (43, $1, 'foreign anchor', $2)`,
      [ORG, OTHER_PROGRAM],
    );
    const before = await jdb.pool.query(`SELECT count(*)::int AS n FROM authoring_documents`);
    const out = JSON.parse(await handler({ ...input, title: 'Foreign anchor draft' }, { organizationId: ORG, userId: Number(AUTHOR.id), humanConfirmed: true, projectId: 43 }));
    expect(out).toEqual({ error: DRAFT_AUTHORING_DOCUMENT_NO_PROJECT });
    const after = await jdb.pool.query(`SELECT count(*)::int AS n FROM authoring_documents`);
    expect((after.rows[0] as { n: number }).n).toBe((before.rows[0] as { n: number }).n);
  });

  it('a failed write reaches the model as a plain refusal, never the driver’s message', async () => {
    // The model relays tool text to the user; a driver error names tables and
    // constraints. Break the write by hiding a table it needs, then restore it.
    await jdb.pool.query(`ALTER TABLE authoring_sections RENAME TO authoring_sections_hidden`);
    try {
      const out = JSON.parse(await handler({ ...input, title: 'Write fails' }, { organizationId: ORG, userId: Number(AUTHOR.id), humanConfirmed: true, projectRef: PROGRAM }));
      expect(out.error, JSON.stringify(out)).toBe('draft_authoring_document failed: the document could not be written. Nothing was saved.');
    } finally {
      await jdb.pool.query(`ALTER TABLE authoring_sections_hidden RENAME TO authoring_sections`);
    }
  });

  it('a second document in the same program is created too (many documents per program)', async () => {
    const out = JSON.parse(await handler({ ...input, title: 'Protocol synopsis draft' }, { organizationId: ORG, userId: Number(AUTHOR.id), humanConfirmed: true, projectRef: PROGRAM }));
    expect(out.error, JSON.stringify(out)).toBeUndefined();
    const inProgram = await jdb.pool.query(
      'SELECT COUNT(*)::int AS n FROM authoring_documents WHERE client_program_id = $1 AND tenant_id = $2',
      [PROGRAM, ORG],
    );
    expect((inProgram.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(3);
  });

  it('refuses malformed input as an error the model can read, not a crash', async () => {
    const out = JSON.parse(await handler({ title: 'No sections', sections: [] }, { organizationId: ORG, userId: Number(AUTHOR.id), humanConfirmed: true, projectRef: PROGRAM }));
    expect(String(out.error)).toMatch(/sections/);
  });
});

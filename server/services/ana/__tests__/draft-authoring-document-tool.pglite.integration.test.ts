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
import { PREREQ, PROGRAM, OTHER_PROGRAM, ORG, AUTHOR, M25_SECTIONS } from '../../../routes/__tests__/_authoring-canvas-fixture';
import { DRAFT_AUTHORING_DOCUMENT_NO_PROJECT } from '../../authoring/authoring-draft-tool';
import { approvedToolHandler } from './support/approved-tool-handler';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
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
    prereqSql: PREREQ,
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
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
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

describe('draft_authoring_document', () => {
  it('is in the tool catalog the model sees', async () => {
    const { ALL_ANA_TOOLS } = await import('../AnaToolDefinitions');
    const def = ALL_ANA_TOOLS.find((t) => t.name === 'draft_authoring_document');
    expect(def).toBeDefined();
    expect(def!.input_schema.required).toEqual(['title', 'sections']);
  });

  it('refuses verbatim without an open project, and writes nothing', async () => {
    const before = await jdb.pool.query('SELECT COUNT(*)::int AS n FROM authoring_documents');
    const out = JSON.parse(await handler(input, { organizationId: ORG, userId: Number(AUTHOR.id) }));
    expect(out).toEqual({ error: DRAFT_AUTHORING_DOCUMENT_NO_PROJECT });
    const after = await jdb.pool.query('SELECT COUNT(*)::int AS n FROM authoring_documents');
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('refuses a project another organization owns as "no project" — never a cross-tenant write', async () => {
    const out = JSON.parse(await handler(input, { organizationId: ORG, userId: Number(AUTHOR.id), projectRef: OTHER_PROGRAM }));
    expect(out).toEqual({ error: DRAFT_AUTHORING_DOCUMENT_NO_PROJECT });
  });

  it('with the open program (uuid projectRef): the document, its sections and its provenance exist', async () => {
    const out = JSON.parse(
      await handler(input, { organizationId: ORG, userId: Number(AUTHOR.id), projectRef: PROGRAM, projectId: null, threadId: 'thread_42' }),
    );
    expect(out.error, JSON.stringify(out)).toBeUndefined();
    expect(out).toMatchObject({ status: 'generated', programId: PROGRAM, title: input.title, sectionCount: 3, documentType: 'clinical_overview' });
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
    const out = JSON.parse(await handler({ ...input, title: 'Legacy anchor draft' }, { organizationId: ORG, userId: Number(AUTHOR.id), projectId: 42 }));
    expect(out.error, JSON.stringify(out)).toBeUndefined();
    expect(out.programId).toBe(PROGRAM);
  });

  it('a second document in the same program is created too (many documents per program)', async () => {
    const out = JSON.parse(await handler({ ...input, title: 'Protocol synopsis draft' }, { organizationId: ORG, userId: Number(AUTHOR.id), projectRef: PROGRAM }));
    expect(out.error, JSON.stringify(out)).toBeUndefined();
    const inProgram = await jdb.pool.query(
      'SELECT COUNT(*)::int AS n FROM authoring_documents WHERE client_program_id = $1 AND tenant_id = $2',
      [PROGRAM, ORG],
    );
    expect((inProgram.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(3);
  });

  it('refuses malformed input as an error the model can read, not a crash', async () => {
    const out = JSON.parse(await handler({ title: 'No sections', sections: [] }, { organizationId: ORG, userId: Number(AUTHOR.id), projectRef: PROGRAM }));
    expect(String(out.error)).toMatch(/sections/);
  });
});

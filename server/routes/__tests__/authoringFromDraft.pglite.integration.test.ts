/**
 * POST /api/authoring/docs/from-draft — a drafted document becomes an
 * authoring document (WM, 2026-09-21, docs/design/ANA_DOCUMENT_CANVAS.md).
 *
 * The REAL router over HTTP (supertest) with REAL signed JWTs against the
 * canonical authoring DDL on in-process Postgres (PGlite): the happy path with
 * provenance read back through GET /docs/:id, the 400s, the 403, the server-
 * side sanitizer stripping a script tag, and — the control-tower addition —
 * TWO documents in ONE program both answering 201 and both listed by
 * GET /docs?programId=, with the root cause (the alias map's one-canonical-
 * per-filing rule) demonstrated against the same database.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { createJourneyDb, type JourneyDb } from '../../../tests/golden-journeys/harness';
import {
  PREREQ, AUTHOR, TENANTLESS, PROGRAM, PROGRAM_B, OTHER_PROGRAM, FILING_B, ORG,
  mint, makeApp, asToken, M25_SECTIONS,
} from './_authoring-canvas-fixture';
import { recordDocumentAlias, DocumentAliasConflictError, type AliasExecutor } from '../../services/c2c/document-alias-map';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

const T = 180_000;
let jdb: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
let tenantless: (r: request.Test) => request.Test;

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
      // The column under test.
      'migrations/20260921_authoring_document_provenance.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  author = asToken(await mint(AUTHOR));
  tenantless = asToken(await mint(TENANTLESS));
  const { default: router } = await import('../authoring.router');
  app = makeApp(router);
}, T);

afterAll(async () => {
  await jdb?.close();
});

const draftBody = (over: Record<string, unknown> = {}) => ({
  programId: PROGRAM,
  title: 'Module 2.5 Clinical Overview — excerpt',
  module: 'M2',
  documentType: 'clinical_overview',
  sections: M25_SECTIONS,
  provenance: { source: 'ana', conversationId: 'thread_abc', turnId: 'turn_7', note: 'drafted in the test' },
  ...over,
});

describe('POST /docs/from-draft', () => {
  it('creates the document with its sections in one go and returns { data: { doc, sections } }', async () => {
    const res = await author(request(app).post('/api/authoring/docs/from-draft')).send(draftBody());
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { doc, sections } = res.body.data;
    expect(doc.status).toBe('draft');
    expect(doc.client_program_id).toBe(PROGRAM);
    expect(doc.title).toBe('Module 2.5 Clinical Overview — excerpt');
    expect(sections.map((s: { code: string }) => s.code)).toEqual(['2.5.1', '2.5.2', '2.5.3']);
    expect(sections.map((s: { order_index: number }) => s.order_index)).toEqual([0, 1, 2]);
    // Provenance on the response AND on the row — the model is absent because none was reported.
    expect(doc.provenance).toMatchObject({ source: 'ana', conversationId: 'thread_abc', turnId: 'turn_7' });
    expect(doc.provenance.model).toBeUndefined();
    expect(typeof doc.provenance.recordedAt).toBe('string');

    // GET /docs/:id returns the stored provenance.
    const got = await author(request(app).get(`/api/authoring/docs/${doc.id}`));
    expect(got.status).toBe(200);
    expect(got.body.document.provenance).toMatchObject({ source: 'ana', conversationId: 'thread_abc' });
    expect(got.body.provenanceStore).toBeUndefined();

    // The Part 11 evidence: a genesis revision and a CREATE audit row per section,
    // and the machine author recorded on the revision inputs.
    const revs = await jdb.pool.query(
      `SELECT r.origin, r.inputs FROM doc_revisions r JOIN authoring_sections s ON s.id = r.section_id
        WHERE s.doc_id = $1 AND r.tenant_id = $2`,
      [doc.id, ORG],
    );
    expect(revs.rows.length).toBe(3);
    for (const r of revs.rows as { origin: string; inputs: string | { contributors?: unknown[] } }[]) {
      expect(r.origin).toBe('genesis');
      const inputs = typeof r.inputs === 'string' ? JSON.parse(r.inputs) : r.inputs;
      expect(inputs.contributors).toEqual([{ id: 'ana', name: 'AnA (AI draft)' }]);
    }
    const audits = await jdb.pool.query(
      `SELECT operation_type, change_reason FROM authoring_audit_trail WHERE doc_id = $1 AND tenant_id = $2`,
      [doc.id, ORG],
    );
    expect(audits.rows.length).toBe(3);
    expect((audits.rows[0] as { change_reason: string }).change_reason).toBe('Drafted by AnA in a conversation');
    // Span lineage: the machine's draft, not the actor's assertion.
    const lineage = await jdb.pool.query(
      `SELECT DISTINCT document_id FROM document_span_lineage WHERE organization_id = $1`,
      [ORG],
    );
    expect(lineage.rows.length).toBeGreaterThanOrEqual(3);
  });

  it('sanitizes the content: a <script> tag and an onerror handler never reach the store', async () => {
    const res = await author(request(app).post('/api/authoring/docs/from-draft')).send(
      draftBody({
        title: 'Hostile draft',
        sections: [
          {
            code: '2.5.1',
            title: 'Rationale',
            content: '<p>Safe text</p><script>alert(1)</script><img src="/api/authoring/images/x" onerror="steal()"><a href="javascript:alert(2)">link</a>',
          },
        ],
      }),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const stored = String(res.body.data.sections[0].content);
    expect(stored).toContain('<p>Safe text</p>');
    expect(stored).not.toContain('<script');
    expect(stored).not.toContain('onerror');
    expect(stored).not.toContain('javascript:');
    const row = await jdb.pool.query('SELECT content FROM authoring_sections WHERE doc_id = $1', [res.body.data.doc.id]);
    expect(String((row.rows[0] as { content: string }).content)).not.toContain('<script');
  });

  it('refuses 400 on an empty section list — nothing written', async () => {
    const before = await jdb.pool.query('SELECT COUNT(*)::int AS n FROM authoring_documents');
    const res = await author(request(app).post('/api/authoring/docs/from-draft')).send(draftBody({ sections: [] }));
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/sections/);
    const after = await jdb.pool.query('SELECT COUNT(*)::int AS n FROM authoring_documents');
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('refuses 400 without a programId', async () => {
    const res = await author(request(app).post('/api/authoring/docs/from-draft')).send(draftBody({ programId: undefined }));
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/programId/);
  });

  it('refuses 404 a project of another organization — nothing written (PF-02: the draft route checked the id\'s shape only)', async () => {
    const before = await jdb.pool.query(`SELECT count(*)::int AS n FROM authoring_documents`);
    const res = await author(request(app).post('/api/authoring/docs/from-draft')).send(draftBody({ programId: OTHER_PROGRAM }));
    expect(res.status).toBe(404);
    const after = await jdb.pool.query(`SELECT count(*)::int AS n FROM authoring_documents`);
    expect((after.rows[0] as { n: number }).n).toBe((before.rows[0] as { n: number }).n);
  });

  it('refuses 400 on a provenance source it does not know', async () => {
    const res = await author(request(app).post('/api/authoring/docs/from-draft')).send(
      draftBody({ provenance: { source: 'magic' } }),
    );
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/provenance.source/);
  });

  it('refuses 403 without a tenant', async () => {
    const res = await tenantless(request(app).post('/api/authoring/docs/from-draft')).send(draftBody());
    expect(res.status).toBe(403);
  });
});

describe('a program holds many documents (control tower, 2026-09-21)', () => {
  it('the root cause, demonstrated: the alias map admits ONE canonical document per filing', async () => {
    // Two authoring documents claiming the same governed filing as their
    // c2c_documents representation: the second is refused by the alias map.
    // This is what POST /docs surfaced as 409 DOCUMENT_ALIAS_CONFLICT on the
    // second document of a program.
    // The PGlite harness types its client's rows as unknown[]; the alias map
    // reads named columns, so narrow it to the executor shape it declares.
    const client = (await jdb.pool.connect()) as unknown as AliasExecutor & { release(): void };
    await client.query('BEGIN');
    const a = '0a0a0a0a-0000-4000-8000-00000000000a';
    const b = '0b0b0b0b-0000-4000-8000-00000000000b';
    const filing = 'doc_demo_filing';
    await recordDocumentAlias(client, { organizationId: ORG, canonicalId: a, store: 'c2c_documents', nativeId: filing });
    await expect(
      recordDocumentAlias(client, { organizationId: ORG, canonicalId: b, store: 'c2c_documents', nativeId: filing }),
    ).rejects.toBeInstanceOf(DocumentAliasConflictError);
    await client.query('ROLLBACK');
    client.release();
  });

  it('two POST /docs with client_program_id for one program → both 201, both listed by GET /docs?programId=', async () => {
    // A program whose filing nothing has claimed yet (the tests above already
    // took PROGRAM's), so the first document here IS the first.
    const first = await author(request(app).post('/api/authoring/docs')).send({
      title: 'IB — Investigator Brochure', module: 'M2', client_program_id: PROGRAM_B,
    });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    // The first document takes the filing's editing copy, exactly as before.
    expect(first.body.governance).toEqual({ bound: true, c2cDocumentId: FILING_B });

    const second = await author(request(app).post('/api/authoring/docs')).send({
      title: 'Protocol synopsis', module: 'M5', client_program_id: PROGRAM_B,
    });
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    // In the program, unbound, and it says why.
    expect(second.body.document.client_program_id).toBe(PROGRAM_B);
    expect(second.body.governance.bound).toBe(false);
    expect(String(second.body.governance.reason)).toContain(FILING_B);
    expect(String(second.body.governance.reason)).toContain(first.body.document.id);
    const row = await jdb.pool.query('SELECT c2c_document_id FROM authoring_documents WHERE id = $1', [second.body.document.id]);
    expect((row.rows[0] as { c2c_document_id: string | null }).c2c_document_id).toBeNull();

    // And a third, drafted by AnA through from-draft, lands in the same program.
    const third = await author(request(app).post('/api/authoring/docs/from-draft')).send(
      draftBody({ title: 'Module 2.5 draft #2', programId: PROGRAM_B }),
    );
    expect(third.status, JSON.stringify(third.body)).toBe(201);
    expect(third.body.governance.bound).toBe(false);

    const listed = await author(request(app).get('/api/authoring/docs').query({ programId: PROGRAM_B }));
    expect(listed.status).toBe(200);
    const titles = listed.body.documents.map((d: { title: string }) => d.title);
    expect(titles).toEqual(expect.arrayContaining(['IB — Investigator Brochure', 'Protocol synopsis', 'Module 2.5 draft #2']));

    // Another program's documents stay out of it.
    const other = await author(request(app).get('/api/authoring/docs').query({ programId: OTHER_PROGRAM }));
    expect(other.body.documents.map((d: { title: string }) => d.title)).not.toContain('Protocol synopsis');
  });
});

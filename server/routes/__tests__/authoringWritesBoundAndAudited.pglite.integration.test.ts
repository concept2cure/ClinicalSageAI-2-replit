/**
 * Authoring write routes: the object a request writes is the one its path
 * authorised, and the audit row for the write commits in the same transaction
 * as the write (periodic review 2026-09-28, editor family: SEC-A-1, P11-A-1
 * with SEC-A-8, SEC-A-2). SEC-A-9, the revert route's audit row, was fixed by
 * 59b0d8f9 and is covered by authoring-atomic-mutations.test.ts.
 *
 * What was wrong:
 *   SEC-A-1  POST /sections/:sectionId/refresh-token re-read the citation named
 *            by body `cite_id`, looked up by tenant alone. Both authorization
 *            layers check the PATH section, so an editor of one section could
 *            re-baseline the stored checksum of a citation on any document,
 *            frozen or signed, and nothing recorded it.
 *   P11-A-1  No citation write (cite, cite-source, the uncite DELETE,
 *   SEC-A-8  refresh-token, refresh-all) wrote to the document's audit trail;
 *            the DELETE and the overwrites destroyed the cite-time checksum
 *            with no before-image anywhere; and re-citing an already-cited
 *            source silently reset its checksum.
 *   SEC-A-2  POST /sections/:sectionId/comment filed the comment and its audit
 *            row under the body's `doc_id` and threaded it under the body's
 *            `parent_comment_id`, neither checked against the section.
 *
 * How it is driven: the REAL router over HTTP with REAL signed JWTs against the
 * canonical DDL on in-process Postgres (PGlite), with the per-user permission
 * matrix ON, so the section guard is the same decision production makes. The
 * database module is a recording shim over that database: PGlite is one
 * session, so a statement run on the pool inside someone else's BEGIN would
 * look transactional here and not be in production. The shim records which
 * executor ran each write, and the tests require every write and its audit row
 * to run on the transaction client between BEGIN and COMMIT.
 *
 * "Fail closed" is proved with a test-only trigger that refuses the audit row
 * for a named operation: the write it records must roll back with it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { randomUUID } from 'node:crypto';
import { createJourneyDb, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { PREREQ, AUTHOR, ORG, mint, makeApp, asToken } from './_authoring-canvas-fixture';
import { RECORDED_LINEAGE_STORES_DDL } from '../../services/document-data-disposition/__tests__/lineage-stores-fixture';

type Exec = { query: (text: unknown, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number }> };

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) => (h.pool as Exec).query(text, params),
}));

const T = 180_000;
/** The creator of the documents AUTHOR holds no grant on. */
const OTHER_USER = '9';

let jdb: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;

/** Every statement, in order, with the executor that ran it. */
const calls: Array<{ via: 'pool' | 'client'; sql: string }> = [];
const sqlText = (t: unknown) => (typeof t === 'string' ? t : String((t as { text?: string })?.text ?? '')).trim();

function recordingPool(inner: JourneyDb['pool']) {
  return {
    query: (t: unknown, p?: unknown[]) => {
      calls.push({ via: 'pool', sql: sqlText(t) });
      return inner.query(t as string, p);
    },
    connect: async () => {
      const c = await inner.connect();
      return {
        query: (t: unknown, p?: unknown[]) => {
          calls.push({ via: 'client', sql: sqlText(t) });
          return c.query(t as string, p);
        },
        release: () => c.release(),
      };
    },
  };
}

/**
 * Where the statements matching `re` ran: on the pool, on the transaction
 * client between BEGIN and COMMIT/ROLLBACK, or on a client outside one.
 */
function where(re: RegExp): { onPool: number; inTransaction: number; outsideTransaction: number } {
  const out = { onPool: 0, inTransaction: 0, outsideTransaction: 0 };
  let open = false;
  for (const c of calls) {
    if (c.via === 'client' && /^BEGIN/i.test(c.sql)) { open = true; continue; }
    if (c.via === 'client' && /^(COMMIT|ROLLBACK)/i.test(c.sql)) { open = false; continue; }
    if (!re.test(c.sql)) continue;
    if (c.via === 'pool') out.onPool++;
    else if (open) out.inTransaction++;
    else out.outsideTransaction++;
  }
  return out;
}
const once = { onPool: 0, inTransaction: 1, outsideTransaction: 0 };

const q = (text: string, params?: unknown[]) => jdb.pool.query(text, params) as Promise<{ rows: any[] }>;

async function makeDoc(opts: { status?: string; createdBy?: string } = {}): Promise<string> {
  const id = randomUUID();
  await q(
    `INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id)
     VALUES ($1, $2, 'M3', $3, $4, $5)`,
    [id, `Doc ${id.slice(0, 8)}`, opts.status ?? 'draft', opts.createdBy ?? AUTHOR.id, ORG],
  );
  return id;
}

async function makeSection(docId: string, code = '3.2.P.1'): Promise<string> {
  const id = randomUUID();
  await q(
    `INSERT INTO authoring_sections (id, doc_id, code, title, content, tenant_id)
     VALUES ($1, $2, $3, $4, '<p>Original text.</p>', $5)`,
    [id, docId, code, `Section ${code}`, ORG],
  );
  return id;
}

async function makeSource(checksum: string): Promise<number> {
  const r = await q(
    `INSERT INTO cre_evidence_sources (organization_id, source_type, title, checksum)
     VALUES ($1, 'client_document', $2, $3) RETURNING id`,
    [ORG, `protocol ${checksum}`, checksum],
  );
  return Number(r.rows[0].id);
}

const moveSource = (id: number, checksum: string) =>
  q(`UPDATE cre_evidence_sources SET checksum = $1, updated_at = NOW() WHERE id = $2`, [checksum, id]);

/** A citation written straight to the table — for a section no route may write to. */
async function insertCitation(sectionId: string, sourceId: number, checksum: string): Promise<string> {
  const id = randomUUID();
  await q(
    `INSERT INTO authoring_citations
       (id, section_id, source, citation_text, reference_id, created_by, tenant_id, payload_sha256)
     VALUES ($1, $2, 'cre_evidence_source', 'as cited', $3, $4, $5, $6)`,
    [id, sectionId, String(sourceId), OTHER_USER, ORG, checksum],
  );
  return id;
}

async function checksumOf(citationId: string): Promise<string | null> {
  const r = await q(`SELECT payload_sha256 FROM authoring_citations WHERE id = $1`, [citationId]);
  return r.rows[0] ? (r.rows[0].payload_sha256 as string | null) : null;
}

type TrailRow = {
  doc_id: string | null;
  section_id: string | null;
  operation_type: string;
  before_content: string | null;
  after_content: string | null;
  metadata: Record<string, unknown> | null;
};

async function trail(docId: string, op?: string): Promise<TrailRow[]> {
  const r = await q(
    `SELECT doc_id, section_id, operation_type, before_content, after_content, metadata
       FROM authoring_audit_trail
      WHERE doc_id = $1 AND tenant_id = $2 AND ($3::text IS NULL OR operation_type = $3)
      ORDER BY created_at ASC`,
    [docId, ORG, op ?? null],
  );
  return r.rows as TrailRow[];
}

const trailTotal = async () =>
  Number((await q(`SELECT COUNT(*)::int AS n FROM authoring_audit_trail`)).rows[0].n);

/** Refuse the audit row for `op` while `run` executes. */
async function withAuditRefused<T>(op: string, run: () => Promise<T>): Promise<T> {
  await q(`INSERT INTO test_refused_audit_ops (op) VALUES ($1)`, [op]);
  try {
    return await run();
  } finally {
    await q(`DELETE FROM test_refused_audit_ops WHERE op = $1`, [op]);
  }
}

beforeAll(async () => {
  process.env.AUTH_ENFORCE_SECTION_PERMS = '1';
  jdb = await createJourneyDb({
    prereqSql: PREREQ + RECORDED_LINEAGE_STORES_DDL,
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
      // The canonical source registry and the citation back-reference index.
      'db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
      // cre_evidence_sources.client_program_id: a citation is judged by its source's project (PF-11).
      'migrations/20260726_cre_source_program_scope.sql',
      'migrations/20260726_authoring_citation_source_usage.sql',
      // Citation eligibility reads this existing ledger and its write guards.
      'migrations/20261006_document_data_dispositions.sql',
    ],
    // TEST-ONLY: refuse the audit row for any operation listed in the table.
    testOnlySql: `
      CREATE TABLE test_refused_audit_ops (op TEXT PRIMARY KEY);
      CREATE FUNCTION test_refuse_audit() RETURNS trigger AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM test_refused_audit_ops WHERE op = NEW.operation_type) THEN
          RAISE EXCEPTION 'test: audit row refused for %', NEW.operation_type;
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_refuse_audit BEFORE INSERT ON authoring_audit_trail
        FOR EACH ROW EXECUTE FUNCTION test_refuse_audit();
    `,
  });
  h.db = jdb.db;
  h.pool = recordingPool(jdb.pool);
  author = asToken(await mint(AUTHOR));
  const { default: router } = await import('../authoring.router');
  app = makeApp(router);
}, T);

afterAll(async () => {
  delete process.env.AUTH_ENFORCE_SECTION_PERMS;
  await jdb?.close();
});

beforeEach(() => {
  calls.length = 0;
});

describe('SEC-A-1 — "Re-read source" re-reads only a citation the path section owns', () => {
  it('refuses, as not found, a citation on another document that is FROZEN and not granted to the caller; nothing is written', async () => {
    const docA = await makeDoc();
    const secA = await makeSection(docA);
    const docB = await makeDoc({ status: 'FROZEN', createdBy: OTHER_USER });
    const secB = await makeSection(docB);
    const src = await makeSource('sha-sealed-1');
    const citeB = await insertCitation(secB, src, 'sha-sealed-1');
    await moveSource(src, 'sha-sealed-2');
    const before = await trailTotal();

    const res = await author(request(app).post(`/api/authoring/sections/${secA}/refresh-token`)).send({ cite_id: citeB });

    expect(res.status, JSON.stringify(res.body)).toBe(404);
    // The sealed document's cite-time checksum is untouched.
    expect(await checksumOf(citeB)).toBe('sha-sealed-1');
    expect(await trailTotal()).toBe(before);
    expect(where(/UPDATE authoring_citations/i)).toEqual({ onPool: 0, inTransaction: 0, outsideTransaction: 0 });
  }, T);

  it('refuses a citation on another section of the same document', async () => {
    const doc = await makeDoc();
    const one = await makeSection(doc, '3.2.P.1');
    const two = await makeSection(doc, '3.2.P.2');
    const src = await makeSource('sha-sibling-1');
    const citeTwo = await insertCitation(two, src, 'sha-sibling-1');
    await moveSource(src, 'sha-sibling-2');

    const res = await author(request(app).post(`/api/authoring/sections/${one}/refresh-token`)).send({ cite_id: citeTwo });

    expect(res.status).toBe(404);
    expect(await checksumOf(citeTwo)).toBe('sha-sibling-1');
    expect(await trail(doc)).toHaveLength(0);
  }, T);

  it("re-reads the section's own citation and records the prior checksum in the same transaction", async () => {
    const doc = await makeDoc();
    const sec = await makeSection(doc);
    const src = await makeSource('sha-own-1');
    const cite = await insertCitation(sec, src, 'sha-own-1');
    await moveSource(src, 'sha-own-2');

    const res = await author(request(app).post(`/api/authoring/sections/${sec}/refresh-token`)).send({ cite_id: cite });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ changed: true, previous_sha256: 'sha-own-1', sha256: 'sha-own-2' });
    expect(await checksumOf(cite)).toBe('sha-own-2');

    const rows = await trail(doc, 'CITATION_REFRESHED');
    expect(rows).toHaveLength(1);
    expect(rows[0].section_id).toBe(sec);
    expect(JSON.parse(String(rows[0].before_content))).toMatchObject({ id: cite, payload_sha256: 'sha-own-1', citation_text: 'as cited' });
    expect(JSON.parse(String(rows[0].after_content))).toMatchObject({ id: cite, payload_sha256: 'sha-own-2' });
    expect(rows[0].metadata).toMatchObject({ citation_id: cite, previous_sha256: 'sha-own-1', sha256: 'sha-own-2' });

    expect(where(/UPDATE authoring_citations/i)).toEqual(once);
    expect(where(/INSERT INTO authoring_audit_trail/i)).toEqual(once);
  }, T);

  it('a re-read that finds the content unchanged writes nothing', async () => {
    const doc = await makeDoc();
    const sec = await makeSection(doc);
    const src = await makeSource('sha-still-1');
    const cite = await insertCitation(sec, src, 'sha-still-1');

    const res = await author(request(app).post(`/api/authoring/sections/${sec}/refresh-token`)).send({ cite_id: cite });

    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(false);
    expect(await trail(doc)).toHaveLength(0);
  }, T);
});

describe('P11-A-1 / SEC-A-8 — every citation write is on the document trail, with its before-image', () => {
  it('cite-source: CITATION_ADDED under the document the section belongs to, in the same transaction', async () => {
    const doc = await makeDoc();
    const sec = await makeSection(doc);
    const src = await makeSource('sha-add-1');

    const res = await author(request(app).post(`/api/authoring/sections/${sec}/cite-source`)).send({ source_id: src });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const rows = await trail(doc, 'CITATION_ADDED');
    expect(rows).toHaveLength(1);
    expect(rows[0].section_id).toBe(sec);
    expect(rows[0].before_content).toBeNull();
    expect(JSON.parse(String(rows[0].after_content))).toMatchObject({
      id: res.body.citationId,
      reference_id: String(src),
      payload_sha256: 'sha-add-1',
    });
    expect(where(/INSERT INTO authoring_citations/i)).toEqual(once);
    expect(where(/INSERT INTO authoring_audit_trail/i)).toEqual(once);
  }, T);

  it('re-citing an already-cited source keeps the checksum recorded at cite time and writes nothing', async () => {
    const doc = await makeDoc();
    const sec = await makeSection(doc);
    const src = await makeSource('sha-recite-1');
    const first = await author(request(app).post(`/api/authoring/sections/${sec}/cite-source`)).send({ source_id: src });
    expect(first.status).toBe(201);
    await moveSource(src, 'sha-recite-2');
    calls.length = 0;

    const again = await author(request(app).post(`/api/authoring/sections/${sec}/cite-source`)).send({ source_id: src });

    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ created: false, citationId: first.body.citationId, citedChecksum: 'sha-recite-1' });
    // Still the evidence that the section was written against the earlier content.
    expect(await checksumOf(first.body.citationId)).toBe('sha-recite-1');
    expect(where(/UPDATE authoring_citations/i)).toEqual({ onPool: 0, inTransaction: 0, outsideTransaction: 0 });
    expect(await trail(doc)).toHaveLength(1); // the original CITATION_ADDED only
  }, T);

  it('re-citing with new citation text records the prior text, and leaves the checksum alone', async () => {
    const doc = await makeDoc();
    const sec = await makeSection(doc);
    const src = await makeSource('sha-text-1');
    const first = await author(request(app).post(`/api/authoring/sections/${sec}/cite-source`))
      .send({ source_id: src, citation_text: 'Protocol §5' });
    await moveSource(src, 'sha-text-2');

    const again = await author(request(app).post(`/api/authoring/sections/${sec}/cite-source`))
      .send({ source_id: src, citation_text: 'Protocol §5.2' });

    expect(again.status).toBe(200);
    expect(await checksumOf(first.body.citationId)).toBe('sha-text-1');
    const rows = await trail(doc, 'CITATION_UPDATED');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(String(rows[0].before_content))).toMatchObject({ citation_text: 'Protocol §5', payload_sha256: 'sha-text-1' });
    expect(JSON.parse(String(rows[0].after_content))).toMatchObject({ citation_text: 'Protocol §5.2', payload_sha256: 'sha-text-1' });
  }, T);

  it('uncite: CITATION_REMOVED keeps the deleted row, cite-time checksum included, as its before-image', async () => {
    const doc = await makeDoc();
    const sec = await makeSection(doc);
    const src = await makeSource('sha-del-1');
    const cited = await author(request(app).post(`/api/authoring/sections/${sec}/cite-source`)).send({ source_id: src });
    await moveSource(src, 'sha-del-2');
    calls.length = 0;

    const res = await author(request(app).delete(`/api/authoring/sections/${sec}/cite-source/${src}`));

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await checksumOf(cited.body.citationId)).toBeNull(); // gone from the table
    const rows = await trail(doc, 'CITATION_REMOVED');
    expect(rows).toHaveLength(1);
    expect(rows[0].section_id).toBe(sec);
    expect(rows[0].after_content).toBeNull();
    expect(JSON.parse(String(rows[0].before_content))).toMatchObject({
      id: cited.body.citationId,
      reference_id: String(src),
      payload_sha256: 'sha-del-1',
      created_by: AUTHOR.id,
    });
    expect(where(/DELETE FROM authoring_citations/i)).toEqual(once);
    expect(where(/INSERT INTO authoring_audit_trail/i)).toEqual(once);
  }, T);

  it('the free-text cite: CITATION_ADDED in the same transaction', async () => {
    const doc = await makeDoc();
    const sec = await makeSection(doc);

    const res = await author(request(app).post(`/api/authoring/sections/${sec}/cite`))
      .send({ source: 'lims_result', reference_id: 'BATCH-9', citation_text: 'Assay, batch 9' });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const rows = await trail(doc, 'CITATION_ADDED');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(String(rows[0].after_content))).toMatchObject({ id: res.body.citation.id, source: 'lims_result', reference_id: 'BATCH-9' });
    expect(where(/INSERT INTO authoring_citations/i)).toEqual(once);
    expect(where(/INSERT INTO authoring_audit_trail/i)).toEqual(once);
  }, T);
});

describe('P11-A-1 — "Re-read all" records each checksum it moves, and refuses a sealed document', () => {
  it('refresh-all: one CITATION_REFRESHED per citation whose checksum moved, under its own section', async () => {
    const doc = await makeDoc();
    const one = await makeSection(doc, '3.2.P.1');
    const two = await makeSection(doc, '3.2.P.2');
    const moved = await makeSource('sha-all-moved-1');
    const still = await makeSource('sha-all-still-1');
    const citeMoved = await insertCitation(two, moved, 'sha-all-moved-1');
    await insertCitation(one, still, 'sha-all-still-1');
    await moveSource(moved, 'sha-all-moved-2');

    const res = await author(request(app).post(`/api/authoring/docs/${doc}/refresh-all`)).send({});

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ ok: true, refreshed: 2, changed: 1 });
    const rows = await trail(doc, 'CITATION_REFRESHED');
    expect(rows).toHaveLength(1);
    expect(rows[0].section_id).toBe(two);
    expect(JSON.parse(String(rows[0].before_content))).toMatchObject({ id: citeMoved, payload_sha256: 'sha-all-moved-1' });
    expect(JSON.parse(String(rows[0].after_content))).toMatchObject({ id: citeMoved, payload_sha256: 'sha-all-moved-2' });
    expect(where(/UPDATE authoring_citations/i)).toEqual(once);
    expect(where(/INSERT INTO authoring_audit_trail/i)).toEqual(once);
  }, T);

  it('refresh-all refuses a FROZEN document and re-reads nothing', async () => {
    const doc = await makeDoc({ status: 'FROZEN' });
    const sec = await makeSection(doc);
    const src = await makeSource('sha-all-sealed-1');
    const cite = await insertCitation(sec, src, 'sha-all-sealed-1');
    await moveSource(src, 'sha-all-sealed-2');

    const res = await author(request(app).post(`/api/authoring/docs/${doc}/refresh-all`)).send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('DOCUMENT_FROZEN');
    expect(await checksumOf(cite)).toBe('sha-all-sealed-1');
    expect(await trail(doc)).toHaveLength(0);
  }, T);
});

describe('fail closed — an audit row that cannot be written takes the change with it', () => {
  it('cite-source', async () => {
    const doc = await makeDoc();
    const sec = await makeSection(doc);
    const src = await makeSource('sha-fc-add');

    const res = await withAuditRefused('CITATION_ADDED', () =>
      author(request(app).post(`/api/authoring/sections/${sec}/cite-source`)).send({ source_id: src }),
    );

    expect(res.status).toBe(500);
    const left = await q(`SELECT 1 FROM authoring_citations WHERE section_id = $1`, [sec]);
    expect(left.rows).toHaveLength(0);
  }, T);

  it('uncite', async () => {
    const doc = await makeDoc();
    const sec = await makeSection(doc);
    const src = await makeSource('sha-fc-del');
    const cite = await insertCitation(sec, src, 'sha-fc-del');

    const res = await withAuditRefused('CITATION_REMOVED', () =>
      author(request(app).delete(`/api/authoring/sections/${sec}/cite-source/${src}`)),
    );

    expect(res.status).toBe(500);
    expect(await checksumOf(cite)).toBe('sha-fc-del');
  }, T);

  it('refresh-token', async () => {
    const doc = await makeDoc();
    const sec = await makeSection(doc);
    const src = await makeSource('sha-fc-rr-1');
    const cite = await insertCitation(sec, src, 'sha-fc-rr-1');
    await moveSource(src, 'sha-fc-rr-2');

    const res = await withAuditRefused('CITATION_REFRESHED', () =>
      author(request(app).post(`/api/authoring/sections/${sec}/refresh-token`)).send({ cite_id: cite }),
    );

    expect(res.status).toBe(500);
    expect(await checksumOf(cite)).toBe('sha-fc-rr-1');
  }, T);

  it('refresh-all — the whole batch, not the citations before the failure', async () => {
    const doc = await makeDoc();
    const one = await makeSection(doc, '3.2.P.1');
    const two = await makeSection(doc, '3.2.P.2');
    const a = await makeSource('sha-fc-all-a1');
    const b = await makeSource('sha-fc-all-b1');
    const citeA = await insertCitation(one, a, 'sha-fc-all-a1');
    const citeB = await insertCitation(two, b, 'sha-fc-all-b1');
    await moveSource(a, 'sha-fc-all-a2');
    await moveSource(b, 'sha-fc-all-b2');

    const res = await withAuditRefused('CITATION_REFRESHED', () =>
      author(request(app).post(`/api/authoring/docs/${doc}/refresh-all`)).send({}),
    );

    expect(res.status).toBe(500);
    expect(await checksumOf(citeA)).toBe('sha-fc-all-a1');
    expect(await checksumOf(citeB)).toBe('sha-fc-all-b1');
  }, T);
});

describe('SEC-A-2 — a comment belongs to the document its section belongs to', () => {
  it('refuses (400) a body doc_id naming another document, and writes nothing', async () => {
    const docA = await makeDoc();
    const secA = await makeSection(docA);
    const docB = await makeDoc({ status: 'FROZEN', createdBy: OTHER_USER });

    const res = await author(request(app).post(`/api/authoring/sections/${secA}/comment`))
      .send({ body: 'Planted on another document', doc_id: docB });

    expect(res.status).toBe(400);
    const planted = await q(`SELECT 1 FROM authoring_comments WHERE doc_id = $1 OR section_id = $2`, [docB, secA]);
    expect(planted.rows).toHaveLength(0);
    expect(await trail(docB)).toHaveLength(0);
  }, T);

  it('files the comment, and its audit row, under the section\'s document in one transaction', async () => {
    const doc = await makeDoc();
    const sec = await makeSection(doc);

    const res = await author(request(app).post(`/api/authoring/sections/${sec}/comment`)).send({ body: 'Check the batch table.' });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.comment.doc_id).toBe(doc);
    expect(await trail(doc, 'comment_added')).toHaveLength(1);
    expect(where(/INSERT INTO authoring_comments/i)).toEqual(once);
    expect(where(/INSERT INTO authoring_audit_trail/i)).toEqual(once);
  }, T);

  it('refuses (400) a parent comment on another section, and writes nothing', async () => {
    const doc = await makeDoc();
    const one = await makeSection(doc, '3.2.P.1');
    const two = await makeSection(doc, '3.2.P.2');
    const parent = await author(request(app).post(`/api/authoring/sections/${two}/comment`)).send({ body: 'Thread on two', doc_id: doc });
    expect(parent.status).toBe(201);

    const res = await author(request(app).post(`/api/authoring/sections/${one}/comment`))
      .send({ body: 'Reply filed on one', doc_id: doc, parent_comment_id: parent.body.comment.id });

    expect(res.status).toBe(400);
    const replies = await q(`SELECT 1 FROM authoring_comments WHERE parent_comment_id = $1`, [parent.body.comment.id]);
    expect(replies.rows).toHaveLength(0);
    expect(await trail(doc, 'reply_added')).toHaveLength(0);
  }, T);

  it('threads a reply to a parent on the same section', async () => {
    const doc = await makeDoc();
    const sec = await makeSection(doc);
    const parent = await author(request(app).post(`/api/authoring/sections/${sec}/comment`)).send({ body: 'Thread', doc_id: doc });

    const res = await author(request(app).post(`/api/authoring/sections/${sec}/comment`))
      .send({ body: 'Reply', doc_id: doc, parent_comment_id: parent.body.comment.id });

    expect(res.status).toBe(201);
    expect(res.body.comment.parent_comment_id).toBe(parent.body.comment.id);
    expect(await trail(doc, 'reply_added')).toHaveLength(1);
  }, T);

  it('fail closed: a comment whose audit row cannot be written is not saved', async () => {
    const doc = await makeDoc();
    const sec = await makeSection(doc);

    const res = await withAuditRefused('comment_added', () =>
      author(request(app).post(`/api/authoring/sections/${sec}/comment`)).send({ body: 'Unrecorded', doc_id: doc }),
    );

    expect(res.status).toBe(500);
    const left = await q(`SELECT 1 FROM authoring_comments WHERE section_id = $1`, [sec]);
    expect(left.rows).toHaveLength(0);
  }, T);
});

/**
 * A filing copy that a submission leaf pins is never rewritten by placing its
 * source again (QA 2026-10-08, walk 2, j4 blocker).
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Authoring > Place into filing takes a filing copy of the document
 * (POST /api/coauthor/documents with sourceAuthoringDocId — takeAuthoringSnapshot)
 * and points a leaf at it (upsertLeaf), which pins the sha256 of the copy's
 * text. One copy per source: a second placement re-takes the SAME copy. After
 * the document was edited, pressing Place again rewrote that copy's text in
 * place, so leaf #81's filed text was replaced and its pin no longer matched,
 * while upsertLeaf answered `unchanged: true` and the dialog said "Already
 * placed … Nothing was written". The Builder then showed "CONTENT CHANGED SINCE
 * FILING", and the copy the leaf filed was no longer the copy row's text.
 *
 * ── What is pinned here ──────────────────────────────────────────────────────
 *   - re-placing an edited document whose copy a live leaf pins is refused
 *     (409 FILING_COPY_PINNED), naming the leaf; the copy's text, title and
 *     sha256 are exactly the leaf's pin, and nothing is versioned or audited;
 *   - a frozen or dispatched sequence's leaf pins the copy the same way;
 *   - the same text, now approved, may still promote the copy's status (the
 *     pin is the text, and the text is unchanged) and says it wrote;
 *   - once the leaf is removed, the copy is no longer filed and is re-taken;
 *   - upsertLeaf answers `unchanged` only while the pin still matches.
 *
 * Real router, real snapshot service, real upsertLeaf, on PGlite.
 */
import { vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'coauthor-snapshot-pinned-secret-padded-to-32';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));

vi.mock('../../db', () => {
  const pool = { query: (sql: string, params?: unknown[]) => holder.pglite.query(sql, params) };
  return {
    get db() {
      return holder.db;
    },
    pool,
    getPool: () => pool,
    transaction: async (fn: (c: unknown) => unknown) =>
      holder.pglite.transaction(async (tx: any) => fn({ query: (s: string, p?: unknown[]) => tx.query(s, p) })),
  };
});

vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { ...(req.user || {}), id: 3, userId: 3, organizationId: 7 };
    next();
  },
  authenticateToken: (_r: any, _s: any, n: any) => n(),
  requireAuth: (_r: any, _s: any, n: any) => n(),
}));

/* upsertLeaf / removeLeaf record their §11.10(e) row through auditService. */
const logAction = vi.hoisted(() => vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })));
vi.mock('../../services/auditService', () => ({ default: { logAction } }));

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import express from 'express';
import { createIndPgliteDb, type IndPgliteDb } from '../../db/pglite-harness';
import { expandRoleClaims } from '../../middleware/auth';
import coauthorRoutes from '../coauthor';
import { upsertLeaf, removeLeaf, SubmissionError } from '../../services/submission-service/submission-service';

const ORG = 7;
const CTX = { organizationId: ORG, userId: 3 };

let h: IndPgliteDb;
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 3, userId: 3, organizationId: ORG, role: 'member', roles: expandRoleClaims('member', undefined) };
  next();
});
app.use('/api/coauthor', coauthorRoutes);

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const q = async <T = any>(text: string, params: unknown[] = []): Promise<T[]> =>
  (await h.pglite.query<T>(text, params)).rows;

type Copy = { id: number; status: string; title: string; content: string; updated_at: string };
const copy = async (id: number): Promise<Copy> =>
  (await q<Copy>('SELECT id, status, title, content, updated_at::text AS updated_at FROM coauthor_documents WHERE id = $1', [id]))[0];
const versionsOf = async (id: number) =>
  (await q<{ n: number }>('SELECT count(*)::int AS n FROM coauthor_document_versions WHERE document_id = $1', [id]))[0].n;
const eventsOf = async (id: number) =>
  (await q<{ n: number }>("SELECT count(*)::int AS n FROM audit_events WHERE entity_type = 'coauthor_document' AND entity_id = $1", [String(id)]))[0].n;

/** Seal a document as the authoring router does on freeze/approval (see coauthorSnapshotFromSource.test.ts). */
async function seal(id: string): Promise<void> {
  const [doc] = await q('SELECT * FROM authoring_documents WHERE id = $1', [id]);
  const sections = await q('SELECT * FROM authoring_sections WHERE doc_id = $1 ORDER BY order_index, created_at, id', [id]);
  const frozenContent = JSON.stringify({ document: doc, sections, frozenAt: new Date().toISOString() });
  await q(
    `INSERT INTO frozen_documents (document_id, version, frozen_content, content_hash, frozen_by, tenant_id)
     VALUES ($1, 'v1.0.frozen', $2, $3, 'approver@org.test', $4)`,
    [id, frozenContent, sha(frozenContent), ORG],
  );
}

let sourceSeq = 0;
/** An authoring document with two saved sections, in DRAFT. */
async function source(): Promise<string> {
  sourceSeq += 1;
  const id = `a${String(sourceSeq).padStart(7, '0')}-0000-4000-8000-00000000c0de`;
  await q('INSERT INTO authoring_documents (id, tenant_id, status, title, module) VALUES ($1, $2, $3, $4, $5)', [
    id, ORG, 'DRAFT', 'Clinical Overview', 'M2',
  ]);
  await q(
    `INSERT INTO authoring_sections (doc_id, tenant_id, code, title, content, order_index)
     VALUES ($1, $2, '2.5.1', 'Product Development Rationale', '<p>The rationale as first placed.</p>', 100),
            ($1, $2, '2.5.2', 'Overview of Biopharmaceutics', '', 200)`,
    [id, ORG],
  );
  return id;
}

const editSection = (docId: string, code: string, content: string) =>
  q('UPDATE authoring_sections SET content = $3 WHERE doc_id = $1 AND code = $2', [docId, code, content]);

const place = (sourceAuthoringDocId: string) =>
  request(app).post('/api/coauthor/documents').send({ title: 'Clinical Overview', moduleNumber: '2.5', sourceAuthoringDocId });

async function sequence(status = 'draft'): Promise<number> {
  const [sub] = await q<{ id: number }>(
    `INSERT INTO submissions (title, product_name, application_type, client_type, primary_region, organization_id, created_by)
     VALUES ('IND', 'Tolvexa', 'ind', 'pharma', 'fda', $1, 3) RETURNING id`,
    [ORG],
  );
  const [seq] = await q<{ id: number }>(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, status, organization_id, created_by)
     VALUES ($1, 'fda', '0000', 'draft', $2, 3) RETURNING id`,
    [sub.id, ORG],
  );
  if (status !== 'draft') await q('UPDATE ectd_sequences SET status = $2 WHERE id = $1', [seq.id, status]);
  return Number(seq.id);
}

const placeLeaf = (sequenceId: number, documentId: number) =>
  upsertLeaf(
    {
      sequenceId,
      sectionCode: '2.5',
      title: 'Clinical Overview',
      lifecycleOp: 'new',
      documentTable: 'coauthor_documents',
      documentId,
      reason: 'Clinical Overview placed for sequence 0000.',
    },
    CTX,
  );

/** Place a fresh source and pin its copy with a leaf in a new draft sequence. */
async function placedAndPinned() {
  const docId = await source();
  const first = await place(docId);
  expect(first.status, JSON.stringify(first.body)).toBe(201);
  const copyId = Number(first.body.document.id);
  const seqId = await sequence();
  const leaf = await placeLeaf(seqId, copyId);
  const filed = await copy(copyId);
  expect(leaf.documentContentSha256).toBe(sha(filed.content));
  return { docId, copyId, seqId, leaf, filed };
}

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true });
  holder.db = h.db;
  holder.pglite = h.pglite;
  await h.pglite.exec(`
    ALTER TABLE coauthor_documents
      ADD COLUMN IF NOT EXISTS sections JSONB, ADD COLUMN IF NOT EXISTS template_id INTEGER,
      ADD COLUMN IF NOT EXISTS created_by TEXT, ADD COLUMN IF NOT EXISTS client_workspace TEXT,
      ADD COLUMN IF NOT EXISTS completion_percentage INTEGER,
      ADD COLUMN IF NOT EXISTS regulatory_compliance_score INTEGER,
      ADD COLUMN IF NOT EXISTS ectd_module_id INTEGER,
      ADD COLUMN IF NOT EXISTS module_name TEXT, ADD COLUMN IF NOT EXISTS embedding TEXT;
    INSERT INTO organizations (id, name) VALUES (${ORG}, 'Org');
    -- uuid-keyed, as the live table is: upsertLeaf's program read joins the
    -- alias map's canonical_id (uuid) to it.
    CREATE TABLE IF NOT EXISTS authoring_documents (
      id UUID PRIMARY KEY, tenant_id INTEGER NOT NULL, status TEXT, title TEXT, module TEXT,
      client_program_id UUID);
    CREATE TABLE IF NOT EXISTS authoring_sections (
      id SERIAL PRIMARY KEY, doc_id UUID NOT NULL, tenant_id INTEGER NOT NULL,
      code TEXT, title TEXT, content TEXT, order_index INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS frozen_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), document_id UUID NOT NULL,
      version TEXT NOT NULL, frozen_content TEXT NOT NULL, content_hash TEXT NOT NULL,
      frozen_by TEXT NOT NULL, frozen_reason TEXT, tenant_id INTEGER NOT NULL,
      frozen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (document_id, version, tenant_id));
    CREATE TABLE IF NOT EXISTS coauthor_document_versions (
      id SERIAL PRIMARY KEY, document_id INTEGER NOT NULL REFERENCES coauthor_documents(id),
      version_number INTEGER NOT NULL, content TEXT, created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(), created_by TEXT, change_summary TEXT,
      UNIQUE (document_id, version_number));
    CREATE TABLE IF NOT EXISTS audit_events (
      id SERIAL PRIMARY KEY, organization_id INTEGER, event_type TEXT, entity_type TEXT,
      entity_id TEXT, user_id INTEGER, user_name TEXT, user_role TEXT, ip_address TEXT,
      timestamp TIMESTAMPTZ, reason TEXT, metadata JSONB, regulatory_significant BOOLEAN,
      gxp_relevant BOOLEAN, created_at TIMESTAMPTZ);
  `);
  await h.pglite.exec(
    readFileSync(path.resolve(__dirname, '../../../migrations/20260814d_document_alias_map.sql'), 'utf8'),
  );
}, 120_000);

afterAll(async () => {
  await h?.close();
});

describe('a filing copy a leaf pins is never rewritten by placing its source again', () => {
  it('refuses to re-place an edited document over the copy leaf 2.5 files: text, title and hash stay the pin', async () => {
    const { docId, copyId, seqId, leaf, filed } = await placedAndPinned();
    const versionsBefore = await versionsOf(copyId);
    const eventsBefore = await eventsOf(copyId);

    await editSection(docId, '2.5.2', '<p>An overview added after the first placement.</p>');
    const again = await place(docId);

    expect(again.status, JSON.stringify(again.body)).toBe(409);
    expect(again.body.error).toBe('FILING_COPY_PINNED');
    // The placement dialog reads a refusal's code from `code` (mutateVerbatim).
    expect(again.body.code).toBe('FILING_COPY_PINNED');
    expect(again.body.leaves).toEqual([{ leafId: leaf.id, sectionCode: '2.5', sequenceNumber: '0000', sequenceStatus: 'draft' }]);
    expect(again.body.message).toContain(`leaf #${leaf.id}`);
    expect(again.body.message).toContain('2.5');
    expect(again.body.message).toContain('0000');
    expect(again.body.message).toMatch(/Nothing was written\./);

    const after = await copy(copyId);
    expect(after.content).toBe(filed.content);
    expect(after.title).toBe(filed.title);
    expect(after.status).toBe(filed.status);
    expect(after.updated_at).toBe(filed.updated_at);
    expect(sha(after.content)).toBe(leaf.documentContentSha256);
    expect(after.content).not.toContain('added after the first placement');
    // Nothing was versioned or audited: nothing was replaced.
    expect(await versionsOf(copyId)).toBe(versionsBefore);
    expect(await eventsOf(copyId)).toBe(eventsBefore);

    // The leaf is exactly as it was placed.
    const [row] = await q('SELECT document_id, document_content_sha256, deleted_at FROM submission_leaves WHERE id = $1', [leaf.id]);
    expect(row).toMatchObject({ document_id: copyId, document_content_sha256: sha(filed.content), deleted_at: null });
    void seqId;
  });

  it('a leaf in a dispatched sequence pins its copy the same way, and the refusal says the sequence keeps it', async () => {
    const { docId, copyId, seqId, leaf, filed } = await placedAndPinned();
    await q("UPDATE ectd_sequences SET status = 'dispatched' WHERE id = $1", [seqId]);
    await editSection(docId, '2.5.1', '<p>A rationale revised after dispatch.</p>');

    const again = await place(docId);

    expect(again.status, JSON.stringify(again.body)).toBe(409);
    expect(again.body.error).toBe('FILING_COPY_PINNED');
    expect(again.body.message).toContain(`leaf #${leaf.id}`);
    expect(again.body.message).toMatch(/dispatched/);
    expect((await copy(copyId)).content).toBe(filed.content);
  });

  it('the same text, now approved, promotes the copy status in place and says it wrote; the pin still holds', async () => {
    const { docId, copyId, leaf, filed } = await placedAndPinned();
    await q("UPDATE authoring_documents SET status = 'APPROVED' WHERE id = $1", [docId]);
    await seal(docId);

    const again = await place(docId);

    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(again.body.written).toBe(true);
    const after = await copy(copyId);
    expect(after.status).toBe('approved');
    expect(after.content).toBe(filed.content);
    expect(sha(after.content)).toBe(leaf.documentContentSha256);
  });

  it('an unchanged re-place writes nothing, and says so', async () => {
    const { docId, copyId, filed } = await placedAndPinned();
    const again = await place(docId);
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(again.body.written).toBe(false);
    expect((await copy(copyId)).updated_at).toBe(filed.updated_at);
  });

  it('once the leaf is removed the copy is no longer filed, and an edited document is re-taken into it', async () => {
    const { docId, copyId, seqId, leaf } = await placedAndPinned();
    await removeLeaf(leaf.id, seqId, CTX, 'Removed to file the revised overview.');
    await editSection(docId, '2.5.2', '<p>The overview, revised.</p>');

    const again = await place(docId);

    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(again.body.written).toBe(true);
    const after = await copy(copyId);
    expect(after.content).toContain('The overview, revised.');
    const next = await placeLeaf(seqId, copyId);
    expect(next.id).not.toBe(leaf.id);
    expect(next.documentContentSha256).toBe(sha(after.content));
  });
});

describe('upsertLeaf answers "unchanged" only while the pin still matches', () => {
  it('re-placing a document whose text changed since its leaf pinned it is refused by name, and the leaf is untouched', async () => {
    const { copyId, seqId, leaf, filed } = await placedAndPinned();
    // Another writer of the copy row (the co-author editor's PUT) changes it.
    await q('UPDATE coauthor_documents SET content = $2 WHERE id = $1', [copyId, `${filed.content}\n\nEdited elsewhere.`]);
    logAction.mockClear();

    const err = await placeLeaf(seqId, copyId).catch((e) => e);

    expect(err).toBeInstanceOf(SubmissionError);
    expect(err.code).toBe('ALREADY_PLACED');
    expect(err.message).toContain(String(leaf.id));
    expect(err.message).toMatch(/changed since/);
    expect(err.message).toMatch(/Nothing was written\./);
    const [row] = await q('SELECT document_content_sha256 FROM submission_leaves WHERE id = $1', [leaf.id]);
    expect(row.document_content_sha256).toBe(sha(filed.content));
    expect(logAction).not.toHaveBeenCalled();
  });

  it('the same document with its pinned text intact is still answered unchanged', async () => {
    const { copyId, seqId, leaf } = await placedAndPinned();
    const again = await placeLeaf(seqId, copyId);
    expect(again.id).toBe(leaf.id);
    expect(again.unchanged).toBe(true);
  });
});

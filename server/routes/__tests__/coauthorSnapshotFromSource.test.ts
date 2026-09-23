/**
 * A filing copy taken from an authoring document carries that document's TEXT,
 * not only its status — and the path the read-only refusal names works.
 *
 * ── The defect (2026-09-23, W5/D7, round-3 review) ──────────────────────────
 * `POST /api/coauthor/documents` derived `status` from the source authoring
 * document (APPROVED -> approved, FROZEN -> finalized) but took `content`
 * from the request body. So an ordinary org member who named any APPROVED
 * document got back an `approved` row carrying text they wrote themselves —
 * pointing a leaf at it cleared transmit's "only approved documents" refusal.
 * The PUT's read-only rule (services/coauthor/coauthor-status-write.ts) sent
 * callers to exactly this endpoint as "the governed path".
 *
 * And that path could not be followed: the snapshot is aliased under the
 * source's uuid, c2c_document_aliases is UNIQUE (canonical_id, store), so
 * placing the same source a second time failed (a 500, because the alias
 * conflict arrives wrapped), and DELETE leaves the alias behind, so it failed
 * after a delete too. Once approved, a filing copy could never be corrected.
 *
 * ── What is pinned here ─────────────────────────────────────────────────────
 *   - the copy's text and title come from the source's saved sections, read
 *     server-side by the canonical assembler; a body `content` is not read;
 *   - placing an already-placed source again re-takes the SAME copy from the
 *     source (200), including after the source moved on (draft -> approved),
 *     after the copy's text drifted, and after the copy was deleted;
 *   - the 409's instruction, followed end to end, succeeds.
 *
 * Runs the real coauthor router on PGlite with the real alias-map migration.
 */
import { vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'coauthor-snapshot-source-secret-padded-to-32';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

type Exec = { query: (sql: string, params?: unknown[]) => Promise<unknown> };
const holder = vi.hoisted(() => ({
  db: null as any,
  pglite: null as any,
  /** Runs right after the placement's first read of the source's status, before its transaction. */
  afterSourceRead: null as null | (() => Promise<void>),
  /** Run just before / just after the canonical assembler reads the sections, on the
   *  queryable it reads with (the placement's transaction, when it passes one). */
  onLoad: null as null | ((q: Exec | undefined) => Promise<void>),
  afterLoad: null as null | ((q: Exec | undefined) => Promise<void>),
}));

/* 2026-09-23 (W5/D7, round-3 review, repair 2): the real assembler, with a
   seam around its read. 2026-09-23 (W5/D7, co-author final pass): the seam
   now receives the queryable the assembler reads on, so a case can change a
   section just before the read and restore it just after (the A-B-A the
   final review found), and SOURCE_CHANGED's hook moved to the pool (below),
   because the read it used to precede now runs inside the placement's
   transaction. */
vi.mock('../../services/ana/authoring-canonical-bridge.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../services/ana/authoring-canonical-bridge.js')>();
  return {
    ...orig,
    defaultAuthoringBridgeDeps: () => {
      const deps = orig.defaultAuthoringBridgeDeps();
      return {
        ...deps,
        loadDocumentSnapshot: async (docId: string, organizationId: number, q?: Exec) => {
          if (holder.onLoad) await holder.onLoad(q);
          const snap = await (deps.loadDocumentSnapshot as (...a: unknown[]) => Promise<any>)(docId, organizationId, q);
          if (holder.afterLoad) await holder.afterLoad(q);
          return snap;
        },
      };
    },
  };
});

vi.mock('../../db', () => {
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      const r = await holder.pglite.query(sql, params);
      if (holder.afterSourceRead && /^SELECT status FROM authoring_documents/.test(sql.trim())) {
        const hook = holder.afterSourceRead;
        holder.afterSourceRead = null;
        await hook();
      }
      return r;
    },
  };
  return {
    get db() {
      return holder.db;
    },
    pool,
    getPool: () => pool,
    // node-postgres-shaped client over PGlite, for the DELETE route.
    transaction: async (fn: (c: unknown) => unknown) =>
      holder.pglite.transaction(async (tx: any) =>
        fn({ query: (s: string, p?: unknown[]) => tx.query(s, p) }),
      ),
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

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import express from 'express';
import { createIndPgliteDb, type IndPgliteDb } from '../../db/pglite-harness';
import { expandRoleClaims } from '../../middleware/auth';
import coauthorRoutes from '../coauthor';

const ORG = 7;
const OTHER_ORG = 8;

let h: IndPgliteDb;
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 3, userId: 3, organizationId: ORG, role: 'member', roles: expandRoleClaims('member', undefined) };
  next();
});
app.use('/api/coauthor', coauthorRoutes);

type Row = { id: number; status: string; title: string; content: string; module_number: string | null };
const row = async (id: number): Promise<Row | undefined> =>
  (
    await h.pglite.query<Row>(
      'SELECT id, status, title, content, module_number FROM coauthor_documents WHERE id = $1',
      [id],
    )
  ).rows[0];
const rowsFor = async (sourceId: string): Promise<Row[]> =>
  (
    await h.pglite.query<Row>(
      `SELECT id, status, title, content, module_number FROM coauthor_documents
        WHERE metadata->>'docId' = $1 ORDER BY id`,
      [sourceId],
    )
  ).rows;

/**
 * Seal a document the way the authoring router does when it freezes or
 * approves one (authoring.router.ts, POST /docs/:docId/freeze and the
 * APPROVER auto-freeze): a frozen_documents row whose frozen_content is
 * {document, sections, frozenAt} and whose content_hash is sha256 of those
 * bytes. The real writer is exercised in coauthorSnapshotSeal.test.ts.
 * 2026-09-23 (W5/D7, round-3 review, repair 2).
 */
async function seal(
  id: string,
  opts: { tenant?: number; version?: string; stub?: boolean; tamper?: boolean; noIds?: boolean; legacyOrder?: boolean } = {},
): Promise<void> {
  const tenant = opts.tenant ?? ORG;
  const doc = (await h.pglite.query<Record<string, unknown>>('SELECT * FROM authoring_documents WHERE id = $1', [id])).rows[0];
  /* 2026-09-23 (W5/D7, co-author final pass): the router's seal order now.
     `legacyOrder` is the order the router sealed in before: order_index alone,
     so tied sections are recorded in storage order. */
  const sections = (
    await h.pglite.query<Record<string, unknown>>(
      `SELECT * FROM authoring_sections WHERE doc_id = $1 ORDER BY ${opts.legacyOrder ? 'order_index' : 'order_index, created_at, id'}`,
      [id],
    )
  ).rows;
  const liveText = sections.map((x) => String(x.content ?? '')).join('');
  const frozenContent = JSON.stringify(
    opts.stub
      ? /* The pre-2026 approval record, in its real shape (2026-09-23, final
           pass): no sections, and content_hash is the hash of the live
           section text (docHash), NOT of these bytes. */
        { approvedBy: 'approver@org.test', documentHash: sha(liveText), timestamp: '2026-01-01T00:00:00Z' }
      : opts.noIds
        ? /* The shape seed 99 used to write: sections without id, doc_id or order_index. */
          {
            document: { id: doc.id, title: doc.title, status: doc.status },
            sections: sections.map((x) => ({ code: x.code, title: x.title, content: x.content })),
            frozenAt: new Date().toISOString(),
          }
        : { document: doc, sections, frozenAt: new Date().toISOString() },
  );
  const hash = opts.stub ? sha(liveText) : createHash('sha256').update(frozenContent).digest('hex');
  await h.pglite.query(
    `INSERT INTO frozen_documents (document_id, version, frozen_content, content_hash, frozen_by, tenant_id)
     VALUES ($1, $2, $3, $4, 'approver@org.test', $5)`,
    [id, opts.version ?? 'v1.0.frozen', frozenContent, opts.tamper ? '0'.repeat(64) : hash, tenant],
  );
}

/**
 * Seed an authoring document and its saved sections. An APPROVED or FROZEN
 * document is sealed, as the router always seals one, unless `seal: false`.
 */
async function source(
  id: string,
  status: string,
  sections: Array<[code: string, title: string, content: string]>,
  opts: { tenant?: number; title?: string; seal?: boolean } = {},
): Promise<void> {
  await h.pglite.query(
    'INSERT INTO authoring_documents (id, tenant_id, status, title, module) VALUES ($1, $2, $3, $4, $5)',
    [id, opts.tenant ?? ORG, status, opts.title ?? 'Cover letter', 'm1'],
  );
  for (const [i, [code, title, content]] of sections.entries()) {
    await h.pglite.query(
      'INSERT INTO authoring_sections (doc_id, tenant_id, code, title, content, order_index) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, opts.tenant ?? ORG, code, title, content, i],
    );
  }
  if (/^(APPROVED|FROZEN)$/i.test(status) && opts.seal !== false) await seal(id, { tenant: opts.tenant });
}

const auditFor = async (id: number) =>
  (
    await h.pglite.query<{ event_type: string; metadata: Record<string, any>; user_id: number | null }>(
      "SELECT event_type, metadata, user_id FROM audit_events WHERE entity_type = 'coauthor_document' AND entity_id = $1 ORDER BY id",
      [String(id)],
    )
  ).rows;
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

const place = (sourceAuthoringDocId: string, extra: Record<string, unknown> = {}) =>
  request(app)
    .post('/api/coauthor/documents')
    .send({ title: 'Cover letter', moduleNumber: 'm1.2', content: '<p>client copy</p>', sourceAuthoringDocId, ...extra });

const APPROVED_TEXT = '## 1.2 — Cover\n\nThe approved cover letter.\n\n## 1.2.1 — Annex\n\nApproved annex.';

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
      ADD COLUMN IF NOT EXISTS metadata JSONB, ADD COLUMN IF NOT EXISTS ectd_module_id INTEGER,
      ADD COLUMN IF NOT EXISTS module_name TEXT, ADD COLUMN IF NOT EXISTS embedding TEXT;
    INSERT INTO organizations (id, name) VALUES (${ORG}, 'Org');
    CREATE TABLE IF NOT EXISTS authoring_documents (
      id TEXT PRIMARY KEY, tenant_id INTEGER NOT NULL, status TEXT, title TEXT, module TEXT);
    CREATE TABLE IF NOT EXISTS authoring_sections (
      id SERIAL PRIMARY KEY, doc_id TEXT NOT NULL, tenant_id INTEGER NOT NULL,
      code TEXT, title TEXT, content TEXT, order_index INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    -- The columns of db/migrations/20260725_authoring_document_loop_tables.sql,
    -- with document_id as TEXT to match this harness's authoring ids.
    CREATE TABLE IF NOT EXISTS frozen_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), document_id TEXT NOT NULL,
      version TEXT NOT NULL, frozen_content TEXT NOT NULL, content_hash TEXT NOT NULL,
      frozen_by TEXT NOT NULL, frozen_reason TEXT, tenant_id INTEGER NOT NULL,
      frozen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (document_id, version, tenant_id));
    CREATE TABLE IF NOT EXISTS audit_events (
      id SERIAL PRIMARY KEY, organization_id INTEGER, event_type TEXT, entity_type TEXT,
      entity_id TEXT, user_id INTEGER, user_name TEXT, user_role TEXT, ip_address TEXT,
      timestamp TIMESTAMPTZ, reason TEXT, metadata JSONB, regulatory_significant BOOLEAN,
      gxp_relevant BOOLEAN, created_at TIMESTAMPTZ);
  `);
  // The real alias map, not a copy of its DDL.
  await h.pglite.exec(
    readFileSync(path.resolve(__dirname, '../../../migrations/20260814d_document_alias_map.sql'), 'utf8'),
  );
}, 120_000);

afterAll(async () => {
  await h?.close();
});

afterEach(() => {
  holder.onLoad = null;
  holder.afterLoad = null;
  holder.afterSourceRead = null;
});

describe('POST /api/coauthor/documents takes the text from the source, not the request', () => {
  it('an APPROVED source files its own saved text and title — a forged body is not what gets approved', async () => {
    const SRC = '0a000000-0000-4000-8000-000000000001';
    await source(SRC, 'APPROVED', [
      ['1.2', 'Cover', 'The approved cover letter.'],
      ['1.2.1', 'Annex', 'Approved annex.'],
    ]);

    const res = await place(SRC, { title: 'Forged title', content: '<p>FORGED 1571 text nobody approved</p>' });

    expect(res.status).toBe(201);
    expect(res.body.document.status).toBe('approved');
    const stored = await row(res.body.document.id);
    expect(stored?.content, 'the request body became the approved text').toBe(APPROVED_TEXT);
    expect(stored?.title).toBe('Cover letter');
    const everything = (await h.pglite.query<{ content: string }>('SELECT content FROM coauthor_documents')).rows;
    expect(everything.map((r) => r.content).join('\n')).not.toContain('FORGED');
  });

  it('a FROZEN source likewise files its sealed text as finalized', async () => {
    const SRC = '0a000000-0000-4000-8000-000000000002';
    await source(SRC, 'FROZEN', [['2.5', 'Clinical Overview', 'Sealed overview.']]);

    const res = await place(SRC, { content: 'something else' });

    expect(res.status).toBe(201);
    expect(await row(res.body.document.id)).toMatchObject({
      status: 'finalized',
      content: '## 2.5 — Clinical Overview\n\nSealed overview.',
    });
  });

  it('refuses a source with no saved sections — there is nothing to file — and creates nothing', async () => {
    const SRC = '0a000000-0000-4000-8000-000000000003';
    await source(SRC, 'APPROVED', []);

    const res = await place(SRC, { content: '<p>body text</p>' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('SOURCE_HAS_NO_SAVED_CONTENT');
    expect(await rowsFor(SRC)).toEqual([]);
  });

  it("still refuses another organization's source with 404", async () => {
    const SRC = '0a000000-0000-4000-8000-000000000004';
    await source(SRC, 'APPROVED', [['1.1', 'Form', 'Theirs.']], { tenant: OTHER_ORG });
    const res = await place(SRC);
    expect(res.status).toBe(404);
    expect(await rowsFor(SRC)).toEqual([]);
  });

  it('leaves an unsourced POST as it was: the body is the text, and it is a draft', async () => {
    const res = await request(app)
      .post('/api/coauthor/documents')
      .send({ title: 'Scratch', content: '<p>mine</p>', status: 'approved' });
    expect(res.status).toBe(201);
    expect(await row(res.body.document.id)).toMatchObject({ status: 'draft', content: '<p>mine</p>' });
  });
});

describe('placing the same source again re-takes the same copy — the path the 409 names', () => {
  it('follows FINALIZED_DOCUMENT_READ_ONLY end to end: place, refused edit, place again', async () => {
    const SRC = '0b000000-0000-4000-8000-000000000001';
    await source(SRC, 'APPROVED', [
      ['1.2', 'Cover', 'The approved cover letter.'],
      ['1.2.1', 'Annex', 'Approved annex.'],
    ]);
    const first = await place(SRC);
    expect(first.status).toBe(201);
    const id = first.body.document.id;

    const edit = await request(app).put(`/api/coauthor/documents/${id}`).send({ content: '<p>typo fix</p>' });
    expect(edit.status).toBe(409);
    expect(edit.body.error).toBe('FINALIZED_DOCUMENT_READ_ONLY');
    expect(edit.body.message).toMatch(/placed into the filing again/i);

    // Do what the message says.
    const again = await place(SRC);
    expect(again.status, `re-placement failed: ${JSON.stringify(again.body)}`).toBe(200);
    expect(again.body.document.id, 'a second copy (a fork) was created').toBe(id);
    expect(await rowsFor(SRC)).toHaveLength(1);
    expect(await row(id)).toMatchObject({ status: 'approved', content: APPROVED_TEXT });
  });

  it('a source that has moved on (draft, then approved) re-takes its copy with the approved text', async () => {
    const SRC = '0b000000-0000-4000-8000-000000000002';
    await source(SRC, 'draft', [['1.3', 'Letter', 'Working text.']]);
    const first = await place(SRC);
    expect(first.status).toBe(201);
    expect(first.body.document.status).toBe('draft');
    const id = first.body.document.id;

    await h.pglite.query("UPDATE authoring_sections SET content = 'Approved text.' WHERE doc_id = $1", [SRC]);
    await h.pglite.query("UPDATE authoring_documents SET status = 'APPROVED' WHERE id = $1", [SRC]);
    // Approval seals the document (2026-09-23, repair 2: the seal is now read).
    await seal(SRC);

    const again = await place(SRC);
    expect(again.status, `re-placement failed: ${JSON.stringify(again.body)}`).toBe(200);
    expect(again.body.document.id).toBe(id);
    expect(await row(id)).toMatchObject({ status: 'approved', content: '## 1.3 — Letter\n\nApproved text.' });
  });

  it('a copy whose text drifted from its approved source is restored to the source by placing again', async () => {
    const SRC = '0b000000-0000-4000-8000-000000000003';
    await source(SRC, 'APPROVED', [['1.4', 'Letter', 'Approved.']]);
    const id = (await place(SRC)).body.document.id;
    // A copy written before this rule existed: approved, with text nobody approved.
    await h.pglite.query("UPDATE coauthor_documents SET content = 'drifted text' WHERE id = $1", [id]);

    const again = await place(SRC);
    expect(again.status).toBe(200);
    expect(await row(id)).toMatchObject({ status: 'approved', content: '## 1.4 — Letter\n\nApproved.' });
  });

  it('a deleted copy can be placed again, under the identity the alias map still records', async () => {
    const SRC = '0b000000-0000-4000-8000-000000000004';
    await source(SRC, 'APPROVED', [['1.5', 'Letter', 'Approved.']]);
    const id = (await place(SRC)).body.document.id;
    const del = await request(app).delete(`/api/coauthor/documents/${id}`);
    expect(del.status).toBe(200);

    const again = await place(SRC);
    expect(again.status, `re-placement after delete failed: ${JSON.stringify(again.body)}`).toBe(201);
    expect(again.body.document.id, 'the copy was re-created under a new id the alias does not name').toBe(id);
    expect(await row(id)).toMatchObject({ status: 'approved', content: '## 1.5 — Letter\n\nApproved.' });
    const aliases = (
      await h.pglite.query<{ native_id: string }>(
        "SELECT native_id FROM c2c_document_aliases WHERE canonical_id = $1 AND store = 'coauthor_documents'",
        [SRC],
      )
    ).rows;
    expect(aliases).toEqual([{ native_id: String(id) }]);
  });

  it('placing an unchanged source again writes nothing', async () => {
    const SRC = '0b000000-0000-4000-8000-000000000005';
    await source(SRC, 'APPROVED', [['1.6', 'Letter', 'Approved.']]);
    const id = (await place(SRC)).body.document.id;
    await h.pglite.query("UPDATE coauthor_documents SET updated_at = '2026-09-01T00:00:00Z' WHERE id = $1", [id]);

    const again = await place(SRC);
    expect(again.status).toBe(200);
    const stamp = (
      await h.pglite.query<{ updated_at: Date }>('SELECT updated_at FROM coauthor_documents WHERE id = $1', [id])
    ).rows[0].updated_at;
    expect(new Date(stamp).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });
});

/* ── 2026-09-23 (W5/D7, round-3 review, repair 2) ─────────────────────────────
 * Round 3 argued that re-taking an approved copy "always yields the approved
 * text" because APPROVED and FROZEN documents cannot be edited. That was false:
 * POST /api/authoring/docs/:docId/apply-template rewrites and adds sections
 * with no lock check, so an ordinary member could change an APPROVED
 * document's text and have it filed — or re-filed over an existing copy — as
 * 'approved'. The filing path no longer relies on the lock: a verdict copy is
 * filed only when the source's saved sections are exactly the sections its
 * seal (frozen_documents) recorded. The UPDATEs below are what apply-template
 * does; the real route is driven in coauthorSnapshotSeal.test.ts. */
describe('an approved or frozen source is filed only as the text its seal recorded', () => {
  it('refuses a first placement after the approved sections were rewritten, and creates nothing', async () => {
    const SRC = '0d000000-0000-4000-8000-000000000001';
    await source(SRC, 'APPROVED', [['3.2.P.5', 'Control of Drug Product', 'APPROVED SPEC TEXT']]);
    await h.pglite.query("UPDATE authoring_sections SET content = 'template boilerplate' WHERE doc_id = $1", [SRC]);

    const res = await place(SRC);

    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('SOURCE_ALTERED_SINCE_SEAL');
    expect(await rowsFor(SRC)).toEqual([]);
  });

  it('refuses a re-placement over an existing approved copy, and leaves the copy exactly as it was', async () => {
    const SRC = '0d000000-0000-4000-8000-000000000002';
    await source(SRC, 'APPROVED', [['3.2.P.5', 'Control of Drug Product', 'APPROVED SPEC TEXT']]);
    const id = (await place(SRC)).body.document.id;
    await h.pglite.query("UPDATE coauthor_documents SET updated_at = '2026-09-01T00:00:00Z' WHERE id = $1", [id]);
    const before = await row(id);
    await h.pglite.query("UPDATE authoring_sections SET content = 'template boilerplate' WHERE doc_id = $1", [SRC]);

    const res = await place(SRC);

    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('SOURCE_ALTERED_SINCE_SEAL');
    expect(await row(id)).toEqual(before);
    expect(before?.content).toBe('## 3.2.P.5 — Control of Drug Product\n\nAPPROVED SPEC TEXT');
  });

  it('refuses a section added after the seal (apply-template merge mode)', async () => {
    const SRC = '0d000000-0000-4000-8000-000000000003';
    await source(SRC, 'FROZEN', [['2.5', 'Clinical Overview', 'Sealed overview.']]);
    await h.pglite.query(
      "INSERT INTO authoring_sections (doc_id, tenant_id, code, title, content, order_index) VALUES ($1, $2, '2.5.1', 'Added', 'unsealed', 1)",
      [SRC, ORG],
    );
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('SOURCE_ALTERED_SINCE_SEAL');
    expect(await rowsFor(SRC)).toEqual([]);
  });

  it('refuses a document renamed after its seal: the copy would carry a title nobody approved', async () => {
    const SRC = '0d000000-0000-4000-8000-000000000004';
    await source(SRC, 'APPROVED', [['1.2', 'Cover', 'Approved.']]);
    await h.pglite.query("UPDATE authoring_documents SET title = 'Renamed' WHERE id = $1", [SRC]);
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('SOURCE_ALTERED_SINCE_SEAL');
    expect(await rowsFor(SRC)).toEqual([]);
  });

  it('refuses an APPROVED source with no sealed record: what was approved cannot be established', async () => {
    const SRC = '0d000000-0000-4000-8000-000000000005';
    await source(SRC, 'APPROVED', [['1.2', 'Cover', 'Some text.']], { seal: false });
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('SOURCE_NOT_SEALED');
    expect(await rowsFor(SRC)).toEqual([]);
  });

  it('refuses a source whose only seal is the old approval stub, which holds no sections', async () => {
    const SRC = '0d000000-0000-4000-8000-000000000006';
    await source(SRC, 'APPROVED', [['1.2', 'Cover', 'Some text.']], { seal: false });
    await seal(SRC, { stub: true, version: 'approved' });
    // 2026-09-23 (W5/D7, co-author final pass): the real legacy shape — its
    // hash is of the section text, so it never matches its own bytes. It is
    // recognised as a stub before the hash check: "not sealed", not "tampered".
    const stored = (await h.pglite.query<{ frozen_content: string; content_hash: string }>(
      'SELECT frozen_content, content_hash FROM frozen_documents WHERE document_id = $1', [SRC],
    )).rows[0];
    expect(stored.content_hash).not.toBe(sha(stored.frozen_content));
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('SOURCE_NOT_SEALED');
    expect(await rowsFor(SRC)).toEqual([]);
  });

  it('refuses a seal whose bytes no longer match its own hash', async () => {
    const SRC = '0d000000-0000-4000-8000-000000000007';
    await source(SRC, 'FROZEN', [['2.5', 'Clinical Overview', 'Sealed.']], { seal: false });
    await seal(SRC, { tamper: true });
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('SOURCE_SEAL_INTEGRITY_FAILED');
    expect(await rowsFor(SRC)).toEqual([]);
  });

  it('holds the copy to the LATEST seal (approval after freeze)', async () => {
    const SRC = '0d000000-0000-4000-8000-000000000008';
    await source(SRC, 'FROZEN', [['2.5', 'Clinical Overview', 'Sealed.']]);
    await h.pglite.query("UPDATE authoring_documents SET status = 'APPROVED' WHERE id = $1", [SRC]);
    await h.pglite.query("UPDATE frozen_documents SET frozen_at = now() - interval '1 day' WHERE document_id = $1", [SRC]);
    await seal(SRC, { version: 'approved' });
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(await row(res.body.document.id)).toMatchObject({
      status: 'approved',
      content: '## 2.5 — Clinical Overview\n\nSealed.',
    });
    expect(res.body.document.metadata).toMatchObject({ sealVersion: 'approved' });
  });

  it('a draft source is not held to a seal (it has none), and still files as a draft', async () => {
    const SRC = '0d000000-0000-4000-8000-000000000009';
    await source(SRC, 'draft', [['1.2', 'Cover', 'Working.']]);
    const res = await place(SRC);
    expect(res.status).toBe(201);
    expect(res.body.document.status).toBe('draft');
  });
});

describe('the server holds a source to the same "has saved content" rule as the placement dialog', () => {
  it('refuses a source whose sections are headings with no text — the body would be empty', async () => {
    const SRC = '0e000000-0000-4000-8000-000000000001';
    await source(SRC, 'APPROVED', [['1.4', 'Heading only', '']]);
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.error).toBe('SOURCE_HAS_NO_SAVED_CONTENT');
    expect(await rowsFor(SRC)).toEqual([]);
  });

  it('refuses whitespace-only sections the same way', async () => {
    const SRC = '0e000000-0000-4000-8000-000000000002';
    await source(SRC, 'draft', [['1.4', 'A', '   '], ['1.5', 'B', '\n\t']]);
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(await rowsFor(SRC)).toEqual([]);
  });
});

describe('the two refusals round 3 never showed failing', () => {
  it('SOURCE_CHANGED: a source approved between the first read and the lock is refused, and nothing is written', async () => {
    const SRC = '0f000000-0000-4000-8000-000000000001';
    await source(SRC, 'draft', [['1.2', 'Cover', 'Working text.']]);
    holder.afterSourceRead = async () => {
      // The source was read as a draft; the document is approved (and sealed) before the lock.
      await h.pglite.query("UPDATE authoring_documents SET status = 'APPROVED' WHERE id = $1", [SRC]);
      await seal(SRC);
    };
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('SOURCE_CHANGED');
    expect(await rowsFor(SRC)).toEqual([]);
    const aliases = await h.pglite.query('SELECT 1 FROM c2c_document_aliases WHERE canonical_id = $1', [SRC]);
    expect(aliases.rows).toEqual([]);
  });

  it("DOCUMENT_ALIAS_CONFLICT: an alias naming another organization's row is refused, and neither row nor alias changes", async () => {
    const SRC = '0f000000-0000-4000-8000-000000000002';
    await source(SRC, 'APPROVED', [['1.2', 'Cover', 'Approved.']]);
    const theirs = (
      await h.pglite.query<{ id: number }>(
        "INSERT INTO coauthor_documents (organization_id, title, content, status) VALUES ($1, 'Theirs', 'their text', 'draft') RETURNING id",
        [OTHER_ORG],
      )
    ).rows[0].id;
    await h.pglite.query(
      "INSERT INTO c2c_document_aliases (canonical_id, store, native_id, organization_id) VALUES ($1, 'coauthor_documents', $2, $3)",
      [SRC, String(theirs), ORG],
    );

    const res = await place(SRC);

    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('DOCUMENT_ALIAS_CONFLICT');
    expect(await row(theirs)).toMatchObject({ title: 'Theirs', content: 'their text', status: 'draft' });
    expect(await rowsFor(SRC)).toEqual([]);
    const aliases = await h.pglite.query<{ native_id: string }>(
      'SELECT native_id FROM c2c_document_aliases WHERE canonical_id = $1',
      [SRC],
    );
    expect(aliases.rows).toEqual([{ native_id: String(theirs) }]);
  });
});

describe('re-taking an existing copy is recorded', () => {
  it('a re-take that changes the copy writes one audit event with the text it replaced — even saved co-author edits', async () => {
    const SRC = '10000000-0000-4000-8000-000000000001';
    await source(SRC, 'draft', [['1.3', 'Letter', 'source text']]);
    const id = (await place(SRC)).body.document.id;
    // An author saves an edit to the draft copy in the co-author editor.
    const save = await request(app).put(`/api/coauthor/documents/${id}`).send({ content: '<p>edited in co-author</p>' });
    expect(save.status).toBe(200);

    const again = await place(SRC);

    expect(again.status).toBe(200);
    expect(again.body.replaced).toBe(true);
    expect(await row(id)).toMatchObject({ content: '## 1.3 — Letter\n\nsource text' });
    const events = await auditFor(id);
    expect(events.map((e) => e.event_type)).toEqual(['coauthor_document.retaken']);
    expect(events[0].user_id).toBe(3);
    expect(events[0].metadata).toMatchObject({
      sourceAuthoringDocId: SRC,
      before: { status: 'draft', contentSha256: sha('<p>edited in co-author</p>') },
      after: { status: 'draft', contentSha256: sha('## 1.3 — Letter\n\nsource text') },
    });
  });

  it('an unchanged re-take writes no audit event (and nothing else)', async () => {
    const SRC = '10000000-0000-4000-8000-000000000002';
    await source(SRC, 'APPROVED', [['1.6', 'Letter', 'Approved.']]);
    const id = (await place(SRC)).body.document.id;
    const again = await place(SRC);
    expect(again.status).toBe(200);
    expect(await auditFor(id)).toEqual([]);
  });

  it('re-creating a deleted copy is recorded against the same id', async () => {
    const SRC = '10000000-0000-4000-8000-000000000003';
    await source(SRC, 'APPROVED', [['1.7', 'Letter', 'Approved.']]);
    const id = (await place(SRC)).body.document.id;
    expect((await request(app).delete(`/api/coauthor/documents/${id}`)).status).toBe(200);
    const again = await place(SRC);
    expect(again.status).toBe(201);
    const events = await auditFor(id);
    expect(events.map((e) => e.event_type)).toEqual(['coauthor_document.deleted', 'coauthor_document.retaken']);
    expect(events[1].metadata).toMatchObject({ recreated: true, before: null });
  });

  /* 2026-09-23 (W5/D7, co-author final pass): the reason and the Part 11
     flags of both events were unpinned — changing either passed every test. */
  it('both events carry their reason and are flagged regulatory-significant and GxP-relevant', async () => {
    const SRC = '10000000-0000-4000-8000-000000000004';
    await source(SRC, 'draft', [['1.8', 'Letter', 'v1']]);
    const id = (await place(SRC)).body.document.id;
    await h.pglite.query("UPDATE authoring_sections SET content = 'v2' WHERE doc_id = $1", [SRC]);
    expect((await place(SRC)).status).toBe(200);
    expect((await request(app).delete(`/api/coauthor/documents/${id}`)).status).toBe(200);
    expect((await place(SRC)).status).toBe(201);
    const rows = (
      await h.pglite.query(
        `SELECT event_type, reason, regulatory_significant, gxp_relevant, user_id, organization_id
           FROM audit_events WHERE entity_type = 'coauthor_document' AND entity_id = $1 ORDER BY id`,
        [String(id)],
      )
    ).rows;
    const flags = { regulatory_significant: true, gxp_relevant: true, user_id: 3, organization_id: ORG };
    expect(rows).toEqual([
      { event_type: 'coauthor_document.retaken', reason: 'filing copy re-taken from its source authoring document', ...flags },
      { event_type: 'coauthor_document.deleted', reason: 'coauthor document deleted', ...flags },
      { event_type: 'coauthor_document.retaken', reason: 'deleted filing copy re-created from its source authoring document', ...flags },
    ]);
  });
});

/* ── 2026-09-23 (W5/D7, co-author final pass) ────────────────────────────────
 * The seal compare claimed (id, code, title, content, order_index) but only
 * content, the count, the document title, the hash and "latest" were pinned:
 * dropping the section code, the section title or the order from the compare
 * — or the tenant from the seal read — passed every test. The compare is now
 * of what is FILED: each section's code, title and text, in filed order. */
describe('the seal compare is of what is filed: heading, code, text and order — in this tenant', () => {
  const TWO: Array<[string, string, string]> = [
    ['3.2.S.4.1', 'Specification', 'Spec text.'],
    ['3.2.S.4.2', 'Analytical procedures', 'Methods text.'],
  ];

  it('(a) a section heading renamed after the seal, same text: 409, nothing written', async () => {
    const SRC = '11000000-0000-4000-8000-000000000001';
    await source(SRC, 'APPROVED', TWO);
    await h.pglite.query("UPDATE authoring_sections SET title = 'Renamed heading' WHERE doc_id = $1 AND code = '3.2.S.4.2'", [SRC]);
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('SOURCE_ALTERED_SINCE_SEAL');
    expect(await rowsFor(SRC)).toEqual([]);
  });

  it('(b) a section code changed after the seal: 409, nothing written', async () => {
    const SRC = '11000000-0000-4000-8000-000000000002';
    await source(SRC, 'FROZEN', TWO);
    await h.pglite.query("UPDATE authoring_sections SET code = '3.2.S.4.3' WHERE doc_id = $1 AND code = '3.2.S.4.2'", [SRC]);
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('SOURCE_ALTERED_SINCE_SEAL');
    expect(await rowsFor(SRC)).toEqual([]);
  });

  it('(c) two sections swapped in order after the seal, texts unchanged: 409, nothing written', async () => {
    const SRC = '11000000-0000-4000-8000-000000000003';
    await source(SRC, 'APPROVED', TWO);
    await h.pglite.query(
      'UPDATE authoring_sections SET order_index = 1 - order_index WHERE doc_id = $1',
      [SRC],
    );
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('SOURCE_ALTERED_SINCE_SEAL');
    expect(await rowsFor(SRC)).toEqual([]);
  });

  it("(d) another tenant's seal of the same document id does not seal this tenant's document: 409, nothing written", async () => {
    const SRC = '11000000-0000-4000-8000-000000000004';
    await source(SRC, 'APPROVED', TWO, { seal: false });
    await seal(SRC, { tenant: OTHER_ORG });
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('SOURCE_NOT_SEALED');
    expect(await rowsFor(SRC)).toEqual([]);
  });

  it('a seal without section ids (the shape seed 99 wrote) whose filed text matches is not reported as altered', async () => {
    const SRC = '11000000-0000-4000-8000-000000000005';
    await source(SRC, 'APPROVED', TWO, { seal: false });
    await seal(SRC, { noIds: true });
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.document.status).toBe('approved');
  });
});

/* ── 2026-09-23 (W5/D7, co-author final pass): section order ──────────────────
 * The editor lists sections ORDER BY order_index, created_at
 * (authoring.router.ts GET /docs/:docId/sections), and the placement dialog
 * used to file them in that order. The server assembler sorted by order_index
 * alone, so a legacy document whose sections share an order_index was filed —
 * and an existing approved copy re-filed — in another order. The UPDATE below
 * moves Alpha's row after Beta's in the heap, which is where an
 * order_index-only sort leaves it. */
describe('sections sharing an order_index file in the editor order', () => {
  async function tied(SRC: string, sealOpts: { legacyOrder?: boolean } = {}): Promise<void> {
    await h.pglite.query(
      "INSERT INTO authoring_documents (id, tenant_id, status, title, module) VALUES ($1, $2, 'DRAFT', 'Legacy', 'm1')",
      [SRC, ORG],
    );
    await h.pglite.query(
      "INSERT INTO authoring_sections (doc_id, tenant_id, code, title, content, order_index, created_at) VALUES ($1, $2, '1.1', 'Alpha', 'alpha v1', 0, '2026-01-01T00:00:00Z')",
      [SRC, ORG],
    );
    await h.pglite.query(
      "INSERT INTO authoring_sections (doc_id, tenant_id, code, title, content, order_index, created_at) VALUES ($1, $2, '1.2', 'Beta', 'beta', 0, '2026-01-02T00:00:00Z')",
      [SRC, ORG],
    );
    await h.pglite.query("UPDATE authoring_sections SET content = 'alpha v2' WHERE doc_id = $1 AND code = '1.1'", [SRC]);
    await h.pglite.query("UPDATE authoring_documents SET status = 'APPROVED' WHERE id = $1", [SRC]);
    await seal(SRC, sealOpts);
  }
  const EDITOR_ORDER = '## 1.1 — Alpha\n\nalpha v2\n\n## 1.2 — Beta\n\nbeta';

  it('files the editor order', async () => {
    const SRC = '12000000-0000-4000-8000-000000000001';
    await tied(SRC);
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect((await row(res.body.document.id))?.content).toBe(EDITOR_ORDER);
  });

  it('a seal the router wrote before it ordered ties (storage order) is read in the editor order, not refused', async () => {
    const SRC = '12000000-0000-4000-8000-000000000003';
    await tied(SRC, { legacyOrder: true });
    const sealed = JSON.parse(
      (await h.pglite.query<{ frozen_content: string }>('SELECT frozen_content FROM frozen_documents WHERE document_id = $1', [SRC]))
        .rows[0].frozen_content,
    );
    // The fixture really is the legacy case: the seal lists Beta first.
    expect(sealed.sections.map((x: { code: string }) => x.code)).toEqual(['1.2', '1.1']);
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect((await row(res.body.document.id))?.content).toBe(EDITOR_ORDER);
  });

  /* 2026-09-23 (W5/D7, co-author final pass, repair): a legacy seal is
     re-sorted, but a seal records created_at only to the millisecond. Two tied
     sections created inside one millisecond (Alpha 800 µs before Beta, Alpha
     with the higher id) cannot be told apart by it, so they keep the seal's
     own order — breaking the tie by id put Beta first, which is not the order
     anyone saw or sealed. */
  async function tiedSameMs(SRC: string, base: number): Promise<void> {
    await h.pglite.query(
      "INSERT INTO authoring_documents (id, tenant_id, status, title, module) VALUES ($1, $2, 'DRAFT', 'SameMs', 'm1')",
      [SRC, ORG],
    );
    // Gamma is stored first and created a day later: a seal in storage order is detectably legacy.
    // Alpha's id is higher than Beta's, so an id tie-break would put Beta first.
    await h.pglite.query(
      "INSERT INTO authoring_sections (id, doc_id, tenant_id, code, title, content, order_index, created_at) VALUES ($3, $1, $2, '1.3', 'Gamma', 'gamma', 0, '2026-01-02T00:00:00Z')",
      [SRC, ORG, base + 3],
    );
    await h.pglite.query(
      "INSERT INTO authoring_sections (id, doc_id, tenant_id, code, title, content, order_index, created_at) VALUES ($3, $1, $2, '1.1', 'Alpha', 'alpha', 0, '2026-01-01T00:00:00.000100Z')",
      [SRC, ORG, base + 2],
    );
    await h.pglite.query(
      "INSERT INTO authoring_sections (id, doc_id, tenant_id, code, title, content, order_index, created_at) VALUES ($3, $1, $2, '1.2', 'Beta', 'beta', 0, '2026-01-01T00:00:00.000900Z')",
      [SRC, ORG, base + 1],
    );
    await h.pglite.query("UPDATE authoring_documents SET status = 'APPROVED' WHERE id = $1", [SRC]);
    await seal(SRC, { legacyOrder: true });
    const sealed = JSON.parse(
      (await h.pglite.query<{ frozen_content: string }>('SELECT frozen_content FROM frozen_documents WHERE document_id = $1', [SRC]))
        .rows[0].frozen_content,
    );
    expect(sealed.sections.map((x: { code: string }) => x.code), 'the fixture is not a storage-order seal').toEqual(['1.3', '1.1', '1.2']);
  }

  it('a legacy seal with two ties inside one millisecond files them in the order sealed (201)', async () => {
    const SRC = '12000000-0000-4000-8000-000000000004';
    await tiedSameMs(SRC, 900_010);
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect((await row(res.body.document.id))?.content).toBe(
      '## 1.1 — Alpha\n\nalpha\n\n## 1.2 — Beta\n\nbeta\n\n## 1.3 — Gamma\n\ngamma',
    );
  });

  it('the same legacy seal, with those two swapped after it, is refused (409, nothing written)', async () => {
    const SRC = '12000000-0000-4000-8000-000000000005';
    await tiedSameMs(SRC, 900_020);
    await h.pglite.query(
      "UPDATE authoring_sections SET order_index = -1 WHERE doc_id = $1 AND code = '1.2'",
      [SRC],
    );
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('SOURCE_ALTERED_SINCE_SEAL');
    expect(await rowsFor(SRC)).toEqual([]);
  });

  /* 2026-09-23 (W5/D7, co-author close): sections inserted in one transaction
     share created_at exactly (now() is the transaction start), so neither
     order_index nor created_at separates them. A legacy seal lists them in
     storage order; the live assembler orders them by id. Re-sorting the seal
     could not reconcile the two, and an untouched approved document was
     refused 409 SOURCE_ALTERED_SINCE_SEAL — a false "altered". A seal that
     records section ids is now compared section by section, by id. */
  it('sections created in one transaction under a legacy seal are filed, not refused as altered', async () => {
    const SRC = '12000000-0000-4000-8000-000000000007';
    await h.pglite.query(
      "INSERT INTO authoring_documents (id, tenant_id, status, title, module) VALUES ($1, $2, 'DRAFT', 'OneTx', 'm1')",
      [SRC, ORG],
    );
    // Stored first with the HIGHER id: storage order and id order disagree.
    await h.pglite.query(
      "INSERT INTO authoring_sections (id, doc_id, tenant_id, code, title, content, order_index, created_at) VALUES ($3, $1, $2, '1.1', 'Alpha', 'alpha', 0, '2026-01-01T00:00:00.000500Z')",
      [SRC, ORG, 900_032],
    );
    await h.pglite.query(
      "INSERT INTO authoring_sections (id, doc_id, tenant_id, code, title, content, order_index, created_at) VALUES ($3, $1, $2, '1.2', 'Beta', 'beta', 0, '2026-01-01T00:00:00.000500Z')",
      [SRC, ORG, 900_031],
    );
    await h.pglite.query("UPDATE authoring_documents SET status = 'APPROVED' WHERE id = $1", [SRC]);
    await seal(SRC, { legacyOrder: true });
    const sealed = JSON.parse(
      (await h.pglite.query<{ frozen_content: string }>('SELECT frozen_content FROM frozen_documents WHERE document_id = $1', [SRC]))
        .rows[0].frozen_content,
    );
    expect(sealed.sections.map((x: { code: string }) => x.code), 'the fixture is not a storage-order seal').toEqual(['1.1', '1.2']);
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    // Filed in the live order (order_index, created_at, id): Beta has the lower id.
    expect((await row(res.body.document.id))?.content).toBe('## 1.2 — Beta\n\nbeta\n\n## 1.1 — Alpha\n\nalpha');
  });

  it('the same document with the two sections\' texts exchanged after the seal is refused (409, nothing written)', async () => {
    const SRC = '12000000-0000-4000-8000-000000000008';
    await h.pglite.query(
      "INSERT INTO authoring_documents (id, tenant_id, status, title, module) VALUES ($1, $2, 'DRAFT', 'OneTxSwap', 'm1')",
      [SRC, ORG],
    );
    await h.pglite.query(
      "INSERT INTO authoring_sections (id, doc_id, tenant_id, code, title, content, order_index, created_at) VALUES ($3, $1, $2, '1.1', 'Alpha', 'alpha', 0, '2026-01-01T00:00:00.000500Z')",
      [SRC, ORG, 900_042],
    );
    await h.pglite.query(
      "INSERT INTO authoring_sections (id, doc_id, tenant_id, code, title, content, order_index, created_at) VALUES ($3, $1, $2, '1.1', 'Alpha', 'beta', 0, '2026-01-01T00:00:00.000500Z')",
      [SRC, ORG, 900_041],
    );
    await h.pglite.query("UPDATE authoring_documents SET status = 'APPROVED' WHERE id = $1", [SRC]);
    await seal(SRC);
    // Exchange the two texts: the multiset of sections is unchanged, the filed order of the text is not.
    await h.pglite.query("UPDATE authoring_sections SET content = CASE content WHEN 'alpha' THEN 'beta' ELSE 'alpha' END WHERE doc_id = $1", [SRC]);
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('SOURCE_ALTERED_SINCE_SEAL');
    expect(await rowsFor(SRC)).toEqual([]);
  });

  it('a section created later but placed first files where the seal placed it (order_index before created_at)', async () => {
    const SRC = '12000000-0000-4000-8000-000000000006';
    await h.pglite.query(
      "INSERT INTO authoring_documents (id, tenant_id, status, title, module) VALUES ($1, $2, 'DRAFT', 'Inserted', 'm1')",
      [SRC, ORG],
    );
    await h.pglite.query(
      "INSERT INTO authoring_sections (doc_id, tenant_id, code, title, content, order_index, created_at) VALUES ($1, $2, '1.2', 'Early', 'early', 1, '2026-01-01T00:00:00Z')",
      [SRC, ORG],
    );
    await h.pglite.query(
      "INSERT INTO authoring_sections (doc_id, tenant_id, code, title, content, order_index, created_at) VALUES ($1, $2, '1.1', 'Late', 'late', 0, '2026-01-02T00:00:00Z')",
      [SRC, ORG],
    );
    await h.pglite.query("UPDATE authoring_documents SET status = 'APPROVED' WHERE id = $1", [SRC]);
    await seal(SRC);
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect((await row(res.body.document.id))?.content).toBe('## 1.1 — Late\n\nlate\n\n## 1.2 — Early\n\nearly');
  });

  it('re-placing an unchanged approved source over the copy the pre-fix client filed writes nothing', async () => {
    const SRC = '12000000-0000-4000-8000-000000000002';
    await tied(SRC, { legacyOrder: true });
    const ins = await h.pglite.query<{ id: number }>(
      `INSERT INTO coauthor_documents (organization_id, title, content, module_number, status, metadata, updated_at)
       VALUES ($1, 'Legacy', $2, 'm1.2', 'approved', $3, '2026-09-01T00:00:00Z') RETURNING id`,
      [ORG, EDITOR_ORDER, JSON.stringify({ source: 'authoring-document', docId: SRC, status: 'APPROVED' })],
    );
    const id = ins.rows[0].id;
    await h.pglite.query(
      "INSERT INTO c2c_document_aliases (organization_id, canonical_id, store, native_id) VALUES ($1, $2, 'coauthor_documents', $3)",
      [ORG, SRC, String(id)],
    );

    const res = await place(SRC);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const after = (
      await h.pglite.query<{ content: string; updated_at: Date }>('SELECT content, updated_at FROM coauthor_documents WHERE id = $1', [id])
    ).rows[0];
    expect(after.content).toBe(EDITOR_ORDER);
    expect(new Date(after.updated_at).toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(await auditFor(id)).toEqual([]);
  });
});

/* ── 2026-09-23 (W5/D7, co-author final pass): the A-B-A window ───────────────
 * The seal check compared the sections it read on the placement's
 * transaction, but the text it filed had been assembled earlier, on the pool.
 * A section changed just before that first read and restored before the check
 * was filed as 'finalized' — with sealVersion and sealContentHash recording a
 * seal that text is not in. The text filed is now assembled from the very rows
 * the check reads, on the transaction. */
describe('the filed text is the text the seal check read', () => {
  it('a section changed before the read and restored after it is refused, not filed', async () => {
    const SRC = '13000000-0000-4000-8000-000000000001';
    await source(SRC, 'FROZEN', [['1.1.3', 'Form', 'SEALED TEXT']]);
    holder.onLoad = async (q) => {
      await (q ?? h.pglite).query("UPDATE authoring_sections SET content = 'NOT-SEALED TEXT' WHERE doc_id = $1", [SRC]);
    };
    holder.afterLoad = async (q) => {
      await (q ?? h.pglite).query("UPDATE authoring_sections SET content = 'SEALED TEXT' WHERE doc_id = $1", [SRC]);
    };
    const res = await place(SRC);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('SOURCE_ALTERED_SINCE_SEAL');
    const everything = (await h.pglite.query<{ content: string }>('SELECT content FROM coauthor_documents')).rows;
    expect(everything.map((r) => r.content).join('\n')).not.toContain('NOT-SEALED');
  });
});

describe('a sourceAuthoringDocId that is not a string', () => {
  it.each([[['0a000000-0000-4000-8000-000000000001']], [{ id: '0a000000-0000-4000-8000-000000000001' }], [42], [true]])(
    '%j is refused 400 and nothing is written',
    async (value) => {
      const before = (await h.pglite.query<{ n: number }>('SELECT count(*)::int AS n FROM coauthor_documents')).rows[0].n;
      const res = await place(value as unknown as string);
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      const after = (await h.pglite.query<{ n: number }>('SELECT count(*)::int AS n FROM coauthor_documents')).rows[0].n;
      expect(after).toBe(before);
    },
  );
});

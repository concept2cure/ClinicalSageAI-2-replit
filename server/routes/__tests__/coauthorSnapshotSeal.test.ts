/**
 * The filing copy of a sealed authoring document is the text its seal holds —
 * pinned against the REAL authoring router, which writes both the seal and the
 * section rewrite that used to get past it.
 *
 * ── The defect (2026-09-23, W5/D7, round-3 review, repair 2) ────────────────
 * Round 3's filing path took an APPROVED or FROZEN document's text from its
 * live sections and argued that was safe because such a document cannot be
 * edited. POST /api/authoring/docs/:docId/apply-template can edit it: it
 * rewrites (overwrite mode) or adds (merge mode) sections without consulting
 * the document lock, and any org member may call it. Its text was then filed
 * as 'approved' / 'finalized' — on first placement, and by re-taking an
 * existing approved copy in place.
 *
 * The filing path no longer depends on every section writer honouring the
 * lock: services/coauthor/coauthor-snapshot.ts files a verdict copy only when
 * the live sections are the ones the latest frozen_documents record sealed.
 *
 * 2026-09-23 (W5/D7, co-author final pass): apply-template itself now honours
 * the lock — checkDocumentWritable on its transaction, 403 DOCUMENT_FROZEN —
 * so the two cases that drove it past a seal now pin the refusal, and that
 * the sealed document still files. The seal check on the filing side is still
 * pinned (coauthorSnapshotFromSource.test.ts), for any other section writer.
 * The last case pins section order end to end: the editor's order, the real
 * freeze's seal and the filed copy agree when sections share an order_index.
 *
 * Real authoring router (real JWT verification, real authoring migrations),
 * real coauthor router, PGlite. Mocked: the live org-membership re-check and
 * the lineage gate — neither is a lock.
 */
import { vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET = 'coauthor-snapshot-seal-test-secret-padded-to-32';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});
const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));

vi.mock('../../db', () => {
  // node-postgres shape: the authoring router reads rowCount, PGlite has none.
  const q = async (sql: string, params?: unknown[]) => {
    const r: any = await holder.pglite.query(sql, params);
    return { ...r, rowCount: r.affectedRows || r.rows.length };
  };
  const pool = { query: q, connect: async () => ({ query: q, release: () => undefined }) };
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
vi.mock('../../middleware/orgMembership', async (orig) => ({
  ...(await orig<any>()),
  enforceOrgMembership: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../services/clinical-regulatory-evidence/lineage-gate', async (orig) => ({
  ...(await orig<any>()),
  enforceAuthorLineage: async () => undefined,
}));

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { createIndPgliteDb, AUDIT_LOGS_PGLITE_DDL, type IndPgliteDb } from '../../db/pglite-harness';
import { expandRoleClaims } from '../../middleware/auth';
import coauthorRoutes from '../coauthor';

const ROOT = path.resolve(__dirname, '../../..');
const ORG = 7;
let h: IndPgliteDb;
let app: express.Express;
const token = () =>
  jwt.sign(
    { userId: 3, id: 3, email: 'member@org.test', role: 'member', organizationId: ORG, type: 'access' },
    (process.env.JWT_SECRET_DEV ?? process.env.JWT_SECRET)!,
    { expiresIn: '1h' },
  );

const MIGRATIONS = [
  'db/migrations/20260725_authoring_document_loop_tables.sql',
  'migrations/20260728_authoring_document_governed_binding.sql',
  'db/migrations/20260730_authoring_comments_router_columns.sql',
  'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
  'db/migrations/20260725_authoring_signatures_and_workflow.sql',
  'db/migrations/20260725_authoring_audit_trail.sql',
  'db/migrations/20260725_authoring_signature_freeze_binding.sql',
  'migrations/20260728_authoring_comments_threading.sql',
  'migrations/20260814d_document_alias_map.sql',
];

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
    INSERT INTO organizations (id, name) VALUES (${ORG}, 'Org') ON CONFLICT DO NOTHING;
  `);
  for (const m of MIGRATIONS) await h.pglite.exec(readFileSync(path.join(ROOT, m), 'utf8'));
  await h.pglite.exec(AUDIT_LOGS_PGLITE_DDL);
  const authoringRouter = (await import('../authoring.router')).default;
  app = express();
  app.use(express.json());
  app.use('/api/authoring', authoringRouter);
  app.use(
    '/api/coauthor',
    (req: any, _res, next) => {
      req.user = { id: 3, userId: 3, organizationId: ORG, role: 'member', roles: expandRoleClaims('member', undefined) };
      next();
    },
    coauthorRoutes,
  );
}, 180_000);

afterAll(async () => {
  await h?.close();
});

/** A DRAFT authoring document with one section, frozen through the real router. */
async function frozenDocument(docId: string, sectionId: string, text: string): Promise<void> {
  await h.pglite.query(
    `INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id, locale)
     VALUES ($1, 'Specifications', 'm3', 'DRAFT', '3', $2, 'en')`,
    [docId, ORG],
  );
  await h.pglite.query(
    `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id)
     VALUES ($1, $2, '3.2.P.5', 'Control of Drug Product', $3, 0, $4)`,
    [sectionId, docId, text, ORG],
  );
  const fz = await request(app)
    .post(`/api/authoring/docs/${docId}/freeze`)
    .set('Authorization', `Bearer ${token()}`)
    .send({ reason: 'seal for filing' });
  expect(fz.status, JSON.stringify(fz.body)).toBe(200);
}

const place = (docId: string) =>
  request(app).post('/api/coauthor/documents').send({ moduleNumber: 'm3.2.p.5', sourceAuthoringDocId: docId });
const applyTemplate = (docId: string) =>
  request(app)
    .post(`/api/authoring/docs/${docId}/apply-template`)
    .set('Authorization', `Bearer ${token()}`)
    .send({ templateKey: 'm3/p-5/specs-dp', mode: 'overwrite' });
const sectionRows = async (docId: string) =>
  (
    await h.pglite.query(
      'SELECT id, code, title, content, order_index FROM authoring_sections WHERE doc_id = $1 ORDER BY id',
      [docId],
    )
  ).rows;
const copy = async (id: number) =>
  (
    await h.pglite.query<{ status: string; content: string; updated_at: Date }>(
      'SELECT status, content, updated_at FROM coauthor_documents WHERE id = $1',
      [id],
    )
  ).rows[0];

describe('a document sealed by the real freeze files as exactly its sealed text', () => {
  it('reads the seal the router writes: a frozen document places as finalized with its text', async () => {
    const DOC = '0c000000-0000-4000-8000-0000000000e1';
    await frozenDocument(DOC, '0c000000-0000-4000-8000-0000000000e2', 'SEALED SPEC TEXT');
    const res = await place(DOC);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(await copy(res.body.document.id)).toMatchObject({
      status: 'finalized',
      content: '## 3.2.P.5 — Control of Drug Product\n\nSEALED SPEC TEXT',
    });
  });

  /* 2026-09-23 (W5/D7, co-author final pass): inverted. This case expected
     apply-template to answer 200 on a FROZEN document and the filing to refuse
     what it wrote; apply-template now refuses the sealed document itself. */
  it('apply-template refuses a FROZEN document (403 DOCUMENT_FROZEN), writes nothing, and the document still files', async () => {
    const DOC = '0c000000-0000-4000-8000-0000000000f1';
    await frozenDocument(DOC, '0c000000-0000-4000-8000-0000000000f2', 'SEALED SPEC TEXT');
    const sectionsBefore = await sectionRows(DOC);
    const tpl = await applyTemplate(DOC);
    expect(tpl.status, JSON.stringify(tpl.body)).toBe(403);
    expect(tpl.body.error).toBe('DOCUMENT_FROZEN');
    expect(await sectionRows(DOC)).toEqual(sectionsBefore);
    const revisions = await h.pglite.query(
      "SELECT 1 FROM doc_revisions WHERE section_id = '0c000000-0000-4000-8000-0000000000f2'",
    );
    expect(revisions.rows).toEqual([]);

    const res = await place(DOC);

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(await copy(res.body.document.id)).toMatchObject({
      status: 'finalized',
      content: '## 3.2.P.5 — Control of Drug Product\n\nSEALED SPEC TEXT',
    });
  });

  it('apply-template refuses an APPROVED document too, in merge mode, and adds no section', async () => {
    const DOC = '0c000000-0000-4000-8000-0000000000a1';
    await frozenDocument(DOC, '0c000000-0000-4000-8000-0000000000a2', 'SEALED SPEC TEXT');
    await h.pglite.query("UPDATE authoring_documents SET status = 'APPROVED' WHERE id = $1", [DOC]);
    const first = await place(DOC);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const id = first.body.document.id;
    const before = await copy(id);
    const sectionsBefore = await sectionRows(DOC);

    const tpl = await request(app)
      .post(`/api/authoring/docs/${DOC}/apply-template`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ templateKey: 'm3/p-5/specs-dp', mode: 'merge' });
    expect(tpl.status, JSON.stringify(tpl.body)).toBe(403);
    expect(tpl.body.error).toBe('DOCUMENT_FROZEN');
    expect(await sectionRows(DOC)).toEqual(sectionsBefore);

    const again = await place(DOC);
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(await copy(id)).toEqual(before);
  });

  it('a DRAFT document still takes a template (the lock is the refusal, not the route)', async () => {
    const DOC = '0c000000-0000-4000-8000-0000000000b1';
    await h.pglite.query(
      `INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id, locale)
       VALUES ($1, 'Specifications', 'm3', 'DRAFT', '3', $2, 'en')`,
      [DOC, ORG],
    );
    const tpl = await applyTemplate(DOC);
    expect(tpl.status, JSON.stringify(tpl.body)).toBe(200);
    expect((await sectionRows(DOC)).length).toBeGreaterThan(0);
  });
});

describe('sections sharing an order_index: editor, seal and filing agree', () => {
  it("the real freeze seals, and the copy files, the editor's order — and re-placing it writes nothing", async () => {
    const DOC = '0c000000-0000-4000-8000-0000000000c1';
    await h.pglite.query(
      `INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id, locale)
       VALUES ($1, 'Legacy', 'm1', 'DRAFT', '3', $2, 'en')`,
      [DOC, ORG],
    );
    // Beta's row is stored first, Alpha (created earlier) second: an order_index-only
    // sort leaves them in storage order, the editor sorts Alpha first.
    await h.pglite.query(
      `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id, created_at)
       VALUES ('0c000000-0000-4000-8000-0000000000c3', $1, '1.2', 'Beta', 'beta', 0, $2, '2026-01-02T00:00:00Z')`,
      [DOC, ORG],
    );
    await h.pglite.query(
      `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id, created_at)
       VALUES ('0c000000-0000-4000-8000-0000000000c2', $1, '1.1', 'Alpha', 'alpha v2', 0, $2, '2026-01-01T00:00:00Z')`,
      [DOC, ORG],
    );

    const editor = await request(app).get(`/api/authoring/docs/${DOC}/sections`).set('Authorization', `Bearer ${token()}`);
    expect(editor.status, JSON.stringify(editor.body)).toBe(200);
    const editorSections = (editor.body.sections ?? editor.body.data ?? editor.body) as Array<{ code: string }>;
    expect(editorSections.map((x) => x.code)).toEqual(['1.1', '1.2']);

    const fz = await request(app)
      .post(`/api/authoring/docs/${DOC}/freeze`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ reason: 'seal for filing' });
    expect(fz.status, JSON.stringify(fz.body)).toBe(200);
    const sealed = JSON.parse(
      (await h.pglite.query<{ frozen_content: string }>('SELECT frozen_content FROM frozen_documents WHERE document_id = $1', [DOC]))
        .rows[0].frozen_content,
    );
    expect(sealed.sections.map((x: { code: string }) => x.code)).toEqual(['1.1', '1.2']);

    const res = await place(DOC);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const id = res.body.document.id;
    expect((await copy(id)).content).toBe('## 1.1 — Alpha\n\nalpha v2\n\n## 1.2 — Beta\n\nbeta');

    await h.pglite.query("UPDATE coauthor_documents SET updated_at = '2026-09-01T00:00:00Z' WHERE id = $1", [id]);
    const again = await place(DOC);
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(new Date((await copy(id)).updated_at).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  /* 2026-09-23 (W5/D7, co-author final pass, repair): the seal stores
     created_at to the millisecond, the database orders by the microsecond. Two
     tied sections created inside one millisecond were sealed by the real
     freeze in the editor's (microsecond) order, and the filing compare re-sorted
     the seal by (millisecond, id) — the other way round — and refused a
     document nobody had touched: 409 SOURCE_ALTERED_SINCE_SEAL (skeptic probe
     verify-r4/coauthor/regression Q1). Rows the seal cannot tell apart keep
     the order it recorded them in. */
  it('tied sections created inside one millisecond: the real freeze seals them and the copy files (201)', async () => {
    const DOC = '0c000000-0000-4000-8000-0000000000d1';
    await h.pglite.query(
      `INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id, locale)
       VALUES ($1, 'SameMs', 'm1', 'DRAFT', '3', $2, 'en')`,
      [DOC, ORG],
    );
    // Alpha is created 800 µs before Beta, in the same millisecond, and has the HIGHER id.
    await h.pglite.query(
      `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id, created_at)
       VALUES ('ffffffff-0000-4000-8000-0000000000d2', $1, '1.1', 'Alpha', 'alpha', 0, $2, '2026-01-01T00:00:00.000100Z')`,
      [DOC, ORG],
    );
    await h.pglite.query(
      `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id, created_at)
       VALUES ('00000000-0000-4000-8000-0000000000d3', $1, '1.2', 'Beta', 'beta', 0, $2, '2026-01-01T00:00:00.000900Z')`,
      [DOC, ORG],
    );
    const editor = await request(app).get(`/api/authoring/docs/${DOC}/sections`).set('Authorization', `Bearer ${token()}`);
    const editorSections = (editor.body.sections ?? editor.body.data ?? editor.body) as Array<{ code: string }>;
    expect(editorSections.map((x) => x.code)).toEqual(['1.1', '1.2']);
    const fz = await request(app)
      .post(`/api/authoring/docs/${DOC}/freeze`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ reason: 'seal for filing' });
    expect(fz.status, JSON.stringify(fz.body)).toBe(200);

    const res = await place(DOC);

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(await copy(res.body.document.id)).toMatchObject({
      status: 'finalized',
      content: '## 1.1 — Alpha\n\nalpha\n\n## 1.2 — Beta\n\nbeta',
    });
  });

  it('the same document with its two sections swapped after the seal is still refused (409, nothing written)', async () => {
    const DOC = '0c000000-0000-4000-8000-0000000000d1';
    const before = (await h.pglite.query<{ n: number }>('SELECT count(*)::int AS n FROM coauthor_documents')).rows[0].n;
    const copyBefore = (
      await h.pglite.query<{ content: string; updated_at: Date }>(
        "SELECT content, updated_at FROM coauthor_documents WHERE title = 'SameMs'",
      )
    ).rows;
    await h.pglite.query(
      "UPDATE authoring_sections SET order_index = 1 WHERE id = 'ffffffff-0000-4000-8000-0000000000d2'",
    );
    try {
      const res = await place(DOC);
      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body.error).toBe('SOURCE_ALTERED_SINCE_SEAL');
      expect((await h.pglite.query<{ n: number }>('SELECT count(*)::int AS n FROM coauthor_documents')).rows[0].n).toBe(before);
      expect(
        (
          await h.pglite.query<{ content: string; updated_at: Date }>(
            "SELECT content, updated_at FROM coauthor_documents WHERE title = 'SameMs'",
          )
        ).rows,
      ).toEqual(copyBefore);
    } finally {
      await h.pglite.query(
        "UPDATE authoring_sections SET order_index = 0 WHERE id = 'ffffffff-0000-4000-8000-0000000000d2'",
      );
    }
  });
});

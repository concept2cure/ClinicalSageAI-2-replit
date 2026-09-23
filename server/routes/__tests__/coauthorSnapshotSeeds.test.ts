/**
 * The GA demo's APPROVED authoring documents can be placed into a filing.
 *
 * ── The defect (2026-09-23, W5/D7, co-author final pass) ────────────────────
 * The filing path files an APPROVED document as 'approved' only while its
 * saved sections are the ones its seal (frozen_documents) recorded
 * (services/coauthor/coauthor-snapshot.ts). Two demo seeds claim an approval
 * without the seal the router writes:
 *   - scripts/seed/ga-demo.d/112-ind-authoring-doc.mjs inserted an APPROVED
 *     document with no frozen_documents row at all → 409 SOURCE_NOT_SEALED.
 *     It exists so the IND demo can reach "Place into filing" (founder's
 *     human-testing script, docs/reports/wo9-phase1-ectd-unblock-2026-09-03.md
 *     §17, "Click 3 placement … 3.2.S.4.2").
 *   - scripts/seed/ga-demo.d/99-doc-journey.mjs wrote a seal of its own shape
 *     (sections without id or order_index) → 409 SOURCE_ALTERED_SINCE_SEAL,
 *     a false reason: the sealed text was byte-for-byte the live text.
 * Both now write the seal in the authoring router's own format
 * (scripts/seed/authoring-seal.mjs), and the filing compare is of what is
 * filed, so a seal lacking section ids is not reported as altered.
 *
 * Runs the REAL seed functions on the real authoring migrations, then the real
 * sourced POST of the real coauthor router, on PGlite. Seeds run on laptops
 * only (CLAUDE.md RULE 1 corollary); no migration is involved.
 */
import { vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'coauthor-snapshot-seeds-secret-padded-to-32';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});
const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));

vi.mock('../../db', () => {
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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import request from 'supertest';
import express from 'express';
import { createIndPgliteDb, type IndPgliteDb } from '../../db/pglite-harness';
import { expandRoleClaims } from '../../middleware/auth';
import coauthorRoutes from '../coauthor';

/* The seeds are plain .mjs modules the seed runner imports; loaded the same
   way (a string-typed path, as seed-collab-review.pglite.integration.test.ts
   does), so the type checker does not need declarations for them. */
type SeedFn = (client: unknown, ctx: unknown) => Promise<void>;
const SEED_99: string = '../../../scripts/seed/ga-demo.d/99-doc-journey.mjs';
const SEED_112: string = '../../../scripts/seed/ga-demo.d/112-ind-authoring-doc.mjs';
const seed99: SeedFn = async (c, x) => ((await import(SEED_99)) as { default: SeedFn }).default(c, x);
const seed112: SeedFn = async (c, x) => ((await import(SEED_112)) as { default: SeedFn }).default(c, x);

const ROOT = path.resolve(__dirname, '../../..');
const ORG = 7;
let h: IndPgliteDb;
const app = express();
app.use(express.json());
app.use(
  '/api/coauthor',
  (req: any, _res, next) => {
    req.user = { id: 3, userId: 3, organizationId: ORG, role: 'member', roles: expandRoleClaims('member', undefined) };
    next();
  },
  coauthorRoutes,
);

const MIGRATIONS = [
  'db/migrations/20260725_authoring_document_loop_tables.sql',
  'migrations/20260728_authoring_document_governed_binding.sql',
  'db/migrations/20260730_authoring_comments_router_columns.sql',
  'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
  'migrations/20260728_authoring_comments_threading.sql',
  'migrations/20260814d_document_alias_map.sql',
];

/** A node-postgres-shaped client over PGlite: what the seed runner hands a seed. */
const client = { query: (s: string, p?: unknown[]) => holder.pglite.query(s, p) };
const ctx = { org: { id: ORG }, admin: { id: 3, email: 'admin@org.test', name: 'Admin' } };

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
  await h.pglite.exec(`
    ALTER TABLE authoring_documents ADD COLUMN IF NOT EXISTS client_program_id UUID;
    CREATE TABLE IF NOT EXISTS audit_events (
      id SERIAL PRIMARY KEY, organization_id INTEGER, event_type TEXT, entity_type TEXT,
      entity_id TEXT, user_id INTEGER, user_name TEXT, user_role TEXT, ip_address TEXT,
      timestamp TIMESTAMPTZ, reason TEXT, metadata JSONB, regulatory_significant BOOLEAN,
      gxp_relevant BOOLEAN, created_at TIMESTAMPTZ);
    INSERT INTO regulatory_programs (organization_id, name, code, program_type, product_name)
      VALUES (${ORG}, 'Vorelinib IND', 'BX-512', 'IND', 'Vorelinib');
  `);
  const t = await h.pglite.query<{ ou: string | null; u: string | null }>(
    "SELECT to_regclass('public.organization_users')::text AS ou, to_regclass('public.users')::text AS u",
  );
  if (!t.rows[0].u) await h.pglite.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, name TEXT)');
  if (!t.rows[0].ou) await h.pglite.exec('CREATE TABLE organization_users (organization_id INTEGER, user_id INTEGER)');
  await h.pglite.exec(`
    INSERT INTO users (id, email, name) VALUES (3, 'author@org.test', 'Author') ON CONFLICT DO NOTHING;
    INSERT INTO organization_users (organization_id, user_id) VALUES (${ORG}, 3);
  `);
}, 180_000);

afterAll(async () => {
  await h?.close();
});

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** The seal the router writes: its bytes hash to content_hash, and it holds the row and its sections. */
async function expectRouterSeal(docId: string): Promise<void> {
  const seals = (
    await h.pglite.query<{ frozen_content: string; content_hash: string; tenant_id: number }>(
      'SELECT frozen_content, content_hash, tenant_id FROM frozen_documents WHERE document_id = $1',
      [docId],
    )
  ).rows;
  expect(seals).toHaveLength(1);
  const [seal] = seals;
  expect(seal.tenant_id).toBe(ORG);
  expect(sha(seal.frozen_content)).toBe(seal.content_hash);
  const body = JSON.parse(seal.frozen_content);
  const docRow = (await h.pglite.query('SELECT * FROM authoring_documents WHERE id = $1', [docId])).rows[0];
  expect(body.document).toEqual(JSON.parse(JSON.stringify(docRow)));
  const live = (
    await h.pglite.query(
      `SELECT id, doc_id, code, title, content, order_index, track_changes, created_at, updated_at, tenant_id
         FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index, created_at, id`,
      [docId, ORG],
    )
  ).rows;
  expect(live.length).toBeGreaterThan(0);
  expect(body.sections).toEqual(JSON.parse(JSON.stringify(live)));
}

const place = (docId: string, moduleNumber: string) =>
  request(app).post('/api/coauthor/documents').send({ moduleNumber, sourceAuthoringDocId: docId });

describe('GA demo seeds produce documents "Place into filing" accepts', () => {
  it('112-ind-authoring-doc: the IND demo document is sealed and files as approved (201)', async () => {
    await seed112(client, ctx);
    const doc = (
      await h.pglite.query<{ id: string; status: string }>(
        "SELECT id, status FROM authoring_documents WHERE title = 'Control of Drug Substance (CTD 3.2.S.4)'",
      )
    ).rows[0];
    expect(doc, 'seed 112 did not run').toBeTruthy();
    expect(doc.status).toBe('APPROVED');
    await expectRouterSeal(doc.id);

    const res = await place(doc.id, '3.2.S.4.2');

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.document.status).toBe('approved');
    expect(res.body.document.content).toContain('## 3.2.S.4.2 — 3.2.S.4.2  Analytical procedures');

    // Idempotent: a second run adds neither a document nor a seal.
    await seed112(client, ctx);
    const n = await h.pglite.query<{ d: number; f: number }>(
      `SELECT (SELECT count(*)::int FROM authoring_documents WHERE title = 'Control of Drug Substance (CTD 3.2.S.4)') AS d,
              (SELECT count(*)::int FROM frozen_documents WHERE document_id = $1) AS f`,
      [doc.id],
    );
    expect(n.rows[0]).toEqual({ d: 1, f: 1 });
  });

  /*
   * 2026-09-23 (W5/D7, co-author final pass, repair): a demo database seeded
   * BEFORE this change holds the same document and section rows with NO seal —
   * the previous seed 112 wrote none (it inserted exactly these rows and
   * returned). The §17 sandbox was seeded that way on 2026-09-08. Its
   * "already seeded" branch returned before sealing, so re-running the seeds
   * never repaired it and Click 3 stayed 409 SOURCE_NOT_SEALED. The state is
   * reproduced here by removing the seal the fresh run wrote; the skeptic
   * probe (verify-r4/coauthor/regression, Q2) runs the literal previous file.
   */
  it('112 on a database the previous seed populated (APPROVED, no seal): a re-run seals it and it files as approved', async () => {
    const doc = (
      await h.pglite.query<{ id: string }>(
        "SELECT id FROM authoring_documents WHERE title = 'Control of Drug Substance (CTD 3.2.S.4)'",
      )
    ).rows[0];
    await h.pglite.query('DELETE FROM frozen_documents WHERE document_id = $1', [doc.id]);
    const before = await place(doc.id, '3.2.S.4.2');
    expect(before.status).toBe(409);
    expect(before.body.error).toBe('SOURCE_NOT_SEALED');

    await seed112(client, ctx);

    await expectRouterSeal(doc.id);
    const res = await place(doc.id, '3.2.S.4.2');
    expect([200, 201], JSON.stringify(res.body)).toContain(res.status);
    expect(res.body.document.status).toBe('approved');

    // Still idempotent once the seal exists: no second seal, no second document.
    await seed112(client, ctx);
    const n = await h.pglite.query<{ d: number; f: number }>(
      `SELECT (SELECT count(*)::int FROM authoring_documents WHERE title = 'Control of Drug Substance (CTD 3.2.S.4)') AS d,
              (SELECT count(*)::int FROM frozen_documents WHERE document_id = $1) AS f`,
      [doc.id],
    );
    expect(n.rows[0]).toEqual({ d: 1, f: 1 });
  });

  it('112 does not seal an unsealed APPROVED document whose sections are not the text it seeded', async () => {
    const doc = (
      await h.pglite.query<{ id: string }>(
        "SELECT id FROM authoring_documents WHERE title = 'Control of Drug Substance (CTD 3.2.S.4)'",
      )
    ).rows[0];
    const sec = (
      await h.pglite.query<{ id: string; content: string }>(
        "SELECT id, content FROM authoring_sections WHERE doc_id = $1 AND code = '3.2.S.4.2'",
        [doc.id],
      )
    ).rows[0];
    await h.pglite.query('DELETE FROM frozen_documents WHERE document_id = $1', [doc.id]);
    await h.pglite.query('UPDATE authoring_sections SET content = $2 WHERE id = $1', [sec.id, 'EDITED, NEVER APPROVED']);
    try {
      await seed112(client, ctx);
      const f = await h.pglite.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM frozen_documents WHERE document_id = $1',
        [doc.id],
      );
      expect(f.rows[0].n, 'the seed sealed text it did not write as approved').toBe(0);
      const res = await place(doc.id, '3.2.S.4.2');
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SOURCE_NOT_SEALED');
    } finally {
      await h.pglite.query('UPDATE authoring_sections SET content = $2 WHERE id = $1', [sec.id, sec.content]);
      await seed112(client, ctx);
    }
    await expectRouterSeal(doc.id);
  });

  it('112 does not seal an unsealed document that is no longer APPROVED', async () => {
    const doc = (
      await h.pglite.query<{ id: string }>(
        "SELECT id FROM authoring_documents WHERE title = 'Control of Drug Substance (CTD 3.2.S.4)'",
      )
    ).rows[0];
    await h.pglite.query('DELETE FROM frozen_documents WHERE document_id = $1', [doc.id]);
    await h.pglite.query("UPDATE authoring_documents SET status = 'DRAFT' WHERE id = $1", [doc.id]);
    try {
      await seed112(client, ctx);
      const f = await h.pglite.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM frozen_documents WHERE document_id = $1',
        [doc.id],
      );
      expect(f.rows[0].n, 'the seed sealed a document that is not approved').toBe(0);
    } finally {
      await h.pglite.query("UPDATE authoring_documents SET status = 'APPROVED' WHERE id = $1", [doc.id]);
      await seed112(client, ctx);
    }
    await expectRouterSeal(doc.id);
  });

  it('99-doc-journey: the doc-journey document is sealed in the router format and files as approved (201)', async () => {
    await seed99(client, ctx);
    const doc = (
      await h.pglite.query<{ id: string; status: string }>(
        "SELECT id, status FROM authoring_documents WHERE title = 'Clinical Overview (CTD Module 2.5)'",
      )
    ).rows[0];
    expect(doc, 'seed 99 did not run').toBeTruthy();
    expect(doc.status).toBe('APPROVED');
    await expectRouterSeal(doc.id);

    const res = await place(doc.id, 'm2.5');

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.document.status).toBe('approved');
    expect(res.body.document.content).toContain('## 2.5.4 — 2.5.4  Overview of efficacy');
  });
});

/**
 * Contract: PATCH /api/c2c/documents/:id/sections/:key, and the version ledger.
 *
 * ── 2026-10-17, document store consolidation step 5 ──────────────────────────
 * The route no longer writes section TEXT. The authoring editor is the one
 * editor, and its write-through (commit-section-to-filing.ts) is the one writer
 * of c2c_document_sections.content; a content PATCH is refused with 409
 * SECTION_TEXT_IS_AUTHORED (docs/design/DOCUMENT_STORE_CONSOLIDATION.md). The
 * route still moves a section between the unsigned states. The ledger cases
 * below drive the trigger the way the write-through does. The history that
 * follows is why the real-database harness exists.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * It did not. Not "sometimes", not "under load" — never, for anyone.
 *
 *   server/routes/c2c/documents.ts:394
 *   await client.query(`SET LOCAL app.actor_id = $1`, [String(userId)]);
 *
 * `SET` is a PostgreSQL utility statement and its grammar has no parameter
 * production, so a bind placeholder is a syntax error. node-postgres uses the
 * extended protocol whenever a values array is passed, so this failed at Parse
 * with 42601 on every request. It threw before the existence check, which meant
 * neither the INSERT branch nor the UPDATE branch below it ever ran, and the
 * catch-all converted it to 500. The dossier editor showed "Not saved —
 * HTTP 500" for every save the product has ever attempted through this route.
 *
 * ── Why the existing test suite was green ─────────────────────────────────────
 * server/__tests__/security/c2c-documents-transition-audit-order.contract.test.ts
 * mocks the client and short-circuits the exact statement that fails:
 *
 *   if (/^\s*BEGIN/i.test(sql) || /SET\s+LOCAL/i.test(sql)) return { rows: [] };
 *
 * It asserts audit-before-commit ordering against a mock that cannot reproduce a
 * parse error. That test is not wrong about what it checks; it simply cannot see
 * this class of bug. Which is the point of this file: the route is driven end to
 * end against a REAL PostgreSQL running the REAL migration, so a statement that
 * the server rejects fails the test.
 *
 * PGlite reproduces the failure faithfully — verified: parameterised
 * `SET LOCAL` returns 42601 there exactly as it does on PostgreSQL 16.
 *
 * ── The second defect this pins ───────────────────────────────────────────────
 * c2c_snapshot_section_version() hardcoded `author_kind` to 'human' for every
 * version row, discarding the provenance the route had just validated and
 * stored. AnA-generated text entered the immutable Part 11 ledger asserting a
 * person wrote it. Because c2c_document_sections.draft_source is mutable and is
 * overwritten by the next edit, the version ledger is the only durable record of
 * AI involvement — and it was uniformly false.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response, type NextFunction } from 'express';
import supertest from 'supertest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREREQ = path.join(REPO_ROOT, 'migrations/20260527_mutation_primitives.sql');
const SCHEMA = path.join(REPO_ROOT, 'migrations/20260528_phase9_document_schema.sql');
const AUTHORING = path.join(REPO_ROOT, 'db/migrations/20260725_authoring_document_loop_tables.sql');
const COMMENTS = path.join(REPO_ROOT, 'db/migrations/20260730_authoring_comments_router_columns.sql');
const REVISION_LEDGER = path.join(REPO_ROOT, 'db/migrations/20260817_doc_revisions_immutable_ledger.sql');
const BINDING = path.join(REPO_ROOT, 'migrations/20260728_authoring_document_governed_binding.sql');

const ORG = 7;
const USER = 42;
const DOC = 'doc_contract_save';
const PROJECT = '11111111-2222-3333-4444-555555555555';

let pg: PGlite;

/**
 * The route calls `pool.query` for the membership pre-check and
 * `pool.connect()` for the transaction. PGlite is a single embedded instance, so
 * both are served by it and `release` is a no-op — statements are serialised
 * anyway, which is exactly what a single pooled client would give us.
 */
vi.mock('../../server/db', () => ({
  pool: {
    query: (sql: string, params?: unknown[]) => pg.query(sql, params as any[]),
    connect: async () => ({
      query: (sql: string, params?: unknown[]) => pg.query(sql, params as any[]),
      release: () => {},
    }),
  },
}));

async function buildApp() {
  const router = (await import('../../server/routes/c2c/documents')).default;
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: USER, organizationId: ORG };
    next();
  });
  app.use('/api/c2c/documents', router);
  return app;
}

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY);
    -- recordGovernedAction writes a hash-chained row in the same transaction as
    -- the section write. That coupling is the property this codebase has been
    -- converging on, so the harness provisions the table rather than stubbing
    -- the writer out and losing the coupling from the test.
    CREATE TABLE audit_logs (
      id text PRIMARY KEY, tenant_id integer, user_id integer, action text,
      table_name text, record_id text, actor_id text, target text,
      target_type text, target_id text, reason text, payload_hash text,
      ana_action_id text, sha256_chain text,
      occurred_at timestamptz DEFAULT now(), hmac_seal text,
      old_values   json,
      new_values   json,
      ip_address   text,
      user_agent   text
    );
  `);
  await pg.exec(fs.readFileSync(PREREQ, 'utf8'));
  await pg.exec(fs.readFileSync(SCHEMA, 'utf8'));
  // The real save checks bound authoring seals inside its transaction. Apply
  // the actual deployed prerequisites; catching a missing table leaves that
  // transaction aborted and cannot prove the filing write contract.
  await pg.exec(fs.readFileSync(AUTHORING, 'utf8'));
  await pg.exec(fs.readFileSync(COMMENTS, 'utf8'));
  await pg.exec(fs.readFileSync(REVISION_LEDGER, 'utf8'));
  await pg.exec(fs.readFileSync(BINDING, 'utf8'));

  // A document bound to a real seeded rule pack, so the composite FK resolves,
  // and to a real project — c2c_documents.project_id is NOT NULL.
  await pg.query(`INSERT INTO regulatory_programs (id) VALUES ($1)`, [PROJECT]);
  const pack = await pg.query<{ version: string }>(
    `SELECT version FROM c2c_rule_packs WHERE doc_type='ind' AND agency='fda' LIMIT 1`,
  );
  await pg.query(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness)
     VALUES ($1, $2, $3, 'ind', 'fda', $4, 'Contract Doc', 'draft', 0)`,
    [DOC, ORG, PROJECT, pack.rows[0].version],
  );
});
afterEach(async () => {
  vi.resetModules();
  await pg?.close();
});

const patch = async (body: Record<string, unknown>, key = 'm2.5') =>
  supertest(await buildApp())
    .patch(`/api/c2c/documents/${DOC}/sections/${key}`)
    .send({ reason: 'contract test edit', ...body });

/**
 * Write section text the way the one remaining writer does
 * (server/services/c2c/commit-section-to-filing.ts): the Part 11 GUCs set
 * transaction-locally, then the UPDATE the snapshot trigger fires on. A
 * section not yet present is inserted with its text (an INSERT writes no
 * version row, as for the route's own first save before this change).
 */
const writeText = async (text: string, draftSource: string | null = null, key = 'm2.5') =>
  pg.transaction(async (tx) => {
    await tx.query(`SELECT set_config('app.actor_id', $1, true)`, [String(USER)]);
    await tx.query(`SELECT set_config('app.reason', $1, true)`, ['contract test edit']);
    const upd = await tx.query(
      `UPDATE c2c_document_sections
          SET content = jsonb_build_object('text', $3::text), draft_source = $4::text
        WHERE document_id = $1 AND section_key = $2`,
      [DOC, key, text, draftSource],
    );
    if (upd.affectedRows === 0) {
      await tx.query(
        `INSERT INTO c2c_document_sections (document_id, section_key, label, path_order, content, status, draft_source)
         VALUES ($1, $2, $2, 1, jsonb_build_object('text', $3::text), 'drafted', $4::text)`,
        [DOC, key, text, draftSource],
      );
    }
  });

const sectionRows = async () =>
  (await pg.query<any>(
    `SELECT section_key, content, status, version FROM c2c_document_sections WHERE document_id = $1`, [DOC],
  )).rows;

describe('the route does not write section text (consolidation step 5)', () => {
  it('refuses a content PATCH with 409 SECTION_TEXT_IS_AUTHORED and writes nothing', async () => {
    const res = await patch({ content: { paragraphs: ['typed into the dossier drawer'] }, draftSource: 'human' });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.code).toBe('SECTION_TEXT_IS_AUTHORED');
    expect(res.body.message).toMatch(/authoring editor/);
    expect(res.body.message).toMatch(/Nothing was changed\.$/);
    expect(await sectionRows()).toEqual([]);
    expect((await pg.query(`SELECT 1 FROM audit_logs`)).rows).toHaveLength(0);
  }, 60_000);

  it('refuses content even when a status rides with it — the status is not applied either', async () => {
    await writeText('authored text');
    const res = await patch({ content: { text: 'replacement' }, status: 'review' });
    expect(res.status).toBe(409);
    const [row] = await sectionRows();
    expect(row.content).toEqual({ text: 'authored text' });
    expect(row.status).toBe('drafted');
  }, 60_000);

  it('still moves a section between the unsigned states, audited in the same transaction', async () => {
    const res = await patch({ status: 'review' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const [row] = await sectionRows();
    expect(row.status).toBe('review');
    expect(row.content).toEqual({});
    const audit = await pg.query<any>(`SELECT target, sha256_chain FROM audit_logs`);
    expect(audit.rows.length).toBeGreaterThan(0);
    expect(audit.rows[0].sha256_chain).toBeTruthy();
  }, 60_000);

  it('a status change on authored text leaves the text and its version alone', async () => {
    await writeText('authored text');
    const res = await patch({ status: 'review' });
    expect(res.status).toBe(200);
    const [row] = await sectionRows();
    expect(row).toMatchObject({ content: { text: 'authored text' }, status: 'review', version: 1 });
    expect((await pg.query(`SELECT 1 FROM c2c_document_section_versions`)).rows).toHaveLength(0);
  }, 60_000);
});

describe('the version ledger the write-through feeds', () => {
  it('a second write bumps the version and snapshots the first, attributed to the GUC actor', async () => {
    await writeText('v1');
    await writeText('v2');
    const [row] = await sectionRows();
    expect(row.content).toEqual({ text: 'v2' });
    expect(row.version).toBe(2);
    const v = await pg.query<any>(`SELECT author_id, reason FROM c2c_document_section_versions`);
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0].author_id).toBe(USER);
    expect(v.rows[0].reason).toBe('contract test edit');
  }, 60_000);

  it('AnA-drafted text is not recorded as human-authored', async () => {
    await writeText('ana draft', 'ana');
    await writeText('human revision', 'human');
    const v = await pg.query<any>(
      `SELECT version, author_kind FROM c2c_document_section_versions ORDER BY version`,
    );
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0].author_kind).toBe('ana');
  }, 60_000);

  it('human-authored text stays human', async () => {
    await writeText('h1', 'human');
    await writeText('h2', 'human');
    const v = await pg.query<any>(`SELECT author_kind FROM c2c_document_section_versions ORDER BY version`);
    expect(v.rows[0].author_kind).toBe('human');
  }, 60_000);
});

describe('no route may set a GUC with a bind parameter', () => {
  it('server/ contains no parameterised SET — the whole bug class, fenced', async () => {
    // This is the durable guard. The behavioural tests above cover this one
    // route; this covers every route, including ones not yet written. `SET`
    // never accepts a placeholder, so any match is a latent 42601.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === 'dist') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.ts$/.test(e.name) || /\.test\.ts$/.test(e.name)) continue;
        const src = fs.readFileSync(p, 'utf8');
        // Must match the SET *utility statement* and not the SET *clause* of an
        // UPDATE — `UPDATE t SET content = $3` is correct and ubiquitous (226
        // occurrences in server/ alone, which is how the first version of this
        // guard failed). Two unambiguous forms of the utility statement:
        //   SET LOCAL|SESSION <anything> = $n
        //   SET <dotted.guc.name> = $n        (GUCs are namespaced; columns are not)
        const re =
          /\bSET\s+(?:(?:LOCAL|SESSION)\s+[a-zA-Z_][\w.]*|[a-zA-Z_]\w*\.[\w.]+)\s*(?:=|\bTO\b)\s*\$\d/gi;
        for (const m of src.matchAll(re)) {
          const line = src.slice(0, m.index).split('\n').length;
          offenders.push(`${path.relative(REPO_ROOT, p)}:${line}  ${m[0].trim()}`);
        }
      }
    };
    walk(path.join(REPO_ROOT, 'server'));
    expect(offenders).toEqual([]);
  }, 60_000);
});

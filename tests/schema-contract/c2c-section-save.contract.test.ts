/**
 * Contract: PATCH /api/c2c/documents/:id/sections/:key actually saves.
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

const save = async (body: Record<string, unknown>, key = 'm2.5') =>
  supertest(await buildApp())
    .patch(`/api/c2c/documents/${DOC}/sections/${key}`)
    .send({ reason: 'contract test edit', ...body });

describe('the section save actually persists', () => {
  it('returns 200 and creates the section — not 500', async () => {
    const res = await save({ content: { paragraphs: ['first draft'] } });

    // Before the fix this was 500 INTERNAL_ERROR, caused by 42601 at the GUC.
    expect(res.status).toBe(200);

    const rows = await pg.query<any>(
      `SELECT section_key, content, version FROM c2c_document_sections WHERE document_id = $1`,
      [DOC],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].section_key).toBe('m2.5');
    expect(rows.rows[0].content).toEqual({ paragraphs: ['first draft'] });
  }, 60_000);

  it('a second save updates the same row and bumps the version', async () => {
    await save({ content: { paragraphs: ['v1'] } });
    const res = await save({ content: { paragraphs: ['v2'] } });
    expect(res.status).toBe(200);

    const rows = await pg.query<any>(
      `SELECT content, version FROM c2c_document_sections WHERE document_id = $1`, [DOC],
    );
    expect(rows.rows).toHaveLength(1);                       // updated, not duplicated
    expect(rows.rows[0].content).toEqual({ paragraphs: ['v2'] });
    expect(rows.rows[0].version).toBe(2);
  }, 60_000);

  it('the Part 11 attribution GUC really does reach the trigger', async () => {
    // The trigger RAISES without app.actor_id. A save that updates content and
    // returns 200 is therefore positive proof the GUC was set — this is the
    // assertion the mocked suite structurally could not make.
    await save({ content: { paragraphs: ['v1'] } });
    const res = await save({ content: { paragraphs: ['v2'] } });
    expect(res.status).toBe(200);

    const v = await pg.query<any>(
      `SELECT author_id, reason FROM c2c_document_section_versions`,
    );
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0].author_id).toBe(USER);                  // the real JWT user, not a placeholder
    expect(v.rows[0].reason).toBe('contract test edit');
  }, 60_000);

  it('audits in the same transaction as the write', async () => {
    await save({ content: { paragraphs: ['first draft'] } });
    const audit = await pg.query<any>(`SELECT target, sha256_chain FROM audit_logs`);
    expect(audit.rows.length).toBeGreaterThan(0);
    expect(audit.rows[0].sha256_chain).toBeTruthy();
  }, 60_000);
});

describe('the version ledger records how the superseded content was authored', () => {
  it('AnA-drafted text is not recorded as human-authored', async () => {
    // v1 is written by AnA...
    await save({ content: { paragraphs: ['ana draft'] }, draftSource: 'ana' });
    // ...then a human edits it, which snapshots v1 into the ledger.
    await save({ content: { paragraphs: ['human revision'] }, draftSource: 'human' });

    const v = await pg.query<any>(
      `SELECT version, author_kind FROM c2c_document_section_versions ORDER BY version`,
    );
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0].version).toBe(1);
    // Hardcoded 'human' before the fix. This is the falsification 21 CFR Part 11
    // §11.10(e) exists to prevent.
    expect(v.rows[0].author_kind).toBe('ana');
  }, 60_000);

  it('human-authored text stays human', async () => {
    await save({ content: { paragraphs: ['h1'] }, draftSource: 'human' });
    await save({ content: { paragraphs: ['h2'] }, draftSource: 'human' });
    const v = await pg.query<any>(`SELECT author_kind FROM c2c_document_section_versions`);
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

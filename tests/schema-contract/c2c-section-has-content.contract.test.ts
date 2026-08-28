/**
 * Contract: a section a user has written reports that it has content.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * Save a section, reload the page, and your text was gone from the screen.
 *
 * Three shipped queries computed has_content as
 * `(content -> 'paragraphs') IS NOT NULL`. The editor saves `{ text: "…" }`
 * (client/src/concept2cure/mdx/hooks/useSectionSave.ts:89) — no `paragraphs`
 * key — so has_content was FALSE for every section anyone had actually typed
 * into. useDossier.ts:131 gates its body re-fetch on has_content, so it never
 * fetched, and the section rendered empty. The text was in the database the
 * whole time. Two more surfaces drew the same wrong conclusion:
 * project-vault.ts:203 reported `pct: 0` and :169/:176 reported 'not_started'.
 *
 * It was unreachable until #1188: the save itself returned 500 on every request
 * (a bind parameter passed to `SET LOCAL`), so nothing was ever stored to be
 * lost. Fixing the save is what exposed this.
 *
 * ── Why this file exists in this shape ────────────────────────────────────────
 * The writer and the presence test disagreed, in three independent copies of one
 * expression. So the assertions here are anchored to the WRITER, not to a shape
 * restated in the test:
 *
 *   • the round-trip test PATCHes through the real router and reads back through
 *     the real GET /:id/outline, so the two halves of the contract are exercised
 *     by the same code paths the browser uses;
 *   • the writer-shape test reads useSectionSave.ts and asserts the key it
 *     actually sends is one the predicate accepts — change the editor's payload
 *     shape without teaching the predicate and this fails;
 *   • the fence test asserts the old narrow expression is gone from server/, so
 *     a fourth copy cannot be reintroduced.
 *
 * Mutation-verified: restoring `(content -> 'paragraphs') IS NOT NULL` in
 * server/services/c2c/section-content.ts fails the round-trip, the table-driven
 * shape test and the fence.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response, type NextFunction } from 'express';
import supertest from 'supertest';
import { sectionHasContentSql } from '../../server/services/c2c/section-content';
import { stripComments } from '../ui/_strip-comments';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREREQ = path.join(REPO_ROOT, 'migrations/20260527_mutation_primitives.sql');
const SCHEMA = path.join(REPO_ROOT, 'migrations/20260528_phase9_document_schema.sql');
// The section save writes content and its span lineage in ONE transaction and
// refuses to commit either alone, so this table is a prerequisite for the save
// rather than an optional extra. It only became one for `{ text }` content when
// sectionPlainText was widened to serialise the shape the editor actually
// sends — before that the route skipped the lineage block for every real save.
const LINEAGE = path.join(REPO_ROOT, 'db/migrations/20260803_document_span_lineage.sql');
const SAVE_HOOK = path.join(REPO_ROOT, 'client/src/concept2cure/mdx/hooks/useSectionSave.ts');

const ORG = 7;
const USER = 42;
const DOC = 'doc_has_content';
const PROJECT = '11111111-2222-3333-4444-666666666666';

let pg: PGlite;

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
    -- Seeded explicitly: document_span_lineage.organization_id carries an FK to
    -- this table, so the org under test has to be the one that exists.
    INSERT INTO organizations (id) VALUES (${ORG});
    CREATE TABLE users (id serial PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY);
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
  await pg.exec(fs.readFileSync(LINEAGE, 'utf8'));

  await pg.query(`INSERT INTO regulatory_programs (id) VALUES ($1)`, [PROJECT]);
  const pack = await pg.query<{ version: string }>(
    `SELECT version FROM c2c_rule_packs WHERE doc_type='ind' AND agency='fda' LIMIT 1`,
  );
  await pg.query(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness)
     VALUES ($1, $2, $3, 'ind', 'fda', $4, 'Has-content Doc', 'draft', 0)`,
    [DOC, ORG, PROJECT, pack.rows[0].version],
  );
});
afterEach(async () => {
  vi.resetModules();
  await pg?.close();
});

/** Run the predicate against a real row of the real table. */
async function hasContent(value: unknown): Promise<boolean> {
  await pg.query(`DELETE FROM c2c_document_sections WHERE document_id = $1`, [DOC]);
  await pg.query(
    `INSERT INTO c2c_document_sections (document_id, section_key, label, path_order, content, status)
     VALUES ($1, 'probe', 'Probe section', 1, $2::jsonb, 'drafted')`,
    [DOC, JSON.stringify(value)],
  );
  const r = await pg.query<{ h: boolean }>(
    `SELECT ${sectionHasContentSql('content')} AS h
       FROM c2c_document_sections WHERE document_id = $1`,
    [DOC],
  );
  return r.rows[0].h;
}

describe('the shape the editor saves survives a round trip', () => {
  it('save { text } → the outline reports has_content', async () => {
    // '2.5' is a real key in the seeded IND × FDA rule pack, so the saved row
    // merges into the outline instead of being dropped as an unknown section.
    const save = await supertest(await buildApp())
      .patch(`/api/c2c/documents/${DOC}/sections/2.5`)
      .send({ content: { text: 'The investigational product is…' },
              reason: 'contract test edit', draftSource: 'human' });
    expect(save.status).toBe(200);

    const outline = await supertest(await buildApp()).get(`/api/c2c/documents/${DOC}/outline`);
    expect(outline.status).toBe(200);

    const section = (outline.body.outline as any[]).find((s) => s.key === '2.5');
    expect(section).toBeDefined();
    // FALSE before the fix — which is why the browser never re-fetched the body
    // and the user's text vanished from the screen on reload.
    expect(section.has_content).toBe(true);
  }, 60_000);

  it('an untouched section still reports no content', async () => {
    // The other half of the contract: if everything reported true, the round
    // trip above would pass for the wrong reason.
    const outline = await supertest(await buildApp()).get(`/api/c2c/documents/${DOC}/outline`);
    const untouched = (outline.body.outline as any[])[0];
    expect(untouched.has_content).toBe(false);
  }, 60_000);
});

describe('every body shape the reader accepts counts as content', () => {
  // contentToBody (useDossier.ts:80-99) renders all four of these. A shape the
  // reader can display but the server calls empty is the bug, restated.
  it.each([
    ['editor default  { text }',   { text: 'written by a person' }],
    ['backfill shape  { paragraphs }', { paragraphs: [{ id: 'p1', text: 'legacy', prov: 'legacy' }] }],
    ['{ markdown }',               { markdown: '## Heading' }],
    ['{ xml }',                    { xml: '<section>…</section>' }],
    ['bare JSON string',           'plain legacy text'],
  ])('%s', async (_label, value) => {
    expect(await hasContent(value)).toBe(true);
  }, 60_000);
});

describe('an outline is not a draft', () => {
  // Reporting a scaffolded placeholder as content would be the fabrication this
  // codebase has been removing. Empty must stay empty.
  it.each([
    ['scaffold placeholder {}', {}],
    ['empty text',              { text: '' }],
    ['whitespace-only text',    { text: '   \n\t ' }],
    // The old expression called this TRUE: `{} -> 'paragraphs'` is `[]`, and
    // `[] IS NOT NULL` is true.
    ['empty paragraphs list',   { paragraphs: [] }],
    ['unrelated keys only',     { updatedBy: 'someone' }],
    ['empty JSON string',       ''],
  ])('%s → no content', async (_label, value) => {
    expect(await hasContent(value)).toBe(false);
  }, 60_000);

  it('a NULL content column does not error', async () => {
    // The column is NOT NULL with a default today, but the predicate is used in
    // three files and must not become a landmine if that ever changes.
    const r = await pg.query<{ h: boolean }>(
      `SELECT ${sectionHasContentSql('c')} AS h FROM (SELECT NULL::jsonb AS c) t`,
    );
    expect(r.rows[0].h).toBe(false);
  }, 60_000);
});

describe('the predicate cannot drift from the writer again', () => {
  it('the key useSectionSave.ts actually sends is one the predicate accepts', async () => {
    // Read from the hook's SOURCE rather than restated here: this is the exact
    // disagreement that caused the defect, so the gate has to be anchored to the
    // writer, not to a second copy of the writer's assumptions.
    const src = fs.readFileSync(SAVE_HOOK, 'utf8');
    const m = /body:\s*JSON\.stringify\(\{[\s\S]{0,400}?content:\s*\{\s*(\w+)\s*:/.exec(src);
    expect(m, 'could not locate the content payload in useSectionSave.ts').not.toBeNull();

    const key = m![1];
    expect(await hasContent({ [key]: 'some authored text' })).toBe(true);
  }, 60_000);

  it('no route computes has_content from the paragraphs key alone', async () => {
    // The durable fence. Three copies of this expression are how the server
    // drifted from the editor; a fourth would do it again.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === 'dist') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.ts$/.test(e.name) || /\.test\.ts$/.test(e.name)) continue;
        // Comments stripped first: section-content.ts documents the expression
        // it replaced, and a guard that fails on the file describing the fix is
        // the failure mode _strip-comments.ts exists for.
        const src = stripComments(fs.readFileSync(p, 'utf8'));
        const re = /->\s*'paragraphs'\s*\)?\s*IS\s+NOT\s+NULL/gi;
        for (const mm of src.matchAll(re)) {
          const line = src.slice(0, mm.index).split('\n').length;
          offenders.push(`${path.relative(REPO_ROOT, p)}:${line}`);
        }
      }
    };
    walk(path.join(REPO_ROOT, 'server'));
    expect(offenders).toEqual([]);
  }, 60_000);
});

describe('the fragment is not an injection surface', () => {
  it('refuses anything that is not a plain or qualified identifier', () => {
    // Every caller passes a hard-coded string today. The guard is what keeps a
    // future caller from making this the first templated-SQL hole in the file.
    expect(() => sectionHasContentSql("content) OR true --")).toThrow(/unsafe column/);
    expect(() => sectionHasContentSql('a.b.c')).toThrow(/unsafe column/);
    expect(() => sectionHasContentSql('ds.content')).not.toThrow();
    expect(() => sectionHasContentSql()).not.toThrow();
  });
});

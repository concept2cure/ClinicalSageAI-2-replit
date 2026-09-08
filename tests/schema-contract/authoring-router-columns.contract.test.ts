/**
 * Contract: every SQL statement in authoring.router.ts references columns that
 * actually exist.
 *
 * ── The bug class ─────────────────────────────────────────────────────────────
 * PostgreSQL rejects an unknown column at PLAN time, so a statement naming one
 * is not "usually fine" — it fails 100% of the time, on every request, with
 * 42703. This router shipped several:
 *
 *   GET /templates          selected t.name, t.module, t.region, t.description,
 *                           t.section_count and t.active — six columns the table
 *                           does not have (it has template_name, regions,
 *                           is_active). The endpoint 500'd on every request it
 *                           had ever received, and the only caller
 *                           (AuthoringCreateExport.tsx:53) swallows the rejection
 *                           in a catch that leaves the picker blank-only. So the
 *                           "Start from" template dropdown silently offered
 *                           nothing but "None" for the life of the feature,
 *                           with no error anywhere a user or operator would see.
 *
 *   POST /docs/:id/apply-template
 *                           used document_id, order_idx, created_by and
 *                           updated_by across a SELECT, an UPDATE and an INSERT.
 *                           authoring_sections has doc_id and order_index and
 *                           neither of the others. Applying a template had never
 *                           once succeeded.
 *
 * A previous encounter with the same class left the comment
 * `// template_type filter removed - column doesn't exist` — which patched one
 * filter, and was itself wrong (template_type does exist). Fixing them one
 * symptom at a time is why they kept coming back; this gate covers the file.
 *
 * ── Mechanism ─────────────────────────────────────────────────────────────────
 * PREPARE plans a statement without executing it, so an unknown column raises
 * 42703 with no writes and no fixtures needed. Verified to behave identically in
 * PGlite and PostgreSQL.
 *
 * Statements are extracted from the router SOURCE rather than restated here, so
 * the gate cannot drift from the code it guards. Comments are stripped first —
 * apostrophes in prose ("doesn't", "no longer") otherwise parse as string
 * delimiters and produce fragments of English as fake SQL.
 *
 * ── Scope, stated rather than hidden ──────────────────────────────────────────
 * The harness provisions the tables this router owns. A statement that also
 * touches a table outside that set fails with 42P01 (undefined_table), which is
 * NOT this gate's concern and is skipped — but the skip count is asserted to
 * stay small and is logged, so the gate cannot quietly stop covering anything.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../ui/_strip-comments';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROUTER = path.join(REPO_ROOT, 'server/routes/authoring.router.ts');
/**
 * Migrations that define this router's tables, in apply order. The harness
 * applies the SAME files production does, so a column that exists here exists
 * there — the whole point of the gate.
 */
const MIGRATIONS = [
  'db/migrations/20260725_authoring_document_loop_tables.sql',
  // ALTERs authoring_documents with the governed-binding column c2c_document_id
  // the router reads (WHERE c2c_document_id IS NOT NULL) — on the durable applier
  // (scripts/db/migration-set.mjs) but previously absent from this list, so the
  // router's SQL referenced a column the test's schema had never created.
  'migrations/20260728_authoring_document_governed_binding.sql',
  'db/migrations/20260730_authoring_comments_router_columns.sql',
  // ALTERs doc_revisions above with the ledger columns the router now writes
  // (content/chain hashes, origin, input manifest) and installs the
  // append-only triggers. Same position the durable applier uses.
  'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
  'db/migrations/20260725_authoring_signatures_and_workflow.sql',
  'db/migrations/20260725_authoring_audit_trail.sql',
  'db/migrations/20260725_authoring_signature_freeze_binding.sql',
  'db/migrations/20260508_authoring_plans.sql',
  'migrations/20260728_authoring_comments_threading.sql',
  // The router's own tables (templates/tokens/template_guidance/template_usage/
  // section_guidance/export_history/tracked_change_decisions). The canonical-spine
  // refactor retired the router's runtime CREATE TABLE blocks and moved them here,
  // so this migration is now their only definition.
  'db/migrations/20260730_authoring_runtime_ddl.sql',
  'migrations/20260728_authoring_reviews.sql',
].map((r) => path.join(REPO_ROOT, r));

/** SQL string literals in the router that touch the tables it owns. */
function extractStatements(src: string): string[] {
  const code = stripComments(src);
  const TABLES = /(authoring_\w+|doc_revisions|doc_permissions|template_guidance)\b/;
  const STARTS_WITH_SQL = /^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i;
  // Backtick literals, and single-quoted literals that cannot span lines.
  const LITERAL = /`([^`\\]*(?:\\.[^`\\]*)*)`|'([^'\\\n]*)'/gs;

  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = LITERAL.exec(code)) !== null) {
    const s = m[1] ?? m[2] ?? '';
    if (!TABLES.test(s) || !STARTS_WITH_SQL.test(s)) continue;
    // Interpolated fragments are not valid SQL on their own; the router builds
    // those by concatenation and they are covered by the static parts.
    if (/\$\{/.test(s)) continue;
    out.push(s.trim());
  }
  return out;
}

/** The CREATE TABLE blocks the router itself runs at module load. */
function extractRuntimeDdl(src: string): string[] {
  const code = stripComments(src);
  const out: string[] = [];
  const LITERAL = /`([^`\\]*(?:\\.[^`\\]*)*)`/gs;
  let m: RegExpExecArray | null;
  while ((m = LITERAL.exec(code)) !== null) {
    const s = m[1] ?? '';
    if (/^\s*CREATE TABLE/i.test(s)) out.push(s.trim());
  }
  return out;
}

let pg: PGlite;
let statements: string[] = [];
const results: Array<{ sql: string; code?: string; message?: string }> = [];

beforeAll(async () => {
  const src = fs.readFileSync(ROUTER, 'utf8');
  statements = extractStatements(src);

  pg = new PGlite();
  // `users` is a core table, not an authoring one, so no migration in the list
  // below creates it — but the router LEFT JOINs it for author identity. A
  // minimal stand-in with the columns actually joined (u.id) is enough for
  // PREPARE to plan, and keeps a core-schema absence from masquerading as an
  // authoring defect.
  await pg.exec(`CREATE TABLE IF NOT EXISTS users (id serial PRIMARY KEY, name text, email text)`);
  // `c2c_documents` is the governed-filing store from another bundle, not an
  // authoring table. The governed-binding migration (in the list below) is
  // guarded on it existing and adds authoring_documents.c2c_document_id, which
  // the router reads (WHERE c2c_document_id IS NOT NULL). A minimal stand-in
  // with just the FK target (id) lets that migration's DO-block guard pass so
  // the column is created — same pattern as the `users` stub above.
  await pg.exec(`CREATE TABLE IF NOT EXISTS c2c_documents (id text PRIMARY KEY)`);
  // The router's own tables, exactly as the migrations define them. A migration
  // that cannot apply standalone (it depends on a table from another bundle) is
  // tolerated — the statements needing it then surface as 42P01 skips, which
  // the skip-budget assertion keeps visible.
  for (const file of MIGRATIONS) {
    await pg.exec(fs.readFileSync(file, 'utf8')).catch(() => { /* see above */ });
  }
  // Plus the tables the router creates at module load (templates, guidance,
  // tokens). Applied from the router's own DDL so the harness cannot disagree
  // with production about their shape.
  for (const ddl of extractRuntimeDdl(src)) {
    await pg.exec(ddl).catch(() => { /* depends on a table outside this set */ });
  }

  let n = 0;
  for (const sql of statements) {
    try {
      await pg.exec(`PREPARE stmt_${n++} AS ${sql}`);
      results.push({ sql });
    } catch (e) {
      const err = e as { code?: string; message?: string };
      results.push({ sql, code: err.code, message: err.message });
    }
  }
}, 120_000);

afterAll(async () => { await pg?.close(); });

const short = (s: string) => s.replace(/\s+/g, ' ').slice(0, 110);

describe('authoring.router.ts SQL matches the schema', () => {
  it('extracts a meaningful number of statements — the gate is not vacuous', () => {
    // If the extractor breaks, every assertion below passes trivially.
    expect(statements.length).toBeGreaterThan(20);
  });

  it('no statement references a column its table does not have', () => {
    const undefinedColumn = results
      .filter((r) => r.code === '42703')
      .map((r) => `${r.message}\n    in: ${short(r.sql)}`);
    expect(undefinedColumn).toEqual([]);
  });

  it('this router writes to no table that nobody creates', () => {
    // This used to be a ratchet of eight. Every endpoint touching one of them
    // was an unconditional 42P01, so document reviews, comment activity, audit
    // read-back, AI suggestions, compliance scores, suggestion feedback,
    // checklists and change requests had never once worked. All eight are
    // resolved, and deliberately not all the same way:
    //
    //   authoring_reviews          CREATED (migrations/20260728_authoring_reviews.sql).
    //                              Review-and-approve is not optional in a
    //                              regulated authoring product and the handler
    //                              code was already correct — JWT identity,
    //                              tenant-scoped throughout. Only DDL was missing.
    //   authoring_audit_events     PHANTOM NAME. Nothing ever wrote it; every
    //                              writer targets authoring_audit_trail, which
    //                              exists and is on the durable path. The reader
    //                              was repointed at the ledger that holds the data.
    //   authoring_comment_activity DUPLICATE LEDGER. Comment resolve/reopen/delete
    //                              now record through createAuditEvent into the
    //                              same authoring_audit_trail as every other
    //                              authoring mutation, so there is one audit
    //                              ledger and one reader instead of two.
    //   the remaining five         DELETED with their endpoints. Nothing in the
    //                              client called any of them; the AI-scoring pair
    //                              persisted "regulatory compliance scores"
    //                              derived from keyword regexes, and the
    //                              checklist / change-request statements carried
    //                              no tenant predicate at all — creating those
    //                              tables would have converted a 500 into a
    //                              working cross-tenant read.
    //
    // The list is empty and must stay empty. An entry appearing here means new
    // code was written against a table that does not exist — which is a 42P01
    // on every request, not an edge case.
    const KNOWN_MISSING: string[] = [];

    const missing = new Set<string>();
    for (const r of results.filter((x) => x.code === '42P01')) {
      const m = /relation "([a-z_]+)" does not exist/.exec(r.message ?? '');
      if (m) missing.add(m[1]);
    }
    const found = [...missing].sort();

    const unexpected = found.filter((t) => !KNOWN_MISSING.includes(t));
    expect(unexpected).toEqual([]);
    // Shrink-only: if a table is created, remove it from KNOWN_MISSING.
    expect(found.length).toBeLessThanOrEqual(KNOWN_MISSING.length);
  });

  it('the statements that matter are actually covered', () => {
    // Named explicitly so a regression in the extractor cannot silently drop
    // the two endpoints this gate was written for.
    const prepared = results.filter((r) => !r.code).map((r) => r.sql.replace(/\s+/g, ' '));
    expect(prepared.some((s) => /FROM authoring_templates t/i.test(s))).toBe(true);
    // Matched on the clause rather than the column list: overwrite mode also
    // selects `content` so it can snapshot what it is about to replace, and
    // pinning the projection would make this assertion break on a correct
    // change — which it did, the first time that snapshot was added.
    expect(prepared.some((s) => /FROM authoring_sections WHERE doc_id = \$1 AND tenant_id/i.test(s))).toBe(true);
    expect(prepared.some((s) => /UPDATE authoring_sections\s+SET title/i.test(s))).toBe(true);
    expect(prepared.some((s) => /INSERT INTO authoring_sections \(id, doc_id, code, title, order_index/i.test(s))).toBe(true);
  });
});

/**
 * Contract: a test harness that builds the authoring schema must build ALL of
 * it — every applier file that ALTERs a table the harness creates.
 *
 * ── What this exists to catch ─────────────────────────────────────────────────
 * Fourteen harnesses stand up a real Postgres engine (PGlite) from their OWN
 * hard-coded list of db/migrations files, then drive the real
 * server/routes/authoring.router.ts against it. Each list is a hand-maintained
 * copy of part of the deploy, and a copy drifts:
 *
 *   • 20260817_doc_revisions_immutable_ledger.sql was registered with the
 *     durable applier but with none of those lists. Six harnesses built a
 *     doc_revisions with no ledger columns and ran a router that writes them —
 *     11 assertions failed, in tests whose subject was permissions and filing,
 *     not revisions.
 *   • 20260730_authoring_comments_router_columns.sql had ALREADY drifted the
 *     same way, out of eight lists, before that. Nothing failed yet only
 *     because those harnesses do not touch the comment columns — a latent
 *     break waiting for the first test that does.
 *
 * The failure mode is not "a test is wrong". It is that the proofs run against
 * a schema no deployment would ever have, so a green suite stops meaning the
 * deployed shape works. Registering a migration with the applier is one edit;
 * remembering the fourteen private copies is not something to hold by memory.
 *
 * ── The rule ──────────────────────────────────────────────────────────────────
 * ALTER-closure. If a harness lists any file from AUTHORING_SUBSYSTEM_FILES, and
 * the files it lists CREATE table T, then every applier file that ALTERs T must
 * be in that list too. Ordering is the harness's business; presence is not.
 *
 * This is deliberately narrow: only the applier's own files are required, and
 * only when the harness already builds the table being altered. A harness that
 * stays away from the authoring subsystem is untouched by this gate.
 *
 * ── Listed must mean applied ──────────────────────────────────────────────────
 * The closure rule above is satisfied by the TEXT of a filename appearing in a
 * harness, and that is a hole a fix walked straight into. Three harnesses build
 * their schema as a sequence of `await pglite.exec(migration('…'))` statements,
 * not as an array; two filenames were inserted into that sequence in array
 * style, as bare strings:
 *
 *   await pglite.exec(migration('db/migrations/…_loop_tables.sql'));
 *   'db/migrations/20260817_doc_revisions_immutable_ledger.sql',   // <- no-op
 *
 * A bare string statement evaluates and is discarded. The migration was never
 * applied, the closure rule above was satisfied, and the suite stayed green
 * because those three harnesses do not yet read the ledger columns — the exact
 * latent break this gate exists to prevent, reintroduced by the gate's own fix.
 * (tsc caught it as TS2695, one job after the one that was failing.)
 *
 * So the second rule: a migration literal must sit inside a bracket — a call
 * argument or an array element. Anything else is a mention, not an application.
 *
 * ── Scope ─────────────────────────────────────────────────────────────────────
 * Static: it reads source text, so it proves the file is listed AND passed to
 * something, not that the call it is passed to ran. The execution half is
 * covered by authoring-durable-applier.contract.test.ts, which runs the real
 * applier.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTHORING_SUBSYSTEM_FILES } from '../../scripts/db/authoring-subsystem.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SEARCH_ROOTS = ['tests', 'server'];
const MIGRATION_LITERAL = /'(db\/migrations\/[^']+\.sql)'/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, out);
    } else if (/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Tables a migration file CREATEs and ALTERs. */
function tablesOf(relPath: string): { created: Set<string>; altered: Set<string> } {
  const abs = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(abs)) return { created: new Set(), altered: new Set() };
  const sql = fs.readFileSync(abs, 'utf8');
  const names = (re: RegExp) =>
    new Set([...sql.matchAll(re)].map((m) => m[1].toLowerCase()));
  return {
    created: names(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([a-z0-9_.]+)/gi),
    altered: names(/ALTER TABLE(?:\s+IF EXISTS)?\s+([a-z0-9_.]+)/gi),
  };
}

const APPLIER_FILES: string[] = [...AUTHORING_SUBSYSTEM_FILES];
const applierMeta = new Map(APPLIER_FILES.map((f) => [f, tablesOf(f)]));

const TEST_FILES = SEARCH_ROOTS.flatMap((root) => walk(path.join(REPO_ROOT, root)));

/**
 * Migration literals that are a bare expression statement — mentioned, never
 * passed to anything.
 *
 * Bracket-aware, because the surrounding bracket is what separates the two
 * shapes: an array element or a call argument sits inside `[` or `(`, while a
 * bare statement sits directly in a `{` block (or at module top level). The
 * token before it disambiguates the rest — `= '…'`, `: '…'`, `case '…'` are
 * bindings, not statements. Comments and nested strings are skipped so a
 * filename inside a SQL string or a doc comment is not mistaken for code.
 */
function bareStatementLiterals(src: string): { file: string; line: number }[] {
  const stack: string[] = [];
  const out: { file: string; line: number }[] = [];
  const STATEMENT_START = new Set([';', '{', '}', ',', '']);
  let prev = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      const start = i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i++;
        i++;
      }
      const text = src.slice(start, i + 1);
      const m = /^'(db\/migrations\/[^']+\.sql)'$/.exec(text);
      const enclosing = stack.length ? stack[stack.length - 1] : '';
      if (m && (enclosing === '' || enclosing === '{') && STATEMENT_START.has(prev)) {
        out.push({ file: m[1], line: src.slice(0, start).split('\n').length });
      }
      prev = "'";
      i++;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') stack.push(c);
    else if (c === ')' || c === ']' || c === '}') stack.pop();
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

/** Every harness that lists at least one applier migration, with its list. */
const harnesses = TEST_FILES
  .map((abs) => {
    const listed = [
      ...fs.readFileSync(abs, 'utf8').matchAll(MIGRATION_LITERAL),
    ].map((m) => m[1]);
    return { file: path.relative(REPO_ROOT, abs), listed };
  })
  .filter((h) => h.listed.some((f) => APPLIER_FILES.includes(f)));

describe('authoring migration lists in test harnesses are ALTER-closed', () => {
  it('finds the harnesses at all — the gate is not vacuous', () => {
    // If a refactor moves these lists somewhere this scan cannot see, the gate
    // would pass by finding nothing. It must keep finding the real population.
    expect(harnesses.length).toBeGreaterThanOrEqual(10);
  });

  it('and the applier itself still declares files that ALTER what it creates', () => {
    // The rule is only meaningful while the applier ships ALTER files at all.
    const altering = APPLIER_FILES.filter((f) => applierMeta.get(f)!.altered.size > 0);
    expect(altering.length).toBeGreaterThan(0);
  });

  it('no harness builds a table and then skips an applier file that alters it', () => {
    const violations: string[] = [];

    for (const h of harnesses) {
      const created = new Set<string>();
      for (const f of h.listed) for (const t of tablesOf(f).created) created.add(t);

      for (const applierFile of APPLIER_FILES) {
        if (h.listed.includes(applierFile)) continue;
        const altersBuiltTable = [...applierMeta.get(applierFile)!.altered].filter((t) =>
          created.has(t),
        );
        if (altersBuiltTable.length > 0) {
          violations.push(
            `${h.file}\n    builds ${altersBuiltTable.join(', ')} but does not apply ${applierFile}`,
          );
        }
      }
    }

    expect(violations, `\n${violations.join('\n')}\n`).toEqual([]);
  });

  it('lists its migrations as calls or array elements, never as bare strings', () => {
    const violations: string[] = [];

    for (const abs of TEST_FILES) {
      for (const lit of bareStatementLiterals(fs.readFileSync(abs, 'utf8'))) {
        violations.push(
          `${path.relative(REPO_ROOT, abs)}:${lit.line}\n    '${lit.file}' is a bare string statement — mentioned, never applied`,
        );
      }
    }

    expect(violations, `\n${violations.join('\n')}\n`).toEqual([]);
  });
});

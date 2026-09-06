#!/usr/bin/env node
/**
 * Drizzle tenant-scope ratchet — an HTTP-reachable query on an org-scoped table
 * must constrain the organization.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * `server/routes/c2c/tasks.ts` filtered five of its seven handlers on `projectId`
 * alone. `project_tasks.id` and `projects.id` are both serial and the router sits
 * behind `authMiddleware` only, so any authenticated user of any tenant could
 * read another tenant's task list and health score by counting up — and the two
 * create paths read the project unscoped and then used THAT project's
 * organizationId for the insert, so rows landed attributed to the victim.
 *
 * The PUT and DELETE twins had already been fixed, and the note left at that fix
 * says exactly why nothing caught the rest:
 *
 *     "The static tenant-isolation gate could not see it because it scans raw
 *      SQL literals and this is a Drizzle query-builder call."
 *
 * That is the gap this closes. `check-tenant-entry-points.mjs` enumerates the
 * ways INTO tenant data; the raw-SQL scanner reads string literals. Neither can
 * see `db.select().from(projectTasks).where(eq(projectTasks.projectId, id))`.
 *
 * ── What it checks ───────────────────────────────────────────────────────────
 * For every Drizzle statement in `server/routes/**` and `server/api/**` that
 * touches a table whose model declares `organizationId`, the statement must
 * mention an organization column somewhere. That is deliberately a LOW bar: it
 * cannot tell a correct predicate from a decorative one, and it is not trying
 * to. It catches the shape that has now bitten this repo twice — a query on
 * tenant data with no organization anywhere in it.
 *
 * Scope is HTTP-reachable code on purpose. A service is usually called with an
 * already-scoped id, and flagging every one of those would bury the finding that
 * matters. A route handler takes its ids from the URL.
 *
 * ── Ratchet, not a wall ──────────────────────────────────────────────────────
 * There were 153 such statements when this landed. They are recorded in
 * scripts/ci/drizzle-tenant-scope-baseline.json and the gate fails only on a NEW
 * one. Some baselined entries are false positives; some are real. Shrink the
 * list, never grow it, and re-run with --write-baseline after fixing a batch.
 *
 * Usage:
 *   node scripts/ci/check-drizzle-tenant-scope.mjs
 *   node scripts/ci/check-drizzle-tenant-scope.mjs --list           # print all sites
 *   node scripts/ci/check-drizzle-tenant-scope.mjs --write-baseline
 *
 * Exit 0 when no unbaselined site exists, 1 otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:drizzle-tenant-scope]';
const BASELINE = path.join(repoRoot, 'scripts', 'ci', 'drizzle-tenant-scope-baseline.json');

const listOnly = process.argv.includes('--list');
const writeBaseline = process.argv.includes('--write-baseline');

/** Every .ts file under a directory, excluding tests. */
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      walk(full, out);
    } else if (e.name.endsWith('.ts') && !e.name.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Drizzle models that declare an `organizationId` column — the tables where a
 * missing organization predicate is a tenant-isolation question at all.
 */
function orgScopedTables() {
  const files = [
    ...walk(path.join(repoRoot, 'shared', 'schema')),
    path.join(repoRoot, 'shared', 'schema.ts'),
  ].filter(f => fs.existsSync(f));

  const tables = new Set();
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/export const (\w+)\s*=\s*(?:pgTable|\w+\.table)\(/g)) {
      const start = m.index + m[0].length;
      // Block extent: up to the next top-level `export const`, which is where
      // the next model begins. Good enough to tell whether THIS model declares
      // an organizationId.
      const next = src.indexOf('export const', start);
      const block = src.slice(start, next > 0 ? next : src.length);
      if (/\borganizationId\s*:/.test(block)) tables.add(m[1]);
    }
  }
  return tables;
}

/** The text of one Drizzle statement, from `db.<verb>` to its terminating `;`. */
function statementAt(src, index) {
  let depth = 0;
  for (let i = index; i < Math.min(src.length, index + 4000); i++) {
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ';' && depth <= 0) return src.slice(index, i);
  }
  return src.slice(index, index + 4000);
}

const tables = orgScopedTables();
const sites = [];

for (const file of [
  ...walk(path.join(repoRoot, 'server', 'routes')),
  ...walk(path.join(repoRoot, 'server', 'api')),
]) {
  const rel = path.relative(repoRoot, file);
  const src = fs.readFileSync(file, 'utf8');
  const seen = new Map();

  for (const m of src.matchAll(/\bdb\s*\.\s*(select|insert|update|delete)\b/g)) {
    const chunk = statementAt(src, m.index);
    const hit = [...tables].find(t => new RegExp(`\\b${t}\\b`).test(chunk));
    if (!hit) continue;
    if (/organizationId|organization_id|orgId\b/.test(chunk)) continue;

    // Key by file + verb + table, with an occurrence index, so the entry is
    // stable across unrelated edits and line-number drift. Two identical
    // statements in one file get :0 and :1.
    const base = `${rel}::${m[1]}:${hit}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    sites.push({ key: `${base}#${n}`, line: src.slice(0, m.index).split('\n').length });
  }
}

sites.sort((a, b) => a.key.localeCompare(b.key));

if (listOnly) {
  for (const s of sites) console.log(`${s.key}  (line ${s.line})`);
  console.log(`\n${TAG} ${sites.length} site(s) across ${tables.size} org-scoped tables.`);
  process.exit(0);
}

if (writeBaseline) {
  fs.writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        note:
          'HTTP-reachable Drizzle statements on org-scoped tables with no organization predicate. ' +
          'Some are false positives (a query already narrowed by an org-verified key); some are real ' +
          'tenant-isolation gaps. This list must never grow. Fix a batch, then re-run with ' +
          '--write-baseline to shrink it. See scripts/ci/check-drizzle-tenant-scope.mjs.',
        generatedBy: 'scripts/ci/check-drizzle-tenant-scope.mjs --write-baseline',
        sites: sites.map(s => s.key),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`${TAG} baseline written — ${sites.length} site(s).`);
  process.exit(0);
}

let baseline = { sites: [] };
if (fs.existsSync(BASELINE)) baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const known = new Set(baseline.sites ?? []);

const added = sites.filter(s => !known.has(s.key));
const removed = [...known].filter(k => !sites.some(s => s.key === k));

if (added.length) {
  console.error(`${TAG} FAIL — ${added.length} NEW unscoped statement(s) on org-scoped tables.\n`);
  for (const s of added) console.error(`  ${s.key}  (line ${s.line})`);
  console.error(
    `\n${TAG} A route handler takes its ids from the URL, and a serial id is enumerable across\n` +
      '  the estate. Constrain the organization in the statement, as the sibling handlers in\n' +
      '  server/routes/c2c/tasks.ts do:\n' +
      '      .where(and(eq(table.someId, id), eq(table.organizationId, getOrganizationId(req))))\n' +
      '  A lookup used only to derive an org id must itself be org-scoped, or it is a way to\n' +
      "  read another tenant's row and adopt its tenancy.",
  );
  process.exit(1);
}

console.log(
  `${TAG} OK — ${sites.length} site(s), all baselined` +
    (removed.length ? `; ${removed.length} fixed since the baseline was written` : '') +
    '.',
);
if (removed.length) {
  console.log(`${TAG} Re-run with --write-baseline to bank the ${removed.length} fix(es).`);
}

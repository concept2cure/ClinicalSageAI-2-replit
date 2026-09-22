#!/usr/bin/env node
/**
 * CI Guard: a COLUMN the server queries must be added by something a real
 * deployment actually RUNS.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * check-migration-reachability.mjs closed this question for TABLES, and has
 * ratcheted its baseline to zero. The same blind spot stayed wide open one level
 * down. A migration that only ALTERs — adding a column to a table that already
 * exists — creates no table, so that guard never looks at it, and neither does
 * ci:unbacked-tables. The file sits in db/migrations/, on no applier, and every
 * gate stays green while the column it adds exists on no real database.
 *
 * Six such defects were found by hand between 2026-09-08 and 2026-09-20, each
 * confirmed by running the server's own statement against a database built by
 * scripts/db/install-fresh.mjs plus the whole migration set:
 *
 *   audit_events.hmac_seal ......... the Part 11 §11.70 seal verifier, 42703
 *   gdpr_…_requests.execution_evidence  every DSAR completion, 42703
 *   ai_claims.verifier_flags ....... claim persistence in chat, 42703
 *   ivdr_binder_evidence.source_type  attaching evidence to a claim, 42703
 *   ivdr_packs.{hashes,warnings} ... every IVDR pack build's last step, 42703
 *   c2c_ana_actions.command ........ (a CHECK, not a column — same cause)
 *
 * Each was one line of wiring away from working, and nothing could see them.
 * The contract test un-wires each of the five column migrations and requires
 * this guard to name its column.
 *
 * ── How it decides ───────────────────────────────────────────────────────────
 * A column is DURABLE when something a deployment runs creates it:
 *   · an `ALTER TABLE … ADD [COLUMN]` / `RENAME COLUMN … TO` in a durable file —
 *     every action of a multi-clause ALTER, not just the first;
 *   · a `CREATE TABLE` body in a durable file, parsed by balanced parentheses;
 *   · a catalog sweep in a durable file — `EXECUTE format('ALTER TABLE %I.%I ADD
 *     COLUMN …')` over a `table_name LIKE/IN`, ARRAY or VALUES set — but ONLY for
 *     tables created EARLIER in apply order, because a sweep can only touch a
 *     table that already exists (stab_studies.tenant_id is vouched this way; a
 *     stab_* table created after the sweep would not be);
 *   · a public table in the drizzle push surface (push creates nothing outside
 *     public), or runtime DDL in server code.
 * "Durable", the apply order and the set of durably-created tables all come from
 * durableSurface() in the table guard, so the two levels cannot disagree.
 *
 * A column is ORPHANED when it is not durable and some non-durable file adds it
 * (an ALTER, or a CREATE TABLE of a table that exists in another shape).
 *
 * A column is REFERENCED when a server SQL string names it ON THAT RELATION,
 * resolved through the clause it appears in (lib/sql-columns.mjs): an INSERT
 * column list, an UPDATE SET target, `alias.col` through the alias's binding, or
 * a bare column that no other relation in scope durably has. Not "the table word
 * and the column word both occur in the string" — that rule reported
 * documents.tags for `SELECT p.tags, (…) AS documents FROM regulatory_programs p`.
 *
 * A table nothing durable creates is skipped as the TABLE guard's finding — sound
 * only because both guards read the same server files (serverSqlFiles).
 *
 * ── Baseline ─────────────────────────────────────────────────────────────────
 * column-reachability-baseline.json maps a column to a WRITTEN reason. An entry
 * without one fails the guard, and so does an entry that no longer reproduces
 * (remove it — the ratchet only turns one way). --write-baseline keeps existing
 * reasons and adds new findings with an empty one, which fails until a human
 * writes it: a baseline entry is a decision, not a snapshot.
 *
 * Usage:  node scripts/ci/check-column-reachability.mjs [--write-baseline]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  durableSurface,
  serverSqlFiles,
  sqlishSegments,
  stripSqlComments,
  repoRoot,
} from './check-migration-reachability.mjs';
import {
  columnsAddedIn,
  columnsCreatedIn,
  dynamicColumnAdds,
  drizzleColumns,
  columnReferences,
  referencesColumn,
  lastPart,
  splitKey,
} from './lib/sql-columns.mjs';

const __filename = fileURLToPath(import.meta.url);
const TAG = '[ci:column-reachability]';
const BASELINE = path.join(repoRoot, 'scripts', 'ci', 'column-reachability-baseline.json');
const read = (p) => fs.readFileSync(p, 'utf8');
const toRel = (abs) => path.relative(repoRoot, abs).split(path.sep).join('/');

/**
 * Every migration .sql the guard reads, comment-stripped. db/migrations/_legacy
 * and _archive are skipped as the table guard skips them; migrations/<subdir>
 * is read and is non-durable (durableSurface decides).
 */
export function migrationSources() {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!/^(_archive|meta|node_modules)$/.test(e.name) && !(e.name === '_legacy' && toRel(dir) === 'db/migrations')) walk(p);
      } else if (e.name.endsWith('.sql')) out.push({ rel: toRel(p), sql: stripSqlComments(read(p)) });
    }
  };
  walk(path.join(repoRoot, 'migrations'));
  walk(path.join(repoRoot, 'db/migrations'));
  return out;
}

/**
 * Which columns exist on a deployed database, and which are added only by files
 * nothing runs.
 *
 * @param {ReturnType<typeof durableSurface>} surface
 * @param {{rel: string, sql: string}[]} sqlFiles comment-stripped migrations
 * @param {{drizzle: string[], runtimeDdl: string[]}} sources file contents
 */
export function buildColumnSurface(surface, sqlFiles, { drizzle = [], runtimeDdl = [] } = {}) {
  const durable = new Set(); // "rel.column"
  const orphanAdds = new Map(); // "rel.column" -> [files]
  const unresolvedDynamic = []; // {file, snippet}
  const sweeps = [];
  const orphan = (key, rel) => {
    if (!orphanAdds.has(key)) orphanAdds.set(key, []);
    if (!orphanAdds.get(key).includes(rel)) orphanAdds.get(key).push(rel);
  };

  for (const { rel, sql } of sqlFiles) {
    const idx = surface.applyIndex(rel);
    const adds = columnsAddedIn(sql);
    const creates = columnsCreatedIn(sql);
    if (idx === null) {
      for (const { table, column } of [...adds, ...creates]) orphan(`${table}.${column}`, rel);
      continue;
    }
    for (const { table, column } of [...adds, ...creates]) durable.add(`${table}.${column}`);
    const dyn = dynamicColumnAdds(sql);
    for (const sw of dyn.sweeps) sweeps.push({ rel, idx, ...sw });
    for (const snippet of dyn.unresolved) unresolvedDynamic.push({ file: rel, snippet });
  }

  // A catalog sweep vouches only for tables that exist when it runs.
  const createdBefore = (t, idx) => (surface.creatorIndex.get(t) ?? Number.POSITIVE_INFINITY) < idx;
  for (const sw of sweeps) {
    for (const t of surface.durableTables) {
      const schema = t.includes('.') ? t.slice(0, t.lastIndexOf('.')) : 'public';
      if (sw.schema && sw.schema !== schema) continue;
      const name = lastPart(t);
      if (!(sw.names.includes(name) || sw.patterns.some((re) => re.test(name)))) continue;
      if (!createdBefore(t, sw.idx)) continue;
      for (const c of sw.columns) durable.add(`${t}.${c}`);
    }
    for (const [tbl, col] of sw.pairs) {
      const t = sw.schema && sw.schema !== 'public' ? `${sw.schema}.${tbl}` : tbl;
      if (createdBefore(t, sw.idx)) durable.add(`${t}.${col}`);
    }
  }

  // drizzle push creates public tables only; see durableSurface.
  for (const src of drizzle) {
    for (const { table, column } of drizzleColumns(src).columns) {
      if (!table.includes('.')) durable.add(`${table}.${column}`);
    }
  }
  for (const src of runtimeDdl) {
    const sql = stripSqlComments(src);
    for (const { table, column } of [...columnsAddedIn(sql), ...columnsCreatedIn(sql)]) durable.add(`${table}.${column}`);
  }

  return { durable, orphanAdds, unresolvedDynamic };
}

/** Every SQL-looking string in server code: the same files the table guard reads. */
export function serverSegments() {
  const out = [];
  for (const abs of serverSqlFiles()) {
    for (const sql of sqlishSegments(read(abs))) out.push({ sql, file: toRel(abs) });
  }
  return out;
}

/**
 * Orphaned columns the server references.
 *
 * @param {{durable: Set<string>, orphanAdds: Map<string, string[]>}} columns
 * @param {Set<string>} durableTables
 * @param {{sql: string, file: string}[]} segments
 */
export function findUnreachableColumns({ durable, orphanAdds }, durableTables, segments) {
  const parsed = new Map(); // segment index -> columnReferences
  const refsOf = (i) => {
    if (!parsed.has(i)) parsed.set(i, columnReferences(segments[i].sql));
    return parsed.get(i);
  };
  const hasColumn = (rel, column) => durable.has(`${rel}.${column}`);
  const findings = [];
  for (const [key, files] of orphanAdds) {
    if (durable.has(key)) continue;
    const [table, column] = splitKey(key);
    // A table nothing durable creates is the TABLE guard's finding, not this
    // one. Both guards read serverSqlFiles(), so the deferral lands on a guard
    // that can see the reference.
    if (!durableTables.has(table)) continue;
    const word = new RegExp(`\\b${column}\\b`, 'i');
    for (let i = 0; i < segments.length; i++) {
      if (!word.test(segments[i].sql)) continue;
      if (referencesColumn(refsOf(i), table, column, hasColumn)) {
        findings.push({ column: key, addedOnlyBy: [...files].sort(), referencedIn: segments[i].file });
        break;
      }
    }
  }
  return findings.sort((a, b) => a.column.localeCompare(b.column));
}

/** The whole check against the repository, with an optional substitute set. */
export function scanRepository({ setFiles } = {}) {
  const surface = durableSurface(setFiles ? { setFiles } : {});
  const runtimeDdl = serverSqlFiles()
    .filter((abs) => abs.endsWith('.ts'))
    .map(read)
    .filter((src) => /\b(CREATE|ALTER)\s+TABLE\b/i.test(src));
  const columns = buildColumnSurface(surface, migrationSources(), {
    drizzle: surface.drizzleFiles.map(read),
    runtimeDdl,
  });
  const findings = findUnreachableColumns(columns, surface.durableTables, serverSegments());
  return { findings, columns };
}

const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isEntryPoint) {
  const writeBaseline = process.argv.includes('--write-baseline');
  const { findings, columns } = scanRepository();
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(read(BASELINE)) : { columns: {} };
  const entries = baseline.columns ?? {};

  if (writeBaseline) {
    const next = {};
    for (const f of findings) {
      next[f.column] = { reason: entries[f.column]?.reason ?? '', addedOnlyBy: f.addedOnlyBy, referencedIn: f.referencedIn };
    }
    fs.writeFileSync(
      BASELINE,
      `${JSON.stringify(
        {
          _comment:
            'Columns the server queries whose ONLY creator is a migration on no durable apply path — they exist on no real database, so the statements naming them raise 42703. Every entry needs a written reason; an empty one fails the guard. Resolve an entry (put its migration on an applier after the file that creates the table, or delete the dead reference), then remove it here. Goal: empty.',
          columns: next,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`${TAG} baseline written — ${findings.length} column(s); every new entry needs a reason before the guard passes.`);
    process.exit(0);
  }

  let failed = false;
  const found = new Set(findings.map((f) => f.column));
  const fresh = findings.filter((f) => !(f.column in entries));
  const unreasoned = Object.entries(entries).filter(([, e]) => !String(e?.reason ?? '').trim()).map(([k]) => k);
  const stale = Object.keys(entries).filter((k) => !found.has(k));

  if (fresh.length) {
    failed = true;
    console.error(`${TAG} ❌ ${fresh.length} column(s) the server queries are added only by a migration nothing runs:`);
    for (const f of fresh) {
      console.error(`  ${f.column}`);
      console.error(`      added only by : ${f.addedOnlyBy.join(', ')}`);
      console.error(`      queried in    : ${f.referencedIn}`);
    }
    const consolidatedOnly = fresh.filter((f) => f.addedOnlyBy.every((x) => x.startsWith('db/migrations/_consolidated/')));
    console.error(
      `\n  Put the migration on an applier (C2C_MIGRATION_FILES, positioned after the file that\n` +
        `  creates the table — CLAUDE.md RULE 1), or delete the reference if the feature is dead.`,
    );
    if (consolidatedOnly.length) {
      console.error(
        `  EXCEPT ${consolidatedOnly.map((f) => f.column).join(', ')}: added only under db/migrations/_consolidated/,\n` +
          `  which must never be wired. Delete the reference, or write a NEW replay-safe migration in the set.`,
      );
    }
  }
  if (unreasoned.length) {
    failed = true;
    console.error(`${TAG} ❌ baseline entries with no written reason: ${unreasoned.join(', ')}`);
  }
  if (stale.length) {
    failed = true;
    console.error(`${TAG} ❌ baselined column(s) no longer found — remove them to ratchet down: ${stale.join(', ')}`);
  }
  for (const u of columns.unresolvedDynamic) {
    console.warn(`${TAG} note: dynamic ALTER … ADD in ${u.file} has no resolvable table set; it vouches for nothing.`);
  }
  if (failed) process.exit(1);

  console.log(
    `${TAG} OK — ${columns.orphanAdds.size} column add(s) on no applier, ${findings.length} queried by the server` +
      `${findings.length ? ' (all baselined with reasons)' : ''}.`,
  );
}

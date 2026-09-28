#!/usr/bin/env node
/**
 * CI Guard: a jsonb operator applied to a plain `json` column.
 *
 * WHY THIS EXISTS
 * ---------------
 * Most JSON columns in this schema are `json`, not `jsonb` — Drizzle declares
 * roughly a thousand of them with `json('…')` under shared/. The two types do
 * not share operators, and PostgreSQL has no implicit cast between them in an
 * expression (json → jsonb is an ASSIGNMENT cast only). So every one of these
 * fails on every execution, on every database, whatever the data:
 *
 *   metadata = metadata || $1::jsonb                 operator does not exist: json || jsonb
 *   metadata = COALESCE(metadata, '{}'::jsonb) || …  COALESCE could not convert type jsonb to json
 *   metadata = jsonb_set(COALESCE(metadata, …), …)   (same)
 *   metadata = jsonb_strip_nulls(metadata)           function jsonb_strip_nulls(json) does not exist
 *
 * and `json || 'text'` is worse: it resolves to TEXT concatenation and yields
 * `{}{"a":1}`, which the json column then refuses on assignment.
 *
 * On 2026-09-28 this was found in five features, each of which could never
 * save: the artifact tagger (concept2cure_artifacts.metadata, both branches), a
 * GDPR erasure, the submission-chat rewrite, contradiction resolution (twice)
 * and AnA's program-metadata tool (regulatory_programs.metadata). Every one had
 * unit tests, and every one of those tests mocked the pool — a mock accepts any
 * SQL — so nothing had ever executed the statement against PostgreSQL.
 *
 * The correct form casts the column first; the assignment back into the json
 * column is implicit:
 *
 *   metadata = COALESCE(metadata::jsonb, '{}'::jsonb) || $1::jsonb
 *
 * WHAT THIS ENFORCES
 * ------------------
 * Column types come from the Drizzle models in shared/ (`json('col')` vs
 * `jsonb('col')`, under `pgTable(…)` and `pgSchema(…).table(…)`), minus any
 * column a migration later retypes with `ALTER TABLE … ALTER COLUMN … TYPE`.
 * When two models disagree about one column, the model drizzle.config.ts
 * pushes wins, because drizzle-kit push is what creates it; a disagreement it
 * cannot resolve counts as json, since the cast form is correct on both. A
 * table NO pushed model declares exists only because a migration creates it,
 * so that migration's json/jsonb wins over a stale model. With those two rules
 * the model's json set equals the reference database's on every table both
 * know (904 of 904, 2026-09-28).
 * No database is needed: CI has none.
 *
 * Server code (server/, tests excluded) is read literal by literal. Within:
 *   · `UPDATE <table> [AS a] SET col = <expr>, …`
 *   · `INSERT INTO <table> [AS a] … ON CONFLICT … DO UPDATE SET col = <expr>`
 *     (where `<table>.col`, `a.col` and `EXCLUDED.col` all name the json value)
 *   · a Drizzle `sql\`…\`` fragment, where `${model.key}` names the column, and
 *     a bare name is resolved against the table of an enclosing `.update(model)`
 * a reference to a json column of the target table is a finding when, WITHOUT
 * first being cast (`col::jsonb`, `(…)::jsonb`, `CAST`, `to_jsonb(col)`), it is
 *   · an operand of a jsonb-only operator: || - #- @> <@ ? ?| ?& @? @@
 *   · an argument of a jsonb_* function (jsonb_set, jsonb_strip_nulls,
 *     jsonb_insert, …; not the "any"-typed builders jsonb_build_object & co.)
 *   · a COALESCE/NULLIF/GREATEST/LEAST argument alongside a jsonb argument.
 * `->` / `#>` on a json value stay json and are followed through; a COALESCE of
 * json arguments stays json and is followed through.
 *
 * NOT covered, and not claimed:
 *   · SQL assembled from separate JS strings (`sets.push('metadata = …')`) —
 *     the fragment carries no table, so it cannot be typed;
 *   · statements whose target table is an interpolation (`UPDATE ${t} SET`);
 *   · SELECT/WHERE expressions outside an UPDATE, upsert or sql`` fragment;
 *   · a CASE whose branches mix json and jsonb.
 *
 * BASELINE
 * --------
 * scripts/ci/json-operator-types-baseline.json, keyed `file#table.column` with
 * a count and a written reason. A finding not covered fails; an entry without a
 * reason fails; an entry that covers more than it finds is reported so it can
 * shrink. It starts EMPTY and there is no --write-baseline: every one of these
 * statements fails on every execution, so an entry is a decision a person
 * writes by hand, not a snapshot.
 *
 * USAGE
 *   node scripts/ci/check-json-operator-types.mjs              # the gate
 *   node scripts/ci/check-json-operator-types.mjs --verbose    # + model disagreements
 *   node scripts/ci/check-json-operator-types.mjs --selftest   # every branch, shown firing
 *   --root <dir>      read shared/, migrations/, db/migrations/ and server/ from <dir>
 *   --baseline <file> read the baseline from <file>
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { drizzleColumns, columnsRetypedIn, columnsCreatedIn, stripSqlComments, qualify } from './lib/sql-columns.mjs';
import { extractStringLiterals } from './lib/extract-string-literals.mjs';
import { requireScanRoots } from './lib/scan-roots.mjs';

const TAG = '[ci:json-operator-types]';
const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SELF), '..', '..');

const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const ROOT = path.resolve(argValue('--root', REPO_ROOT));
const BASELINE_PATH = path.resolve(
  argValue('--baseline', path.join(ROOT, 'scripts/ci/json-operator-types-baseline.json')),
);
const VERBOSE = args.includes('--verbose');

// ── Files ───────────────────────────────────────────────────────────────────

const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'build', '__tests__', '__mocks__', 'fixtures']);
const SKIP_FILE = /\.(test|spec|dbtest)\.[cm]?[jt]sx?$/;

function walk(dir, keep, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIR.has(e.name)) walk(full, keep, out);
    } else if (keep(e.name)) out.push(full);
  }
  return out;
}

const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

// ── Column types ────────────────────────────────────────────────────────────

/**
 * The Drizzle files drizzle.config.ts pushes, plus everything they
 * `export * from`. A table declared there is CREATED by drizzle-kit push with
 * that declaration's type, so it wins when two models disagree.
 */
function pushedSchemaFiles(root) {
  const out = new Set();
  let cfg;
  try {
    cfg = fs.readFileSync(path.join(root, 'drizzle.config.ts'), 'utf8');
  } catch {
    return out;
  }
  const block = /schema\s*:\s*\[([^\]]*)\]/.exec(cfg) || /schema\s*:\s*(['"][^'"]+['"])/.exec(cfg);
  const queue = block ? [...block[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => path.resolve(root, m[1])) : [];
  while (queue.length) {
    const f = queue.shift();
    if (out.has(f) || !fs.existsSync(f)) continue;
    out.add(f);
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/export\s+\*\s+from\s+['"](\.[^'"]+)['"]/g)) {
      const base = path.resolve(path.dirname(f), m[1]);
      for (const cand of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) queue.push(cand);
      }
    }
  }
  return out;
}

/**
 * The schema as this guard sees it:
 *   types     table → Map(column → 'json' | 'jsonb' | other builder)
 *   keys      table → Map(TS property → column)
 *   bindings  exported model variable → Set(table)
 *   retyped   'table.column' → type, from migrations
 *   widened   the json columns a migration retypes to jsonb
 *   migrationTyped  json in a model nothing pushes, jsonb in the migration that creates the table
 *   conflicts 'table.column' → { types, resolved, why }
 */
export function loadSchema(root = ROOT) {
  const pushed = pushedSchemaFiles(root);
  const decls = new Map(); // key → [{type, pushed}]
  const keys = new Map();
  const bindings = new Map();
  for (const file of walk(path.join(root, 'shared'), (n) => /\.ts$/.test(n) && !SKIP_FILE.test(n))) {
    const parsed = drizzleColumns(fs.readFileSync(file, 'utf8'));
    for (const { variable, table } of parsed.bindings) {
      if (!bindings.has(variable)) bindings.set(variable, new Set());
      bindings.get(variable).add(table);
    }
    for (const { table, column, type, key } of parsed.columns) {
      const k = `${table}.${column}`;
      if (!decls.has(k)) decls.set(k, []);
      decls.get(k).push({ type, pushed: pushed.has(file), file: rel(file) });
      if (!keys.has(table)) keys.set(table, new Map());
      keys.get(table).set(key, column);
    }
  }

  const retyped = new Map();
  const created = new Map(); // 'table.column' → Set(json | jsonb) from migration CREATE TABLEs
  for (const dir of ['migrations', 'db/migrations']) {
    // _consolidated and _legacy are archived snapshots no applier runs (see
    // check-model-migration-agreement.mjs); a retype there changes nothing.
    for (const file of walk(path.join(root, dir), (n) => n.endsWith('.sql'))) {
      if (/\/_(consolidated|legacy)\//.test(rel(file))) continue;
      const sql = stripSqlComments(fs.readFileSync(file, 'utf8'));
      for (const { table, column, type } of columnsRetypedIn(sql)) {
        retyped.set(`${table}.${column}`, { type, file: rel(file) });
      }
      for (const { table, column, type } of columnsCreatedIn(sql)) {
        if (type !== 'json' && type !== 'jsonb') continue;
        const k = `${table}.${column}`;
        if (!created.has(k)) created.set(k, new Set());
        created.get(k).add(type);
      }
    }
  }
  // Tables some pushed model declares: drizzle-kit push creates them first, so
  // a later `CREATE TABLE IF NOT EXISTS` in a migration changes nothing.
  const pushedTables = new Set();
  for (const [k, list] of decls) if (list.some((d) => d.pushed)) pushedTables.add(k.slice(0, k.lastIndexOf('.')));

  const types = new Map();
  const conflicts = new Map();
  const widened = [];
  const migrationTyped = [];
  for (const [k, list] of decls) {
    const cut = k.lastIndexOf('.');
    const table = k.slice(0, cut);
    const column = k.slice(cut + 1);
    const all = new Set(list.map((d) => d.type));
    let type = list[0].type;
    if (all.size > 1) {
      const fromPushed = new Set(list.filter((d) => d.pushed).map((d) => d.type));
      if (fromPushed.size === 1) type = [...fromPushed][0];
      else type = all.has('json') ? 'json' : type;
      conflicts.set(k, {
        declarations: list.map((d) => `${d.type} in ${d.file}${d.pushed ? ' (pushed)' : ''}`),
        resolved: type,
      });
    }
    // A table no pushed model declares exists only because a migration creates
    // it, so the migration's column type is the real one. Twenty-eight columns
    // (workflow_runs, approval_checkpoints, project_charters, …) are `json` in
    // a model drizzle.config.ts does not push and `jsonb` in the migration
    // that creates them — and in every provisioned database.
    const made = created.get(k);
    if (!pushedTables.has(table) && made?.size === 1 && type !== [...made][0]) {
      if (type === 'json') migrationTyped.push(k);
      type = [...made][0];
    }
    const r = retyped.get(k);
    if (r) {
      if (type === 'json' && r.type === 'jsonb') widened.push(k);
      type = r.type;
    }
    if (!types.has(table)) types.set(table, new Map());
    types.get(table).set(column, type);
  }
  return { types, keys, bindings, retyped, widened, migrationTyped, conflicts };
}

// ── SQL tokens ──────────────────────────────────────────────────────────────

const OPCHARS = '+-*/<>=~!@#%^&|`?';

/** Tokens of one SQL-bearing JS literal body. `${…}` is one `interp` token. */
export function tokenize(text) {
  const toks = [];
  const n = text.length;
  let i = 0;
  const push = (t, v, start, end) => toks.push({ t, v, pos: start, end });
  while (i < n) {
    const c = text[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '-' && text[i + 1] === '-') {
      const nl = text.indexOf('\n', i);
      i = nl < 0 ? n : nl;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const e = text.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === '$' && text[i + 1] === '{') {
      let d = 0;
      let j = i + 1;
      for (; j < n; j++) {
        if (text[j] === '{') d++;
        else if (text[j] === '}' && --d === 0) break;
      }
      push('interp', text.slice(i + 2, j).trim(), i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '$' && /[0-9]/.test(text[i + 1] || '')) {
      let j = i + 1;
      while (j < n && /[0-9]/.test(text[j])) j++;
      push('param', text.slice(i, j), i, j);
      i = j;
      continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_]\w*)?\$/.exec(text.slice(i));
      if (m) {
        const e = text.indexOf(m[0], i + m[0].length);
        const stop = e < 0 ? n : e + m[0].length;
        push('str', text.slice(i, stop), i, stop);
        i = stop;
        continue;
      }
    }
    if (c === "'") {
      let j = i + 1;
      for (; j < n; j++) {
        if (text[j] === "'") {
          if (text[j + 1] === "'") {
            j++;
            continue;
          }
          break;
        }
      }
      push('str', text.slice(i, j + 1), i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '"') {
      const e = text.indexOf('"', i + 1);
      const stop = e < 0 ? n : e;
      push('id', text.slice(i + 1, stop).toLowerCase(), i, stop + 1);
      toks[toks.length - 1].quoted = true;
      i = stop + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(text[j])) j++;
      push('id', text.slice(i, j).toLowerCase(), i, j);
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < n && /[0-9.eE]/.test(text[j])) j++;
      push('num', text.slice(i, j), i, j);
      i = j;
      continue;
    }
    if (c === ':' && text[i + 1] === ':') {
      push('::', '::', i, i + 2);
      i += 2;
      continue;
    }
    if ('(),;.[]'.includes(c)) {
      push(c, c, i, i + 1);
      i++;
      continue;
    }
    if (OPCHARS.includes(c)) {
      let j = i;
      while (
        j < n &&
        OPCHARS.includes(text[j]) &&
        !(text[j] === '-' && text[j + 1] === '-') &&
        !(text[j] === '/' && text[j + 1] === '*')
      )
        j++;
      push('op', text.slice(i, j), i, j);
      i = j;
      continue;
    }
    i++;
  }
  return toks;
}

/** Index of the matching bracket for every ( and [, and back. */
function matchBrackets(toks) {
  const m = new Array(toks.length).fill(-1);
  const stack = [];
  toks.forEach((t, i) => {
    if (t.t === '(' || t.t === '[') stack.push(i);
    else if (t.t === ')' || t.t === ']') {
      const o = stack.pop();
      if (o !== undefined) {
        m[o] = i;
        m[i] = o;
      }
    }
  });
  return m;
}

// ── Statements ──────────────────────────────────────────────────────────────

const isId = (t, v) => t && t.t === 'id' && !t.quoted && (v === undefined || t.v === v);

/** `[ONLY] [schema.]name` at j → { table, next } ; table null for an interpolation. */
function readRelation(toks, j) {
  if (isId(toks[j], 'only')) j++;
  const a = toks[j];
  if (!a) return null;
  if (a.t === 'interp') return { table: null, interp: a.v, next: j + 1 };
  if (a.t !== 'id') return null;
  if (toks[j + 1]?.t === '.' && toks[j + 2]?.t === 'id') return { table: qualify(a.v, toks[j + 2].v), next: j + 3 };
  return { table: qualify(null, a.v), next: j + 1 };
}

/** Where a SET list ends: WHERE / FROM / RETURNING / ; at depth 0, or an unmatched ). */
function setListEnd(toks, start) {
  let depth = 0;
  for (let k = start; k < toks.length; k++) {
    const t = toks[k];
    if (t.t === '(' || t.t === '[') depth++;
    else if (t.t === ')' || t.t === ']') {
      if (depth === 0) return k - 1;
      depth--;
    } else if (depth === 0 && (t.t === ';' || isId(t, 'where') || isId(t, 'from') || isId(t, 'returning'))) {
      return k - 1;
    }
  }
  return toks.length - 1;
}

/** `col = expr` pairs of a SET list, split on top-level commas. */
function assignments(toks, start, end) {
  const out = [];
  let depth = 0;
  let from = start;
  const flush = (to) => {
    if (to < from) return;
    // target: id | "id" (a qualified target is a composite field; not ours)
    const t = toks[from];
    if (t?.t === 'id' && toks[from + 1]?.t === 'op' && toks[from + 1].v === '=') {
      out.push({ target: t.v, targetIx: from, rhsStart: from + 2, rhsEnd: to });
    }
  };
  for (let k = start; k <= end; k++) {
    const t = toks[k];
    if (t.t === '(' || t.t === '[') depth++;
    else if (t.t === ')' || t.t === ']') depth--;
    else if (t.t === ',' && depth === 0) {
      flush(k - 1);
      from = k + 1;
    }
  }
  flush(end);
  return out;
}

/**
 * Every UPDATE … SET and INSERT … ON CONFLICT … DO UPDATE SET in a token list.
 * @returns {{kind: string, table: string|null, interp?: string, quals: Set<string>, start: number, end: number}[]}
 */
export function statements(toks) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    if (isId(toks[i], 'update') && !isId(toks[i - 1], 'do') && !isId(toks[i - 1], 'for')) {
      const r = readRelation(toks, i + 1);
      if (!r) continue;
      let j = r.next;
      if (toks[j]?.t === 'op' && toks[j].v === '*') j++;
      let alias = null;
      if (isId(toks[j], 'as')) j++;
      if (toks[j]?.t === 'id' && !isId(toks[j], 'set')) alias = toks[j++].v;
      if (!isId(toks[j], 'set')) continue;
      const quals = new Set();
      if (r.table) quals.add(r.table.slice(r.table.lastIndexOf('.') + 1)).add(r.table);
      if (alias) quals.add(alias);
      out.push({ kind: 'UPDATE', table: r.table, interp: r.interp, quals, start: j + 1, end: setListEnd(toks, j + 1) });
    }
    if (isId(toks[i], 'insert') && isId(toks[i + 1], 'into')) {
      const r = readRelation(toks, i + 2);
      if (!r) continue;
      let alias = null;
      if (isId(toks[r.next], 'as') && toks[r.next + 1]?.t === 'id') alias = toks[r.next + 1].v;
      for (let k = r.next; k < toks.length - 3; k++) {
        if (toks[k].t === ';' || isId(toks[k], 'insert')) break;
        if (isId(toks[k], 'do') && isId(toks[k + 1], 'update') && isId(toks[k + 2], 'set')) {
          const quals = new Set(['excluded']);
          if (r.table) quals.add(r.table.slice(r.table.lastIndexOf('.') + 1)).add(r.table);
          if (alias) quals.add(alias);
          out.push({
            kind: 'ON CONFLICT DO UPDATE',
            table: r.table,
            interp: r.interp,
            quals,
            start: k + 3,
            end: setListEnd(toks, k + 3),
          });
          break;
        }
      }
    }
  }
  return out;
}

// ── The type rule ───────────────────────────────────────────────────────────

/** Operators json does not have. `->`, `->>`, `#>`, `#>>` it does. */
const JSONB_ONLY_OPS = new Set(['||', '-', '#-', '@>', '<@', '?', '?|', '?&', '@?', '@@']);
/** jsonb_* functions whose jsonb parameters refuse json; the "any"-typed builders accept it. */
const JSONB_ANY_ARG = new Set(['jsonb_build_object', 'jsonb_build_array', 'jsonb_agg', 'jsonb_object_agg', 'jsonb_object']);
const isJsonbFn = (fn) => /^jsonb_\w+$/.test(fn) && !JSONB_ANY_ARG.has(fn) && !/_agg(_strict|_unique|_unique_strict)?$/.test(fn);
const COALESCING = new Set(['coalesce', 'nullif', 'greatest', 'least']);
/** Words that precede `(` without being a function call. */
const NOT_A_FUNCTION = new Set(
  'and or not in exists values then else when case as select where set on using from returning any all some is like ilike filter over within distinct by array'.split(
    ' ',
  ),
);

/** The type named after `::` at k (k is the `::` token) → { type, next }. */
function readCast(toks, k, pm) {
  let j = k + 1;
  if (toks[j]?.t !== 'id') return { type: '?', next: j };
  let type = toks[j].v;
  j++;
  if (toks[j]?.t === '.' && toks[j + 1]?.t === 'id') {
    type = toks[j + 1].v;
    j += 2;
  }
  if (toks[j]?.t === '(' && pm[j] > 0) j = pm[j] + 1;
  while (toks[j]?.t === '[' && pm[j] > 0) j = pm[j] + 1;
  return { type, next: j };
}

/** Is the argument toks[s..e] visibly jsonb? */
function isJsonbArg(toks, s, e, pm) {
  if (e >= s + 1 && toks[e - 1].t === '::' && toks[e].v === 'jsonb') return true;
  const f = toks[s];
  if (f?.t === 'id' && toks[s + 1]?.t === '(' && pm[s + 1] === e && (isJsonbFn(f.v) || f.v === 'to_jsonb' || JSONB_ANY_ARG.has(f.v)))
    return true;
  return false;
}

/**
 * The column reference toks[a..b] is a json value. Follow it outward until it
 * is cast, used safely, or used as jsonb. Returns the reason it fails, or null.
 */
function jsonMisuse(toks, pm, a, b, lo, hi, targetType) {
  for (let guard = 0; guard < 64; guard++) {
    let nx = b + 1;
    // json -> 'k' / json #> '{a}' stay json; ->> / #>> are text and leave the rule.
    while (nx <= hi && toks[nx].t === 'op' && (toks[nx].v === '->' || toks[nx].v === '#>')) {
      b = nx + 1;
      nx = b + 1;
    }
    if (nx <= hi && toks[nx].t === 'op' && (toks[nx].v === '->>' || toks[nx].v === '#>>')) return null;
    if (nx <= hi && toks[nx].t === '::') {
      const c = readCast(toks, nx, pm);
      if (c.type !== 'json') return null; // cast to jsonb (or to anything else): typed now
      b = c.next - 1;
      continue;
    }
    const prev = a - 1 >= lo ? toks[a - 1] : null;
    const next = nx <= hi ? toks[nx] : null;
    for (const op of [next, prev]) {
      if (op?.t === 'op' && JSONB_ONLY_OPS.has(op.v)) {
        // json || <text> is text concatenation: legal when the target is text.
        if (op.v === '||' && targetType && targetType !== 'json' && targetType !== 'jsonb') return null;
        return `json ${op.v} — json has no ${op.v} operator`;
      }
    }
    if ((prev?.t === '(' || prev?.t === ',') && (next?.t === ')' || next?.t === ',')) {
      // the whole of one argument / parenthesised group
      let open = a - 1;
      let depth = 0;
      for (; open >= lo; open--) {
        const t = toks[open];
        if (t.t === ')' || t.t === ']') depth++;
        else if (t.t === '(' || t.t === '[') {
          if (depth === 0) break;
          depth--;
        }
      }
      if (open < lo || toks[open].t !== '(') return null;
      const close = pm[open];
      const f = open - 1 >= lo ? toks[open - 1] : null;
      const fn = f && f.t === 'id' && !f.quoted && !NOT_A_FUNCTION.has(f.v) ? f.v : null;
      if (!fn) {
        if (prev.t === '(' && next.t === ')') {
          a = open;
          b = close;
          continue;
        }
        return null;
      }
      if (isJsonbFn(fn)) return `${fn}(json …) — ${fn} takes jsonb`;
      if (COALESCING.has(fn)) {
        let s = open + 1;
        let d = 0;
        for (let k = open + 1; k <= close; k++) {
          const t = toks[k];
          if (t.t === '(' || t.t === '[') d++;
          else if ((t.t === ')' || t.t === ']') && k !== close) d--;
          if ((t.t === ',' && d === 0) || k === close) {
            if (!(s <= a && b <= k - 1) && isJsonbArg(toks, s, k - 1, pm)) {
              return `${fn.toUpperCase()}(json, jsonb) — could not convert type jsonb to json`;
            }
            s = k + 1;
          }
        }
        a = open - 1;
        b = close;
        continue;
      }
      return null; // to_jsonb, json_*, any other function: not this rule
    }
    return null;
  }
  return null;
}

/**
 * References to json columns of `table` in toks[lo..hi].
 * `quals` are the names that qualify a column of the target (table, alias, EXCLUDED).
 */
function jsonRefs(toks, lo, hi, table, quals, schema, aliases = new Map()) {
  const out = [];
  const cols = table ? schema.types.get(table) : null;
  for (let k = lo; k <= hi; k++) {
    const t = toks[k];
    if (t.t === 'interp') {
      // ${model.key} / ${schema.model.key}
      const parts = t.v.split('.').map((s) => s.trim());
      if (parts.length < 2 || !parts.every((p) => /^\w+$/.test(p))) continue;
      const key = parts[parts.length - 1];
      const model = parts[parts.length - 2];
      for (const tb of schema.bindings.get(aliases.get(model) ?? model) ?? []) {
        const col = schema.keys.get(tb)?.get(key);
        if (col && schema.types.get(tb)?.get(col) === 'json') {
          out.push({ a: k, b: k, table: tb, column: col });
          break;
        }
      }
      continue;
    }
    if (!cols || t.t !== 'id') continue;
    // schema.table.col
    if (toks[k + 1]?.t === '.' && toks[k + 2]?.t === 'id' && toks[k + 3]?.t === '.' && toks[k + 4]?.t === 'id') {
      const col = toks[k + 4].v;
      if (quals.has(qualify(t.v, toks[k + 2].v)) && cols.get(col) === 'json' && toks[k + 5]?.t !== '(') {
        out.push({ a: k, b: k + 4, table, column: col });
      }
      k += 4;
      continue;
    }
    if (toks[k + 1]?.t === '.' && toks[k + 2]?.t === 'id') {
      if (quals.has(t.v) && cols.get(toks[k + 2].v) === 'json' && toks[k + 3]?.t !== '(') {
        out.push({ a: k, b: k + 2, table, column: toks[k + 2].v });
      }
      k += 2;
      continue;
    }
    if (toks[k - 1]?.t === '.' || toks[k + 1]?.t === '(') continue;
    if (cols.get(t.v) === 'json') out.push({ a: k, b: k, table, column: t.v });
  }
  return out;
}

// ── Scan ────────────────────────────────────────────────────────────────────

const lineAt = (src, offset) => {
  let n = 1;
  for (let i = 0; i < offset && i < src.length; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
};
const squash = (s, max = 180) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
};

/** A JS literal made ready for the SQL reader. */
function prepareLiteral(lit) {
  const quote = lit.value[0];
  let body = lit.value.slice(1, lit.value.endsWith(quote) && lit.value.length > 1 ? -1 : undefined);
  if (quote !== '`') body = body.replace(/\\(['"])/g, ' $1'); // keep offsets: `\'` → ` '`
  const toks = tokenize(body);
  return { lit, quote, body, base: lit.start + 1, toks, pm: matchBrackets(toks) };
}

/**
 * Tables a JS variable used as `UPDATE ${name}` can hold, read from its
 * initializer in the same file: `const table = x ? 'concept2cure_artifacts' :
 * 'unified_documents'` → both. Only names the model knows count.
 */
function tablesOfVariable(src, name, before, schema) {
  const decls = [...src.slice(0, before).matchAll(new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=([^;]+);`, 'g'))];
  const init = decls.pop()?.[1] ?? '';
  const out = new Set();
  for (const m of init.matchAll(/['"`]([a-z_][a-z0-9_.]*)['"`]/g)) if (schema.types.has(qualify(null, m[1]))) out.add(m[1]);
  return [...out];
}

/** Findings in one source file: `{ file, line, table, column, kind, expression, why }`. */
export function scanSource(src, file, schema) {
  const findings = [];
  // `import { cerReports as clinicalEvaluationReports }` — a model is often
  // used under a local name, and ${clinicalEvaluationReports.metadata} is
  // still cer_reports.metadata.
  const aliases = new Map();
  for (const m of src.matchAll(/\bimport\s*(?:type\s*)?\{([^}]*)\}\s*from/g)) {
    for (const spec of m[1].split(',')) {
      const a = /^\s*(?:type\s+)?(\w+)\s+as\s+(\w+)\s*$/.exec(spec);
      if (a) aliases.set(a[2], a[1]);
    }
  }
  const literals = extractStringLiterals(src);
  const seen = new Set();

  /** Check toks[lo..hi] of a prepared literal as a SET list against `table`. */
  const checkSetList = (p, lo, hi, table, quals, kind) => {
    for (const asg of assignments(p.toks, lo, hi)) {
      const targetType = schema.types.get(table)?.get(asg.target);
      for (const ref of jsonRefs(p.toks, asg.rhsStart, asg.rhsEnd, table, quals, schema, aliases)) {
        const why = jsonMisuse(p.toks, p.pm, ref.a, ref.b, asg.rhsStart, asg.rhsEnd, targetType);
        if (why) report(p, ref, asg, kind, why);
      }
    }
  };
  const report = (p, ref, asg, kind, why) => {
    const at = p.base + p.toks[ref.a].pos;
    // One finding per assignment and column: `t.metadata || EXCLUDED.metadata` is one defect.
    const id = `${asg ? p.base + p.toks[asg.targetIx].pos : at}:${ref.table}.${ref.column}`;
    if (seen.has(id)) return;
    seen.add(id);
    const from = asg ? p.toks[asg.targetIx].pos : 0;
    const to = asg ? p.toks[asg.rhsEnd].end : p.body.length;
    findings.push({
      file,
      line: lineAt(src, at),
      table: ref.table,
      column: ref.column,
      kind,
      expression: squash(p.body.slice(from, to)),
      why,
    });
  };

  for (const lit of literals) {
    if (!/[|#@?-]|jsonb_|coalesce|nullif|greatest|least|\bupdate\b/i.test(lit.value)) continue;
    const p = prepareLiteral(lit);
    if (p.toks.length === 0) continue;
    const { toks } = p;

    const stmts = statements(toks);
    for (const st of stmts) {
      // `UPDATE ${table}`: the tables that variable can hold, when the file says.
      const targets = st.table
        ? [st.table]
        : st.interp && /^\w+$/.test(st.interp)
          ? tablesOfVariable(src, st.interp, lit.start, schema)
          : [];
      for (const table of targets) {
        const quals = new Set([...st.quals, table.slice(table.lastIndexOf('.') + 1), table]);
        const via = st.table ? '' : ` (via \${${st.interp}})`;
        checkSetList(p, st.start, st.end, table, quals, `${st.kind} ${table}${via}`);

        // `SET ${updates.join(', ')}`: the pieces pushed into `updates` earlier
        // in the file are this SET list.
        const only = st.start === st.end ? toks[st.start] : null;
        const joined = only?.t === 'interp' ? /^(\w+)\.join\(/.exec(only.v) : null;
        if (joined) {
          const pushRe = new RegExp(`\\b${joined[1]}\\.push\\(\\s*$`);
          for (const piece of literals) {
            if (piece.start >= lit.start || piece.start < lit.start - 20000) continue;
            if (!pushRe.test(src.slice(Math.max(0, piece.start - 80), piece.start))) continue;
            const pp = prepareLiteral(piece);
            if (pp.toks.length) checkSetList(pp, 0, pp.toks.length - 1, table, quals, `${st.kind} ${table} (SET assembled from ${joined[1]})`);
          }
        }
      }
    }

    // A Drizzle sql`` fragment that is not itself a statement.
    const tagged = p.quote === '`' && /\bsql\s*$/.test(src.slice(Math.max(0, lit.start - 12), lit.start));
    if (tagged && stmts.length === 0 && !/^\s*(select|with|delete|insert|update)\b/i.test(p.body)) {
      const before = src.slice(Math.max(0, lit.start - 1500), lit.start);
      let table = null;
      let targetType;
      const up = [...before.matchAll(/\.update\(\s*([\w.]+)\s*\)/g)].pop();
      if (up && !before.slice(up.index).includes(';') && /\.set\(/.test(before.slice(up.index))) {
        const local = up[1].split('.').pop();
        const v = aliases.get(local) ?? local;
        const cands = [...(schema.bindings.get(v) ?? [])];
        if (cands.length === 1) table = cands[0];
      }
      const keyM = /(\w+)\s*[:=]\s*sql\s*$/.exec(src.slice(Math.max(0, lit.start - 80), lit.start));
      if (table && keyM) {
        const col = schema.keys.get(table)?.get(keyM[1]);
        if (col) targetType = schema.types.get(table)?.get(col);
      }
      const quals = new Set(table ? [table.slice(table.lastIndexOf('.') + 1), table] : []);
      for (const ref of jsonRefs(toks, 0, toks.length - 1, table, quals, schema, aliases)) {
        const why = jsonMisuse(toks, p.pm, ref.a, ref.b, 0, toks.length - 1, targetType);
        if (why) report(p, ref, null, 'Drizzle sql`` fragment', why);
      }
    }
  }
  return findings;
}

export function scanServer(root, schema) {
  const out = [];
  const files = walk(path.join(root, 'server'), (n) => /\.[cm]?[jt]s$/.test(n) && !SKIP_FILE.test(n) && !n.endsWith('.d.ts'));
  for (const f of files.sort()) out.push(...scanSource(fs.readFileSync(f, 'utf8'), rel(f), schema));
  return { findings: out, files: files.length };
}

// ── Gate ────────────────────────────────────────────────────────────────────

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return { entries: {} };
  const raw = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  return { entries: raw.entries ?? {} };
}

function main() {
  requireScanRoots(TAG, [path.join(ROOT, 'shared'), path.join(ROOT, 'server')]);
  const schema = loadSchema(ROOT);
  let jsonCount = 0;
  for (const cols of schema.types.values()) for (const t of cols.values()) if (t === 'json') jsonCount++;
  const { findings, files } = scanServer(ROOT, schema);
  const { entries } = loadBaseline();

  const failures = [];
  for (const [key, entry] of Object.entries(entries)) {
    if (typeof entry?.reason !== 'string' || entry.reason.trim().length < 20) {
      failures.push(`baseline entry ${key} has no written reason — the reason is the point of the entry`);
    }
  }
  const byKey = new Map();
  for (const f of findings) {
    const k = `${f.file}#${f.table}.${f.column}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(f);
  }
  const fewer = [];
  const fmt = (f) =>
    `  ${f.file}:${f.line}  ${f.table}.${f.column}  [${f.kind}]\n      ${f.why}\n      ${f.expression}`;
  for (const [k, list] of [...byKey].sort()) {
    const allowed = entries[k]?.count ?? 0;
    if (list.length > allowed) failures.push(...list.map(fmt));
    else if (list.length < allowed) fewer.push(`${k} — ${allowed} → ${list.length}`);
  }
  for (const [k, e] of Object.entries(entries)) if (!byKey.has(k)) fewer.push(`${k} — ${e.count} → 0`);

  console.log(
    `${TAG} ${jsonCount} json column(s) (${schema.widened.length} more retyped to jsonb by a migration, ` +
      `${schema.migrationTyped.length} more created jsonb by the migration that owns an unpushed table, ` +
      `${schema.conflicts.size} declared inconsistently); ${files} server file(s) read; ` +
      `${findings.length} finding(s), ${Object.keys(entries).length} baselined`,
  );
  if (VERBOSE && schema.conflicts.size) {
    console.log(`${TAG} columns two models type differently (resolved as shown):`);
    for (const [k, c] of [...schema.conflicts].sort()) console.log(`    ${k} → ${c.resolved}   (${c.declarations.join('; ')})`);
  }
  if (fewer.length) {
    console.log(`${TAG} baseline entries that now cover more than they find — lower or remove them:`);
    for (const f of fewer) console.log(`    • ${f}`);
  }
  if (failures.length) {
    console.error(`\n${TAG} ❌ a jsonb operator is applied to a json column — the statement fails on every execution.\n`);
    for (const f of failures) console.error(`${f}\n`);
    console.error(
      '  These columns are `json`, not `jsonb`: json has no ||, no jsonb_set, and COALESCE will not\n' +
        "  mix it with jsonb. Cast the column first — COALESCE(col::jsonb, '{}'::jsonb) || $1::jsonb —\n" +
        '  and the assignment back into the json column is implicit. A unit test that mocks the pool\n' +
        '  cannot see this; run the statement against PostgreSQL.\n',
    );
    process.exit(1);
  }
  console.log(`${TAG} ✅ no jsonb operator on a json column.`);
}

// ── Self-test ───────────────────────────────────────────────────────────────

/**
 * Builds throwaway trees and runs THIS script on them as a subprocess, so what
 * is tested is the command CI runs. Each case states what the gate must do.
 */
function selftest() {
  const SCHEMA = `
import { pgTable, json, jsonb, text, integer } from 'drizzle-orm/pg-core';
export const artifacts = pgTable('concept2cure_artifacts', {
  id: integer('id'),
  metadata: json('metadata'),
  notes: text('notes'),
});
export const programs = pgTable("regulatory_programs", {
  id: integer('id'),
  metadata: jsonb('metadata'),
});
export const retyped = pgTable('retyped_things', {
  id: integer('id'),
  payload: json('payload'),
});
`;
  // A model drizzle.config.ts does not push: its table exists only because a
  // migration creates it, and the migration says jsonb.
  const UNPUSHED = `
import { pgTable, json, integer } from 'drizzle-orm/pg-core';
export const runs = pgTable('workflow_runs', {
  id: integer('id'),
  metadata: json('metadata'),
});
`;
  // Both CREATE TABLEs say jsonb; only the one for an unpushed table decides.
  const MIGRATION_CREATES =
    'CREATE TABLE IF NOT EXISTS workflow_runs (id integer, metadata jsonb DEFAULT \'{}\'::jsonb);\n' +
    'CREATE TABLE IF NOT EXISTS concept2cure_artifacts (id integer, metadata jsonb, notes text);\n';
  const RETYPE_SQL = `-- later widened\nALTER TABLE IF EXISTS public.retyped_things\n  ALTER COLUMN payload TYPE jsonb USING payload::jsonb;\n`;
  const REASON = 'Selftest fixture: a written reason long enough to satisfy the gate.';
  const q = (sql) => `import { pool } from '../db';\nexport async function f(x) {\n  await pool.query(\`${sql}\`, [x]);\n}\n`;

  const CASES = [
    {
      name: 'SET metadata = metadata || $1::jsonb on a json column',
      server: q('UPDATE concept2cure_artifacts SET metadata = metadata || $1::jsonb WHERE id = $2'),
      expect: 1,
      mustSay: 'concept2cure_artifacts.metadata',
    },
    {
      name: "the cast form COALESCE(metadata::jsonb, '{}'::jsonb) || $1",
      server: q("UPDATE concept2cure_artifacts SET metadata = COALESCE(metadata::jsonb, '{}'::jsonb) || $1 WHERE id = $2"),
      expect: 0,
    },
    {
      name: 'the same uncast expression on a jsonb column',
      server: q("UPDATE regulatory_programs SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb WHERE id = $2"),
      expect: 0,
    },
    {
      name: "jsonb_set(COALESCE(metadata, '{}'::jsonb), …) on a json column",
      server: q("UPDATE concept2cure_artifacts SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{k}', $1::jsonb) WHERE id = $2"),
      expect: 1,
      mustSay: 'COALESCE(json, jsonb)',
    },
    {
      name: 'a json column a migration later ALTERs TYPE to jsonb',
      server: q('UPDATE retyped_things SET payload = payload || $1::jsonb WHERE id = $2'),
      expect: 0,
    },
    {
      name: '…and the same column with the retype migration absent',
      server: q('UPDATE retyped_things SET payload = payload || $1::jsonb WHERE id = $2'),
      noRetype: true,
      expect: 1,
      mustSay: 'retyped_things.payload',
    },
    {
      name: 'json in a model nothing pushes, jsonb in the migration that creates the table',
      server: q('UPDATE workflow_runs SET metadata = metadata || $1::jsonb WHERE id = $2'),
      expect: 0,
    },
    {
      name: '…but a pushed table keeps its pushed json type whatever a later CREATE TABLE says',
      server: q('UPDATE concept2cure_artifacts SET metadata = metadata || $1::jsonb WHERE id = $2'),
      expect: 1,
    },
    {
      name: 'jsonb_strip_nulls(COALESCE(metadata, …) || …) with an alias',
      server: q("UPDATE concept2cure_artifacts a SET metadata = jsonb_strip_nulls(COALESCE(a.metadata, '{}'::jsonb) || $1::jsonb) WHERE a.id = $2"),
      expect: 1,
    },
    {
      name: '(COALESCE(metadata, \'{}\'))::jsonb — cast after the COALESCE',
      server: q("UPDATE concept2cure_artifacts SET metadata = (COALESCE(metadata, '{}'))::jsonb || $1::jsonb WHERE id = $2"),
      expect: 0,
    },
    {
      name: 'a cast to json is still json: metadata::json || $1::jsonb',
      server: q('UPDATE concept2cure_artifacts SET metadata = metadata::json || $1::jsonb WHERE id = $2'),
      expect: 1,
    },
    {
      name: 'a jsonb function given the json column directly: jsonb_strip_nulls(metadata)',
      server: q('UPDATE concept2cure_artifacts SET metadata = jsonb_strip_nulls(metadata) WHERE id = $1'),
      expect: 1,
      mustSay: 'jsonb_strip_nulls(json',
    },
    {
      name: 'upsert merging EXCLUDED into a json column',
      server: q(
        'INSERT INTO concept2cure_artifacts AS t (id, metadata) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET metadata = t.metadata || EXCLUDED.metadata',
      ),
      expect: 1,
    },
    {
      name: 'a Drizzle .set({ metadata: sql`COALESCE(${model.metadata}, …) || …` })',
      server:
        "import { sql } from 'drizzle-orm';\nimport { artifacts } from '@shared/schema';\n" +
        "export async function f(db, x) {\n  await db.update(artifacts).set({ metadata: sql`COALESCE(${artifacts.metadata}, '{}'::jsonb) || ${x}::jsonb` });\n}\n",
      expect: 1,
    },
    {
      name: 'the same, with the model imported under another name',
      server:
        "import { sql } from 'drizzle-orm';\nimport { artifacts as reports } from '@shared/schema';\n" +
        "export async function f(db, x) {\n  await db.update(reports).set({ metadata: sql`jsonb_set(${reports.metadata}, '{k}', ${x}::jsonb)` });\n}\n",
      expect: 1,
    },
    {
      name: 'UPDATE ${table}, where the file says which tables `table` can hold',
      server:
        "import { pool } from '../db';\nexport async function f(kind, x) {\n" +
        "  const table = kind === 'artifact' ? 'concept2cure_artifacts' : 'regulatory_programs';\n" +
        "  await pool.query(`UPDATE ${table} SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{k}', $1::jsonb)`, [x]);\n}\n",
      expect: 1,
      mustSay: 'via ${table}',
    },
    {
      name: "SET ${updates.join(', ')} assembled from pushed pieces",
      server:
        "import { pool } from '../db';\nexport async function f(m) {\n  const updates = ['id = id'];\n" +
        "  if (m) updates.push(`metadata = metadata || $2::jsonb`);\n" +
        "  await pool.query(`UPDATE concept2cure_artifacts SET ${updates.join(', ')} WHERE id = $1`, [1, m]);\n}\n",
      expect: 1,
      mustSay: 'SET assembled from updates',
    },
    {
      name: 'schema-qualified column reference: public.concept2cure_artifacts.metadata ||',
      server: q('INSERT INTO public.concept2cure_artifacts (id, metadata) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET metadata = public.concept2cure_artifacts.metadata || $2::jsonb'),
      expect: 1,
    },
    {
      name: 'text concatenation of a json value into a text column',
      server: q("UPDATE concept2cure_artifacts SET notes = 'was: ' || metadata, metadata = metadata WHERE id = $1"),
      expect: 0,
    },
    {
      name: 'a test file is not scanned',
      file: 'server/services/thing.test.ts',
      server: q('UPDATE concept2cure_artifacts SET metadata = metadata || $1::jsonb WHERE id = $2'),
      expect: 0,
    },
    {
      name: 'a finding covered by a reasoned baseline entry passes',
      server: q('UPDATE concept2cure_artifacts SET metadata = metadata || $1::jsonb WHERE id = $2'),
      baseline: { 'server/services/thing.ts#concept2cure_artifacts.metadata': { count: 1, reason: REASON } },
      expect: 1,
      code: 0,
    },
    {
      name: 'a baselined count does not absorb a second finding in the same file',
      server:
        q('UPDATE concept2cure_artifacts SET metadata = metadata || $1::jsonb WHERE id = $2') +
        q("UPDATE concept2cure_artifacts SET metadata = jsonb_set(metadata, '{k}', $1::jsonb) WHERE id = $2").replace('function f', 'function g'),
      baseline: { 'server/services/thing.ts#concept2cure_artifacts.metadata': { count: 1, reason: REASON } },
      expect: 2,
      code: 1,
    },
    {
      name: 'a baseline entry without a reason fails even with nothing to cover',
      server: q('UPDATE concept2cure_artifacts SET metadata = $1 WHERE id = $2'),
      baseline: { 'server/services/thing.ts#concept2cure_artifacts.metadata': { count: 1 } },
      expect: 0,
      code: 1,
      mustSay: 'no written reason',
    },
  ];

  let failed = 0;
  for (const c of CASES) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'json-operator-types-selftest-'));
    try {
      const put = (p, s) => {
        fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
        fs.writeFileSync(path.join(root, p), s);
      };
      put('shared/schema.ts', SCHEMA);
      put('drizzle.config.ts', "export default { schema: ['./shared/schema.ts'] };\n");
      put('shared/schema/unpushed.ts', UNPUSHED);
      put('migrations/0001_init.sql', MIGRATION_CREATES);
      if (!c.noRetype) put('db/migrations/0002_retype.sql', RETYPE_SQL);
      put(c.file ?? 'server/services/thing.ts', c.server);
      put('baseline.json', JSON.stringify({ entries: c.baseline ?? {} }));
      const res = spawnSync(process.execPath, [SELF, '--root', root, '--baseline', path.join(root, 'baseline.json')], {
        encoding: 'utf8',
      });
      const out = `${res.stdout}\n${res.stderr}`;
      const n = Number(/(\d+) finding\(s\)/.exec(out)?.[1] ?? NaN);
      const wantCode = c.code ?? (c.expect > 0 ? 1 : 0);
      const ok = n === c.expect && res.status === wantCode && (!c.mustSay || out.includes(c.mustSay));
      if (!ok) failed++;
      console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${c.name} → ${n} finding(s), exit ${res.status} (expected ${c.expect}, exit ${wantCode})`);
      if (!ok) console.log(out.replace(/^/gm, '        '));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  if (failed) {
    console.error(`\n${TAG} ❌ selftest: ${failed} case(s) wrong. Do not trust the gate until this passes.`);
    process.exit(1);
  }
  console.log(`\n${TAG} ✅ selftest: ${CASES.length} cases held — every failure branch fired, every safe form passed.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  if (args.includes('--selftest')) selftest();
  else main();
}

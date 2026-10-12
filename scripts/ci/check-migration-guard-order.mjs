#!/usr/bin/env node
/**
 * check-migration-guard-order.mjs — a table's CREATE must precede the file that
 * attaches a guard to it.
 *
 * ── Why this exists, and what it costs when it is wrong ─────────────────────
 * `C2C_MIGRATION_FILES` re-executes in order on EVERY deploy (RULE 1). A file
 * that attaches a trigger or a constraint to a table it does not create is
 * normally written to self-guard with `to_regclass`, so it no-ops harmlessly
 * while the table is absent. That is correct and deliberate — and it means the
 * guard silently does not exist until the creator lands.
 *
 * So if the creator is ordered AFTER the guard, one deploy creates the table and
 * the guard arrives only on the NEXT one. Between the two deploys the table
 * exists, the application can write to it, and the guard is not there.
 *
 * The case that produced this gate (2026-10-12): adding
 * `20260511_qms_and_labeling.sql` — which creates `qms_documents` — to the set.
 * `20261001_qms_document_signature_required.sql` installs the 21 CFR Part 11
 * §11.50/§11.70 constraint triggers that refuse
 * `qms_documents → effective/retired` without a same-transaction electronic
 * signature. Ordered after it, there is a window in which a controlled document
 * is approved to `effective` WITH NO SIGNATURE, on a launch-app surface that can
 * write to it, and the deploy is green both times.
 *
 * The set has made this exact mistake twice before — its own comments name
 * `20260224_binder_evidence_source_types` and `20260617_precedent_org_isolation`
 * — and `ci:migration-set-order` does not catch it: that gate pins the sweep's
 * position, the tail triple, existence and duplicates, and says nothing about
 * the middle. Verified before writing this: with the two QMS files moved after
 * the trigger file, `ci:migration-set-order`, `ci:migration-drop-safety` and
 * `ci:migration-deploy-path` all PASS.
 *
 * ── What it checks ──────────────────────────────────────────────────────────
 * For every (table, guard) pair found in the set, the index of the file that
 * CREATEs the table must be lower than the index of the file that attaches the
 * guard. A guard on a table NO file in the set creates is ignored: that is the
 * ordinary case of guarding a base-schema table.
 *
 * Deliberately textual, like its sibling gates: no database, no parser, so a
 * pre-push hook can afford it. It therefore reads the shapes the repo actually
 * writes, listed in GUARD_PATTERNS, rather than attempting SQL in general.
 *
 * Genuine exceptions go in `migration-guard-order-baseline.json` WITH A WRITTEN
 * REASON — an entry without one is what the file exists to prevent.
 *
 * Usage: node scripts/ci/check-migration-guard-order.mjs
 *        node scripts/ci/check-migration-guard-order.mjs --selftest
 * Exit 0 when every pair is ordered, 1 otherwise with the pair named.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C2C_MIGRATION_FILES } from '../db/migration-set.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:migration-guard-order]';
const BASELINE = path.join(repoRoot, 'scripts', 'ci', 'migration-guard-order-baseline.json');

/** Strip comments and string literals so a table name inside them is not read as SQL. */
function sqlOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''");
}

const ident = '(?:"[^"]+"|[a-zA-Z_][a-zA-Z0-9_$]*)';

/**
 * A table's key: `schema.table`, with an unqualified name defaulting to
 * `public`.
 *
 * THE SCHEMA IS PART OF THE IDENTITY, and leaving it out was this gate's first
 * bug — caught by its own first run against the real set. It reported
 * `electronic_signatures` as guarded-before-created, because
 * `db/migrations/081_grdhe_regulatory_mapping_layer.sql` creates
 * `regulatory_harmonization.electronic_signatures` while
 * `20260730_esign_audit_db_level_immutability.sql` guards
 * `public.electronic_signatures`. Two different tables in two different schemas,
 * collapsed into one name by a capture group that kept only the last
 * identifier. This repository has several non-public schemas, so that is not a
 * corner case.
 */
const tableKey = (schema, table) => {
  const s = (schema ?? '').replace(/"/g, '').replace(/\.$/, '').toLowerCase();
  const n = String(table).replace(/"/g, '').toLowerCase();
  return `${s || 'public'}.${n}`;
};

/** `CREATE TABLE [IF NOT EXISTS] [public.]<t>` — the creators. */
const CREATE_TABLE = new RegExp(
  `\\bCREATE\\s+(?:UNLOGGED\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${ident}\\.)?(${ident})`,
  'gi',
);

/**
 * The guard shapes this repository writes. Each names the table it protects in
 * capture group 1.
 */
const GUARD_PATTERNS = [
  // CREATE [OR REPLACE] [CONSTRAINT] TRIGGER <name> <when> ... ON <table>
  {
    kind: 'trigger',
    re: new RegExp(
      `\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:CONSTRAINT\\s+)?TRIGGER\\s+${ident}\\b[\\s\\S]{0,400}?\\bON\\s+(${ident}\\.)?(${ident})`,
      'gi',
    ),
  },
  // ALTER TABLE [ONLY] <table> ... ADD CONSTRAINT
  {
    kind: 'constraint',
    re: new RegExp(
      `\\bALTER\\s+TABLE\\s+(?:ONLY\\s+)?(?:IF\\s+EXISTS\\s+)?(${ident}\\.)?(${ident})[\\s\\S]{0,300}?\\bADD\\s+CONSTRAINT\\b`,
      'gi',
    ),
  },
  // ALTER TABLE <table> ENABLE ROW LEVEL SECURITY / FORCE
  {
    kind: 'rls',
    re: new RegExp(
      `\\bALTER\\s+TABLE\\s+(?:ONLY\\s+)?(?:IF\\s+EXISTS\\s+)?(${ident}\\.)?(${ident})[\\s\\S]{0,200}?\\b(?:ENABLE|FORCE)\\s+ROW\\s+LEVEL\\s+SECURITY`,
      'gi',
    ),
  },
  // CREATE POLICY <name> ON <table>
  {
    kind: 'policy',
    re: new RegExp(
      `\\bCREATE\\s+POLICY\\s+${ident}\\s+ON\\s+(${ident}\\.)?(${ident})`,
      'gi',
    ),
  },
];

function matchesOf(re, text) {
  const out = new Set();
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) out.add(tableKey(m[1], m[2]));
  return out;
}

/** Scan the set in order: the first file that creates a table, and every file that guards one. */
export function scanSet(files = C2C_MIGRATION_FILES, root = repoRoot) {
  const creatorIndexOf = new Map();
  const guards = [];
  files.forEach((rel, index) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    const text = sqlOnly(fs.readFileSync(abs, 'utf8'));
    for (const table of matchesOf(CREATE_TABLE, text)) {
      if (!creatorIndexOf.has(table)) creatorIndexOf.set(table, { index, file: rel });
    }
    for (const { kind, re } of GUARD_PATTERNS) {
      for (const table of matchesOf(re, text)) guards.push({ table, kind, index, file: rel });
    }
  });
  return { creatorIndexOf, guards };
}

/**
 * Pairs where the guard is ordered before its table's creator.
 *
 * A guard on a table no file in the set creates is NOT a violation — that is the
 * ordinary case of guarding a base-schema table, which deploy-migrate's
 * preflight asserts exists. A file that guards a table it creates ITSELF is also
 * fine: same index, and the statements inside a file run in order.
 */
export function violations(scan) {
  const out = [];
  for (const g of scan.guards) {
    const creator = scan.creatorIndexOf.get(g.table);
    if (!creator) continue;
    if (creator.index > g.index) {
      out.push({
        table: g.table,
        kind: g.kind,
        guardFile: g.file,
        guardIndex: g.index,
        creatorFile: creator.file,
        creatorIndex: creator.index,
      });
    }
  }
  return out;
}

function readBaseline() {
  if (!fs.existsSync(BASELINE)) return { entries: [] };
  try {
    return JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  } catch {
    console.error(`${TAG} baseline is not readable JSON: ${BASELINE}`);
    process.exit(1);
  }
}

const keyOf = (v) => `${v.guardFile}::${v.creatorFile}::${v.table}`;

/**
 * The failure branch, exercised on the real case this gate was written for — a
 * CREATE of `qms_documents` ordered after the Part 11 signature triggers — so
 * the gate has been seen to fail and not only to pass (CLAUDE.md).
 */
function selftest() {
  const sig = 'migrations/20261001_qms_document_signature_required.sql';
  const creator = 'migrations/20260511_qms_and_labeling.sql';
  for (const f of [sig, creator]) {
    if (!fs.existsSync(path.join(repoRoot, f))) {
      console.error(`${TAG} selftest needs ${f}`);
      process.exit(1);
    }
  }
  const broken = violations(scanSet([sig, creator]));
  const ordered = violations(scanSet([creator, sig]));
  const ok = broken.some((v) => v.table === 'public.qms_documents') && ordered.length === 0;
  if (!ok) {
    console.error(`${TAG} SELFTEST FAILED — the gate did not catch the guard-before-creator case.`);
    console.error(`  guard first (must report qms_documents): ${JSON.stringify(broken)}`);
    console.error(`  creator first (must be empty): ${JSON.stringify(ordered)}`);
    process.exit(1);
  }
  console.log(`${TAG} selftest OK — reports public.qms_documents when the Part 11 triggers precede its CREATE, and nothing when they follow it.`);
}

function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const found = violations(scanSet());
  const baseline = readBaseline();
  const allowed = new Map((baseline.entries ?? []).map((e) => [`${e.guardFile}::${e.creatorFile}::${e.table}`, e]));
  const unexplained = (baseline.entries ?? []).filter((e) => !String(e.reason ?? '').trim());
  if (unexplained.length > 0) {
    console.error(`${TAG} FAIL — ${unexplained.length} baseline entry/entries carry no reason.`);
    for (const e of unexplained) console.error(`  ${e.guardFile} guards ${e.table} created by ${e.creatorFile}`);
    console.error('  An entry without a written reason is the thing this baseline exists to prevent.');
    process.exit(1);
  }
  const unbaselined = found.filter((v) => !allowed.has(keyOf(v)));
  if (unbaselined.length === 0) {
    console.log(`${TAG} OK — every guarded table is created before it is guarded (${allowed.size} baselined).`);
    return;
  }
  console.error(`${TAG} FAIL — ${unbaselined.length} guard(s) are ordered before the file that creates the table.`);
  for (const v of unbaselined) {
    console.error(
      `  ${v.table}: ${v.kind} attached by ${v.guardFile} (index ${v.guardIndex}), ` +
      `created by ${v.creatorFile} (index ${v.creatorIndex}).`,
    );
  }
  console.error(
    '\n  Every file in C2C_MIGRATION_FILES re-runs on every deploy, in order. A guard on a\n' +
    '  table that does not exist yet self-guards and NO-OPS, so it arrives only on the\n' +
    '  deploy AFTER the one that creates the table — and in between, the table exists and\n' +
    '  the guard does not. Move the creator ABOVE the guard. If the order is genuinely\n' +
    '  required, add it to scripts/ci/migration-guard-order-baseline.json WITH A REASON.',
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

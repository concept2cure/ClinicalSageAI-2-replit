#!/usr/bin/env node
/**
 * Every rule pack must declare what it was built FROM.
 *
 * ── Why ───────────────────────────────────────────────────────────────────────
 * c2c_rule_packs holds the outline a customer's submission is built against.
 * Those outlines do not all have the same standing:
 *
 *   nda:fda   ICH M4 — an international harmonised standard.
 *   pma:fda   transcribed from 21 CFR 814.20(b), which enumerates its own
 *             contents in the regulation text.
 *   a UK device registration outline — UK MDR 2002 incorporates its essential
 *             requirements by reference and enumerates no annex, so any outline
 *             is a reasoned construction against the regulation's obligations.
 *
 * The first two are transcriptions. The third is a judgement. Before
 * migrations/20260810c the table could not tell them apart, so the product
 * asserted all three with identical authority and a filer had no way to know
 * which they were building against.
 *
 * This guard keeps that from silently regressing: a new pack seeded without an
 * attestation falls back to 'undeclared', which is safe but invisible unless
 * something counts it.
 *
 * ── What it does NOT do ───────────────────────────────────────────────────────
 * It reads SQL, not the database. It cannot tell whether an attestation is
 * TRUE — only whether one was made. Saying a pack is a statutory transcription
 * when it is not is a lie this script cannot catch; that is what the
 * `review_status` column and a regulatory reviewer are for. Stating the limit
 * is the point: a check trusted past its blind spots is worse than no check.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, 'migrations');
const PROVENANCE = 'migrations/20260810c_rule_pack_provenance.sql';

/**
 * Tuples inserted by an `INSERT INTO c2c_rule_packs` statement.
 *
 * Scoped to the statement, NOT to a fixed byte window. An earlier throwaway
 * version of this used a 4000-character window and silently missed ivdr:ema and
 * ide:fda, because a single required_sections JSON blob runs past 5KB. The
 * undercount looked like a clean result.
 */
function packsIn(sql) {
  const found = [];
  const re = /INSERT\s+INTO\s+c2c_rule_packs/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const start = m.index;
    // A statement ends at the first semicolon that is not inside a quoted
    // string. required_sections JSON contains no semicolons outside quotes, but
    // labels legitimately do, so track quoting rather than taking indexOf(';').
    let i = start;
    let inStr = false;
    while (i < sql.length) {
      const c = sql[i];
      if (c === "'") {
        if (inStr && sql[i + 1] === "'") { i += 2; continue; } // escaped ''
        inStr = !inStr;
      } else if (c === ';' && !inStr) {
        break;
      }
      i += 1;
    }
    const stmt = sql.slice(start, i);
    for (const t of stmt.matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*'([a-z_]+)'\s*,\s*'([^']+)'\s*,/gi)) {
      found.push({ docType: t[1], agency: t[2], version: t[3] });
    }
  }
  return found;
}

// ── self-check: the parser before its findings ───────────────────────────────
{
  const cases = [
    [
      `INSERT INTO c2c_rule_packs (doc_type, agency, version, label) VALUES ('a','fda','v1','L');`,
      1,
      'a single tuple',
    ],
    [
      `INSERT INTO c2c_rule_packs VALUES ('a','fda','v1','x'),('b','ema','v2','y');`,
      2,
      'two tuples in one statement',
    ],
    [
      // The regression the byte-window version had: a huge blob between tuples.
      `INSERT INTO c2c_rule_packs VALUES ('a','fda','v1','${'x'.repeat(9000)}'),('b','ema','v2','z');`,
      2,
      'a tuple after a 9KB literal is still found',
    ],
    [
      `SELECT 1; INSERT INTO c2c_rule_packs VALUES ('a','fda','v1','L'); SELECT ('zz','yy','xx',1);`,
      1,
      'tuples after the statement ends are not counted',
    ],
  ];
  for (const [sql, want, label] of cases) {
    const got = packsIn(sql).length;
    if (got !== want) {
      console.error(`self-check FAILED — ${label}: expected ${want} pack(s), got ${got}`);
      process.exit(2);
    }
  }
}

// ── collect every seeded pack ────────────────────────────────────────────────
const seeded = new Map(); // "doc:agency" -> {docType, agency, versions:Set, files:Set}
for (const file of fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) {
  const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
  for (const p of packsIn(sql)) {
    const key = `${p.docType}:${p.agency}`;
    if (!seeded.has(key)) {
      seeded.set(key, { ...p, versions: new Set(), files: new Set() });
    }
    seeded.get(key).versions.add(p.version);
    seeded.get(key).files.add(file);
  }
}

// ── collect every attestation in the provenance migration ────────────────────
const provSql = fs.existsSync(path.join(ROOT, PROVENANCE))
  ? fs.readFileSync(path.join(ROOT, PROVENANCE), 'utf8')
  : '';

if (!provSql) {
  console.error(`❌ ${PROVENANCE} is missing — no pack can declare its basis.`);
  process.exit(1);
}

const byPair = new Set();
for (const m of provSql.matchAll(/WHERE\s+doc_type\s*=\s*'([a-z0-9_]+)'\s+AND\s+agency\s*=\s*'([a-z_]+)'/gi)) {
  byPair.add(`${m[1]}:${m[2]}`);
}
const versionPrefixes = [...provSql.matchAll(/WHERE\s+version\s+LIKE\s+'([^']+)%'/gi)].map(m => m[1]);

function attested(entry, key) {
  if (byPair.has(key)) return true;
  return [...entry.versions].some(v => versionPrefixes.some(p => v.startsWith(p)));
}

const undeclared = [];
for (const [key, entry] of seeded) {
  if (!attested(entry, key)) undeclared.push({ key, entry });
}

console.log(
  `check-rule-pack-provenance: ${seeded.size} rule pack(s) seeded across migrations; ` +
    `${seeded.size - undeclared.length} carry an explicit provenance attestation.`,
);

if (undeclared.length > 0) {
  console.log(`\n${undeclared.length} pack(s) fall back to source_basis='undeclared':\n`);
  for (const { key, entry } of undeclared.sort((a, b) => a.key.localeCompare(b.key))) {
    console.log(`   ${key.padEnd(14)} ${[...entry.versions].join(', ')}`);
    console.log(`   ${' '.repeat(14)} seeded by ${[...entry.files].join(', ')}`);
  }
  console.log(
    `\nThese are not broken — 'undeclared' is the safe default and the product must\n` +
      `treat them as unverified. But an undeclared pack tells a filer nothing about\n` +
      `what their submission outline was built from. Add an UPDATE to\n` +
      `${PROVENANCE} (or a later provenance migration) stating the basis,\n` +
      `confidence and governing rule, and only claim what you actually checked.\n`,
  );
}

// ── ratchet ──────────────────────────────────────────────────────────────────
// Downward-only, same convention as the other debt gates in this repo. Raising
// it by hand is how a guard becomes decoration; the number goes DOWN as packs
// get attested.
// 1 = denovo:fda, the one pack I would not attest. Its outline is versioned
// 'fda-denovo-2024' but De Novo has no CFR annex enumerating a dossier the way
// 814.20(b) does for a PMA, so I could not say from the migration alone whether
// it was transcribed from FDA guidance or constructed. Guessing 'statutory_
// transcription' to make the number zero would be the exact overclaim the
// column exists to prevent. It stays visible until someone checks.
const CEILING = 1;

if (undeclared.length > CEILING) {
  console.error(
    `\n❌ ${undeclared.length} undeclared pack(s), above the ceiling of ${CEILING}.\n` +
      `   A newly seeded pack must declare its basis. Lower the ceiling in this\n` +
      `   file when you attest one; never raise it.\n`,
  );
  process.exit(1);
}

console.log(`\n✅ undeclared packs: ${undeclared.length}/${CEILING} (ceiling is downward-only).`);

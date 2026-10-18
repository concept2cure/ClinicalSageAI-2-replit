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
/**
 * Each statement starting at a match of `head`, up to its terminating semicolon.
 * A statement ends at the first semicolon that is not inside a quoted string.
 * required_sections JSON contains no semicolons outside quotes, but labels and
 * provenance sentences legitimately do, so track quoting rather than taking
 * indexOf(';').
 *
 * A dollar-quoted body ($pack$ … $pack$) is skipped whole (added 2026-10-18).
 * Tracking single quotes alone, an apostrophe inside a pack's JSON ("sponsor's")
 * flipped the quote state, the statement ran on to some later semicolon, and
 * every tuple after the blob was lost: 20261005 seeds four packs in one INSERT
 * and the gate saw one. A pair-level attestation hid it; asking for every live
 * version's attestation exposed it.
 */
const DOLLAR_TAG = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;

function statementsAt(sql, head) {
  const out = [];
  let m;
  while ((m = head.exec(sql)) !== null) {
    const start = m.index;
    let i = start;
    let inStr = false;
    while (i < sql.length) {
      const c = sql[i];
      if (c === "'") {
        if (inStr && sql[i + 1] === "'") { i += 2; continue; } // escaped ''
        inStr = !inStr;
      } else if (c === '$' && !inStr) {
        const tag = DOLLAR_TAG.exec(sql.slice(i, i + 64));
        if (tag) {
          const close = sql.indexOf(tag[0], i + tag[0].length);
          if (close !== -1) { i = close + tag[0].length; continue; }
        }
      } else if (c === ';' && !inStr) {
        break;
      }
      i += 1;
    }
    out.push(sql.slice(start, i));
  }
  return out;
}

function packsIn(sql) {
  const found = [];
  for (const stmt of statementsAt(sql, /INSERT\s+INTO\s+c2c_rule_packs/gi)) {

    // Form 1 — literal tuples: VALUES ('pma','fda','v1', …)
    for (const t of stmt.matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*'([a-z_]+)'\s*,\s*'([^']+)'\s*,/gi)) {
      found.push({ docType: t[1], agency: t[2], version: t[3] });
    }

    // Form 2 — a dollar-quoted JSON blob fed through jsonb_to_recordset, which
    // is how 20260528_phase9_document_schema.sql seeds THIRTEEN packs including
    // pma:fda, k510:fda and cer:ema.
    //
    // Handling only form 1 is the bug this comment exists for. This gate
    // previously reported "12 rule pack(s) seeded across migrations" and named
    // one undeclared, while silently seeing none of those thirteen — a guard
    // announcing a complete inventory and holding half of one. The undercount
    // read as a clean result, which is the same shape as the 4000-character
    // window recorded above: both looked like an answer.
    for (const t of stmt.matchAll(
      /"doc_type"\s*:\s*"([a-z0-9_]+)"\s*,\s*"agency"\s*:\s*"([a-z0-9_]+)"\s*,\s*"version"\s*:\s*"([^"]+)"/gi,
    )) {
      found.push({ docType: t[1], agency: t[2], version: t[3] });
    }
  }
  return found;
}

/**
 * What the UPDATE statements on c2c_rule_packs in one migration say: which packs
 * they attest a source basis for, and which versions they supersede.
 *
 * Added 2026-10-18. This gate read attestations from 20260810c ONLY, while every
 * pack migration since (20260901, 20260901b, 20260902, 20261005, 20261005b,
 * 20261005c) attests its own new versions in its own file, after 20260810c
 * re-runs. So the gate never saw those attestations — k510:fda and denovo:fda,
 * listed below as unattested, have carried an attestation since 20260901b — and
 * a migration that seeded new packs and attested them in the same file
 * (20261018, nineteen filing document classes) read as nineteen undeclared
 * packs. Same shape as the two parser bugs recorded above: a guard announcing an
 * inventory while blind to half of it.
 *
 * Only a statement that ASSIGNS a declared basis counts: 20260810c's step 1
 * COALESCEs every row to 'undeclared', and a supersede statement names a version
 * in its WHERE without saying anything about its basis.
 */
function updatesIn(sql) {
  const attestations = [];
  const superseded = [];
  for (const stmt of statementsAt(sql, /UPDATE\s+c2c_rule_packs\b/gi)) {
    const docType = /\bdoc_type\s*=\s*'([a-z0-9_]+)'/i.exec(stmt)?.[1] ?? null;
    const agency = /\bagency\s*=\s*'([a-z_]+)'/i.exec(stmt)?.[1] ?? null;
    const version = /\bversion\s*=\s*'([^']+)'/i.exec(stmt)?.[1] ?? null;
    const basis = /\bsource_basis\s*=\s*'([a-z_]+)'/i.exec(stmt)?.[1] ?? null;
    if (basis && basis !== 'undeclared') {
      const prefix = /\bversion\s+LIKE\s+'([^']+)%'/i.exec(stmt)?.[1] ?? null;
      const excluded = /\bdoc_type\s+NOT\s+IN\s*\(([^)]*)\)/i.exec(stmt)?.[1];
      attestations.push({
        docType, agency, version, prefix,
        exclude: excluded ? [...excluded.matchAll(/'([a-z0-9_]+)'/gi)].map((x) => x[1]) : [],
      });
    }
    if (/\bSET\s+superseded_by\s*=\s*'[^']+'/i.test(stmt) && docType && agency && version) {
      superseded.push({ docType, agency, version });
    }
  }
  return { attestations, superseded };
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
    // The form this parser was blind to. 20260528 seeds thirteen packs this
    // way; the gate saw none of them and still printed a total.
    [
      `INSERT INTO c2c_rule_packs (doc_type, agency, version, label, required_sections)
       SELECT rp.doc_type, rp.agency, rp.version, rp.label, rp.required_sections
       FROM jsonb_to_recordset($rp$[{"doc_type":"pma","agency":"fda","version":"fda-pma-2024","label":"PMA","required_sections":[]}]$rp$::jsonb)
       AS rp(doc_type text, agency text, version text, label text, required_sections jsonb);`,
      1,
      'a pack seeded through a dollar-quoted jsonb blob is found',
    ],
    [
      `INSERT INTO c2c_rule_packs (doc_type, agency, version, label, required_sections)
       SELECT * FROM jsonb_to_recordset($rp$[{"doc_type":"k510","agency":"fda","version":"v1","label":"A","required_sections":[]},{"doc_type":"cer","agency":"ema","version":"v2","label":"B","required_sections":[]}]$rp$::jsonb) AS rp(a text);`,
      2,
      'several packs in one jsonb blob are all found',
    ],
    [
      // 2026-10-18: an apostrophe inside a dollar-quoted blob hid every later tuple.
      `INSERT INTO c2c_rule_packs (doc_type, agency, version, label, required_sections) VALUES
       ('a', 'fda', 'v1', 'A', $pack$[{"key":"1","label":"The sponsor's position"}]$pack$::jsonb),
       ('b', 'fda', 'v2', 'B', $pack$[]$pack$::jsonb) ON CONFLICT DO NOTHING;`,
      2,
      'a tuple after an apostrophe inside a dollar-quoted blob is still found',
    ],
    [
      // A blob big enough that a window-based reader would lose the tail, which
      // is exactly how the earlier 4000-character version failed.
      `INSERT INTO c2c_rule_packs SELECT * FROM jsonb_to_recordset($rp$[{"doc_type":"a","agency":"fda","version":"v1","label":"${'x'.repeat(9000)}"},{"doc_type":"b","agency":"ema","version":"v2","label":"y"}]$rp$::jsonb) AS rp(a text);`,
      2,
      'a jsonb pack after a 9KB label is still found',
    ],
  ];
  for (const [sql, want, label] of cases) {
    const got = packsIn(sql).length;
    if (got !== want) {
      console.error(`self-check FAILED — ${label}: expected ${want} pack(s), got ${got}`);
      process.exit(2);
    }
  }

  // updatesIn (added 2026-10-18): what counts as an attestation, and what does not.
  const updateCases = [
    [`UPDATE c2c_rule_packs SET source_basis = 'reasoned_construction', confidence = 'low', uncertainties = 'a; b'
       WHERE doc_type = 'pas' AND agency = 'fda' AND version = 'v1';`, 1, 0, 'a version-scoped attestation in any file, with a semicolon in a quoted value'],
    [`UPDATE c2c_rule_packs SET superseded_by = 'v2'
       WHERE doc_type = 'briefing' AND agency = 'fda' AND version = 'v1' AND superseded_by IS NULL;`, 0, 1, 'a supersede names a version and attests nothing'],
    [`UPDATE c2c_rule_packs SET source_basis = COALESCE(source_basis, 'undeclared'), confidence = COALESCE(confidence, 'unknown');`, 0, 0, "the backfill to 'undeclared' attests nothing"],
    [`UPDATE c2c_rule_packs SET source_basis = 'undeclared' WHERE doc_type = 'x' AND agency = 'fda';`, 0, 0, "an explicit 'undeclared' attests nothing"],
  ];
  for (const [sql, wantAtt, wantSup, label] of updateCases) {
    const got = updatesIn(sql);
    if (got.attestations.length !== wantAtt || got.superseded.length !== wantSup) {
      console.error(`self-check FAILED — ${label}: expected ${wantAtt} attestation(s) and ${wantSup} supersede(s), got ${got.attestations.length} and ${got.superseded.length}`);
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

// ── collect every attestation and every supersede, from every migration ──────
// 20260810c must still exist: it adds the columns every attestation writes.
if (!fs.existsSync(path.join(ROOT, PROVENANCE))) {
  console.error(`❌ ${PROVENANCE} is missing — no pack can declare its basis.`);
  process.exit(1);
}

const attestations = [];
const supersededKeys = new Set(); // "doc:agency:version"
for (const file of fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) {
  const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
  if (!/c2c_rule_packs/i.test(sql)) continue;
  const { attestations: a, superseded } = updatesIn(sql);
  attestations.push(...a);
  for (const x of superseded) supersededKeys.add(`${x.docType}:${x.agency}:${x.version}`);
}

/** Does any attestation cover this exact pack version? */
function attestedVersion(entry, version) {
  return attestations.some((a) => {
    if (a.prefix) return version.startsWith(a.prefix) && !a.exclude.includes(entry.docType);
    if (a.docType !== entry.docType || a.agency !== entry.agency) return false;
    return a.version === null || a.version === version;
  });
}

/** The versions a migration seeds and no migration supersedes: what a new document is built against. */
function liveVersions(entry, key) {
  return [...entry.versions].filter((v) => !supersededKeys.has(`${key}:${v}`));
}

/** A pack is declared when every live version of it carries an attestation. */
function attested(entry, key) {
  const live = liveVersions(entry, key);
  return live.length > 0 && live.every((v) => attestedVersion(entry, v));
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
    const unattestedLive = liveVersions(entry, key).filter((v) => !attestedVersion(entry, v));
    console.log(`   ${key.padEnd(14)} ${(unattestedLive.length ? unattestedLive : [...entry.versions]).join(', ')}`);
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
//
// ── Why this reads 5 and not 1 ──────────────────────────────────────────────
// It was 1. The debt did not grow — the gate started seeing it. `packsIn`
// matched only literal VALUES tuples and had no branch for the dollar-quoted
// jsonb_to_recordset form, so it never saw the THIRTEEN packs seeded by
// 20260528_phase9_document_schema.sql. It reported "12 rule pack(s) seeded
// across migrations" and one undeclared. The real figures are 22 and 5.
//
// This is a re-base against a corrected measurement, not a ceiling raised to
// admit new debt, and the distinction is the whole point: the four packs below
// were always undeclared and the guard was quietly asserting otherwise. Any
// future move is downward only.
//
// The five, and why each is still unattested rather than guessed:
//
//   k510:fda      A/B/C/D/E. 21 CFR 807.87 does enumerate a premarket
//                 notification's contents, but whether THIS tree was
//                 transcribed from 807.87 or built from the eSTAR/RTA guidance
//                 is not answerable from the migration, and 807.87's text is
//                 not reachable from this environment to check.
//   cer:ema       Versioned eu-mdr-2017-745. A CER's structure comes from MDR
//                 Annex XIV Part A together with MEDDEV 2.7/1 rev 4 — an annex
//                 and a guidance, which are two different bases.
//   psur:ema      Versioned ich-e2c-r2 and its keys look like E2C(R2) section
//                 numbers, which would make it harmonised_standard. But it
//                 seeds 1,2,3,5,6,15,17,18 — a SUBSET, and choosing a subset
//                 is a judgement that changes the answer.
//   briefing:fda  Formal-meeting briefing packages are described in FDA
//                 guidance, not enumerated in regulation.
//   denovo:fda    De Novo has no CFR annex enumerating a dossier the way
//                 814.20(b) does for a PMA.
//
// Attesting any of them means reading the primary text. eCFR, EUR-Lex and the
// ICH site are all blocked by this environment's egress proxy, so I cannot,
// and guessing a basis to lower the number is the exact overclaim the column
// exists to prevent. They stay visible until someone with access checks.
//
// ── Why this reads 1 (2026-10-18) ───────────────────────────────────────────
// Re-based down against a corrected measurement again, not lowered by attesting
// anything here. The gate read attestations from 20260810c only, and its
// statement scanner lost every tuple after an apostrophe inside a dollar-quoted
// blob (updatesIn and statementsAt above). It now reads every migration and
// asks that each LIVE version (seeded, not superseded) carry an attestation:
//
//   k510:fda, denovo:fda  attested by 20260901b and 20261005c, which read the
//                         eSTAR structure and say so in their uncertainties.
//                         The note above predates both.
//   psur:ema, briefing:fda  their live versions (ich-e2c-r2-v2.0,
//                         fda-formal-meetings-2026-v1.0) are attested by
//                         20261018. The superseded versions stay undeclared,
//                         and nothing new is built against them.
//   cer:ema               still undeclared, for the reason above.
//
// Before this change the corrected gate measured 1 on trunk too: the four were
// already attested, or became so in the same change that would otherwise have
// read as nineteen undeclared packs.
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

// ── no unattributed sign-off may be committed ────────────────────────────────
//
// Migration 20260810d puts a CHECK on the table, which protects the database.
// It does not protect the repository: a migration file that sets
// review_status='reviewed' without also setting reviewed_by / reviewed_at /
// reviewed_sections_sha would fail at deploy time, on whichever environment
// runs it first, having already passed review as a diff.
//
// 'reviewed' is the only value here a filer is entitled to rely on. It must
// name a person, a date, and the exact tree they looked at, and that has to be
// visible in the diff — not discovered by a failing migration.
const REVIEWED_ASSIGNMENT = /review_status\s*=\s*'reviewed'|'reviewed'\s*(?:,|\))/i;
const ATTRIBUTION_FIELDS = ['reviewed_by', 'reviewed_at', 'reviewed_sections_sha'];

const unattributed = [];
for (const name of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
  const file = path.join(MIGRATIONS, name);
  const sql = fs.readFileSync(file, 'utf8');
  if (!/c2c_rule_packs/i.test(sql)) continue;

  for (const stmt of sql.split(';')) {
    if (!/c2c_rule_packs/i.test(stmt)) continue;
    // A CHECK constraint or a view naturally mentions the literal without
    // asserting it about any row.
    if (/\bCHECK\s*\(|CREATE\s+(OR\s+REPLACE\s+)?VIEW|CONSTRAINT\b/i.test(stmt)) continue;
    if (!REVIEWED_ASSIGNMENT.test(stmt)) continue;

    // Substring match, not `new RegExp(f)`. These are fixed column identifiers
    // with no metacharacters, so building a regex from them bought nothing and
    // tripped Semgrep's detect-non-literal-regexp rule. Not exploitable — the
    // values are hardcoded above, never input — but a dynamic regex that gains
    // nothing is worth deleting rather than annotating.
    const haystack = stmt.toLowerCase();
    const missing = ATTRIBUTION_FIELDS.filter((f) => !haystack.includes(f));
    if (missing.length > 0) {
      unattributed.push({ file: path.relative(ROOT, file), missing });
    }
  }
}

if (unattributed.length > 0) {
  console.error(`\n❌ ${unattributed.length} statement(s) mark a pack reviewed without attribution:\n`);
  for (const u of unattributed) {
    console.error(`   ${u.file} — missing ${u.missing.join(', ')}`);
  }
  console.error(
    `\n   A sign-off must name who reviewed it, when, and the digest of the\n` +
      `   section tree they reviewed. Without the digest the review silently\n` +
      `   survives any later edit to that tree.\n`,
  );
  process.exit(1);
}

console.log('✅ no pack is marked reviewed without a named reviewer, a date and a tree digest.');

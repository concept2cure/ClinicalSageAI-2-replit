// Consistency and readiness check for the PQ rag data:
//   server/eval/rag/gold-dataset.json  <->  server/eval/rag/guidance-corpus-manifest.json
//
// Evidence script (docs/evidence/D4/2026-09-28-pq-rag-fail-closed/data/). Not wired
// into CI; promoting it to a committed test is handed on (README.md, "Handed on").
//
// Usage:
//   node check-gold-manifest.mjs <gold.json> <manifest.json> <gold-at-base.json> [--ready]
//
// <gold-at-base.json> is the gold set as last committed before this change
// (git show 462a6ca7a:server/eval/rag/gold-dataset.json), so an original item's
// meaning cannot change unnoticed.
//
// Without --ready it checks STRUCTURE: every rule the data must satisfy today,
// while nothing is verified. Exit 1 on any structural error.
// With --ready it also checks PQ READINESS: every positive item carries an
// official-text quote, resolves only to verified entries and has no open check.
// Exit 1 when any positive item is not ready. Today that is every one of them,
// which is the honest state: the data is blocked on verification.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const ready = args.includes('--ready');
const [goldPath, manifestPath, basePath] = args.filter((a) => a !== '--ready');
if (!goldPath || !manifestPath || !basePath) {
  console.error('usage: node check-gold-manifest.mjs <gold.json> <manifest.json> <gold-at-base.json> [--ready]');
  process.exit(2);
}

const errors = [];
const err = (m) => errors.push(m);
const load = (p, label) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`${label} does not parse: ${e.message}`);
    process.exit(1);
  }
};
const gold = load(goldPath, 'gold');
const manifest = load(manifestPath, 'manifest');
const base = load(basePath, 'gold-at-base');

// Version patterns per scheme. A version that does not match its scheme is an error.
const VERSION_PATTERNS = {
  ICH: /^Step4$/,
  'US-CFR': /^\d{4}-04-01$/,
  'US-Code': /^USCODE-\d{4}$/,
  'FDA-guidance': /^final-\d{4}-\d{2}(-\d{2})?$/,
  'EU-CONS': /^CONS-\d{4}-\d{2}-\d{2}$/,
  'EU-OJ': /^OJ$/,
  UNPINNED: /^UNPINNED$/,
};
// Schemes that are editions of one code: the corpus holds one edition of each.
const SINGLE_EDITION_SCHEMES = ['US-CFR', 'US-Code'];
const ROLES = new Set(['answer-source', 'revision-distractor', 'supporting']);
// Quotation marks mark fetched text. A summary nobody fetched must not carry them.
const QUOTE_MARK = /["“”‘’]|(^|[\s(])'|'([\s).,;:]|$)/;

const isNegative = (item) => (item.tags ?? []).includes('negative-control');
const items = Array.isArray(gold.items) ? gold.items : (err('gold.items is not an array'), []);

// ── 1. Gold ids unique; original items unchanged in meaning ────────────────────
const ids = new Set();
for (const item of items) {
  if (ids.has(item.id)) err(`duplicate gold id ${item.id}`);
  ids.add(item.id);
}
const ORIGINAL_FIELDS = ['id', 'question', 'expectedSourceIds', 'expectedAnswerContains', 'tags', 'referenceAnswer'];
const baseIds = new Set(base.items.map((i) => i.id));
for (const b of base.items) {
  const g = items.find((i) => i.id === b.id);
  if (!g) {
    err(`base item ${b.id} missing`);
    continue;
  }
  for (const f of ORIGINAL_FIELDS) {
    if (JSON.stringify(g[f]) !== JSON.stringify(b[f])) err(`item ${b.id}: original field ${f} changed`);
  }
}

// ── 2. Manifest blocks ─────────────────────────────────────────────────────────
const issuers = manifest.issuers ?? {};
const publishers = manifest.publishers ?? {};
if (!Object.keys(issuers).length) err('manifest has no issuers block');
if (!Object.keys(publishers).length) err('manifest has no publishers block');
for (const scheme of Object.keys(VERSION_PATTERNS)) {
  if (!manifest.versionScheme?.[scheme]) err(`versionScheme.${scheme} is not described`);
}
for (const [name, p] of Object.entries(publishers)) {
  if (p.termsVerified === true) {
    if (!p.terms || !p.termsUrl) err(`publisher ${name}: termsVerified without quoted terms and termsUrl`);
  } else if (p.terms !== null) {
    err(`publisher ${name}: terms set while termsVerified is not true`);
  }
  if (p.termsSearchIndexSummary && QUOTE_MARK.test(p.termsSearchIndexSummary)) {
    err(`publisher ${name}: termsSearchIndexSummary carries quotation marks, but it is not fetched text`);
  }
}

// ── 3. Manifest entries ────────────────────────────────────────────────────────
const byKey = new Map();
const sha = new Map();
const editions = new Map();
for (const e of manifest.entries ?? []) {
  const key = `${e.document_code}@${e.version}`;
  if (!e.document_code || !e.version) err(`entry without document_code/version: ${key}`);
  if (key.split('@').length !== 2) err(`key has an extra '@': ${key}`);
  if (byKey.has(key)) err(`duplicate manifest key ${key}`);
  byKey.set(key, e);
  if (!issuers[e.issuer]) err(`${key}: issuer ${e.issuer} is not in issuers`);
  if (!publishers[e.publisher]) err(`${key}: publisher ${e.publisher} is not in publishers`);
  if (!publishers[e.redistribution?.termsOf]) err(`${key}: redistribution.termsOf is not in publishers`);
  if (!ROLES.has(e.role)) err(`${key}: unknown role ${e.role}`);
  const pattern = VERSION_PATTERNS[e.versionScheme];
  if (!pattern) err(`${key}: unknown versionScheme ${e.versionScheme}`);
  else if (!pattern.test(e.version)) err(`${key}: version ${e.version} does not match versionScheme ${e.versionScheme}`);
  if (SINGLE_EDITION_SCHEMES.includes(e.versionScheme)) {
    if (!editions.has(e.versionScheme)) editions.set(e.versionScheme, new Set());
    editions.get(e.versionScheme).add(e.version);
  }
  if (e.verified === true) {
    if (e.versionScheme === 'UNPINNED') err(`${key}: verified while UNPINNED`);
    if (e.versionVerified !== true) err(`${key}: verified without versionVerified`);
    if (!e.sourceUrl) err(`${key}: verified without sourceUrl`);
    if (!/^[0-9a-f]{64}$/.test(e.sha256 ?? '')) err(`${key}: verified without sha256`);
    if (!e.date) err(`${key}: verified without date`);
    if (publishers[e.redistribution?.termsOf]?.termsVerified !== true) err(`${key}: verified while its publisher's terms are unverified`);
    if (e.sha256) {
      if (sha.has(e.sha256)) err(`${key}: shares sha256 with ${sha.get(e.sha256)} (one entry is one file)`);
      sha.set(e.sha256, key);
    }
  } else {
    if (e.verified !== false) err(`${key}: verified must be true or false`);
    if (e.sourceUrl !== null || e.sha256 !== null || e.date !== null) {
      err(`${key}: unverified entry carries a verified-only field (sourceUrl/sha256/date)`);
    }
    if (e.sha256 === null && !e.sha256NullReason) err(`${key}: sha256 null without reason`);
  }
}
for (const [scheme, versions] of editions) {
  if (versions.size > 1) err(`${scheme} entries pin more than one edition: ${[...versions].sort().join(', ')}`);
}

// ── 4. Gold keys ───────────────────────────────────────────────────────────────
const keyedBy = new Map();
let anyProvisional = false;
for (const item of items) {
  const keys = item.expectedSourceKeys;
  if (!Array.isArray(keys)) {
    err(`item ${item.id}: expectedSourceKeys missing`);
    continue;
  }
  if (isNegative(item) && keys.length) err(`negative ${item.id} has expected source keys`);
  if (!isNegative(item) && keys.length === 0) err(`positive ${item.id} has no expected source keys`);
  if ((item.expectedSourceIds ?? []).length) err(`item ${item.id}: expectedSourceIds must stay [] until run-eval resolves keys`);
  for (const k of keys) {
    const e = byKey.get(k);
    if (!e) {
      err(`item ${item.id}: key ${k} matches no manifest entry`);
      continue;
    }
    if (e.versionScheme === 'UNPINNED') err(`item ${item.id}: key ${k} names an UNPINNED entry`);
    if (e.role !== 'answer-source') err(`item ${item.id}: key ${k} names a ${e.role} entry, not an answer-source`);
    if (e.versionVerified !== true) anyProvisional = true;
    if (!keyedBy.has(k)) keyedBy.set(k, new Set());
    keyedBy.get(k).add(item.id);
  }
  if (item.openChecks !== undefined) {
    if (!Array.isArray(item.openChecks) || !item.openChecks.length || item.openChecks.some((c) => typeof c !== 'string' || !c)) {
      err(`item ${item.id}: openChecks must be a non-empty array of strings`);
    }
  }
  // A new item needs a quote from a VERIFIED official text that contains every expected substring.
  if (!baseIds.has(item.id) && !isNegative(item)) {
    checkNewItemEvidence(item, keys);
  }
}
function checkNewItemEvidence(item, keys) {
  const ev = item.evidence;
  if (!ev || !ev.document_code || !ev.section || !ev.quote) {
    err(`new item ${item.id} lacks evidence {document_code, section, quote}`);
    return;
  }
  const evEntries = keys.map((k) => byKey.get(k)).filter((e) => e && e.document_code === ev.document_code);
  if (!evEntries.length) err(`new item ${item.id}: evidence document ${ev.document_code} is not among its keys`);
  else if (!evEntries.every((e) => e.verified === true)) err(`new item ${item.id}: evidence quotes an unverified entry`);
  const quote = ev.quote.toLowerCase();
  for (const s of item.expectedAnswerContains ?? []) {
    if (!quote.includes(String(s).toLowerCase())) err(`new item ${item.id}: '${s}' is not in the quote`);
  }
}
if (anyProvisional && gold.keysProvisional !== true) {
  err('gold keysProvisional must be true while any keyed entry has versionVerified:false');
}
for (const [key, e] of byKey) {
  const declared = [...(e.neededByGoldItems ?? [])].sort().join(',');
  const actual = [...(keyedBy.get(key) ?? [])].sort().join(',');
  if (declared !== actual) err(`${key}: neededByGoldItems [${declared}] != items keying it [${actual}]`);
}

// ── 5. Readiness (only with --ready) ───────────────────────────────────────────
const positives = items.filter((i) => !isNegative(i));
const notReady = [];
for (const item of positives) {
  const why = [];
  if (!item.evidence) why.push('no evidence quote');
  const unverified = (item.expectedSourceKeys ?? []).filter((k) => byKey.get(k)?.verified !== true);
  if (unverified.length) why.push(`unverified keys: ${unverified.join(', ')}`);
  if (item.openChecks?.length) why.push(`${item.openChecks.length} open check(s)`);
  if (why.length) notReady.push(`${item.id}: ${why.join('; ')}`);
}

const summary = {
  mode: ready ? 'structure+readiness' : 'structure',
  items: items.length,
  positives: positives.length,
  negatives: items.length - positives.length,
  newItems: items.filter((i) => !baseIds.has(i.id)).length,
  manifestEntries: byKey.size,
  verifiedEntries: [...byKey.values()].filter((e) => e.verified === true).length,
  distinctKeysUsed: keyedBy.size,
  keysProvisional: gold.keysProvisional === true,
  itemsWithOpenChecks: items.filter((i) => i.openChecks?.length).length,
  structuralErrors: errors,
  ...(ready ? { positivesReady: positives.length - notReady.length, notReady } : {}),
};
console.info(JSON.stringify(summary, null, 1));
process.exitCode = errors.length || (ready && notReady.length) ? 1 : 0;

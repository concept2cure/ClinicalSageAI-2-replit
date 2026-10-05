/**
 * scripts/verify-rag-corpus.mjs --org-uuid: the preflight for the corpus the
 * PQ rag component reads (D4 evidence
 * docs/evidence/D4/2026-09-28-pq-rag-unblock-misdescribed/, E8).
 *
 * THE DEFECT THIS PREVENTS. The protocol and the GA dashboard named
 * `node scripts/verify-rag-corpus.mjs` as the check that the rag corpus was
 * populated. That report counts nine tables across every tenant and exits 0
 * whatever it finds, while the pipeline reads exactly one store for the PQ —
 * embedded chunks in vault.document_chunks of ONE organization — and the
 * named "unblock" (ClinicalTrials.gov ingestion) writes csr_reports /
 * csr_details, which it never reads and the report never counted. So the
 * check could not fail on the case it was cited for.
 *
 * These cases pin: the org-scoped count is the pipeline's own predicate (the
 * vault arm's, sliced out of searchVaultSimilar, not merely present somewhere
 * in the file); an empty, unreadable or unknown-organization corpus exits
 * non-zero and is never reported as empty when it was unreadable; a non-empty
 * corpus is reported as non-empty and NOT as complete, because nothing here
 * checks it against the guidance-corpus manifest; csr_* is counted and labelled
 * as NOT read; and the default report (no flag) is untouched.
 *
 * Run: node --test tests/ops/verify-rag-corpus.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

import {
  EVAL_CORPUS_PREDICATES,
  evalCorpusVerdict,
  parseVerifyArgs,
  readCsrCounts,
  readEvalCorpus,
} from '../../scripts/verify-rag-corpus.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'verify-rag-corpus.mjs');

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const ORG_NONE = '33333333-3333-4333-8333-333333333333';

// ── argument parsing ──────────────────────────────────────────────────────────

test('no flag → the default report (orgUuid null)', () => {
  assert.deepEqual(parseVerifyArgs([]), { orgUuid: null });
});

test('--org-uuid <uuid> and --org-uuid=<uuid> are both read', () => {
  assert.deepEqual(parseVerifyArgs(['--org-uuid', ORG_A]), { orgUuid: ORG_A });
  assert.deepEqual(parseVerifyArgs([`--org-uuid=${ORG_A}`]), { orgUuid: ORG_A });
});

test('--org-uuid with no value, or a value that is not a uuid, is a usage error — never the default report', () => {
  assert.match(parseVerifyArgs(['--org-uuid']).error, /--org-uuid needs/);
  assert.match(parseVerifyArgs(['--org-uuid', '--other']).error, /--org-uuid needs/);
  assert.match(parseVerifyArgs(['--org-uuid', 'acme']).error, /not a uuid/);
});

// ── the decision ──────────────────────────────────────────────────────────────

const populated = {
  orgUuid: ORG_A,
  orgId: 7,
  documents: 3,
  documentsWithEmbeddedChunks: 2,
  chunks: 40,
  embeddedChunks: 25,
};

test('control — embedded chunks for the organization → exit 0', () => {
  const v = evalCorpusVerdict(populated, { csrReports: 0, csrDetails: 0 });
  assert.equal(v.exitCode, 0);
  assert.match(v.lines.join('\n'), /25 embedded chunk\(s\) across 2 document\(s\)/);
});

test('a non-empty corpus is reported as NON-EMPTY, and says plainly that completeness is NOT checked', () => {
  // Exit 0 on one embedded chunk is a non-empty preflight, not verification of
  // a 30-50 document corpus: nothing here reads the guidance-corpus manifest.
  const text = evalCorpusVerdict(populated, null).lines.join('\n');
  assert.match(text, /RESULT: NON-EMPTY/);
  assert.match(text, /completeness against the guidance-corpus manifest is NOT checked/);
  assert.doesNotMatch(text, /corpus is complete|verified corpus/i);
});

test('the headline says which store a PQ rag run WILL read, not that one reads it today', () => {
  // run-pq has no rag phase and run-eval passes no tenant yet
  // (docs/evidence/D4/2026-09-28-pq-rag-unblock-misdescribed/, E1 and E6).
  const head = evalCorpusVerdict(populated, null).lines[0];
  assert.match(head, /the store a PQ rag run will read/);
  assert.match(head, /once run-eval is tenant-scoped/);
  assert.doesNotMatch(head, /the store the PQ rag component reads/);
});

test('documents and chunks but nothing embedded → EMPTY, exit 1: the pipeline reads only embedded chunks', () => {
  const v = evalCorpusVerdict({ ...populated, documentsWithEmbeddedChunks: 0, embeddedChunks: 0 }, null);
  assert.equal(v.exitCode, 1);
  assert.match(v.lines.join('\n'), /EMPTY/);
});

test('a documented-but-unembedded document is named as not retrievable, without failing a non-empty corpus', () => {
  const v = evalCorpusVerdict(populated, null);
  assert.equal(v.exitCode, 0);
  assert.match(v.lines.join('\n'), /1 document\(s\) have no embedded chunk/);
});

test('an organization uuid that matches no organization → exit 1, and it says so rather than "empty"', () => {
  const v = evalCorpusVerdict({ orgUuid: ORG_NONE, orgId: null }, null);
  assert.equal(v.exitCode, 1);
  assert.match(v.lines.join('\n'), /no organization has uuid/);
  assert.doesNotMatch(v.lines.join('\n'), /EMPTY/);
});

test('the store is missing → exit 1, named as missing', () => {
  const v = evalCorpusVerdict({ orgUuid: ORG_A, missing: ['vault.document_chunks'] }, null);
  assert.equal(v.exitCode, 1);
  assert.match(v.lines.join('\n'), /vault\.document_chunks does not exist/);
});

test('a read error → exit 1, reported as unreadable, never as an empty corpus', () => {
  const v = evalCorpusVerdict({ orgUuid: ORG_A, error: 'permission denied for schema vault' }, null);
  assert.equal(v.exitCode, 1);
  assert.match(v.lines.join('\n'), /could not read.*permission denied/);
  assert.doesNotMatch(v.lines.join('\n'), /EMPTY/);
});

test('CT.gov rows in csr_* beside an empty eval corpus → still exit 1, and csr_* is labelled NOT read by the RAG pipeline', () => {
  const v = evalCorpusVerdict(
    { ...populated, documents: 0, documentsWithEmbeddedChunks: 0, chunks: 0, embeddedChunks: 0 },
    { csrReports: 500, csrDetails: 480 },
  );
  assert.equal(v.exitCode, 1);
  const text = v.lines.join('\n');
  assert.match(text, /csr_reports\s+rows=500.*NOT read by the RAG pipeline/);
  assert.match(text, /csr_details\s+rows=480.*NOT read by the RAG pipeline/);
});

test('csr_* that could not be counted is said, not shown as zero, and does not decide the exit code', () => {
  const v = evalCorpusVerdict(populated, { csrReports: null, csrDetails: null, error: 'boom' });
  assert.equal(v.exitCode, 0);
  assert.match(v.lines.join('\n'), /csr_reports\s+could not be counted: boom/);
});

// ── the count is the pipeline's predicate, against a real Postgres (PGlite) ──

async function corpusDb() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY, uuid uuid NOT NULL UNIQUE);
    CREATE SCHEMA vault;
    CREATE TABLE vault.documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id integer,
      document_title text
    );
    CREATE TABLE vault.document_chunks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id uuid NOT NULL REFERENCES vault.documents(id),
      chunk_text text NOT NULL,
      embedding real[]
    );
    INSERT INTO organizations (id, uuid) VALUES (1, '${ORG_A}'), (2, '${ORG_B}');
    -- org A: doc a1 has 2 embedded + 1 unembedded chunk; doc a2 has only an unembedded chunk
    INSERT INTO vault.documents (id, organization_id, document_title) VALUES
      ('a0000000-0000-4000-8000-000000000001', 1, 'ICH E9(R1)'),
      ('a0000000-0000-4000-8000-000000000002', 1, 'ICH Q7'),
      ('b0000000-0000-4000-8000-000000000001', 2, 'Org B doc'),
      ('c0000000-0000-4000-8000-000000000001', NULL, 'orphan');
    INSERT INTO vault.document_chunks (document_id, chunk_text, embedding) VALUES
      ('a0000000-0000-4000-8000-000000000001', 'estimand', '{0.1,0.2}'),
      ('a0000000-0000-4000-8000-000000000001', 'intercurrent', '{0.3,0.4}'),
      ('a0000000-0000-4000-8000-000000000001', 'not yet embedded', NULL),
      ('a0000000-0000-4000-8000-000000000002', 'not yet embedded', NULL),
      ('b0000000-0000-4000-8000-000000000001', 'another tenant', '{0.5,0.6}'),
      ('b0000000-0000-4000-8000-000000000001', 'another tenant', '{0.7,0.8}'),
      ('c0000000-0000-4000-8000-000000000001', 'orphan', '{0.9,1.0}');
  `);
  return db;
}

test('counts only the named organization\'s embedded chunks — not another tenant\'s, not an orphan\'s', async () => {
  const db = await corpusDb();
  try {
    const r = await readEvalCorpus(db, ORG_A);
    assert.deepEqual(r, {
      orgUuid: ORG_A,
      orgId: 1,
      documents: 2,
      documentsWithEmbeddedChunks: 1,
      chunks: 4,
      embeddedChunks: 2,
    });
    assert.equal(evalCorpusVerdict(r, null).exitCode, 0);
  } finally {
    await db.close();
  }
});

test('an organization with no documents → counted as zero, and the verdict is EMPTY', async () => {
  const db = await corpusDb();
  try {
    await db.exec(`INSERT INTO organizations (id, uuid) VALUES (3, '${ORG_NONE}')`);
    const r = await readEvalCorpus(db, ORG_NONE);
    assert.equal(r.orgId, 3);
    assert.equal(r.embeddedChunks, 0);
    assert.equal(evalCorpusVerdict(r, null).exitCode, 1);
  } finally {
    await db.close();
  }
});

test('an organization uuid nobody has → orgId null (not a zero count)', async () => {
  const db = await corpusDb();
  try {
    const r = await readEvalCorpus(db, ORG_NONE);
    assert.equal(r.orgId, null);
    assert.equal(r.embeddedChunks, undefined);
  } finally {
    await db.close();
  }
});

test('the store absent → named as missing', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE organizations (id serial PRIMARY KEY, uuid uuid NOT NULL UNIQUE)');
    const r = await readEvalCorpus(db, ORG_A);
    assert.deepEqual(r.missing, ['vault.documents', 'vault.document_chunks']);
  } finally {
    await db.close();
  }
});

test('a query that fails is returned as an error, not as counts', async () => {
  const failing = {
    query: async (sql) => {
      if (/to_regclass/.test(sql)) return { rows: [{ organizations: 'organizations', documents: 'vault.documents', chunks: 'vault.document_chunks' }] };
      if (/^\s*(BEGIN|ROLLBACK|SELECT set_config)/i.test(sql)) return { rows: [] };
      throw new Error('permission denied for schema vault');
    },
  };
  const r = await readEvalCorpus(failing, ORG_A);
  assert.match(r.error, /permission denied/);
  assert.equal(r.embeddedChunks, undefined);
});

test('the read sets the same tenant GUC the pipeline\'s withTenantContext sets (no RLS claim: not tested here)', async () => {
  const seen = [];
  const db = await corpusDb();
  try {
    const spy = { query: (sql, params) => { seen.push([sql.trim().split(/\s+/).slice(0, 2).join(' '), params]); return db.query(sql, params); } };
    await readEvalCorpus(spy, ORG_A);
    const guc = seen.find(([s]) => /set_config/.test(s));
    assert.ok(guc, 'set_config(app.current_org_id, …) must be issued');
    assert.deepEqual(guc[1], [ORG_A]);
  } finally {
    await db.close();
  }
});

test('csr_reports / csr_details are counted when present, and absent tables are null', async () => {
  const db = new PGlite();
  try {
    assert.deepEqual(await readCsrCounts(db), { csrReports: null, csrDetails: null });
    await db.exec(`
      CREATE TABLE csr_reports (id serial PRIMARY KEY);
      CREATE TABLE csr_details (id serial PRIMARY KEY, report_id integer);
      INSERT INTO csr_reports DEFAULT VALUES; INSERT INTO csr_reports DEFAULT VALUES;
      INSERT INTO csr_details (report_id) VALUES (1);
    `);
    assert.deepEqual(await readCsrCounts(db), { csrReports: 2, csrDetails: 1 });
  } finally {
    await db.close();
  }
});

// ── the count cannot drift from the pipeline's vault arm without this failing ──
//
// The pin reads the vault arm itself: every SQL template in searchVaultSimilar
// that reads vault.document_chunks, reduced to its FROM/JOIN clause and its
// top-level WHERE conjuncts. Each arm's predicate set must EQUAL the preflight's
// — so a predicate that moves out of the vault arm fails it even if the same
// text survives in the rag_chunks arms, and a restriction ADDED to the vault
// arm (d.deleted_at IS NULL, say) fails it too, because the preflight would
// then count chunks retrieval excludes.

const PIPELINE = path.join(REPO, 'server', 'services', 'advancedRAGPipeline.ts');
const [FROM_CHUNKS, JOIN_DOCS, EMBEDDED, IN_ORG] = EVAL_CORPUS_PREDICATES;
const norm = (s) => s.replace(/\$\d+/g, '$N').replace(/\s+/g, ' ').trim();
/** The lexical arm's text match: a property of the query, not of the corpus, so the preflight does not count by it. */
const QUERY_MATCH = norm("to_tsvector('english', c.chunk_text) @@ websearch_to_tsquery('english', $1)");

/** The body of searchVaultSimilar, comments removed. */
function vaultArmBody(source) {
  const start = source.search(/\n {2}(?:private |public |protected )?async searchVaultSimilar\s*\(/);
  if (start < 0) return null;
  const rest = source.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}(?:private |public |protected )?(?:async )?\w+\s*\(/);
  const body = next < 0 ? rest : rest.slice(0, next + 1);
  return body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** FROM/JOIN, top-level WHERE conjuncts and ${…} filter placeholders of one SQL template. */
function sqlShape(sql) {
  const text = sql.replace(/--[^\n]*/g, '');
  const from = text.indexOf('FROM vault.document_chunks c');
  const where = text.indexOf('WHERE', from);
  const conds = text.slice(where + 'WHERE'.length);
  let depth = 0;
  let end = conds.length;
  for (let i = 0; i < conds.length; i++) {
    const ch = conds[i];
    if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) { end = i; break; }
    else if (depth === 0 && /^(ORDER BY|GROUP BY|LIMIT)\b/.test(conds.slice(i))) { end = i; break; }
  }
  const whereText = conds.slice(0, end);
  const filters = [...whereText.matchAll(/\$\{(\w+)\}/g)].map((m) => m[1]);
  const conjuncts = [];
  let cur = '';
  depth = 0;
  const bare = whereText.replace(/\$\{\w+\}/g, '');
  for (let i = 0; i < bare.length; i++) {
    const ch = bare[i];
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && /^\sAND\s/i.test(bare.slice(i, i + 5))) { conjuncts.push(norm(cur)); cur = ''; i += 4; continue; }
    cur += ch;
  }
  conjuncts.push(norm(cur));
  return { from: norm(text.slice(from, where)), conjuncts: conjuncts.filter(Boolean), filters };
}

/** What differs between the vault arm's predicates and the preflight's. Empty = in step. */
function vaultArmDrift(source) {
  const body = vaultArmBody(source);
  if (!body) return ['searchVaultSimilar is gone from advancedRAGPipeline.ts'];
  const arms = [...body.matchAll(/`([^`]*)`/g)].map((m) => m[1]).filter((t) => t.includes('FROM vault.document_chunks c'));
  if (arms.length !== 2) return [`expected the dense and lexical vault arms (2 SQL templates), found ${arms.length}`];
  const want = [norm(EMBEDDED), norm(IN_ORG)].sort();
  const problems = [];
  arms.forEach((sql, i) => {
    const arm = i === 0 ? 'dense' : 'lexical';
    const shape = sqlShape(sql);
    if (shape.from !== norm(`${FROM_CHUNKS} ${JOIN_DOCS}`)) problems.push(`${arm} arm reads ${shape.from}`);
    const got = shape.conjuncts.filter((c) => !(arm === 'lexical' && c === QUERY_MATCH)).sort();
    for (const c of got) if (!want.includes(c)) problems.push(`${arm} arm restricts by a predicate the preflight does not count by: ${c}`);
    for (const c of want) if (!got.includes(c)) problems.push(`${arm} arm no longer restricts by: ${c}`);
    if (shape.filters.length !== 1 || !/Filter$/.test(shape.filters[0])) {
      problems.push(`${arm} arm's caller-filter placeholders changed: ${JSON.stringify(shape.filters)}`);
    }
  });
  return problems;
}

test('the vault arm retrieves by exactly the predicates the preflight counts by', () => {
  assert.deepEqual(vaultArmDrift(readFileSync(PIPELINE, 'utf8')), []);
});

test('the pin fails when the vault arm gains a restriction the preflight does not count by', () => {
  const src = readFileSync(PIPELINE, 'utf8');
  const mutated = src.replace('WHERE c.embedding IS NOT NULL${denseFilter}', 'WHERE c.embedding IS NOT NULL${denseFilter}\n            AND d.deleted_at IS NULL');
  assert.notEqual(mutated, src, 'the mutation must apply');
  assert.match(vaultArmDrift(mutated).join('\n'), /dense arm restricts by a predicate the preflight does not count by: d\.deleted_at IS NULL/);
});

test('the pin fails when a predicate leaves the vault arm, even though the same text survives in the rag_chunks arms', () => {
  const src = readFileSync(PIPELINE, 'utf8');
  const mutated = src.replace('WHERE c.embedding IS NOT NULL${lexFilter}', 'WHERE TRUE${lexFilter}');
  assert.notEqual(mutated, src, 'the mutation must apply');
  // A whole-file search — the pin this replaces — still finds it (rag_chunks arms).
  assert.ok(mutated.includes('c.embedding IS NOT NULL'));
  assert.match(vaultArmDrift(mutated).join('\n'), /lexical arm no longer restricts by: c\.embedding IS NOT NULL/);
});

// ── the CLI ───────────────────────────────────────────────────────────────────

function runCli(args) {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.NEON_DATABASE_URL;
  delete env.DATABASE_NEON_NEW_SECRET;
  return spawnSync(process.execPath, [SCRIPT, ...args], { env, encoding: 'utf8' });
}

test('CLI — a malformed --org-uuid exits 2 before touching a database', () => {
  const r = runCli(['--org-uuid', 'acme']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not a uuid/);
});

test('CLI — no flag and no database URL: the pre-existing message and exit 1, unchanged', () => {
  const r = runCli([]);
  assert.equal(r.status, 1);
  assert.equal(r.stderr.trim(), 'No database URL found. Set DATABASE_URL, NEON_DATABASE_URL, or DATABASE_NEON_NEW_SECRET.');
});

// ── the CLI end to end, against a real Postgres engine (PGlite standing in for pg) ──
// The exit code IS this check's output, so it is asserted from the process, not
// from evalCorpusVerdict: a verdict of 1 that the process reports as 0 is a pass.

const REGISTER = path.join(HERE, 'helpers', 'pglite-as-pg-register.mjs');

const SEED = `
  CREATE TABLE organizations (id serial PRIMARY KEY, uuid uuid NOT NULL UNIQUE);
  INSERT INTO organizations (id, uuid) VALUES (1, '${ORG_A}'), (2, '${ORG_B}');
  CREATE SCHEMA vault;
  CREATE TABLE vault.documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id integer, processing_status text);
  CREATE TABLE vault.document_chunks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES vault.documents(id), chunk_text text NOT NULL, embedding real[]);
  CREATE TABLE csr_reports (id serial PRIMARY KEY, organization_id integer NOT NULL);
  CREATE TABLE csr_details (id serial PRIMARY KEY, report_id integer NOT NULL);
  -- What CT.gov ingestion leaves behind, plus another tenant's embedded vault content:
  -- both are counted by the default report, neither is the evaluation corpus.
  INSERT INTO csr_reports (organization_id) SELECT 2 FROM generate_series(1, 500);
  INSERT INTO csr_details (report_id) SELECT g FROM generate_series(1, 480) g;
  INSERT INTO vault.documents (id, organization_id, processing_status) VALUES ('b0000000-0000-4000-8000-000000000001', 2, 'completed');
  INSERT INTO vault.document_chunks (document_id, chunk_text, embedding) VALUES ('b0000000-0000-4000-8000-000000000001', 'x', '{0.1}');
`;
const EVAL_CONTENT = `
  INSERT INTO vault.documents (id, organization_id, processing_status) VALUES ('a0000000-0000-4000-8000-000000000001', 1, 'completed');
  INSERT INTO vault.document_chunks (document_id, chunk_text, embedding) VALUES ('a0000000-0000-4000-8000-000000000001', 'estimand', '{0.3}');
`;

function runCliOnDb(seed, args) {
  const env = { ...process.env, DATABASE_URL: 'pglite://memory', PGLITE_SEED: seed };
  delete env.NEON_DATABASE_URL;
  delete env.DATABASE_NEON_NEW_SECRET;
  return spawnSync(process.execPath, ['--import', REGISTER, SCRIPT, ...args], { env, encoding: 'utf8' });
}

test('CLI e2e — CT.gov rows and another tenant\'s chunks, but an empty evaluation org → exit 1, EMPTY, csr_* NOT read', () => {
  const r = runCliOnDb(SEED, ['--org-uuid', ORG_A]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /RESULT: EMPTY/);
  assert.match(r.stdout, /csr_reports\s+rows=500\s+NOT read by the RAG pipeline/);
});

test('CLI e2e — the evaluation org holds an embedded chunk → exit 0', () => {
  const r = runCliOnDb(SEED + EVAL_CONTENT, ['--org-uuid', ORG_A]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /RESULT: NON-EMPTY — 1 embedded chunk\(s\) across 1 document\(s\)/);
  assert.match(r.stdout, /completeness against the guidance-corpus manifest is NOT checked/);
});

test('CLI e2e — an organization uuid nobody has → exit 1', () => {
  const r = runCliOnDb(SEED, ['--org-uuid', ORG_NONE]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /no organization has uuid/);
});

test('CLI e2e — without the flag, the default report still exits 0 over the same database', () => {
  const r = runCliOnDb(SEED, []);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^RAG corpus verification$/m);
  assert.doesNotMatch(r.stdout, /PQ|csr_reports/);
});

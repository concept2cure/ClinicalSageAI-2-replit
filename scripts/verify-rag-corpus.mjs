#!/usr/bin/env node
/**
 * verify-rag-corpus.mjs
 *
 * Reports how populated the RAG corpus actually is: row counts, how many rows
 * carry embeddings, embedding-model/dimension distribution, and document
 * processing status. The point is to answer "is the sophisticated retrieval
 * pipeline pointed at real data, or at empty tables?" — a question the code
 * alone cannot answer.
 *
 * Read-only. Connects with the same env vars as the app
 * (DATABASE_URL | NEON_DATABASE_URL | DATABASE_NEON_NEW_SECRET).
 *
 * Usage:
 *   node scripts/verify-rag-corpus.mjs                     # every table, every tenant; always exits 0
 *   node scripts/verify-rag-corpus.mjs --org-uuid <uuid>   # the PQ rag corpus; exits 1 when it is empty
 *
 * ── --org-uuid: the store a PQ rag run will read ─────────────────────────────
 * The default report answers "is anything embedded anywhere". It cannot answer
 * the PQ's question, and was cited as if it could (D4 evidence
 * docs/evidence/D4/2026-09-28-pq-rag-unblock-misdescribed/, E8): it counts nine
 * tables across every tenant and exits 0 whatever it finds, while the RAG
 * pipeline's vault arm reads exactly one thing — embedded chunks in
 * vault.document_chunks whose document belongs to the ONE organization named on
 * the request (advancedRAGPipeline.ts searchVaultSimilar). The PQ corpus is the
 * official guidance texts ingested through Vault into a dedicated evaluation
 * organization, so --org-uuid counts that, by the vault arm's own predicates
 * (tests/ops/verify-rag-corpus.test.mjs fails when the two part), and exits
 * non-zero when it is empty, when the organization does not exist, or when it
 * cannot be read. An unreadable corpus is reported as unreadable, never as empty.
 *
 * The evaluation paths now carry explicit organization/programme scope and
 * reviewed source binding. This preflight still establishes only non-empty
 * live embedded evidence, not source review or a passed qualification.
 *
 * Exit 0 means NON-EMPTY, not complete: at least one embedded chunk exists for
 * the organization. Nothing here checks the corpus against the guidance-corpus
 * manifest (every manifest document ingested, at its pinned revision), so one
 * document of thirty passes. It is a preflight, not verification of the corpus.
 *
 * It also counts csr_reports / csr_details and says, on the line, that the RAG
 * pipeline does NOT read them: ClinicalTrials.gov ingestion
 * (scripts/ingest-corpus.ts, the ENABLE_CORPUS_INGESTION sweep) writes only those
 * tables, registry metadata with no embeddings, so it is not the PQ corpus
 * however many rows it holds.
 *
 * Without the flag the report, and its exit code, are exactly what they were.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * RFC-4122 shape, as the pipeline's vault arm checks it before its `::uuid`
 * cast. A copy of advancedRAGPipeline.ts's UUID_RE (:337): that module is
 * TypeScript, does not export it, and this script runs under plain node.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read the command line. `{ orgUuid: null }` is the default report; an
 * `error` is a usage error, reported before any database is touched — a
 * malformed --org-uuid must never fall through to the default report, which
 * exits 0 and would read as a pass.
 */
export function parseVerifyArgs(argv) {
  let orgUuid = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    let value;
    if (a === '--org-uuid') {
      value = argv[i + 1];
      i++;
      if (!value || value.startsWith('--')) return { error: '--org-uuid needs a value: the evaluation organization\'s uuid' };
    } else if (a.startsWith('--org-uuid=')) {
      value = a.slice('--org-uuid='.length);
      if (!value) return { error: '--org-uuid needs a value: the evaluation organization\'s uuid' };
    } else {
      continue;
    }
    if (!UUID_RE.test(value)) return { error: `--org-uuid "${value}" is not a uuid (organizations.uuid of the evaluation organization)` };
    orgUuid = value;
  }
  return { orgUuid };
}

/**
 * The predicates the pipeline's vault arm retrieves by (advancedRAGPipeline.ts,
 * searchVaultSimilar, dense and lexical arms). The embedded-chunk count below is
 * built from exactly these. tests/ops/verify-rag-corpus.test.mjs slices both
 * vault-arm SQL templates out of searchVaultSimilar and fails unless each arm's
 * FROM/JOIN and WHERE conjuncts equal these (less the lexical arm's text match
 * and the caller-filter placeholder, which a PQ run does not set) — so a
 * predicate dropped from, or added to, the vault arm fails it.
 */
export const EVAL_CORPUS_PREDICATES = Object.freeze([
  'FROM vault.document_chunks c',
  'JOIN vault.documents d ON d.id = c.document_id',
  'c.embedding IS NOT NULL',
  'd.organization_id IN (SELECT o.id FROM organizations o WHERE o.uuid = $1::uuid)',
  'd.deleted_at IS NULL',
  'EXISTS (SELECT 1 FROM regulatory_programs p WHERE p.id = d.program_id AND p.organization_id = d.organization_id AND p.deleted_at IS NULL)',
]);

const [FROM_CHUNKS, JOIN_DOCS, EMBEDDED, IN_ORG, LIVE_DOCUMENT, LIVE_PROGRAM] = EVAL_CORPUS_PREDICATES;

const EMBEDDED_SQL = `
  SELECT count(*)::int AS embedded_chunks, count(DISTINCT c.document_id)::int AS documents_with_embedded_chunks
    ${FROM_CHUNKS}
    ${JOIN_DOCS}
   WHERE ${EMBEDDED}
     AND ${IN_ORG} AND ${LIVE_DOCUMENT} AND ${LIVE_PROGRAM}`;

const TOTALS_SQL = `
  SELECT
    (SELECT count(*)::int FROM vault.documents d WHERE ${IN_ORG} AND ${LIVE_DOCUMENT} AND ${LIVE_PROGRAM}) AS documents,
    (SELECT count(*)::int ${FROM_CHUNKS} ${JOIN_DOCS} WHERE ${IN_ORG} AND ${LIVE_DOCUMENT} AND ${LIVE_PROGRAM}) AS chunks`;

/**
 * Count the evaluation organization's corpus by the vault arm's predicates.
 *
 * `client` is one connection (a pg PoolClient, or anything with the same
 * `query(sql, params) → { rows }`), because the read runs in one read-only
 * transaction with `app.current_org_id` and the resolved integer
 * `app.current_tenant_id` set to the organization — the same GUCs
 * the pipeline's withTenantContext sets (advancedRAGPipeline.ts). Whether vault
 * RLS on a non-owner role then admits the same rows is NOT established here:
 * its policies go through core.can_access_program(program_id), which this
 * script does not model and no test checks. Run it as the role the application
 * retrieves with. The transaction is rolled back: nothing is written.
 *
 * Returns one of:
 *   { orgUuid, missing: [table, …] }       the store does not exist
 *   { orgUuid, error }                     it could not be read
 *   { orgUuid, orgId: null }               no organization has that uuid
 *   { orgUuid, orgId, documents, documentsWithEmbeddedChunks, chunks, embeddedChunks }
 */
export async function readEvalCorpus(client, orgUuid) {
  try {
    const reg = await client.query(
      `SELECT to_regclass('organizations')::text AS organizations,
              to_regclass('vault.documents')::text AS documents,
              to_regclass('vault.document_chunks')::text AS chunks,
              to_regclass('regulatory_programs')::text AS programs`
    );
    const r0 = reg.rows[0] ?? {};
    const missing = [
      ['organizations', r0.organizations],
      ['vault.documents', r0.documents],
      ['vault.document_chunks', r0.chunks],
      ['regulatory_programs', r0.programs],
    ]
      .filter(([, v]) => !v)
      .map(([n]) => n);
    if (missing.length) return { orgUuid, missing };

    await client.query('BEGIN READ ONLY');
    try {
      await client.query("SELECT set_config('app.current_org_id', $1, true)", [orgUuid]);
      const org = await client.query('SELECT id FROM organizations WHERE uuid = $1::uuid', [orgUuid]);
      if (org.rows.length === 0) return { orgUuid, orgId: null };
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [String(org.rows[0].id)]);
      const totals = (await client.query(TOTALS_SQL, [orgUuid])).rows[0];
      const embedded = (await client.query(EMBEDDED_SQL, [orgUuid])).rows[0];
      return {
        orgUuid,
        orgId: Number(org.rows[0].id),
        documents: Number(totals.documents),
        documentsWithEmbeddedChunks: Number(embedded.documents_with_embedded_chunks),
        chunks: Number(totals.chunks),
        embeddedChunks: Number(embedded.embedded_chunks),
      };
    } finally {
      await client.query('ROLLBACK').catch(() => {});
    }
  } catch (err) {
    return { orgUuid, error: err.message };
  }
}

/**
 * Row counts of the tables ClinicalTrials.gov ingestion writes. `null` for a
 * table that does not exist; `error` when counting failed — so an uncounted
 * table is said, not shown as zero.
 */
export async function readCsrCounts(client) {
  try {
    const out = {};
    for (const [key, table] of [
      ['csrReports', 'csr_reports'],
      ['csrDetails', 'csr_details'],
    ]) {
      const reg = await client.query('SELECT to_regclass($1)::text AS reg', [table]);
      if (!reg.rows[0]?.reg) {
        out[key] = null;
        continue;
      }
      const { rows } = await client.query(`SELECT count(*)::int AS c FROM ${table}`);
      out[key] = Number(rows[0].c);
    }
    return out;
  } catch (err) {
    return { csrReports: null, csrDetails: null, error: err.message };
  }
}

const NOT_READ =
  'NOT read by the RAG pipeline — ClinicalTrials.gov registry metadata (scripts/ingest-corpus.ts), no embeddings; not the PQ corpus';

function csrLines(csr) {
  if (!csr) return [];
  const line = (label, n) => {
    if (csr.error) return `  ${label.padEnd(14)} could not be counted: ${csr.error}   ${NOT_READ}`;
    if (n === null || n === undefined) return `  ${label.padEnd(14)} table not present   ${NOT_READ}`;
    return `  ${label.padEnd(14)} rows=${fmt(n)}   ${NOT_READ}`;
  };
  return ['', 'Also present, and NOT the PQ corpus:', line('csr_reports', csr.csrReports), line('csr_details', csr.csrDetails)];
}

/**
 * The decision, pure: given what readEvalCorpus and readCsrCounts found, the
 * lines to print and the exit code. 0 only when the organization has at least
 * one embedded chunk the vault arm would read — NON-EMPTY, which is not the
 * same as complete. csr_* never decides it.
 */
export function evalCorpusVerdict(corpus, csr) {
  const head = [
    'RAG PQ evaluation corpus — the store a PQ rag run will read (vault arm, this organization) once run-eval is tenant-scoped',
    '═'.repeat(72),
    '  store          vault.document_chunks ⋈ vault.documents, embedding IS NOT NULL, by organization',
    `  organization   ${corpus.orgUuid}${corpus.orgId ? ` (organizations.id ${corpus.orgId})` : ''}`,
  ];
  const tail = csrLines(csr);
  const done = (exitCode, body) => ({ exitCode, lines: [...head, ...body, ...tail, '', '═'.repeat(72)] });

  if (corpus.missing?.length) {
    return done(1, corpus.missing.map((t) => `  RESULT: ${t} does not exist in this database, so there is no evaluation corpus to read.`));
  }
  if (corpus.error) {
    return done(1, [`  RESULT: could not read the evaluation corpus: ${corpus.error}. This is not a count of zero.`]);
  }
  if (corpus.orgId === null || corpus.orgId === undefined) {
    return done(1, [
      `  RESULT: no organization has uuid ${corpus.orgUuid}; the pipeline's organization predicate matches nothing for it.`,
    ]);
  }

  const body = [
    `  documents      ${fmt(corpus.documents)} (${fmt(corpus.documentsWithEmbeddedChunks)} with at least one embedded chunk)`,
    `  chunks         ${fmt(corpus.chunks)} (${fmt(corpus.embeddedChunks)} embedded — only these are retrievable)`,
  ];
  const unembeddedDocs = corpus.documents - corpus.documentsWithEmbeddedChunks;
  if (unembeddedDocs > 0) {
    body.push(`  note           ${fmt(unembeddedDocs)} document(s) have no embedded chunk; retrieval cannot return them.`);
  }
  if (corpus.embeddedChunks === 0) {
    body.push(
      '  RESULT: EMPTY — a PQ rag run would retrieve nothing for this organization. Ingest the corpus',
      '          through Vault with the document catalog and ana.vault_chunking enabled for this organization.',
    );
    return done(1, body);
  }
  body.push(
    `  RESULT: NON-EMPTY — ${fmt(corpus.embeddedChunks)} embedded chunk(s) across ${fmt(corpus.documentsWithEmbeddedChunks)} document(s) are retrievable for this organization.`,
    '          This is a non-empty preflight: completeness against the guidance-corpus manifest is NOT checked.',
  );
  return done(0, body);
}

let pool;

/** Run a query, returning rows; on error return null so callers can degrade. */
async function safeQuery(sql, params = []) {
  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch (err) {
    return { __error: err.message };
  }
}

/** True when a table (optionally schema-qualified) exists. */
async function tableExists(qualifiedName) {
  const rows = await safeQuery('SELECT to_regclass($1) AS reg', [qualifiedName]);
  return Array.isArray(rows) && rows[0] && rows[0].reg !== null;
}

function fmt(n) {
  return Number(n).toLocaleString('en-US');
}

async function reportEmbeddingTable(label, table, embeddingCol = 'embedding') {
  if (!(await tableExists(table))) {
    console.log(`  ${label.padEnd(34)} table not present (${table})`);
    return;
  }

  const totalRows = await safeQuery(`SELECT count(*)::bigint AS c FROM ${table}`);
  if (totalRows.__error) {
    console.log(`  ${label.padEnd(34)} error: ${totalRows.__error}`);
    return;
  }
  const total = totalRows[0].c;

  const embedded = await safeQuery(
    `SELECT count(*)::bigint AS c FROM ${table} WHERE ${embeddingCol} IS NOT NULL`
  );
  const embeddedCount = embedded.__error ? 'n/a' : embedded[0].c;

  const pct =
    embeddedCount !== 'n/a' && Number(total) > 0
      ? ` (${((Number(embeddedCount) / Number(total)) * 100).toFixed(1)}%)`
      : '';

  console.log(
    `  ${label.padEnd(34)} rows=${fmt(total).padStart(10)}   embedded=${String(
      embeddedCount === 'n/a' ? 'n/a' : fmt(embeddedCount)
    ).padStart(10)}${pct}`
  );
}

async function main() {
  console.log('\nRAG corpus verification');
  console.log('═'.repeat(72));

  console.log('\nEmbedding-bearing tables:');
  await reportEmbeddingTable('lumen_data_atoms', 'lumen_data_atoms');
  await reportEmbeddingTable('vault.document_chunks', 'vault.document_chunks');
  await reportEmbeddingTable('knowledge_entries', 'knowledge_entries');
  await reportEmbeddingTable('rag_chunks', 'rag_chunks');
  await reportEmbeddingTable('document_vectors', 'document_vectors');
  await reportEmbeddingTable('csr_studies', 'csr_studies');
  await reportEmbeddingTable('csr_sections', 'csr_sections');
  await reportEmbeddingTable('csr_endpoints', 'csr_endpoints');
  await reportEmbeddingTable('academic_embeddings', 'academic_embeddings', 'vector');

  // Embedding model / dimension distribution for the primary atoms table.
  if (await tableExists('lumen_data_atoms')) {
    console.log('\nlumen_data_atoms embedding models:');
    const models = await safeQuery(
      `SELECT COALESCE(embedding_model, '(none)') AS model, count(*)::bigint AS c
         FROM lumen_data_atoms
        GROUP BY 1 ORDER BY 2 DESC`
    );
    if (models.__error) {
      console.log(`  (embedding_model column unavailable: ${models.__error})`);
    } else {
      for (const r of models) console.log(`  ${String(r.model).padEnd(28)} ${fmt(r.c)}`);
    }
  }

  // Vault document processing pipeline status.
  if (await tableExists('vault.documents')) {
    console.log('\nvault.documents processing status:');
    const statuses = await safeQuery(
      `SELECT COALESCE(processing_status::text, '(null)') AS status, count(*)::bigint AS c
         FROM vault.documents
        GROUP BY 1 ORDER BY 2 DESC`
    );
    if (statuses.__error) {
      console.log(`  (unavailable: ${statuses.__error})`);
    } else if (statuses.length === 0) {
      console.log('  no documents');
    } else {
      for (const r of statuses) console.log(`  ${String(r.status).padEnd(28)} ${fmt(r.c)}`);
    }
  }

  console.log('\n' + '═'.repeat(72));
  console.log('Done. "embedded" near zero means the pipeline is retrieving over an empty corpus.\n');
}

/** --org-uuid: report the evaluation corpus; resolves to the verdict's exit code. */
async function evalCorpusMain(orgUuid) {
  const client = await pool.connect();
  let corpus;
  let csr;
  try {
    corpus = await readEvalCorpus(client, orgUuid);
    csr = await readCsrCounts(client);
  } finally {
    client.release();
  }
  const { exitCode, lines } = evalCorpusVerdict(corpus, csr);
  console.info(`\n${lines.join('\n')}\n`);
  return exitCode;
}

/* CLI. Only when invoked directly — the tests import the functions above. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseVerifyArgs(process.argv.slice(2));
  if (args.error) {
    console.error(`verify-rag-corpus: ${args.error}`);
    console.error('usage: node scripts/verify-rag-corpus.mjs [--org-uuid <evaluation organization uuid>]');
    process.exit(2);
  }

  const connectionString =
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.DATABASE_NEON_NEW_SECRET;

  if (!connectionString) {
    console.error(
      'No database URL found. Set DATABASE_URL, NEON_DATABASE_URL, or DATABASE_NEON_NEW_SECRET.'
    );
    process.exit(1);
  }

  pool = new pg.Pool({ connectionString, max: 2 });

  let exitCode; // undefined for the default report, which exits 0 as it always has
  (args.orgUuid ? evalCorpusMain(args.orgUuid) : main())
    .then(code => {
      exitCode = code;
    })
    .catch(err => {
      console.error('verify-rag-corpus failed:', err);
      exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
      // Applied after the pool closes, so nothing a driver does on close can
      // overwrite the verdict (a WASM Postgres stand-in resets process.exitCode
      // on close, which is how this was found).
      if (exitCode !== undefined) process.exitCode = exitCode;
    });
}

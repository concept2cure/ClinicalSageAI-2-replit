#!/usr/bin/env node
/**
 * Self-test for db/migrations/20260901_drop_dead_audit_tables.sql — the L13 drop.
 *
 * Exists because the whole value of that migration is in what it REFUSES to do.
 * A DROP loop that works is trivial; one that correctly declines to drop a table
 * holding 21 CFR Part 11 records, or one another table still points at, is the
 * only version worth shipping — and a refusal is exactly the behaviour nobody
 * exercises, because on a healthy database every table is empty and every drop
 * succeeds. A guard whose failure branch has never been seen to fire has not
 * been tested.
 *
 * So this applies the real migration file to a real PostgreSQL (PGlite) with the
 * three refusal cases deliberately constructed, and asserts the survivors by
 * name. It also runs the file twice, because it is registered in
 * C2C_MIGRATION_FILES and therefore replays on every deploy.
 *
 * Usage: node scripts/ci/check-dead-audit-tables.selftest.mjs
 * Exit 0 when the migration keeps exactly what it must and drops the rest.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = 'db/migrations/20260901_drop_dead_audit_tables.sql';
const sql = fs.readFileSync(path.join(repoRoot, MIGRATION), 'utf8');

/** The twelve real tables the migration names. */
const TARGETS = [
  'public.assumption_history',
  'public.auth_password_history',
  'public.doc_activity_log',
  'public.ind_protocol_history',
  'public.program_activity_log',
  'public.qc_compliance_history',
  'public.relation_extraction_log',
  'public.strategy_audit',
  'audit.request_correlations',
  'cortex.confidence_history',
  'predicate.proof_pack_audit_events',
  'regulatory_harmonization.mapping_rule_history',
];

/**
 * Must SURVIVE, each for a different reason the migration is required to honour.
 *   strategy_audit        — holds a row. Part 11 records have a retention
 *                           obligation that "nothing writes it" does not discharge.
 *   doc_activity_log      — another table's foreign key points at it, so the
 *                           inventory's "zero references" finding is false here.
 *   qc_compliance_history — a view depends on it; DROP is RESTRICT, never CASCADE.
 */
const MUST_SURVIVE = [
  'public.strategy_audit',
  'public.doc_activity_log',
  'public.qc_compliance_history',
];

const db = new PGlite();
const notices = [];

await db.exec(`
  CREATE SCHEMA IF NOT EXISTS audit;
  CREATE SCHEMA IF NOT EXISTS cortex;
  CREATE SCHEMA IF NOT EXISTS predicate;
  CREATE SCHEMA IF NOT EXISTS regulatory_harmonization;
`);
for (const t of TARGETS) await db.exec(`CREATE TABLE ${t} (id serial primary key, note text);`);

// public.vault_document_audit_logs is deliberately NOT created: it has no DDL
// anywhere in the repo, and the migration must treat an absent table as a no-op
// rather than an error.

await db.exec(`INSERT INTO public.strategy_audit (note) VALUES ('a real Part 11 record');`);
await db.exec(`
  CREATE TABLE public.live_child (
    id serial primary key,
    log_id int REFERENCES public.doc_activity_log(id)
  );
`);
await db.exec(`CREATE VIEW public.v_qc AS SELECT id FROM public.qc_compliance_history;`);

const listTables = async () =>
  (
    await db.query(`
      SELECT ns.nspname || '.' || c.relname AS name
        FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
       WHERE c.relkind IN ('r', 'p')
         AND ns.nspname IN ('public','audit','cortex','predicate','regulatory_harmonization')
       ORDER BY 1
    `)
  ).rows.map((r) => r.name);

const before = await listTables();
await db.exec(sql, { onNotice: (n) => notices.push(n.message) });
const after = await listTables();

// Replay — this file is in C2C_MIGRATION_FILES and runs on every deploy.
await db.exec(sql);
const afterTwice = await listTables();
const rowsKept = (await db.query('SELECT count(*)::int AS n FROM public.strategy_audit')).rows[0].n;

let failed = 0;
const check = (ok, label) => {
  if (!ok) failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
};

console.log(`[self-test] ${MIGRATION}`);
console.log(`  tables provisioned : ${before.length}`);
console.log(`  surviving after run: ${after.join(', ')}`);
console.log('');

for (const t of MUST_SURVIVE) {
  check(after.includes(t), `KEPT ${t}`);
}
for (const t of TARGETS.filter((t) => !MUST_SURVIVE.includes(t))) {
  check(!after.includes(t), `dropped ${t}`);
}
check(after.includes('public.live_child'), 'the live table that owns the FK is untouched');
check(rowsKept === 1, 'the Part 11 row is still there, unread and undeleted');
check(
  JSON.stringify(after) === JSON.stringify(afterTwice),
  'idempotent — a second run changes nothing',
);
check(
  notices.some((m) => /KEEPING public\.strategy_audit — 1 row\(s\) present/.test(m)),
  'the row-count refusal is announced, not silent',
);
check(
  notices.some((m) => /keeping public\.doc_activity_log — foreign key\(s\)/.test(m)),
  'the foreign-key refusal is announced',
);
check(
  notices.some((m) => /keeping public\.qc_compliance_history — DROP RESTRICT refused/.test(m)),
  'the dependency refusal is announced',
);
check(
  notices.some((m) => /already absent/.test(m)),
  'the absent phantom is counted, not treated as an error',
);

console.log('\n  notices emitted:');
for (const m of notices) console.log(`    ${m}`);

if (failed > 0) {
  console.error(`\n✖ ${failed} case(s) wrong. The migration is NOT safe to apply.`);
  process.exit(1);
}
console.log('\n✅ drops what is dead, refuses what is not, and says which is which.');

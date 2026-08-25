#!/usr/bin/env node
/**
 * Self-test for the SQL-lineage column parser used by
 * check-insert-columns-declared.mjs.
 *
 * Exists because the first attempt at this parse was WRONG in the direction
 * that matters: it reported concept2cure_artifact_versions.updated_at as
 * present in the lineage when no CREATE TABLE declares it, because the body
 * terminator did not match the tab-indented drizzle-generated format. A parser
 * that answers "yes, that column is fine" incorrectly is worse than no parser —
 * it silences the guard on a real defect. So the parse is pinned against cases
 * whose truth was established against a real database.
 */
import { sqlLineageColumns, declaredColumns } from './check-insert-columns-declared.mjs';

const lineage = sqlLineageColumns();
const declared = declaredColumns();

/**
 * The guard's real question: is the column known to EITHER source?
 *
 * The two are not interchangeable and neither alone is the schema. Drizzle is
 * the BASELINE (migrations/0000_sweet_joseph.sql is generated from it and is
 * deliberately NOT in C2C_MIGRATION_FILES); the migration set is the INCREMENTS
 * layered on top. So users.email lives only in Drizzle and audit_logs.hmac_seal
 * only in the increments, and both are perfectly real.
 */
const known = (table, column) =>
  (declared.get(table)?.has(column) ?? false) || (lineage.get(table)?.has(column) ?? false);

/** [table, column, expectedPresent, why] */
const CASES = [
  // Proven ABSENT: the golden journey hit 42703 on this against real PGlite
  // running the real migrations, which is how the governed-export outage was
  // found in the first place.
  ['concept2cure_provenance_events', 'updated_at', false, 'append-only; no lineage creates it'],
  // Proven PRESENT via ALTER TABLE ADD COLUMN in two separate migrations —
  // the case the Drizzle-only check got wrong (model is stale, column is real).
  ['audit_logs', 'sha256_chain', true, 'migrations/20260527_mutation_primitives.sql'],
  ['audit_logs', 'hmac_seal', true, 'migrations/20260609_audit_hmac_seal.sql'],
  // Added by the reconciliation migration written on 2026-08-17.
  ['concept2cure_artifact_versions', 'updated_at', true, 'migrations/20260817_reconcile_declared_updated_at_columns.sql'],
  ['cerv2_section_versions', 'updated_at', true, 'same migration'],
  // Baseline columns: present via DRIZZLE, absent from the increment set. They
  // pin that the union is consulted rather than the lineage alone.
  ['users', 'email', true, 'Drizzle baseline (not in the increment set)'],
  ['users', 'password_hash', true, 'Drizzle baseline (not in the increment set)'],
  // A column declared AFTER a comment that itself contains commas. The DDL is
  // `label text not null,  -- '0M','3M','6M',…` then `month int not null`.
  // Splitting on commas before stripping comments glued `month` onto a fragment
  // starting with a quote, so it vanished — and the guard reported it missing
  // while the router both writes it and ORDER BYs it.
  ['stab_timepoints', 'month', true, 'db/migrations/022_stability_v2.sql, after a comma-bearing comment'],
  ['stab_timepoints', 'label', true, 'same CREATE TABLE'],
  // Proven ABSENT: storage.ts wrote these and 42703'd every call.
  ['users', 'username', false, 'never declared or created'],
  ['users', 'subscribed', false, 'never declared or created'],
];

let failed = 0;
console.log('[self-test] SQL-lineage column parser');
console.log(`  drizzle models        : ${declared.size}`);
console.log(`  applied-migration tables: ${lineage.size}`);
for (const [table, column, expected, why] of CASES) {
  const actual = known(table, column);
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${table}.${column} → ${actual ? 'present' : 'absent'} ` +
      `(expected ${expected ? 'present' : 'absent'}; ${why})`
  );
}

if (failed > 0) {
  console.error(`\n✖ ${failed} parser case(s) wrong. Do NOT trust the guard until this passes.`);
  process.exit(1);
}
console.log('\n✅ parser agrees with every case whose truth was established against a real database.');

#!/usr/bin/env node
/**
 * check-migration-set-order.mjs — the ORDERING invariants of C2C_MIGRATION_FILES,
 * checked in milliseconds so a pre-push hook can afford them.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * These invariants were already pinned, by three contract tests
 * (tenant-isolation-sweep, uuid-tenant-isolation, ana-memory-migrations-reachable).
 * They still reached the default branch broken: on 2026-08-21
 * migrations/20260821_vault_documents_canonical_shape.sql was appended AFTER the
 * tenant-isolation sweep, and all three tests were red on origin until someone
 * noticed. Nothing in .husky/pre-push checks migration ordering — it runs the
 * eCTD stub, risk-code and ledger gates — and tests/schema-contract takes about
 * five minutes, so in practice it is not run before a push.
 *
 * A guard nobody can afford to run is not a guard. This does the positional
 * subset with no database, no PGlite and no vitest: it imports the list and
 * looks at it. The contract tests remain the deeper check (they APPLY the set
 * against a real base schema); this is the pre-flight that catches the cheap
 * mistake before it lands.
 *
 * ── What a violation actually costs ──────────────────────────────────────────
 * The sweep attaches tenant_isolation_policy to every integer tenant-keyed table
 * that exists WHEN IT RUNS. A migration ordered after it creates or re-shapes a
 * tenant table that the sweep never sees, so that table ships with no policy.
 * Nothing fails, no count goes down — the policy total goes UP as unprotected
 * tables are added — and the gap is visible only by reading across tenants.
 *
 * Usage: node scripts/ci/check-migration-set-order.mjs
 * Exit 0 when every invariant holds, 1 otherwise with the specific break named.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  C2C_MIGRATION_FILES,
  CHILD_TABLE_PARENT_SCOPE,
  TENANT_ISOLATION_SWEEP,
  UUID_TENANT_ISOLATION_NONPUBLIC,
} from '../db/migration-set.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:migration-set-order]';

const failures = [];
const fail = (what, detail) => failures.push({ what, detail });

// ── 1. The integer sweep is LAST (ledger C-33) ───────────────────────────────
const last = C2C_MIGRATION_FILES[C2C_MIGRATION_FILES.length - 1];
if (last !== TENANT_ISOLATION_SWEEP) {
  const at = C2C_MIGRATION_FILES.indexOf(TENANT_ISOLATION_SWEEP);
  const after = at < 0 ? [] : C2C_MIGRATION_FILES.slice(at + 1);
  fail(
    'the tenant-isolation sweep is not the last entry',
    at < 0
      ? `${TENANT_ISOLATION_SWEEP} is not in C2C_MIGRATION_FILES at all.`
      : `${after.length} file(s) are ordered after it and will never be swept:\n` +
        after.map((f) => `        ${f}`).join('\n') +
        '\n      Move them ABOVE the two isolation steps at the end of the list.',
  );
}

// ── 2. The isolation tail: uuid step, child scope, sweep (C-46; D3 2026-09-29)
// The uuid non-public step policies the uuid-keyed tables, so nothing that
// creates one may follow it. The parent-scoped child RLS follows IT: its chained
// list delegates to parent policies the uuid step creates, and it must see every
// table the set creates. Mid-set, a blank database's first deploy left
// regulatory_harmonization.export_job_audit_log unscoped until the second
// (docs/evidence/D3/2026-09-29-child-scope-first-deploy/). It creates no table,
// so the integer sweep stays last (invariant 1).
const tail = C2C_MIGRATION_FILES.slice(-3);
const expectedTail = [UUID_TENANT_ISOLATION_NONPUBLIC, CHILD_TABLE_PARENT_SCOPE, TENANT_ISOLATION_SWEEP];
if (tail.join('\n') !== expectedTail.join('\n')) {
  fail(
    'the isolation tail is not uuid step, child scope, sweep',
    `Expected the last three entries to be, in order:\n` +
      expectedTail.map((f) => `        ${f}`).join('\n') +
      `\n      found:\n` +
      tail.map((f) => `        ${f}`).join('\n'),
  );
}

// ── 3. Every listed file exists ──────────────────────────────────────────────
// A rename or delete that misses this list makes the applier fail mid-run on a
// real deploy, which is a worse place to find out.
const missing = C2C_MIGRATION_FILES.filter((f) => !fs.existsSync(path.join(repoRoot, f)));
if (missing.length) {
  fail(
    `${missing.length} listed migration(s) do not exist on disk`,
    missing.map((f) => `        ${f}`).join('\n') +
      '\n      Renamed or deleted? Update C2C_MIGRATION_FILES in the same change.',
  );
}

// ── 4. No duplicates ─────────────────────────────────────────────────────────
// A file listed twice applies twice. Every file on this path is meant to be
// idempotent, so it usually survives — but "usually" is not a property, and a
// duplicate is always a merge accident rather than an intention.
const seen = new Set();
const duplicated = [...new Set(C2C_MIGRATION_FILES.filter((f) => seen.size === seen.add(f).size))];
if (duplicated.length) {
  fail(
    `${duplicated.length} migration(s) are listed more than once`,
    duplicated.map((f) => `        ${f}`).join('\n') +
      '\n      Usually a merge that kept both sides. Keep the earlier position.',
  );
}

if (failures.length) {
  console.error(`${TAG} ❌ ${failures.length} ordering invariant(s) broken:\n`);
  for (const { what, detail } of failures) {
    console.error(`  • ${what}`);
    console.error(`      ${detail}\n`);
  }
  console.error(
    '  The sweep attaches tenant_isolation_policy to every integer tenant-keyed\n' +
      '  table that exists WHEN IT RUNS. Anything ordered after it is never swept,\n' +
      '  so a tenant table ships with no policy — silently, because the policy\n' +
      '  count goes UP when unprotected tables are added.\n\n' +
      '  Same invariants are pinned by tests/schema-contract (which also APPLIES\n' +
      '  the set); this is the fast pre-flight.\n',
  );
  process.exit(1);
}

console.log(
  `${TAG} OK — ${C2C_MIGRATION_FILES.length} migrations, sweep last, tail uuid step → child scope → sweep, ` +
    'all present, no duplicates.',
);

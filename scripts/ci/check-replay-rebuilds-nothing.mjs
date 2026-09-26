#!/usr/bin/env node
/**
 * CI Guard: a deploy that has nothing to change must not rebuild a constraint
 * or an index.
 *
 * WHY
 * ---
 * Every file in C2C_MIGRATION_FILES re-runs on every deploy (CLAUDE.md, Rule 1),
 * and deploy-migrate runs while the previous API tasks are still serving. A file
 * that does an unconditional `DROP CONSTRAINT IF EXISTS … ; ADD CONSTRAINT …`
 * is idempotent in the sense every other guard checks — the schema after the
 * replay is the schema before it — and it is still a production defect:
 *
 *   • ADD CONSTRAINT … CHECK validates every row while holding ACCESS
 *     EXCLUSIVE on the table: no read and no write for the length of the scan;
 *   • ADD CONSTRAINT … FOREIGN KEY scans the child holding SHARE ROW EXCLUSIVE
 *     on the child AND the parent: no writes to either (the parent here was
 *     `organizations`);
 *   • a rebuilt index is a full build under a lock of its own.
 *
 * On CI's empty database that is milliseconds, so nothing noticed. On a
 * client's database it grows with their data, on every deploy. On 2026-09-25 a
 * no-op replay rebuilt 14 constraints — 9 CHECKs, among them `c2c_documents`
 * (the Vault / Authoring document store), `document_span_lineage` and
 * `submission_orchestrator_runs`, and 5 foreign keys to `organizations`.
 *
 * The lock_timeout on the migration session (scripts/db/migration-set.mjs,
 * "Lock waits on a live database") bounds how long a migration WAITS for a
 * lock. It cannot bound how long a statement HOLDS one; this guard is that half.
 *
 * HOW
 * ---
 * Against a database that install-fresh + deploy-migrate have already built
 * (the blank-db-provisioning CI job), it records the OID of every constraint
 * and every index, runs the real `node scripts/db/deploy-migrate.mjs` once more,
 * and records them again. A dropped-and-re-added object has a new OID even when
 * its definition is identical, which is exactly the case to catch. Anything
 * rebuilt, dropped or created by a replay fails the build, named.
 *
 * FIX for a finding: amend the creating file in place (Rule 1) so the
 * replacement runs only when the live definition differs, e.g.
 *
 *     IF NOT EXISTS (SELECT 1 FROM pg_constraint
 *                     WHERE conrelid = 'public.t'::regclass AND conname = 'c'
 *                       AND pg_get_constraintdef(oid) = '<the definition>') THEN
 *       ALTER TABLE t DROP CONSTRAINT IF EXISTS c;
 *       ALTER TABLE t ADD CONSTRAINT c …;
 *     END IF;
 *
 * A comparison that ever stops matching (a new PostgreSQL rendering) falls back
 * to replacing, the old behaviour, and this guard reports it.
 *
 * Exit: 0 nothing rebuilt · 1 something rebuilt, dropped or created · 2 could
 * not run (no database, or the replay itself failed).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { sslFor } from '../db/connection.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:replay-rebuilds-nothing]';

const url = process.env.DATABASE_OWNER_URL || process.env.DATABASE_URL;
if (!url) {
  console.error(`${TAG} DATABASE_URL is not set. This guard needs a provisioned database; it never skips.`);
  process.exit(2);
}

const SNAPSHOT_SQL = `
  SELECT 'constraint' AS kind,
         format('%I.%I %I', n.nspname, c.relname, k.conname) AS name,
         k.oid::bigint AS oid,
         CASE k.contype WHEN 'c' THEN 'CHECK' WHEN 'f' THEN 'FOREIGN KEY' WHEN 'u' THEN 'UNIQUE'
                        WHEN 'p' THEN 'PRIMARY KEY' WHEN 'x' THEN 'EXCLUDE' END AS detail
    FROM pg_constraint k
    JOIN pg_class c ON c.oid = k.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE k.contype IN ('c', 'f', 'u', 'p', 'x')
  UNION ALL
  SELECT 'index', format('%I.%I', n.nspname, i.relname), i.oid::bigint, 'INDEX'
    FROM pg_class i
    JOIN pg_namespace n ON n.oid = i.relnamespace
   WHERE i.relkind IN ('i', 'I')
     AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')`;

async function snapshot() {
  const client = new pg.Client({ connectionString: url, ssl: sslFor(url) });
  await client.connect();
  try {
    const { rows } = await client.query(SNAPSHOT_SQL);
    if (rows.length === 0) {
      console.error(`${TAG} the database has no constraints or indexes: it was never provisioned.`);
      process.exit(2);
    }
    return new Map(rows.map(r => [`${r.kind} ${r.name}`, r]));
  } finally {
    await client.end();
  }
}

const before = await snapshot();

const replay = spawnSync(process.execPath, ['scripts/db/deploy-migrate.mjs'], {
  cwd: REPO_ROOT,
  env: process.env,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
if (replay.status !== 0) {
  process.stdout.write(replay.stdout ?? '');
  process.stderr.write(replay.stderr ?? '');
  console.error(`${TAG} the replay deploy itself failed (exit ${replay.status}); nothing to compare.`);
  process.exit(2);
}

const after = await snapshot();

const rebuilt = [];
const dropped = [];
const created = [];
for (const [key, row] of before) {
  const now = after.get(key);
  if (!now) dropped.push(row);
  else if (now.oid !== row.oid) rebuilt.push(row);
}
for (const [key, row] of after) if (!before.has(key)) created.push(row);

console.info(
  `${TAG} replayed deploy-migrate over ${before.size} constraints and indexes: ` +
    `${rebuilt.length} rebuilt, ${dropped.length} dropped, ${created.length} created`,
);

if (rebuilt.length + dropped.length + created.length === 0) {
  console.info(`${TAG} ✅ a deploy with nothing to change rebuilds nothing`);
  process.exit(0);
}

const list = (title, rows) => {
  if (!rows.length) return;
  console.error(`\n  ${title}:`);
  for (const r of rows.sort((a, b) => a.name.localeCompare(b.name))) console.error(`    ${r.detail.padEnd(11)} ${r.name}`);
};
console.error(`\n${TAG} ❌ a replay deploy changed objects it had no reason to touch.`);
list('rebuilt (dropped and re-added, so re-validated / rebuilt under lock on every deploy)', rebuilt);
list('dropped by a replay (something re-creates and something drops it: Rule 1)', dropped);
list('created by a replay (the first deploy did not converge)', created);
console.error(
  `\n  Each rebuilt CHECK holds ACCESS EXCLUSIVE for a full scan of its table; each\n` +
    `  foreign key blocks writes to the child and the parent for its scan; each index\n` +
    `  is a full build. On a client's database that is every deploy, while it serves.\n` +
    `  FIX: amend the creating file in place (CLAUDE.md, Rule 1) so the replacement runs\n` +
    `  only when pg_get_constraintdef differs — see this script's header for the shape.`,
);
process.exit(1);

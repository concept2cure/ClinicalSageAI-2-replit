// Apply this item's migration, then the tenant sweep that follows it in the set, through the
// deploy's own applier (scripts/db/migration-set.mjs applyMigrationFiles). Run twice to show the replay.
import pg from 'pg';
import path from 'node:path';
import { applyMigrationFiles, TENANT_ISOLATION_SWEEP } from '../../../../../scripts/db/migration-set.mjs';
const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../..');
const files = ['migrations/20261001_compliance_review_records.sql', TENANT_ISOLATION_SWEEP];
const r = await applyMigrationFiles(pool, repoRoot, files, {
  log: (m) => console.info(m), error: (m) => console.error(m), stopOnFirstFailure: true,
});
console.info(JSON.stringify({ applied: r.applied, failures: r.failures?.map((f) => ({ file: f.file, error: String(f.error?.message ?? f.error) })) }));
await pool.end();
process.exit(r.failures?.length ? 1 : 0);

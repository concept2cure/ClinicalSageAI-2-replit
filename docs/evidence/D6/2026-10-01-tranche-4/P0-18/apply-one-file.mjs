// Apply ONE file through the deploy's own applier (scripts/db/migration-set.mjs applyMigrationFiles).
import pg from 'pg';
import path from 'node:path';
import { applyMigrationFiles } from '../../../../../scripts/db/migration-set.mjs';
const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../..');
const r = await applyMigrationFiles(pool, repoRoot, ['migrations/20261001_qms_document_signature_required.sql'], {
  log: (m) => console.log(m), error: (m) => console.error(m), stopOnFirstFailure: true,
});
console.log(JSON.stringify({ applied: r.applied, failures: r.failures?.map((f) => ({ file: f.file, error: String(f.error?.message ?? f.error) })) }));
await pool.end();
process.exit(r.failures?.length ? 1 : 0);

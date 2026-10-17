import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repositoryRoot = process.cwd();
const require = createRequire(resolve(repositoryRoot, 'package.json'));
const { Client, Pool } = require('pg');
const { purgeTenant } = await import(pathToFileURL(resolve(repositoryRoot, 'server/services/tenant/tenant-offboarding.ts')).href);
const databaseName = 'c2c_audit_retention_lock_proof';
const adminUrl = new URL('postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable');
const fixtureUrl = new URL(adminUrl);
fixtureUrl.pathname = '/' + databaseName;
const administrator = new Client({ connectionString: adminUrl.href });
let created = false;
let writer;
let readerPool;
await administrator.connect();
try {
  const existing = await administrator.query('SELECT 1 FROM pg_database WHERE datname=$1', [databaseName]);
  assert.equal(existing.rowCount, 0, 'refuse to replace an existing database');
  await administrator.query('CREATE DATABASE c2c_audit_retention_lock_proof');
  created = true;
  writer = new Client({ connectionString: fixtureUrl.href });
  await writer.connect();
  const testSource = readFileSync(resolve(repositoryRoot, 'server/services/tenant/__tests__/tenant-purge-regulated-retention.pglite.test.ts'), 'utf8');
  const setup = testSource.match(/await db\.exec\(`([\s\S]*?)`\);/);
  assert.ok(setup, 'actual regression fixture setup found');
  await writer.query(setup[1]);
  for (const file of [
    'db/migrations/20261014_qms_controlled_authoring_content.sql',
    'db/migrations/20261014_orchestrator_continuation_inputs.sql',
    'migrations/20261014_notification_recipient_receipts.sql',
  ]) await writer.query(readFileSync(resolve(repositoryRoot, file), 'utf8'));
  await writer.query('BEGIN');
  const runId = '44444444-4444-4444-8444-444444444444';
  await writer.query('INSERT INTO submission_orchestrator_runs VALUES ($1,11)', [runId]);
  await writer.query(`INSERT INTO submission_orchestrator_inputs (run_id,organization_id,program_id,input_snapshot,input_digest)
    VALUES ($1,11,$2,$3::jsonb,$4)`, [runId, '11111111-1111-4111-8111-111111111111', JSON.stringify({ clinicalSummary: 'Synthetic in-flight snapshot' }), 'b'.repeat(64)]);
  readerPool = new Pool({ connectionString: fixtureUrl.href, max: 2 });
  let notifyLockAttempt;
  const lockAttempt = new Promise((resolveAttempt) => { notifyLockAttempt = resolveAttempt; });
  let purgePid;
  const platformPool = {
    query: (...args) => readerPool.query(...args),
    connect: async () => {
      const client = await readerPool.connect();
      purgePid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      return {
        query: (text, params) => {
          if (text.includes('FROM organizations') && text.includes('FOR UPDATE')) notifyLockAttempt();
          return client.query(text, params);
        },
        release: () => client.release(),
      };
    },
  };
  const purgeOutcome = purgeTenant(platformPool, {
    organizationId: 11, purgedByUserId: 7,
    preconditions: { finalExportDigest: 'synthetic-final-export' },
    childTables: ['documents', 'regulatory_programs'],
  }).then((value) => ({ value }), (error) => ({ error }));
  await lockAttempt;
  let blocked = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const wait = await administrator.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [purgePid]);
    if (wait.rows[0]?.wait_event_type === 'Lock') { blocked = true; break; }
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  assert.equal(blocked, true, 'the real purge waits for the in-flight foreign-key insertion');
  await writer.query('COMMIT');
  const outcome = await purgeOutcome;
  assert.equal(outcome.error?.code, 'REGULATED_CONTENT_RETENTION_REVIEW_REQUIRED');
  assert.equal((await writer.query('SELECT status FROM organizations WHERE id=11')).rows[0].status, 'pending_deletion');
  assert.equal((await writer.query('SELECT count(*)::int AS n FROM documents')).rows[0].n, 2);
  assert.equal((await writer.query('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n, 0);
  assert.equal((await writer.query('SELECT count(*)::int AS n FROM submission_orchestrator_inputs WHERE organization_id=11')).rows[0].n, 1);
  console.info('PASS native PostgreSQL: actual purge waits for in-flight FK insertion, then observes the committed snapshot and refuses before erasure; both tenants’ documents remain, status remains pending_deletion, and no purge success audit row exists.');
} finally {
  await writer?.end().catch(() => {});
  await readerPool?.end().catch(() => {});
  if (created) await administrator.query('DROP DATABASE c2c_audit_retention_lock_proof');
  await administrator.end();
}

/** Real independently observed PostgreSQL 16 lock contention in an owned
 * disposable fixture. Canonical shared reservation helper, ordinary runtime
 * role; source/receipt DDL is synthetic. No deployed-role/RLS/PQ claim. */
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../server/db', () => {
  const refuse = () => { throw new Error('UNOWNED_DATABASE_ACCESS_REFUSED'); };
  return { pool: { query: refuse, connect: refuse }, getPool: refuse, db: {} };
});
import { reserveDraftSourceStores } from '../../../../server/services/authoring/draft-source-references';
import { lockDocumentDispositionProgram } from '../../../../server/services/document-data-disposition/program-lock';

const folder = new URL('.', import.meta.url);
// Explicit test-only negative control: preserve the canonical helper and every
// real query except the one table-lock statement whose barrier is under test.
const omitStoreLock = process.env.LIFECYCLE_OMIT_STORE_LOCK === '1';
const artifactPrefix = omitStoreLock ? 'lifecycle-counterfactual' : 'lifecycle';
const state = JSON.parse(fs.readFileSync(new URL(`${artifactPrefix}-fixture-state.json`, folder), 'utf8'));
if (state.phase !== 'ready' || state.host !== '127.0.0.1' || state.database !== 'draft_source_lifecycle_fixture'
    || state.ownerRole !== 'lifecycle_fixture_applier' || !Number.isInteger(state.port)
    || !/^c2c-draft-lifecycle-[a-z0-9-]+$/.test(state.name)) throw new Error('OWNED_LIFECYCLE_FIXTURE_NOT_READY');
const connection = { host: state.host, port: state.port, database: state.database, ssl: false,
  connectionTimeoutMillis: 3000, statement_timeout: 12_000 };
const observer = new pg.Pool({ ...connection, user: state.ownerRole, max: 3, application_name: 'lifecycle-observer' });
const observations: Array<Record<string, unknown>> = [];
const boundFiles = [
  'server/services/authoring/draft-source-references.ts',
  'server/services/authoring/authoring-from-draft.ts',
  'server/services/ana/draft-source-identity.ts',
  'shared/authoring/draft-source-reference.ts',
  'server/services/document-data-disposition/program-lock.ts',
  'server/services/document-data-disposition/types.ts',
  'docs/evidence/D2-DRAFT-SOURCE-IDENTITY/2026-10-16/CONTRACT.md',
  'docs/evidence/D2-DRAFT-SOURCE-IDENTITY/2026-10-16/lifecycle-postgres.test.mts',
  'docs/evidence/D2-DRAFT-SOURCE-IDENTITY/2026-10-16/lifecycle-postgres.config.mts',
  'docs/evidence/D2-DRAFT-SOURCE-IDENTITY/2026-10-16/lifecycle-run-owned-postgres.mjs',
];
const pins = () => Object.fromEntries(boundFiles.map(file => [file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
const before = pins();
let caseNo = 0;

beforeAll(async () => {
  await observer.query(`CREATE SCHEMA vault;
    CREATE TABLE vault.documents(id uuid PRIMARY KEY,organization_id integer NOT NULL,extracted_text text NOT NULL);
    CREATE TABLE vault.document_catalog(document_id uuid PRIMARY KEY,char_count integer NOT NULL);
    CREATE TABLE lifecycle_receipts(id uuid PRIMARY KEY,organization_id integer NOT NULL);
    GRANT USAGE ON SCHEMA vault TO app_service;
    GRANT SELECT,INSERT,UPDATE ON vault.documents,vault.document_catalog,lifecycle_receipts TO app_service;`);
});
afterAll(async () => {
  const after = pins();
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  fs.writeFileSync(new URL(`${artifactPrefix}-postgres-observations.json`, folder), JSON.stringify({
    fixture: { name: state.name, database: state.database, image: state.image },
    counterfactualOmittedStoreLock: omitStoreLock,
    recordedAt: new Date().toISOString(), sourceHashesBefore: before, sourceHashesAfter: after,
    sourcesUnchangedDuringRun: unchanged, observations,
    limits: 'Synthetic source/receipt DDL and explicit transactions over the canonical shared helper. Actual HTTP/save/export/ledger paths are covered separately on PGlite. This fixture proves independent PostgreSQL blocking/release and ordinary role attributes, not deployed RLS, workload, audit HMAC or regulatory qualification.',
  }, null, 2) + '\n');
  await observer.end();
  expect(unchanged).toBe(true);
});

async function client(label: string) {
  const handle = new pg.Client({ ...connection, user: 'app_service', application_name: `lifecycle-${label}` });
  await handle.connect();
  const identity = (await handle.query(`SELECT pg_backend_pid() AS pid,current_user AS role,
    current_database() AS database,rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname=current_user`)).rows[0];
  expect(identity).toMatchObject({ role: 'app_service', database: state.database, rolsuper: false, rolbypassrls: false, rolcreaterole: false });
  return { handle, ...identity };
}
function reserve(handle: pg.Client, org: number, program: string) {
  if (!omitStoreLock) return reserveDraftSourceStores(handle, org, program);
  return reserveDraftSourceStores({ query: (sql: string, params?: unknown[]) =>
    sql === 'LOCK TABLE vault.documents, vault.document_catalog IN SHARE MODE'
      ? Promise.resolve({ rows: [], rowCount: 0 }) : handle.query(sql, params) }, org, program);
}
async function barrier(waiter: number, blocker: number, label: string) {
  const deadline = Date.now() + 3500;
  while (Date.now() < deadline) {
    const rows = (await observer.query(`SELECT pid,application_name,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers
      FROM pg_stat_activity WHERE pid=$1 AND $2=ANY(pg_blocking_pids(pid))`, [waiter, blocker])).rows;
    if (rows.length) {
      observations.push({ kind: 'independent_blocking_barrier', label, waiter, blocker, rows });
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`Expected native PostgreSQL blocking barrier was absent: ${label}`);
}

describe('canonical draft source-store reservation on independently observed PostgreSQL', () => {
  it.each([
    ['document', 'COMMIT'], ['catalog', 'COMMIT'],
    ['document', 'ROLLBACK'], ['catalog', 'ROLLBACK'],
  ] as const)('raw %s UPDATE waits through the reservation and releases only on %s', async (store, ending) => {
    const id = randomUUID(); const receiptId = randomUUID(); const program = randomUUID();
    const org = 995000 + ++caseNo;
    await observer.query('INSERT INTO vault.documents VALUES($1,$2,$3)', [id, org, 'Original synthetic extraction']);
    await observer.query('INSERT INTO vault.document_catalog VALUES($1,29)', [id]);
    const saver = await client(`reservation-${caseNo}`);
    const updater = await client(`raw-update-${caseNo}`);
    let pending: Promise<pg.QueryResult> | undefined;
    let completed = false;
    try {
      expect(saver.pid).not.toBe(updater.pid);
      await saver.handle.query('BEGIN');
      await reserve(saver.handle, org, program);
      const held = (await observer.query(`SELECT c.relname,l.mode,l.granted FROM pg_locks l
        JOIN pg_class c ON c.oid=l.relation JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE l.pid=$1 AND n.nspname='vault' AND l.mode='ShareLock' ORDER BY c.relname`, [saver.pid])).rows;
      if (!omitStoreLock) expect(held).toEqual([{ relname: 'document_catalog', mode: 'ShareLock', granted: true }, { relname: 'documents', mode: 'ShareLock', granted: true }]);
      await saver.handle.query('INSERT INTO lifecycle_receipts VALUES($1,$2)', [receiptId, org]);
      await updater.handle.query('BEGIN');
      pending = store === 'document'
        ? updater.handle.query('UPDATE vault.documents SET extracted_text=$2 WHERE id=$1 AND organization_id=$3', [id, 'Changed synthetic extraction!', org])
        : updater.handle.query('UPDATE vault.document_catalog SET char_count=$2 WHERE document_id=$1', [id, 99]);
      void pending.then(() => { completed = true; }, () => { completed = true; });
      await barrier(updater.pid, saver.pid, `${store}-${ending}`);
      expect(completed).toBe(false);
      expect((await observer.query('SELECT id FROM lifecycle_receipts WHERE id=$1 AND organization_id=$2', [receiptId, org])).rows).toEqual([]);
      await saver.handle.query(ending);
      expect((await pending).rowCount).toBe(1);
      await updater.handle.query('COMMIT');
      const persisted = (await observer.query('SELECT id FROM lifecycle_receipts WHERE id=$1 AND organization_id=$2', [receiptId, org])).rows;
      expect(persisted).toHaveLength(ending === 'COMMIT' ? 1 : 0);
      const stored = store === 'document'
        ? (await observer.query('SELECT extracted_text AS value FROM vault.documents WHERE id=$1 AND organization_id=$2', [id, org])).rows[0].value
        : (await observer.query('SELECT char_count AS value FROM vault.document_catalog WHERE document_id=$1', [id])).rows[0].value;
      expect(stored).toBe(store === 'document' ? 'Changed synthetic extraction!' : 99);
      observations.push({ kind: 'reservation_release', store, ending, runtime: { role: saver.role, rolsuper: saver.rolsuper,
        rolbypassrls: saver.rolbypassrls, rolcreaterole: saver.rolcreaterole }, saverPid: saver.pid, updaterPid: updater.pid,
        receiptPersisted: persisted.length === 1, mutationCompletedAfterRelease: completed, held });
    } finally {
      await saver.handle.query('ROLLBACK').catch(() => undefined);
      await pending?.catch(() => undefined);
      await updater.handle.query('ROLLBACK').catch(() => undefined);
      await saver.handle.end(); await updater.handle.end();
    }
  });

  it('a raw source update already in progress blocks the shared reservation before it can attest to stable sources', async () => {
    const id = randomUUID(); const org = 995000 + ++caseNo; const program = randomUUID();
    await observer.query('INSERT INTO vault.documents VALUES($1,$2,$3)', [id, org, 'Original source']);
    const updater = await client('update-first'); const saver = await client('reservation-second');
    let pending: Promise<void> | undefined;
    let completed = false;
    try {
      await updater.handle.query('BEGIN');
      await updater.handle.query('UPDATE vault.documents SET extracted_text=$2 WHERE id=$1 AND organization_id=$3', [id, 'Changed source!', org]);
      await saver.handle.query('BEGIN');
      pending = reserve(saver.handle, org, program);
      void pending.then(() => { completed = true; }, () => { completed = true; });
      await barrier(saver.pid, updater.pid, 'raw-update-before-reservation');
      expect(completed).toBe(false);
      await updater.handle.query('COMMIT');
      await pending;
      expect((await saver.handle.query('SELECT extracted_text FROM vault.documents WHERE id=$1 AND organization_id=$2', [id, org])).rows[0].extracted_text).toBe('Changed source!');
      await saver.handle.query('ROLLBACK');
      observations.push({ kind: 'raw_update_precedes_reservation', updaterPid: updater.pid, saverPid: saver.pid,
        currentChangedTextVisibleAfterReservation: true, verificationMustUseCurrentText: true });
    } finally {
      await updater.handle.query('ROLLBACK').catch(() => undefined);
      await pending?.catch(() => undefined);
      await saver.handle.query('ROLLBACK').catch(() => undefined);
      await updater.handle.end(); await saver.handle.end();
    }
  });

  it('program advisory admission precedes the store reservation so an unrelated raw writer is not held while admission waits', async () => {
    const id = randomUUID(); const org = 995000 + ++caseNo; const program = randomUUID();
    await observer.query('INSERT INTO vault.documents VALUES($1,$2,$3)', [id, org, 'Original source']);
    const holder = await client('program-holder'); const saver = await client('program-waiter'); const updater = await client('writer-during-program-wait');
    let pending: Promise<void> | undefined;
    try {
      await holder.handle.query('BEGIN');
      await lockDocumentDispositionProgram(holder.handle, org, program);
      await saver.handle.query('BEGIN');
      pending = reserve(saver.handle, org, program);
      void pending.catch(() => undefined);
      await barrier(saver.pid, holder.pid, 'program-admission-before-store-lock');
      expect((await updater.handle.query('UPDATE vault.documents SET extracted_text=$2 WHERE id=$1 AND organization_id=$3', [id, 'Writer progressed', org])).rowCount).toBe(1);
      await holder.handle.query('COMMIT'); await pending;
      await saver.handle.query('ROLLBACK');
      observations.push({ kind: 'program_before_store_lock', holderPid: holder.pid, saverPid: saver.pid,
        rawWriterProgressedWhileProgramAdmissionWaited: true });
    } finally {
      await holder.handle.query('ROLLBACK').catch(() => undefined);
      await pending?.catch(() => undefined);
      await saver.handle.query('ROLLBACK').catch(() => undefined);
      await holder.handle.end(); await saver.handle.end(); await updater.handle.end();
    }
  });
});

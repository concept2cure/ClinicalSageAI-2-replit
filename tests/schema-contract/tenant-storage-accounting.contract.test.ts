/**
 * Storage accounting must measure something, and must measure it per tenant.
 *
 * ── Why this test is the load-bearing one for the quota ───────────────────────
 * `evaluateStorageQuota` is exhaustively unit-tested and `enforceStorageQuota`
 * is pinned against a mocked service. Both stay green if `discoverStorageTables`
 * finds ZERO tables against the real schema — every tenant would measure at
 * exactly 0 bytes, every upload would be admitted, and the quota would be
 * decoration again, with a full suite of passing tests over it. That is the
 * precise failure mode this whole workstream exists to eliminate, so the
 * discovery is asserted against the shipped drizzle lineage rather than a
 * fixture that agrees with itself.
 *
 * ── And it must not measure the wrong thing ───────────────────────────────────
 * A discovery that is too WIDE is the opposite failure and is just as bad
 * commercially: summing a `page_size` or a `cohort_size` column into a byte
 * total bills a customer for numbers that are not bytes. So the column pattern
 * is asserted in both directions — the known byte columns are found, and a
 * decoy `size` column planted in the fixture is not.
 *
 * @compliance Commercial metering, not a security control — see storageQuotaGuard
 *             on why this fails open while the lifecycle guard fails closed.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { citext } from '@electric-sql/pglite/contrib/citext';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computeTenantStorage,
  discoverStorageTables,
  evaluateStorageQuota,
  type StorageTable,
} from '../../server/services/tenant/tenant-storage';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const T = 300_000;

let pg: PGlite;
let discovered: StorageTable[] = [];
let tablesInFixture = new Set<string>();

const asClient = () =>
  ({ query: (sql: string, params?: unknown[]) => pg.query(sql, params) }) as never;

beforeAll(async () => {
  pg = new PGlite({ extensions: { pgcrypto, pg_trgm, uuid_ossp, citext } });
  const safe = async (sql: string) => {
    try {
      await pg.exec(sql);
    } catch {
      await pg.exec('ROLLBACK').catch(() => undefined);
    }
  };
  for (const ext of ['pgcrypto', 'pg_trgm', '"uuid-ossp"', 'citext']) {
    await safe(`CREATE EXTENSION IF NOT EXISTS ${ext};`);
  }
  const journal = fs.readFileSync(path.join(REPO_ROOT, 'migrations/0000_sweet_joseph.sql'), 'utf8');
  for (const match of journal.matchAll(/CREATE TABLE "([a-z0-9_]+)" \([\s\S]*?\n\);/g)) {
    await safe(match[0].replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS '));
  }
  // `file_uploads` is not in the base journal — it was retrofitted by its own
  // tenancy migration. It is also the table chat attachments land in, so a
  // fixture without it under-represents the schema the quota runs against.
  await safe(
    fs.readFileSync(path.join(REPO_ROOT, 'migrations/20260726_file_uploads_tenancy.sql'), 'utf8')
  );

  // A decoy: a tenant-scoped table whose only integer column is an ambiguous
  // `size`. If the pattern ever widens to bare `size`, this table starts being
  // summed into a byte total and the test below says so.
  await safe(`
    CREATE TABLE IF NOT EXISTS zz_storage_decoy (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER,
      size INTEGER,
      page_size INTEGER
    );
  `);

  discovered = await discoverStorageTables(asClient());

  const { rows } = await pg.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
  );
  tablesInFixture = new Set(rows.map(r => r.table_name));
}, T);

afterAll(async () => {
  await pg?.close().catch(() => undefined);
});

describe('the accounting finds real storage', () => {
  it('discovers tables carrying both a tenant key and a byte column', () => {
    // The number that makes every other storage assertion non-vacuous. Zero here
    // means every tenant measures at 0 bytes and the quota admits everything.
    expect(
      discovered.length,
      'no storage tables discovered — the quota would measure every tenant at zero'
    ).toBeGreaterThanOrEqual(8);
  }, T);

  it('finds the tables a regulatory customer actually fills', () => {
    const found = new Set(discovered.map(d => d.table));
    // Named explicitly rather than counted: these are where a submission's bulk
    // lives, and a discovery that missed them while still finding eight others
    // would pass a count check and under-measure every real customer.
    //
    // Asserted WITHOUT a "skip if absent" guard on purpose. An earlier revision
    // guarded on `tablesInFixture.has(table)` and silently skipped `file_uploads`,
    // which is not in the base journal — three assertions in this file passed by
    // testing nothing at all. A table missing from the fixture is now a failure,
    // because it means the fixture no longer represents a deploy.
    for (const table of ['file_uploads', 'project_documents', 'rag_documents']) {
      expect(tablesInFixture.has(table), `${table} is missing from the fixture`).toBe(true);
      expect(found.has(table), `${table} carries tenant bytes but was not discovered`).toBe(true);
    }
  }, T);

  it('does NOT count an ambiguous `size` column as bytes', () => {
    // Too-wide discovery bills customers for numbers that are not bytes.
    const decoy = discovered.find(d => d.table === 'zz_storage_decoy');
    expect(decoy, 'a bare `size` column was counted as a byte total').toBeUndefined();
  }, T);

  it('picks exactly one tenant key per table', () => {
    // A table matching on both organization_id and tenant_id must not be summed
    // twice; the dedupe is what stops a double charge.
    const seen = discovered.map(d => d.table);
    expect(new Set(seen).size).toBe(seen.length);
  }, T);
});

describe('the sum is per tenant, not per platform', () => {
  const ORG_A = 900_001;
  const ORG_B = 900_002;

  beforeAll(async () => {
    // `project_documents` is in the base journal, carries organization_id +
    // file_size, and is where a submission's authored bulk actually lands.
    // Seeding two tenants into it proves the WHERE clause is doing work rather
    // than the sum happening to be right.
    const mk = (org: number, size: number, n: number) =>
      pg.query(
        `INSERT INTO project_documents (organization_id, project_id, name, type, file_size)
         VALUES ($1, $2, $3, 'contract-fixture', $4)`,
        [org, org, `fixture-${org}-${n}`, size]
      );
    await mk(ORG_A, 1000, 1);
    await mk(ORG_A, 2500, 2);
    await mk(ORG_B, 999_999, 1);
  }, T);

  it("sums only the asking tenant's rows", async () => {
    const a = await computeTenantStorage(asClient(), ORG_A);
    const b = await computeTenantStorage(asClient(), ORG_B);

    // If the WHERE clause were dropped, A would see B's 999,999 too. Exact
    // equality is what makes that detectable — a `toBeGreaterThan` would pass
    // in both worlds.
    expect(a.bytes).toBe(3500);
    expect(b.bytes).toBe(999_999);
  }, T);

  it('reports the measurement as partial rather than as a precise bill', async () => {
    const usage = await computeTenantStorage(asClient(), ORG_A);
    // Object storage the database has no row for is not counted. Presenting this
    // as an exact figure to a customer would be a claim we cannot support.
    expect(usage.measured).toBe('partial');
    expect(usage.tablesCounted).toBeGreaterThan(0);
  }, T);

  it('feeds a decision that would actually refuse an over-quota tenant', async () => {
    // End to end on real numbers: measure, then decide. A 1 GB tenant sitting on
    // 999,999 bytes has room; the same tenant against a nominal limit does not.
    const b = await computeTenantStorage(asClient(), ORG_B);
    expect(evaluateStorageQuota({ usedBytes: b.bytes, maxStorageGb: 1, incomingBytes: 1 }).allowed).toBe(
      true
    );
    expect(
      evaluateStorageQuota({
        usedBytes: b.bytes,
        maxStorageGb: 1,
        incomingBytes: 1024 ** 3,
      }).allowed
    ).toBe(false);
  }, T);

  it('records an unreadable table instead of aborting the whole sum', async () => {
    // One bad table must not take out the quota for every tenant; the failure is
    // recorded so the under-count is visible rather than silent.
    const usage = await computeTenantStorage(
      {
        query: async (sql: string, params?: unknown[]) => {
          if (sql.includes('information_schema')) return pg.query(sql, params);
          if (sql.includes('project_documents')) throw new Error('permission denied');
          return pg.query(sql, params);
        },
      } as never,
      ORG_A
    );
    expect(usage.tablesFailed.map(f => f.table)).toContain('project_documents');
    expect(usage.tablesCounted).toBeGreaterThan(0);
  }, T);
});

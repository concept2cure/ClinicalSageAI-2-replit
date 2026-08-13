/**
 * The regression test for the defect this whole project exists to end.
 *
 * `tests/setup.ts` installs `vi.mock('pg')` for every file in the default
 * vitest project — ~1,600 of them — and the CI job that stands up a real
 * PostgreSQL service ran under exactly that mock. `new Pool().query(...)`
 * answered `{ rows: [], rowCount: 0 }` without a packet leaving the process, so
 * the "DB-backed" suite proved nothing about the schema or the SQL the routes
 * issue, and reported green while doing it.
 *
 * These tests fail if that ever becomes true again. They are deliberately about
 * the harness rather than about a feature: if the harness is a stub, every
 * other assertion in this directory is worthless, so this is the one that has
 * to hold first.
 */

import { describe, it, expect, vi } from 'vitest';
import { Pool } from 'pg';
import { resolveTestDatabaseUrl, databaseUrl } from '../setup.db';

describe('real-database project: the pg driver is not mocked', () => {
  it('exposes the genuine pg.Pool, not a vitest mock function', () => {
    expect(vi.isMockFunction(Pool)).toBe(false);
    // The mock in tests/setup.ts is `vi.fn(function () { return mockPool })`;
    // the real export is a class whose prototype carries connect/query.
    expect(typeof Pool.prototype.connect).toBe('function');
    expect(typeof Pool.prototype.query).toBe('function');
  });

  it('reaches a real PostgreSQL server — a value the mock could not invent', async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      // The mocked pool resolves every query to `{ rows: [], rowCount: 0 }`.
      // Anything that requires the server to compute an answer distinguishes
      // the two, so this asserts on a value only a real backend can produce.
      const result = await pool.query(
        "SELECT current_setting('server_version_num')::int AS version, 6 * 7 AS answer"
      );
      expect(result.rowCount).toBe(1);
      expect(result.rows[0].answer).toBe(42);
      expect(result.rows[0].version).toBeGreaterThan(120000);
    } finally {
      await pool.end();
    }
  });

  it('runs with RLS_ENFORCE=on — the mode production mandates', async () => {
    // Before this project existed, no CI job ran a single test in this mode,
    // which is why an RLS-on boot failure and 130 RLS-on 500s could ship green.
    expect(process.env.RLS_ENFORCE).toBe('on');
  });

  it('DDL issued by one connection is visible to another — state actually persists', async () => {
    // The strongest available proof that a server is doing the work: a stub has
    // no place to keep this between two independently constructed pools.
    const table = `dbtest_persist_${process.pid}_${Date.now().toString(36)}`;
    const writer = new Pool({ connectionString: databaseUrl });
    const reader = new Pool({ connectionString: databaseUrl });
    try {
      await writer.query(`CREATE TABLE ${table} (id INT PRIMARY KEY, note TEXT)`);
      await writer.query(`INSERT INTO ${table} VALUES (1, 'written by the writer pool')`);

      const seen = await reader.query(`SELECT note FROM ${table} WHERE id = 1`);
      expect(seen.rowCount).toBe(1);
      expect(seen.rows[0].note).toBe('written by the writer pool');
    } finally {
      await writer.query(`DROP TABLE IF EXISTS ${table}`).catch(() => {});
      await writer.end();
      await reader.end();
    }
  });
});

describe('real-database project: configuration fails closed', () => {
  it('rejects the unit-test placeholder DATABASE_URL instead of timing out on it', () => {
    // tests/setup.ts assigns this when DATABASE_URL is unset. Against the mock
    // it was harmless. Here it means the environment was never configured, and
    // it must say so rather than surface as a connection timeout.
    expect(() =>
      resolveTestDatabaseUrl({ DATABASE_URL: 'postgresql://test:test@localhost:5432/test' })
    ).toThrow(/unit-test placeholder/);
  });

  it('rejects an absent DATABASE_URL rather than skipping the suite', () => {
    // A `skipIf(!DATABASE_URL)` would reproduce the original defect exactly:
    // green output, nothing executed, no signal.
    expect(() => resolveTestDatabaseUrl({})).toThrow(/must point at a real/);
  });

  it('prefers TEST_DATABASE_URL when both are set', () => {
    expect(
      resolveTestDatabaseUrl({
        TEST_DATABASE_URL: 'postgresql://u@host:5432/explicit',
        DATABASE_URL: 'postgresql://u@host:5432/ambient',
      })
    ).toBe('postgresql://u@host:5432/explicit');
  });
});

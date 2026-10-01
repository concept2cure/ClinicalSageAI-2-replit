/**
 * A deploy's migration must not stall the running application behind a lock.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * deploy-aws.yml runs deploy-migrate as a one-off task while the PREVIOUS API
 * tasks are still serving, and every file in C2C_MIGRATION_FILES re-runs on
 * every deploy (CLAUDE.md, Rule 1). Measured on a provisioned PostgreSQL 16
 * database, a replay that changes nothing still takes ACCESS EXCLUSIVE on 151
 * tables in 114 of 309 files — projects, organizations, users, audit_logs and
 * vault.documents among them (`ALTER TABLE … ADD COLUMN IF NOT EXISTS` locks
 * before it checks; `DROP CONSTRAINT IF EXISTS … ADD CONSTRAINT` re-validates).
 *
 * Uncontended, each lock lasts milliseconds. Contended, PostgreSQL queues it:
 * the ALTER waits for any open transaction that has read the table, and every
 * query on that table that arrives afterwards waits behind the ALTER. The
 * migration session set no lock_timeout, so the wait was bounded only by the
 * blocker — up to the runtime pool's 30 s statement_timeout, 60 s for an idle
 * transaction — and for that long every request touching `organizations` (that
 * is, every authenticated request) hung. On every deploy that met a slow query.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 * applyMigrationFiles, the one applier both callers use, on a real server:
 *   1. while a reader holds the table, an application query issued behind the
 *      waiting migration returns within the migration's lock_timeout, not when
 *      the reader lets go — and the migration still applies once it can;
 *   2. a lock that never frees fails the file after a bounded number of
 *      attempts, naming the file, and leaves nothing half-applied;
 *   3. an error that is not a lock timeout is not retried;
 *   4. the session's lock_timeout is restored afterwards.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { databaseUrl } from '../setup.db';
import { applyMigrationFiles } from '../../scripts/db/migration-set.mjs';

const SCHEMA = `lk_${process.pid}_${Math.floor(Math.random() * 1e6)}`;
const TABLE = `${SCHEMA}.hot`;

let pool: Pool;
let root: string;
let holder: PoolClient; // an open transaction that has read the table, as a slow request would
let migrator: PoolClient; // the deploy's one connection

function writeMigration(name: string, sql: string): string {
  fs.writeFileSync(path.join(root, name), sql);
  return name;
}

async function columnExists(column: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'hot' AND column_name = $2`,
    [SCHEMA, column],
  );
  return r.rowCount === 1;
}

/** Resolves once `pid` is waiting on a relation lock: the migration has queued. */
async function waitUntilQueued(pid: number): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const r = await pool.query(`SELECT 1 FROM pg_locks WHERE pid = $1 AND NOT granted`, [pid]);
    if (r.rowCount) return;
    await new Promise(res => setTimeout(res, 10));
  }
  throw new Error('the migration never queued behind the reader; the test is not measuring anything');
}

/** An application request: its own connection, the runtime pool's timeout. */
async function timedRequest(): Promise<number> {
  const c = await pool.connect();
  try {
    await c.query(`SET statement_timeout = 20000`);
    const t0 = Date.now();
    await c.query(`SELECT count(*) FROM ${TABLE}`);
    return Date.now() - t0;
  } finally {
    c.release();
  }
}

beforeAll(async () => {
  pool = new Pool({ connectionString: databaseUrl, max: 6 });
  await pool.query(`CREATE SCHEMA ${SCHEMA}`);
  await pool.query(`CREATE TABLE ${TABLE} (id int PRIMARY KEY)`);
  await pool.query(`INSERT INTO ${TABLE} SELECT generate_series(1, 100)`);
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'c2c-lock-timeout-'));
});

afterAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await pool.end();
  fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(async () => {
  holder = await pool.connect();
  migrator = await pool.connect();
});

afterEach(async () => {
  await holder.query('ROLLBACK').catch(() => {});
  holder.release();
  migrator.release();
});

describe('applyMigrationFiles under a live workload', () => {
  it('an application query behind a waiting migration returns within the lock timeout, and the migration still applies', async () => {
    const file = writeMigration('add_note.sql', `ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS note text;`);
    const HOLD_MS = 4000;

    await holder.query('BEGIN');
    await holder.query(`SELECT count(*) FROM ${TABLE}`);
    const released = new Promise<void>(res =>
      setTimeout(() => holder.query('COMMIT').then(() => res()), HOLD_MS),
    );

    const migratorPid = (await migrator.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const t0 = Date.now();
    const migration = applyMigrationFiles(migrator, root, [file], {
      stopOnFirstFailure: true,
      lockTimeoutMs: 300,
      lockAttempts: 40,
      lockBackoffMs: 100,
    });
    await waitUntilQueued(migratorPid);

    const requestMs = await timedRequest();
    const { applied, failures } = await migration;
    const migrationMs = Date.now() - t0;
    await released;

    // Behind an unbounded wait the request returns only when the reader lets go (~HOLD_MS).
    expect(requestMs, `the request waited ${requestMs} ms behind the migration`).toBeLessThan(1500);
    expect(failures).toEqual([]);
    expect(applied).toEqual([file]);
    expect(await columnExists('note')).toBe(true);
    expect(migrationMs).toBeGreaterThanOrEqual(HOLD_MS - 200); // it waited for the reader, by retrying
  });

  it('a lock that never frees fails the file after bounded attempts, naming it, with nothing applied', async () => {
    const file = writeMigration('add_blocked.sql', `ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS blocked text;`);
    await holder.query('BEGIN');
    await holder.query(`SELECT count(*) FROM ${TABLE}`);

    const errors: string[] = [];
    const t0 = Date.now();
    const { applied, failures } = await applyMigrationFiles(migrator, root, [file], {
      stopOnFirstFailure: true,
      error: m => errors.push(m),
      lockTimeoutMs: 200,
      lockAttempts: 3,
      lockBackoffMs: 50,
    });
    const elapsed = Date.now() - t0;

    expect(applied).toEqual([]);
    expect(failures).toHaveLength(1);
    expect(failures[0].file).toBe(file);
    expect(failures[0].error).toMatch(/lock/i);
    expect(failures[0].error).toMatch(/3 attempts/);
    expect(elapsed).toBeLessThan(5000);
    expect(await columnExists('blocked')).toBe(false);
  });

  it('an error that is not a lock timeout is not retried', async () => {
    const file = writeMigration('broken.sql', `ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS;`);
    const logs: string[] = [];
    const { failures } = await applyMigrationFiles(migrator, root, [file], {
      stopOnFirstFailure: true,
      log: m => logs.push(m),
      error: m => logs.push(m),
      lockTimeoutMs: 200,
      lockAttempts: 5,
      lockBackoffMs: 50,
    });
    expect(failures).toHaveLength(1);
    expect(failures[0].error).toMatch(/syntax/i);
    expect(logs.filter(l => /retry/i.test(l))).toEqual([]);
  });

  it("leaves the session's lock_timeout as it found it", async () => {
    const file = writeMigration('noop.sql', `SELECT 1;`);
    await migrator.query(`SET lock_timeout = '7s'`);
    await applyMigrationFiles(migrator, root, [file], { lockTimeoutMs: 250 });
    expect((await migrator.query('SHOW lock_timeout')).rows[0].lock_timeout).toBe('7s');
    await migrator.query('RESET lock_timeout');
  });
});

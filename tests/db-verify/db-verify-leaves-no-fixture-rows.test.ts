/**
 * The db-verify harnesses leave no fixture rows in a database that is not
 * theirs. 2026-10-15.
 *
 * verify-rls.ts committed `organizations (1,'Org A'),(2,'Org B')` and
 * `users (1,'u@x')` on the pool, outside the transactions it rolls back, into
 * whatever TEST_DATABASE_URL / DATABASE_URL named. verify-research-compliance.ts
 * commits everything it exercises — 'Org A', investigator 'Dr Verify', signed
 * disclosures, a DEA registration, IACUC approvals, grants, and governed
 * actions on the audit hash-chain — into organization 1 of whatever database
 * it reached.
 *
 * verify-rls.ts runs here as written, against a recording `pg` that answers
 * enough for it to finish and tracks how each connection's transaction ended;
 * verify-research-compliance.ts runs as a real child process.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

type Entry = { conn: string; sql: string };
const state = vi.hoisted(() => ({ log: [] as Array<{ conn: string; sql: string }>, settle: (_code: number) => {} }));

vi.mock('pg', () => {
  const answer = (sql: string) => {
    const s = sql.replace(/\s+/g, ' ');
    if (/count\(DISTINCT tablename\)/.test(s)) return { rows: [{ n: 8 }], rowCount: 1 };
    if (/bool_and\(relrowsecurity\)/.test(s)) return { rows: [{ e: true, f: true }], rowCount: 1 };
    if (/count\(\*\)::int n/.test(s)) return { rows: [{ n: 1 }], rowCount: 1 };
    if (/RETURNING id/.test(s)) return { rows: [{ id: 1 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  let clients = 0;
  class Pool {
    async query(sql: string) {
      state.log.push({ conn: 'pool', sql });
      return answer(sql);
    }
    async connect() {
      const conn = `client${++clients}`;
      return {
        async query(sql: string) {
          state.log.push({ conn, sql });
          return answer(sql);
        },
        release() {},
      };
    }
    async end() {}
    on() {}
  }
  return { Pool, default: { Pool } };
});

/** Writes that outlive the run: on the pool (autocommit), or in a transaction that was not rolled back. */
function committedWrites(log: Entry[]): string[] {
  const out: string[] = [];
  const open = new Map<string, string[]>();
  for (const { conn, sql } of log) {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s === 'BEGIN') open.set(conn, []);
    else if (s === 'ROLLBACK') open.delete(conn);
    else if (s === 'COMMIT') {
      out.push(...(open.get(conn) ?? []));
      open.delete(conn);
    } else if (/^(INSERT|UPDATE|DELETE)\b/i.test(s)) {
      const tx = open.get(conn);
      if (tx) tx.push(`${conn}: ${s}`);
      else out.push(`${conn}: ${s}`);
    }
  }
  for (const pending of open.values()) out.push(...pending); // never closed: committed on release
  return out;
}

describe('verify-rls.ts', () => {
  it('commits nothing: its fixture rows exist only inside the transactions it rolls back', async () => {
    const done = new Promise<number>((resolve) => {
      state.settle = resolve;
    });
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => state.settle(code ?? 0)) as never);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await import('../../scripts/db-verify/verify-rls');
      await done;
    } finally {
      exit.mockRestore();
      log.mockRestore();
      err.mockRestore();
    }
    expect(committedWrites(state.log)).toEqual([]);
    const fixtures = state.log.filter((e) => /INSERT INTO (organizations|users)\b/.test(e.sql));
    expect(fixtures.length).toBeGreaterThan(0); // the enforcement checks really ran, with their fixtures
    expect(fixtures.every((e) => e.conn !== 'pool')).toBe(true);
  }, 60_000);
});

describe('verify-research-compliance.ts', () => {
  const ROOT = path.resolve(__dirname, '../..');
  it.each([
    ['another host', { DATABASE_URL: 'postgresql://u:p@uat-db.example.invalid:5432/c2c' }, '"uat-db.example.invalid" is not on this machine'],
    ['a production process', { DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:1/x', NODE_ENV: 'production' }, 'NODE_ENV is production'],
  ])('refuses %s before connecting: it commits what it exercises', (_where, env, reason) => {
    const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/db-verify/verify-research-compliance.ts'], {
      cwd: ROOT,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
      encoding: 'utf8',
      timeout: 120_000,
    });
    const out = `${r.stdout}\n${r.stderr}`;
    expect(out).toContain('verify-research-compliance commits the records it exercises');
    expect(out).toContain(reason);
    expect(r.status).toBe(1);
  }, 150_000);
});

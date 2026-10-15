/**
 * ensureDatabaseAudit: pgaudit is created where the server loads it, and a
 * deployment that requires it fails closed where it is not recording
 * (scripts/db/database-audit.mjs, security audit INF-13 / plan P1-11).
 *
 * The server side is a fake: no PostgreSQL this suite can reach has pgaudit
 * installed. tests/db/database-audit.dbtest.ts covers the real server without
 * it; the loaded branch is pinned here.
 */
import { describe, expect, it } from 'vitest';
import { databaseAuditRequired, ensureDatabaseAudit } from '../../../scripts/db/database-audit.mjs';

function fakeServer({ preload, pgauditLog }: { preload: string | null; pgauditLog?: string | null }) {
  const sent: string[] = [];
  let created = false;
  return {
    sent,
    get created() {
      return created;
    },
    async query(sql: string) {
      sent.push(sql);
      if (sql.includes("'shared_preload_libraries'")) return { rows: [{ v: preload }] };
      if (sql.includes("'pgaudit.log'")) return { rows: [{ v: created ? (pgauditLog ?? null) : null }] };
      if (/CREATE EXTENSION IF NOT EXISTS pgaudit/.test(sql)) {
        created = true;
        return { rows: [] };
      }
      throw new Error(`unexpected statement: ${sql}`);
    },
  };
}

describe('databaseAuditRequired', () => {
  it('is off when unset or empty, on for pgaudit', () => {
    expect(databaseAuditRequired({})).toBe(false);
    expect(databaseAuditRequired({ DB_AUDIT_REQUIRED: '' })).toBe(false);
    expect(databaseAuditRequired({ DB_AUDIT_REQUIRED: 'pgaudit' })).toBe(true);
  });
  it('refuses any other value rather than treating it as off', () => {
    expect(() => databaseAuditRequired({ DB_AUDIT_REQUIRED: 'pg_audit' })).toThrow(/not understood/);
    expect(() => databaseAuditRequired({ DB_AUDIT_REQUIRED: 'true' })).toThrow(/not understood/);
  });
});

describe('ensureDatabaseAudit', () => {
  it('creates the extension where pgaudit is preloaded, and reports what it records', async () => {
    const server = fakeServer({ preload: 'rdsutils,pg_stat_statements,pgaudit', pgauditLog: 'write, ddl' });
    const result = await ensureDatabaseAudit(server, { required: true });
    expect(server.created).toBe(true);
    expect(result).toEqual({ state: 'recording', classes: 'write, ddl' });
  });

  it('fails closed when required and the server does not load pgaudit — the RDS parameter group as it was', async () => {
    const server = fakeServer({ preload: 'rdsutils,pg_stat_statements' });
    await expect(ensureDatabaseAudit(server, { required: true })).rejects.toThrow(
      /required .*does not load pgaudit.*shared_preload_libraries/s,
    );
    expect(server.created).toBe(false);
  });

  it('fails closed when required and pgaudit is loaded but set to record nothing', async () => {
    const server = fakeServer({ preload: 'pgaudit', pgauditLog: 'none' });
    await expect(ensureDatabaseAudit(server, { required: true })).rejects.toThrow(/records nothing/);
  });

  it('does not create anything, and does not fail, where it is neither loaded nor required', async () => {
    const server = fakeServer({ preload: '' });
    expect(await ensureDatabaseAudit(server, { required: false })).toEqual({ state: 'not-loaded' });
    expect(server.sent.some(s => /CREATE EXTENSION/.test(s))).toBe(false);
  });

  it('reads a quoted preload list the way PostgreSQL may render it', async () => {
    const server = fakeServer({ preload: '"pg_stat_statements", "pgaudit"', pgauditLog: 'ddl' });
    expect((await ensureDatabaseAudit(server, { required: true })).state).toBe('recording');
  });
});

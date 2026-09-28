/**
 * The audit_logs DELETE door and the archive service must agree, on a real
 * PostgreSQL engine (PGlite), and the door must not be a session setting.
 *
 * Security audit 2026-09-24, DP-04 (plan P0-8a): the BEFORE DELETE trigger
 * installed by db/migrations/20260617_audit_logs_immutability.sql let any
 * transaction through that had run `SET LOCAL app.audit_archive_bypass = 'on'`.
 * A custom GUC needs no privilege to set, so the runtime role could delete
 * audit rows at will (reproduced on PostgreSQL 16:
 * docs/evidence/D6/2026-09-24-security-audit/repro/DP-03-DP-04-postgres16-transcript.txt §9).
 *
 * The contract pinned here: the only way a row leaves audit_logs is
 * public.audit_logs_archive_delete(ids, locator, sha256, cutoff) — a SECURITY
 * DEFINER function owned by the NOLOGIN role audit_archiver, which the trigger
 * recognises by current_user. It refuses a row newer than the cutoff, a cutoff
 * inside the 24-month hot window (docs/operations/audit-log-retention-policy.md),
 * an empty or malformed locator/checksum and a batch naming a row that is not
 * there; it writes the deletion's own record to public.audit_log_archives (append
 * only) before deleting; and the GUC makes no difference to anyone any more.
 *
 * PGlite runs as a superuser session, so the runtime role is stood in by
 * `SET ROLE app_service` after granting it what scripts/db/provision-app-role.mjs
 * grants on public tables (SELECT, INSERT, UPDATE, DELETE). The role is named
 * app_service on purpose: it exercises the migration's default runtime-role
 * EXECUTE grant. `session_user` stays `postgres` under SET ROLE, which is what
 * the archive record's performed_by shows here; on a real cluster it is the
 * login role (see the PostgreSQL 16 transcript under
 * docs/evidence/D6/2026-09-24-p0/P0-8a/green/).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const MIGRATION = path.join(repoRoot, 'db/migrations/20260617_audit_logs_immutability.sql');
const BASELINE = path.join(repoRoot, 'migrations/0000_sweet_joseph.sql');
const SERVICE = path.join(repoRoot, 'server/services/audit/audit-archive.service.ts');

const ARCHIVE_FN = 'public.audit_logs_archive_delete(uuid[], text, text, timestamptz)';
const SHA = 'a'.repeat(64);
const LOCATOR = 's3://audit-archive-test/2026/09/25/batch.json';

/** The table as the Drizzle baseline creates it (index 0 of the deploy set). */
function auditLogsDdl(): string {
  const src = fs.readFileSync(BASELINE, 'utf8');
  const m = src.match(/CREATE TABLE "audit_logs" \((.*?)\n\);/s);
  if (!m) throw new Error('audit_logs block not found in the baseline migration');
  return m[0];
}

/** The statement runAuditArchive issues, taken from its source so this test cannot drift from it. */
function archiveDeleteFromSource(): string {
  const src = fs.readFileSync(SERVICE, 'utf8');
  const m = src.match(/`(SELECT public\.audit_logs_archive_delete\([^`]*?\) AS deleted)`/);
  if (!m) throw new Error('the archive-door call was not found in audit-archive.service.ts; update this test with it');
  return m[1];
}

let pg: PGlite;

async function seed(age: string, n = 1): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = await pg.query<{ id: string }>(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, created_at)
       VALUES (1, 'x', 'x', $1, now() - $2::interval) RETURNING id`,
      [`p0-8a-${age}-${i}-${Math.random()}`, age],
    );
    ids.push(r.rows[0].id);
  }
  return ids;
}

async function countIds(ids: string[]): Promise<number> {
  const r = await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM audit_logs WHERE id = ANY($1::uuid[])', [ids]);
  return r.rows[0].n;
}

async function archiveRecords(): Promise<number> {
  const r = await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM audit_log_archives');
  return r.rows[0].n;
}

/** Run `fn` as the runtime role; always come back to the superuser session. */
async function asRuntime<T>(fn: () => Promise<T>): Promise<T> {
  await pg.exec('SET ROLE app_service');
  try {
    return await fn();
  } finally {
    await pg.exec('RESET ROLE');
  }
}

/** The Phase A statement (§9): open the GUC door inside one transaction, then DELETE. */
async function deleteWithGuc(id: string): Promise<void> {
  try {
    await pg.exec(
      `BEGIN; SET LOCAL app.audit_archive_bypass = 'on'; DELETE FROM audit_logs WHERE id = '${id}'; COMMIT;`,
    );
  } finally {
    await pg.exec('ROLLBACK').catch(() => undefined);
  }
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(auditLogsDdl());
  // The runtime role, as provision-app-role.mjs grants it on every public table,
  // created BEFORE the migration so the migration's grant path sees it.
  await pg.exec(`
    CREATE ROLE app_service NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO app_service;
    GRANT SELECT, INSERT, UPDATE, DELETE ON audit_logs TO app_service;
    CREATE ROLE bystander NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO bystander;
    GRANT SELECT ON audit_logs TO bystander;
  `);
  await pg.exec(fs.readFileSync(MIGRATION, 'utf8'));
}, 60_000);

afterAll(async () => {
  await pg.close();
});

describe('audit_logs DELETE door (DP-04 / P0-8a)', () => {
  it('a plain DELETE as the runtime role is refused with the IMMUTABILITY_VIOLATION shape', async () => {
    const [id] = await seed('3 years');
    await asRuntime(async () => {
      await expect(pg.query('DELETE FROM audit_logs WHERE id = $1', [id])).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    });
    expect(await countIds([id])).toBe(1);
  });

  it("SET LOCAL app.audit_archive_bypass = 'on' no longer opens the door for the runtime role (Phase A §9)", async () => {
    const [id] = await seed('3 years');
    await asRuntime(async () => {
      await expect(deleteWithGuc(id)).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    });
    expect(await countIds([id])).toBe(1);
  });

  it('the GUC does not open the door for the superuser session either', async () => {
    const [id] = await seed('3 years');
    await expect(deleteWithGuc(id)).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    expect(await countIds([id])).toBe(1);
  });

  it('the service statement deletes an old, archived batch and writes the archive record', async () => {
    const ids = await seed('3 years', 3);
    const before = await archiveRecords();
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 25);
    const res = await asRuntime(() =>
      pg.query<{ deleted: number }>(archiveDeleteFromSource(), [ids, LOCATOR, SHA, cutoff]),
    );
    expect(res.rows[0].deleted).toBe(3);
    expect(await countIds(ids)).toBe(0);
    expect(await archiveRecords()).toBe(before + 1);
    const rec = await pg.query<{
      row_count: number;
      locator: string;
      sha256: string;
      performed_by: string;
      cutoff_ok: boolean;
      span_ok: boolean;
    }>(
      `SELECT row_count, locator, sha256, performed_by,
              cutoff <= now() - interval '24 months' AS cutoff_ok,
              min_created_at <= max_created_at AND max_created_at < cutoff AS span_ok
         FROM audit_log_archives ORDER BY archived_at DESC LIMIT 1`,
    );
    expect(rec.rows[0]).toMatchObject({
      row_count: 3,
      locator: LOCATOR,
      sha256: SHA,
      performed_by: 'postgres',
      cutoff_ok: true,
      span_ok: true,
    });
  });

  it('refuses a batch containing a row newer than the cutoff, and writes no record', async () => {
    const old = await seed('3 years');
    const fresh = await seed('1 day');
    const before = await archiveRecords();
    await asRuntime(async () => {
      await expect(
        pg.query(`SELECT ${ARCHIVE_FN.split('(')[0]}($1::uuid[], $2, $3, now() - interval '25 months')`, [
          [...old, ...fresh],
          LOCATOR,
          SHA,
        ]),
      ).rejects.toThrow(/AUDIT_ARCHIVE_REFUSED.*newer than the cutoff/);
    });
    expect(await countIds([...old, ...fresh])).toBe(2);
    expect(await archiveRecords()).toBe(before);
  });

  it('refuses a cutoff inside the 24-month hot window even for old rows', async () => {
    const ids = await seed('3 years');
    await asRuntime(async () => {
      await expect(
        pg.query(`SELECT public.audit_logs_archive_delete($1::uuid[], $2, $3, now() - interval '1 month')`, [ids, LOCATOR, SHA]),
      ).rejects.toThrow(/AUDIT_ARCHIVE_REFUSED.*hot window/);
      await expect(
        pg.query(`SELECT public.audit_logs_archive_delete($1::uuid[], $2, $3, now() - interval '23 months')`, [ids, LOCATOR, SHA]),
      ).rejects.toThrow(/AUDIT_ARCHIVE_REFUSED.*hot window/);
    });
    expect(await countIds(ids)).toBe(1);
  });

  it('refuses an empty locator, an empty checksum and a checksum that is not a sha256', async () => {
    const ids = await seed('3 years');
    const call = (locator: string, sha: string) =>
      pg.query(`SELECT public.audit_logs_archive_delete($1::uuid[], $2, $3, now() - interval '25 months')`, [ids, locator, sha]);
    await asRuntime(async () => {
      await expect(call('', SHA)).rejects.toThrow(/AUDIT_ARCHIVE_REFUSED.*locator/);
      await expect(call('   ', SHA)).rejects.toThrow(/AUDIT_ARCHIVE_REFUSED.*locator/);
      await expect(call(LOCATOR, '')).rejects.toThrow(/AUDIT_ARCHIVE_REFUSED.*sha256/);
      await expect(call(LOCATOR, 'deadbeef')).rejects.toThrow(/AUDIT_ARCHIVE_REFUSED.*sha256/);
    });
    expect(await countIds(ids)).toBe(1);
  });

  it('refuses a batch naming a row that is not in audit_logs, and an empty batch', async () => {
    const ids = await seed('3 years');
    await asRuntime(async () => {
      await expect(
        pg.query(`SELECT public.audit_logs_archive_delete($1::uuid[], $2, $3, now() - interval '25 months')`, [
          [...ids, '00000000-0000-4000-8000-000000000000'],
          LOCATOR,
          SHA,
        ]),
      ).rejects.toThrow(/AUDIT_ARCHIVE_REFUSED.*not in audit_logs/);
      await expect(
        pg.query(`SELECT public.audit_logs_archive_delete($1::uuid[], $2, $3, now() - interval '25 months')`, [[], LOCATOR, SHA]),
      ).rejects.toThrow(/AUDIT_ARCHIVE_REFUSED.*no rows/);
    });
    expect(await countIds(ids)).toBe(1);
  });

  it('EXECUTE is not public: a role without the grant cannot open the door', async () => {
    const ids = await seed('3 years');
    await pg.exec('SET ROLE bystander');
    try {
      await expect(
        pg.query(`SELECT public.audit_logs_archive_delete($1::uuid[], $2, $3, now() - interval '25 months')`, [ids, LOCATOR, SHA]),
      ).rejects.toThrow(/permission denied for function/);
    } finally {
      await pg.exec('RESET ROLE');
    }
    expect(await countIds(ids)).toBe(1);
  });

  it('the door is owned by audit_archiver, is SECURITY DEFINER, and audit_archiver cannot log in', async () => {
    const r = await pg.query<{ owner: string; secdef: boolean; canlogin: boolean; public_exec: boolean }>(
      `SELECT pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS secdef,
              (SELECT rolcanlogin FROM pg_roles WHERE rolname = 'audit_archiver') AS canlogin,
              COALESCE((SELECT bool_or(a.grantee = 0) FROM aclexplode(p.proacl) a WHERE a.privilege_type = 'EXECUTE'), false) AS public_exec
         FROM pg_proc p WHERE p.oid = $1::regprocedure`,
      [ARCHIVE_FN],
    );
    expect(r.rows[0]).toEqual({ owner: 'audit_archiver', secdef: true, canlogin: false, public_exec: false });
  });

  it('the archive record is itself append-only', async () => {
    const ids = await seed('3 years');
    await asRuntime(() =>
      pg.query(`SELECT public.audit_logs_archive_delete($1::uuid[], $2, $3, now() - interval '25 months')`, [ids, LOCATOR, SHA]),
    );
    await expect(pg.query("UPDATE audit_log_archives SET sha256 = repeat('b', 64) WHERE locator = $1", [LOCATOR])).rejects.toThrow(
      /IMMUTABILITY_VIOLATION/,
    );
    await expect(pg.query('DELETE FROM audit_log_archives WHERE locator = $1', [LOCATOR])).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    await expect(pg.query('TRUNCATE audit_log_archives')).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    await asRuntime(async () => {
      await expect(pg.query('DELETE FROM audit_log_archives WHERE locator = $1', [LOCATOR])).rejects.toThrow(
        /IMMUTABILITY_VIOLATION|permission denied/,
      );
    });
  });

  it('UPDATE and TRUNCATE on audit_logs stay refused', async () => {
    const [id] = await seed('3 years');
    await asRuntime(async () => {
      await expect(pg.query("UPDATE audit_logs SET action = 'forged' WHERE id = $1", [id])).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    });
    await expect(pg.query('TRUNCATE audit_logs')).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
  });

  it('the migration replays cleanly (Rule 1): a second apply changes nothing and the door still works', async () => {
    await pg.exec(fs.readFileSync(MIGRATION, 'utf8'));
    const trg = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid
        WHERE c.relname = 'audit_logs' AND t.tgname LIKE 'trg_audit_logs_no_%' AND NOT t.tgisinternal`,
    );
    expect(trg.rows[0].n).toBe(3);
    const owner = await pg.query<{ owner: string }>('SELECT pg_get_userbyid(proowner) AS owner FROM pg_proc WHERE oid = $1::regprocedure', [ARCHIVE_FN]);
    expect(owner.rows[0].owner).toBe('audit_archiver');
    const ids = await seed('3 years', 2);
    const res = await asRuntime(() =>
      pg.query<{ deleted: number }>(`SELECT public.audit_logs_archive_delete($1::uuid[], $2, $3, now() - interval '25 months') AS deleted`, [ids, LOCATOR, SHA]),
    );
    expect(res.rows[0].deleted).toBe(2);
  });

  it('the service issues only the door call: no bypass GUC, no raw DELETE, in its code', async () => {
    // Comments stripped: the file's header is allowed to name the retired GUC
    // as history; its code is not allowed to use it.
    const src = fs
      .readFileSync(SERVICE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/audit_archive_bypass/);
    expect(src).not.toMatch(/DELETE\s+FROM\s+audit_logs/i);
    expect(archiveDeleteFromSource()).toMatch(/\$1::uuid\[\],\s*\$2,\s*\$3,\s*\$4::timestamptz/);
  });
});

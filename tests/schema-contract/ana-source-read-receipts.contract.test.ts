/** Sequential SQL schema proof only. Independent PostgreSQL owns role/race qualification. */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../migrations/20261014_ana_source_read_receipts.sql', import.meta.url), 'utf8');
// Explicit synthetic precursor for fail-first reproduction. Never used by the
// application applier and never touches a client database.
const appliedMigration = process.env.C2C_RECEIPT_SCHEMA_RED === '1'
  ? migration.slice(0, migration.indexOf('\n-- Shape checks')) : migration;
let pg: PGlite;
const hash = 'a'.repeat(64);
const insert = async (overrides: Record<string, unknown> = {}) => {
  const r = { id: randomUUID(), organization_id: 7, receipt_version: 2, checkpoint: 'host_budget_admitted',
    actor_user_id: 11, admitted_role: 'viewer', program_id: '10000000-0000-4000-8000-000000000001',
    document_id: '20000000-0000-4000-8000-000000000001', original_sha256: hash, extraction_sha256: hash,
    total_chars: 20, ranges: JSON.stringify([{ start: 0, end: 10, sha256: hash }]), payload_sha256: hash,
    tool_use_id: 'tool-1', thread_id: 'thread-1', receipt_sha256: hash, ...overrides };
  await pg.query(`INSERT INTO public.ana_source_read_receipts
    (id,organization_id,receipt_version,checkpoint,actor_user_id,admitted_role,program_id,document_id,
     original_sha256,extraction_sha256,total_chars,ranges,payload_sha256,tool_use_id,thread_id,receipt_sha256)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16)`, Object.values(r));
  return r.id;
};
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE ROLE app_service NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE TABLE public.organizations(id integer PRIMARY KEY,status text);
    INSERT INTO public.organizations VALUES (7,'active'),(8,'pending_deletion');
    CREATE SCHEMA vault;
    CREATE TABLE vault.legal_holds(id integer PRIMARY KEY,organization_id integer,lifted_at timestamptz);`);
  await pg.exec(appliedMigration);
});
afterAll(async () => { await pg?.close(); });

async function asRuntime<T>(role: string, work: () => Promise<T>): Promise<T> {
  await pg.exec('SET ROLE app_service');
  try {
    await pg.query(`SELECT set_config('app.rls_enforce','on',false),set_config('app.current_tenant_id','7',false),
      set_config('app.current_org_id','',false),set_config('app.current_user_role',$1,false)`, [role]);
    return await work();
  } finally {
    await pg.exec(`RESET ROLE; SET app.rls_enforce='off'; SET app.current_user_role='';`);
  }
}

describe('durable source receipt schema protects exact immutable metadata', () => {
  it('replays around populated history without changing the row, acceptance time or indexes', async () => {
    const id = await insert();
    const before = (await pg.query('SELECT * FROM public.ana_source_read_receipts WHERE id=$1', [id])).rows;
    await pg.exec(appliedMigration);
    expect((await pg.query('SELECT * FROM public.ana_source_read_receipts WHERE id=$1', [id])).rows).toEqual(before);
  });
  it.each(['UPDATE', 'DELETE', 'TRUNCATE'] as const)('refuses direct %s, retaining accepted history', async op => {
    const id = await insert();
    const sql = op === 'UPDATE' ? `UPDATE public.ana_source_read_receipts SET total_chars=21 WHERE id='${id}'`
      : op === 'DELETE' ? `DELETE FROM public.ana_source_read_receipts WHERE id='${id}'`
      : 'TRUNCATE public.ana_source_read_receipts';
    await expect(pg.exec(sql)).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    expect((await pg.query('SELECT id FROM public.ana_source_read_receipts WHERE id=$1', [id])).rows).toHaveLength(1);
  });
  it.each([
    { organization_id: 0 }, { actor_user_id: 0 }, { receipt_version: 1 }, { checkpoint: 'provider_served' },
    { original_sha256: 'A'.repeat(64) }, { extraction_sha256: 'broken' }, { payload_sha256: 'b' },
    { total_chars: 0 }, { admitted_role: ' Viewer ' }, { admitted_role: '\u0001viewer' },
    { tool_use_id: '' }, { thread_id: ' '.repeat(2) }, { thread_id: '\u0001private' },
    { admitted_role: 'viewer\u0085' }, { tool_use_id: 'tool\u009f' }, { thread_id: '\u0080private' },
  ])('rejects invalid identity/checkpoint/text shape %j', async fields => {
    await expect(insert(fields)).rejects.toThrow();
  });
  it.each([
    [], Array.from({ length: 9 }, (_, i) => ({ start: i, end: i + 1, sha256: hash })),
    [{ start: 0, end: 0, sha256: hash }], [{ start: -1, end: 1, sha256: hash }],
    [{ start: 0.5, end: 1, sha256: hash }], [{ start: 0, end: 21, sha256: hash }],
    [{ start: '0', end: 1, sha256: hash }], [{ start: 0, end: 1, sha256: 'missing' }],
    [{ start: 0, end: 1, sha256: hash, text: 'private source' }],
    [{ start: 5, end: 10, sha256: hash }, { start: 0, end: 2, sha256: hash }],
    [{ start: 0, end: 10, sha256: hash }, { start: 9, end: 12, sha256: hash }],
  ].map(ranges => ({ ranges })))('rejects malformed/overlapping immutable range list $ranges', async ({ ranges }) => {
    await expect(insert({ ranges: JSON.stringify(ranges) })).rejects.toThrow();
  });
  it('accepts exact bounded adjacent/disjoint ranges and Unicode code-point context limits', async () => {
    const id = await insert({ ranges: JSON.stringify([{ start: 0, end: 3, sha256: hash },
      { start: 3, end: 5, sha256: hash }, { start: 10, end: 20, sha256: hash }]),
      thread_id: '😀'.repeat(2000), tool_use_id: null });
    expect((await pg.query('SELECT id FROM public.ana_source_read_receipts WHERE id=$1', [id])).rows).toHaveLength(1);
    await expect(insert({ thread_id: '😀'.repeat(2001) })).rejects.toThrow();
  });
  it('has no historical source/user/program foreign-key or automatic erasure cascade', async () => {
    const { rows } = await pg.query(`SELECT conname FROM pg_constraint WHERE conrelid='public.ana_source_read_receipts'::regclass AND contype='f'`);
    expect(rows).toEqual([]);
  });
  it('installs explicit FORCE tenant RLS without a private-project claim', async () => {
    const rows = (await pg.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='public.ana_source_read_receipts'::regclass`)).rows;
    expect(rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
  });
});

describe('forced tenant/runtime and narrow source receipt erasure controls', () => {
  it('permits a viewer-scope observation INSERT while refusing a foreign tenant row', async () => {
    await asRuntime('viewer', async () => {
      await expect(insert()).resolves.toBeTypeOf('string');
      await expect(insert({ organization_id: 8 })).rejects.toThrow(/row-level security/);
    });
  });
  it('does not expose another tenant history through runtime SELECT', async () => {
    const foreign = await insert({ organization_id: 8 });
    await asRuntime('viewer', async () => {
      expect((await pg.query('SELECT id FROM public.ana_source_read_receipts WHERE id=$1', [foreign])).rows).toEqual([]);
    });
  });
  it('refuses runtime mutation even when the synthetic fixture grants those DML privileges', async () => {
    const id = await insert();
    await pg.exec('GRANT UPDATE,DELETE,TRUNCATE ON public.ana_source_read_receipts TO app_service');
    try {
      await asRuntime('viewer', async () => {
        await expect(pg.query('UPDATE public.ana_source_read_receipts SET total_chars=21 WHERE id=$1', [id])).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
        await expect(pg.query('DELETE FROM public.ana_source_read_receipts WHERE id=$1', [id])).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
        await expect(pg.exec('TRUNCATE public.ana_source_read_receipts')).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
      });
    } finally { await pg.exec('REVOKE UPDATE,DELETE,TRUNCATE ON public.ana_source_read_receipts FROM app_service'); }
  });
  it('keeps the erasure door non-public and the runtime outside its NOLOGIN owner role', async () => {
    const { rows } = await pg.query(`SELECT has_function_privilege('public','public.purge_tenant_source_read_receipts(integer)','EXECUTE') AS public_exec,
      has_function_privilege('app_service','public.purge_tenant_source_read_receipts(integer)','EXECUTE') AS runtime_exec,
      pg_has_role('app_service','ana_record_purger','MEMBER') AS runtime_member`);
    expect(rows).toEqual([{ public_exec: false, runtime_exec: true, runtime_member: false }]);
    const role = (await pg.query(`SELECT rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='ana_record_purger'`)).rows;
    expect(role).toEqual([{ rolcanlogin: false, rolsuper: false, rolbypassrls: false }]);
  });
  it('refuses non-platform, invalid target and active-state erasure without deleting history', async () => {
    const id = await insert();
    await asRuntime('viewer', async () => {
      await expect(pg.query('SELECT * FROM public.purge_tenant_source_read_receipts(8)')).rejects.toThrow(/SOURCE_READ_RECEIPT_PURGE_REFUSED/);
    });
    await asRuntime('app_super_admin', async () => {
      await expect(pg.query('SELECT * FROM public.purge_tenant_source_read_receipts(0)')).rejects.toThrow(/SOURCE_READ_RECEIPT_PURGE_REFUSED/);
      await expect(pg.query('SELECT * FROM public.purge_tenant_source_read_receipts(7)')).rejects.toThrow(/SOURCE_READ_RECEIPT_PURGE_REFUSED/);
    });
    expect((await pg.query('SELECT id FROM public.ana_source_read_receipts WHERE id=$1', [id])).rows).toHaveLength(1);
  });
  it('refuses active or unavailable legal holds, then returns the exact authorized erasure count', async () => {
    await insert({ organization_id: 8 });
    await pg.exec('INSERT INTO vault.legal_holds VALUES (1,8,NULL)');
    await asRuntime('app_super_admin', async () => {
      await expect(pg.query('SELECT * FROM public.purge_tenant_source_read_receipts(8)')).rejects.toThrow(/active legal hold/);
    });
    await pg.exec('UPDATE vault.legal_holds SET lifted_at=now() WHERE id=1');
    await pg.exec('ALTER TABLE vault.legal_holds RENAME TO legal_holds_unavailable');
    try {
      await asRuntime('app_super_admin', async () => {
        await expect(pg.query('SELECT * FROM public.purge_tenant_source_read_receipts(8)')).rejects.toThrow(/legal-hold records are unavailable/);
      });
    } finally { await pg.exec('ALTER TABLE vault.legal_holds_unavailable RENAME TO legal_holds'); }
    const expected = Number((await pg.query<{ n: number }>('SELECT count(*)::integer AS n FROM public.ana_source_read_receipts WHERE organization_id=8')).rows[0].n);
    await asRuntime('app_super_admin', async () => {
      expect((await pg.query('SELECT * FROM public.purge_tenant_source_read_receipts(8)')).rows).toEqual([{ receipts: expected }]);
    });
    expect((await pg.query('SELECT id FROM public.ana_source_read_receipts WHERE organization_id=8')).rows).toEqual([]);
    expect((await pg.query('SELECT id FROM public.ana_source_read_receipts WHERE organization_id=7 LIMIT 1')).rows).toHaveLength(1);
  });
});

/** Actual deploy sweep and restricted role; not a two-connection qualification. */
import fs from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDispositionHarness, type DispositionHarness, type DispositionFixture } from './disposition-fixture';

let harness: DispositionHarness;
let own: DispositionFixture;
let other: DispositionFixture;
const role = 'disposition_runtime';
const scope = async (organizationId?: number) => {
  await harness.pg.query("SELECT set_config('app.current_tenant_id',$1,false), set_config('app.current_org_id','',false), set_config('app.current_user_role','manager',false)", [organizationId === undefined ? '' : String(organizationId)]);
};

beforeAll(async () => {
  harness = await createDispositionHarness();
  own = await harness.seed();
  other = await harness.seed();
  // Apply the actual deploy policy, twice, rather than a test-only policy.
  const sweep = fs.readFileSync(new URL('../../../../db/migrations/20260801_tenant_isolation_sweep.sql', import.meta.url), 'utf8');
  await harness.pg.exec(sweep);
  await harness.pg.exec(sweep);
  await harness.pg.exec(`CREATE ROLE ${role} NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public, vault TO ${role};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public, vault TO ${role};
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public, vault TO ${role};
    SET ROLE ${role};`);
});
afterAll(async () => { await harness?.close(); });
beforeEach(async () => {
  await harness.pg.query("SELECT set_config('app.rls_enforce','on',false)");
  await scope();
});

describe('dispositions under the deployed integer RLS sweep and runtime role', () => {
  it('establishes a negative control and proves the role cannot bypass forced RLS', async () => {
    const attributes = await harness.pg.query<{ rolsuper: boolean; rolbypassrls: boolean }>('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user');
    expect(attributes.rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
    const policy = await harness.pg.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean; policies: number }>(`SELECT c.relrowsecurity, c.relforcerowsecurity,
      (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename=c.relname) AS policies
      FROM pg_class c WHERE c.oid='public.document_data_dispositions'::regclass`);
    expect(policy.rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true, policies: 1 }]);
    await harness.pg.query("SELECT set_config('app.rls_enforce','off',false)");
    expect((await harness.pg.query('SELECT id FROM cre_evidence_sources')).rows).toHaveLength(2);
    await harness.pg.query("SELECT set_config('app.rls_enforce','on',false)");
    expect((await harness.pg.query('SELECT id FROM cre_evidence_sources')).rows).toEqual([]);
    await scope(own.org);
    expect((await harness.pg.query('SELECT id FROM cre_evidence_sources')).rows).toEqual([{ id: own.capture }]);
  });

  it('refuses cross-tenant reads, updates, deletes and inserts at the database boundary', async () => {
    await scope(own.org);
    expect((await harness.pg.query('SELECT id FROM cre_evidence_sources WHERE id=$1', [other.capture])).rows).toEqual([]);
    expect((await harness.pg.query("UPDATE cre_evidence_sources SET title='foreign change' WHERE id=$1 RETURNING id", [other.capture])).rows).toEqual([]);
    expect((await harness.pg.query('DELETE FROM cre_evidence_sources WHERE id=$1 RETURNING id', [other.capture])).rows).toEqual([]);
    await expect(harness.pg.query('INSERT INTO cre_evidence_sources (organization_id,title) VALUES ($1,$2)', [other.org, 'foreign insert'])).rejects.toMatchObject({ code: '42501' });
    await scope(other.org);
    expect((await harness.pg.query<{ title: string }>('SELECT title FROM cre_evidence_sources WHERE id=$1', [other.capture])).rows).toEqual([{ title: 'Captured study.pdf' }]);
  });

  it('runs preview, audit append, retain and terminal withdrawal without elevated privileges', async () => {
    expect((await own.service.preview(own.scope)).counts.atoms).toBe(3);
    await own.apply('keep_data');
    await own.apply('remove_data');
    // Service transaction-local context must not leak into a reused connection.
    expect((await own.records())).toEqual([]);
    await scope(own.org);
    const records = await own.records();
    expect(records).toHaveLength(2);
    expect(records.map(record => record.choice)).toEqual(expect.arrayContaining(['keep_data', 'remove_data']));
    expect(await own.audits()).toHaveLength(2);
    await expect(harness.pg.query('UPDATE document_data_dispositions SET reason=$1 WHERE organization_id=$2', ['rewritten', own.org])).rejects.toMatchObject({ code: '55000' });
    await expect(harness.pg.query('DELETE FROM document_data_dispositions WHERE organization_id=$1', [own.org])).rejects.toMatchObject({ code: '55000' });
    await expect(harness.pg.query('TRUNCATE document_data_dispositions')).rejects.toMatchObject({ code: '42501' });
    await scope(other.org);
    expect(await own.records()).toEqual([]);
  });

  it('refuses a foreign source and resets local tenant context after rollback', async () => {
    await expect(own.service.preview({ ...own.scope, targetId: String(other.capture) })).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect((await harness.pg.query('SELECT id FROM cre_evidence_sources')).rows).toEqual([]);
    await scope(other.org);
    expect((await other.service.preview(other.scope)).counts.atoms).toBe(3);
    // Restore the incoming session context, rather than retaining own's scope.
    await expect(own.service.preview({ ...own.scope, programId: other.program })).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect((await harness.pg.query('SELECT id FROM cre_evidence_sources')).rows).toEqual([{ id: other.capture }]);
  });
});

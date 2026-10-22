/** Real runtime-role RLS proof. Synthetic organizations and all rows are retained. */
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseUrl } from '../setup.db';
import { runWithTenantScope } from '../../server/db/tenantStore';
import { shouldUseSsl } from '../../server/db/ssl';
import { getAgencyRequirements, promotePatternToRequirement } from '../../server/services/intelligence/ana-failure-learning';

const tag = `agency-rls-${randomUUID()}`;
const ids = Array.from({ length: 5 }, () => randomUUID());
let owner: Pool;
let runtime: Pool;
let organizations: number[];
let patternId: string;

async function scoped<T>(organization: number | null, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await runtime.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant_id',$1,true),
      set_config('app.current_org_id','',true),set_config('app.current_user_role','member',true),
      set_config('app.rls_enforce','on',true)`, [organization === null ? '' : String(organization)]);
    return await fn(client);
  } finally {
    // Each direct SQL assertion is observational; inserted proof rows persist
    // only when written through the real service below.
    await client.query('ROLLBACK');
    client.release();
  }
}

async function visible(organization: number | null): Promise<string[]> {
  return scoped(organization, async client => (await client.query<{ id: string }>(
    'SELECT id FROM intelligence.agency_requirements WHERE id=ANY($1::uuid[]) ORDER BY id', [ids],
  )).rows.map(row => row.id).sort());
}

const insert = (client: PoolClient, organization: number | null) => client.query(
  `INSERT INTO intelligence.agency_requirements
    (agency,document_type,requirement_summary,tenant_count,occurrence_count,confidence,organization_id)
    VALUES('ema','cmc',$1,3,5,0.7,$2) RETURNING id`, [tag, organization],
);

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('An independently provisioned runtime database role is required.');
  owner = new Pool({ connectionString: databaseUrl });
  runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, options: '-c app.rls_enforce=on' });
  const role = (await runtime.query(`SELECT current_user AS role,rolsuper,rolbypassrls,
    current_setting('app.rls_enforce',true) AS enforcement,
    (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls
    FROM pg_roles WHERE rolname=current_user`)).rows[0];
  // Match the actual configured posture without labeling local plaintext as TLS.
  expect(role).toEqual({ role: 'app_service', rolsuper: false, rolbypassrls: false,
    enforcement: 'on', tls: shouldUseSsl(process.env.APP_DATABASE_URL) });
  organizations = [];
  for (const label of ['a', 'b']) {
    const row = (await owner.query('INSERT INTO organizations(name,slug) VALUES($1,$1) RETURNING id', [`${tag}-${label}`])).rows[0];
    organizations.push(Number(row.id));
  }
  patternId = (await owner.query(`INSERT INTO intelligence.failure_patterns
    (pattern_fingerprint,agency,document_type,intent_class,suggested_correction,failure_count,
     tenant_count,correction_quorum,confidence,extractor_version)
    VALUES($1,'ema','cmc','draft','Invented synthetic test correction',5,3,0.7,0.7,'native-test') RETURNING id`, [tag])).rows[0].id;
  const statuses = ['unvalidated', 'unvalidated', 'validated', 'unvalidated', 'rejected'];
  const orgs = [organizations[0], organizations[1], organizations[1], null, organizations[0]];
  for (let i = 0; i < ids.length; i++) {
    await owner.query(`INSERT INTO intelligence.agency_requirements
      (id,agency,document_type,requirement_summary,source_pattern_id,tenant_count,occurrence_count,
       confidence,validation_status,organization_id)
      VALUES($1,'ema','cmc',$2,$3,3,5,0.7,$4,$5)`, [ids[i], `${tag}-${i}`, patternId, statuses[i], orgs[i]]);
  }
});

afterAll(async () => {
  await Promise.allSettled([owner?.end(), runtime?.end()]);
});

describe('agency requirements under the real runtime role', () => {
  it('enables and forces RLS with only SELECT and INSERT policies', async () => {
    const table = (await owner.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class
      WHERE oid='intelligence.agency_requirements'::regclass`)).rows[0];
    expect(table).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    const policies = (await owner.query(`SELECT cmd FROM pg_policies
      WHERE schemaname='intelligence' AND tablename='agency_requirements' ORDER BY cmd`)).rows;
    expect(policies).toEqual([{ cmd: 'INSERT' }, { cmd: 'SELECT' }]);
  });

  it('organization A reads its suggestion and validated global rules only', async () => {
    expect(await visible(organizations[0])).toEqual([ids[0], ids[2]].sort());
  });

  it('organization B cannot read organization A, unknown-writer, or rejected suggestions', async () => {
    expect(await visible(organizations[1])).toEqual([ids[1], ids[2]].sort());
  });

  it('missing tenant settings expose validated canonical rules only', async () => {
    expect(await visible(null)).toEqual([ids[2]]);
  });

  it('admits an insert bearing the current organization', async () => {
    await scoped(organizations[0], async client => expect((await insert(client, organizations[0])).rows).toHaveLength(1));
  });

  it('rejects a forged foreign organization on insert', async () => {
    await scoped(organizations[0], async client => expect(insert(client, organizations[1])).rejects.toMatchObject({ code: '42501' }));
  });

  it('rejects an insert without tenant identity', async () => {
    await scoped(null, async client => expect(insert(client, organizations[0])).rejects.toMatchObject({ code: '42501' }));
  });

  it('permits no update or delete, even for a visible own or global row', async () => {
    await scoped(organizations[0], async client => {
      expect((await client.query('UPDATE intelligence.agency_requirements SET requirement_summary=$1 WHERE id=ANY($2::uuid[]) RETURNING id', [tag, ids])).rows).toEqual([]);
      expect((await client.query('DELETE FROM intelligence.agency_requirements WHERE id=ANY($1::uuid[]) RETURNING id', [ids])).rows).toEqual([]);
    });
    expect((await owner.query('SELECT id FROM intelligence.agency_requirements WHERE id=ANY($1::uuid[])', [ids])).rows).toHaveLength(5);
  });

  it('keeps the real instrumented service readable and writable in verified tenant scope', async () => {
    const within = <T>(organization: number, fn: () => Promise<T>) => runWithTenantScope(
      { tenantId: String(organization), role: 'member', source: 'test', caller: tag }, fn,
    );
    const added = await within(organizations[0], () => promotePatternToRequirement({
      organizationId: organizations[0], patternId, requirementSummary: `${tag}-service`,
    }));
    expect(added.validationStatus).toBe('unvalidated');
    const a = await within(organizations[0], () => getAgencyRequirements({ organizationId: organizations[0], agency: 'ema' }));
    const b = await within(organizations[1], () => getAgencyRequirements({ organizationId: organizations[1], agency: 'ema' }));
    expect(a.some(row => row.id === added.requirementId)).toBe(true);
    expect(b.some(row => row.id === added.requirementId)).toBe(false);
    expect(a.some(row => row.id === ids[2])).toBe(true);
    expect(b.some(row => row.id === ids[2])).toBe(true);
  });
});

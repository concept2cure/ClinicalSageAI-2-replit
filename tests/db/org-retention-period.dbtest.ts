/**
 * An organisation's retention period decides how long the Vault keeps what it
 * admits (P1-22 remainder, DP-20; ADR-0014 §6).
 *
 * ADR-0014 §6: by default a governed record is kept 25 years from
 * finalization; an organisation may set a longer period, or a shorter one with
 * a recorded reason naming the governing rule; a legal hold always overrides.
 * Until this change the only input to `retention_until` at admission was a
 * global named policy in vault.retention_policies (none is seeded), so every
 * document admitted without one was dated NULL — kept with no clock — and an
 * organisation had nowhere to record its own period.
 *
 * Drives the real ingest route and the real retention-period routes on
 * PostgreSQL as the runtime role (app_service, NOSUPERUSER, NOBYPASSRLS,
 * app.rls_enforce=on — asserted below, not assumed). The one stand-in is a
 * switch on writeChainedAuditRow that makes it refuse, to show a refused audit
 * row takes the change down with it; otherwise the real writer runs.
 *
 * Evidence: docs/evidence/D6/2026-10-01-tranche-4/P1-22-org/.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const probe = vi.hoisted(() => ({ refuseAudit: false }));
vi.mock('../../server/services/auditService', async importOriginal => {
  const actual = await importOriginal<typeof import('../../server/services/auditService')>();
  return {
    ...actual,
    writeChainedAuditRow: async (...args: Parameters<typeof actual.writeChainedAuditRow>) => {
      if (probe.refuseAudit) throw new Error('probe: the audit store refused the row');
      return actual.writeChainedAuditRow(...args);
    },
  };
});

import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { getPool } from '../../server/db/runtime';
import { runWithTenantScope } from '../../server/db/tenantStore';

const PROBE = 'dbtest-p122org ';
const CODE = 'DBTEST-P122ORG';
const POLICY = 'DBTEST-P122ORG-15Y';
const APP_ROLE = process.env.APP_SERVICE_DB_ROLE || 'app_service';
const SETTING = '/api/vault/legal-holds/retention';

type Tenant = { orgId: number; orgUuid: string; programId: string };
let owner: Pool;
let admin = 0;
let member = 0;
let mine: Tenant;
let theirs: Tenant;
let seq = 0;

async function appFor(t: Tenant, userId: number, role: string): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const { createVaultLegalHoldRoutes } = await import('../../server/routes/vault-legal-holds');
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.tenantId = t.orgId;
    r.userRole = role;
    r.user = { id: userId, organizationId: t.orgId, organizationUuid: t.orgUuid, role, roles: [role] };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  a.use('/api/vault/legal-holds', createVaultLegalHoldRoutes());
  return a;
}

const pdf = (tag: string) =>
  Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${tag}\ntrailer<</Root 1 0 R>>\n%%EOF\n`, 'utf8');

/** Admit one document as the tenant's administrator; returns the stored retention_until and the dates to compare with. */
async function admit(t: Tenant, fields: Record<string, string> = {}) {
  const code = `${CODE}-${++seq}`;
  let r = request(await appFor(t, admin, 'admin'))
    .post('/api/vault/ingest')
    .field('programId', t.programId)
    .field('documentCode', code)
    .field('documentTitle', 'Trial master file index')
    .field('documentType', 'OTHER');
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  const res = await r.attach('file', pdf(code), `${code}.pdf`);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const row = await owner.query(
    `SELECT retention_until::text AS until,
            (CURRENT_DATE + make_interval(years => 25))::date::text AS y25,
            (CURRENT_DATE + make_interval(years => 30))::date::text AS y30,
            (CURRENT_DATE + make_interval(years => 10))::date::text AS y10,
            (CURRENT_DATE + 5490)::text AS policy15
       FROM vault.documents WHERE id = $1`,
    [res.body.document.id],
  );
  return row.rows[0] as { until: string | null; y25: string; y30: string; y10: string; policy15: string };
}

const put = async (t: Tenant, userId: number, role: string, body: Record<string, unknown>) =>
  request(await appFor(t, userId, role)).put(SETTING).send(body);
const get = async (t: Tenant, userId: number, role: string) => request(await appFor(t, userId, role)).get(SETTING);

const settingTable = async () =>
  (await owner.query(`SELECT to_regclass('public.organization_retention_settings') IS NOT NULL AS present`)).rows[0]
    .present as boolean;
const settingOf = async (t: Tenant) =>
  (await settingTable())
    ? (await owner.query('SELECT * FROM organization_retention_settings WHERE organization_id = $1', [t.orgId])).rows[0] ?? null
    : null;
const auditRows = async (t: Tenant) =>
  (
    await owner.query(
      `SELECT id::text, xmin::text AS xmin, action, actor_id, reason, new_values, chain_seq::text, sha256_chain
         FROM audit_logs WHERE tenant_id = $1 AND action = 'vault.retention_period.set' ORDER BY occurred_at, id`,
      [t.orgId],
    )
  ).rows;

async function tenant(slug: string): Promise<Tenant> {
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-p122org-${slug}`],
  );
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Retainol 5mg') RETURNING id`,
    [`${PROBE}${slug} program`, `${CODE}-${slug}`, org.rows[0].id],
  );
  return { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid), programId: String(prog.rows[0].id) };
}

async function user(label: string): Promise<number> {
  const u = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, 'not-a-real-hash')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`dbtest-p122org-${label}@example.test`, `${PROBE}${label}`],
  );
  return Number(u.rows[0].id);
}

/** Everything this suite writes, by its own tag and its own two organisations. */
async function cleanup(): Promise<void> {
  const orgs = (
    await owner.query('SELECT id FROM organizations WHERE slug LIKE $1', ['dbtest-p122org-%'])
  ).rows.map(r => Number(r.id));
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await client.query('DELETE FROM audit_logs WHERE tenant_id = ANY($1::int[])', [orgs]);
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.warn('[p122org] audit cleanup incomplete:', err);
  } finally {
    client.release();
  }
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${CODE}%`]);
  await owner.query('DELETE FROM vault.retention_policies WHERE policy_name = $1', [POLICY]);
  if (await settingTable()) {
    await owner.query('DELETE FROM organization_retention_settings WHERE organization_id = ANY($1::int[])', [orgs]);
  }
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE}%`]);
  await owner.query('DELETE FROM tenant_export_receipts WHERE organization_id = ANY($1::int[])', [orgs]);
  // Last, once nothing of theirs references them: the suite's own users and organisations.
  await owner.query('DELETE FROM users WHERE email LIKE $1', ['dbtest-p122org-%@example.test']);
  await owner.query('DELETE FROM organizations WHERE slug LIKE $1', ['dbtest-p122org-%']);
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) {
    throw new Error('[p122org] APP_DATABASE_URL is required; owner execution is not an isolation proof');
  }
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await cleanup();
  mine = await tenant('mine');
  theirs = await tenant('theirs');
  admin = await user('admin');
  member = await user('member');
  await owner.query(
    `INSERT INTO vault.retention_policies (policy_name, description, retention_days)
     VALUES ($1, 'dbtest: a named policy longer than the organisation period', 5490)`,
    [POLICY],
  );
}, 60_000);

afterAll(async () => {
  await cleanup().catch(() => undefined);
  await owner.end().catch(() => undefined);
});

describe('the runtime posture this suite proves under', () => {
  it('serves as app_service, not a superuser, without BYPASSRLS, with enforcement on', async () => {
    const r = await runWithTenantScope(
      { tenantId: String(mine.orgId), role: 'admin', source: 'test', caller: 'p122org-posture' },
      () =>
        getPool().query(`SELECT current_user AS role, current_setting('is_superuser')::boolean AS superuser,
                r.rolbypassrls, current_setting('app.rls_enforce', true) AS enforcement
           FROM pg_roles r WHERE r.rolname = current_user`),
    );
    expect(r.rows).toEqual([{ role: APP_ROLE, superuser: false, rolbypassrls: false, enforcement: 'on' }]);
  });

  it('the setting table is tenant-isolated by the sweep: RLS enabled and forced, tenant_isolation_policy present', async () => {
    const r = await owner.query(
      `SELECT c.relrowsecurity, c.relforcerowsecurity,
              EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public'
                        AND p.tablename = 'organization_retention_settings'
                        AND p.policyname = 'tenant_isolation_policy') AS policy
         FROM pg_class c WHERE c.oid = to_regclass('public.organization_retention_settings')`,
    );
    expect(r.rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true, policy: true }]);
  });
});

describe('admission dates a record from the organisation period (ADR-0014 §6)', () => {
  it('with no setting, a document is kept 25 years from admission — never undated', async () => {
    const d = await admit(mine);
    expect(d.until).toBe(d.y25);
  });

  it('reads 25 years, the default, for an organisation that has set nothing', async () => {
    const res = await get(mine, admin, 'admin');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.retention).toMatchObject({ years: 25, defaultYears: 25, isDefault: true, reason: null });
  });

  it('an administrator sets 30 years; the change and its chained audit row are one transaction', async () => {
    const res = await put(mine, admin, 'admin', { years: 30, reason: 'Sponsor SOP QA-014: 30-year archive' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.retention).toMatchObject({ years: 30, isDefault: false, setBy: admin });
    const setting = await settingOf(mine);
    expect(setting).toMatchObject({ retention_years: 30, set_by: admin });
    const rows = await auditRows(mine);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_id: admin, reason: 'Sponsor SOP QA-014: 30-year archive' });
    expect(rows[0].new_values).toMatchObject({ before: null, after: { years: 30 } });
    expect(rows[0].chain_seq, 'sequenced on the tenant chain').not.toBeNull();
    expect(rows[0].sha256_chain).toMatch(/^[0-9a-f]{64}$/);
    // The same xmin: the setting row and the audit row were written by ONE transaction.
    const x = await owner.query('SELECT xmin::text AS xmin FROM organization_retention_settings WHERE organization_id = $1', [mine.orgId]);
    expect(x.rows[0].xmin).toBe(rows[0].xmin);
  });

  it("the next admission is dated from the organisation's 30 years", async () => {
    const d = await admit(mine);
    expect(d.until).toBe(d.y30);
  });

  it("another organisation's setting does not apply, cannot be read, and is invisible under RLS", async () => {
    const d = await admit(theirs);
    expect(d.until).toBe(d.y25);
    const res = await get(theirs, admin, 'admin');
    expect(res.body.retention).toMatchObject({ years: 25, isDefault: true });
    const seen = await runWithTenantScope(
      { tenantId: String(theirs.orgId), role: 'admin', source: 'test', caller: 'p122org-rls' },
      () => getPool().query('SELECT organization_id FROM organization_retention_settings WHERE organization_id = $1', [mine.orgId]),
    );
    expect(seen.rows).toEqual([]);
  });
});

describe('shortening is a governed act', () => {
  it('below 25 years without a reason and the governing rule: 400, and nothing changes', async () => {
    const before = await settingOf(mine);
    const auditBefore = (await auditRows(mine)).length;
    for (const body of [{ years: 10 }, { years: 10, reason: 'shorter please' }, { years: 10, governingRule: '21 CFR 312.62(c)' }]) {
      const res = await put(mine, admin, 'admin', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error).toBe('RETENTION_REASON_REQUIRED');
    }
    expect(await settingOf(mine)).toEqual(before);
    expect(await auditRows(mine)).toHaveLength(auditBefore);
  });

  it('the database refuses a shorter period with no reason, whatever path writes it', async () => {
    await expect(
      owner.query(
        `INSERT INTO organization_retention_settings (organization_id, retention_years, set_by)
         VALUES ($1, 10, $2)`,
        [theirs.orgId, admin],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('with a reason naming the governing rule it is recorded; a named policy that is longer still wins', async () => {
    const body = { years: 10, reason: 'IND records: 2 years after approval, kept 10 by SOP', governingRule: '21 CFR 312.62(c)' };
    const res = await put(mine, admin, 'admin', body);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.retention).toMatchObject({ years: 10, governingRule: '21 CFR 312.62(c)' });
    const last = (await auditRows(mine)).at(-1);
    expect(last?.new_values).toMatchObject({ before: { years: 30 }, after: { years: 10, governingRule: '21 CFR 312.62(c)' } });
    const plain = await admit(mine);
    expect(plain.until).toBe(plain.y10);
    const named = await admit(mine, { retentionPolicy: POLICY });
    expect(named.until, 'a named policy is never shortened silently').toBe(named.policy15);
  });
});

describe('authority and atomicity', () => {
  it('a member can neither read nor set the period: 403, and nothing changes', async () => {
    const before = await settingOf(mine);
    expect((await get(mine, member, 'member')).status).toBe(403);
    expect((await put(mine, member, 'member', { years: 40 })).status).toBe(403);
    expect(await settingOf(mine)).toEqual(before);
  });

  it('a refused audit row takes the change down with it, and the 500 carries no error text', async () => {
    const before = await settingOf(mine);
    const auditBefore = (await auditRows(mine)).length;
    probe.refuseAudit = true;
    try {
      const res = await put(mine, admin, 'admin', { years: 50 });
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toMatch(/probe|audit store|refused the row/);
    } finally {
      probe.refuseAudit = false;
    }
    expect(await settingOf(mine)).toEqual(before);
    expect(await auditRows(mine)).toHaveLength(auditBefore);
  });
});

describe('a tenant purge erases the period (GDPR Art. 17)', () => {
  it('the purge list reaches the setting row; the organisation row the purge updates survives', async () => {
    const { purgeTenant, PURGE_CHILD_TABLES } = await import('../../server/services/tenant/tenant-offboarding');
    const gone = await tenant('purged');
    const digest = `dbtest-p122org-${process.pid}-digest`;
    await owner.query(
      `UPDATE organizations SET status = 'pending_deletion', deletion_requested_at = now() - interval '40 days',
              purge_eligible_at = now() - interval '1 day' WHERE id = $1`,
      [gone.orgId],
    );
    await owner.query(
      `INSERT INTO tenant_export_receipts (organization_id, digest, table_count, row_count, created_by)
       VALUES ($1, $2, 1, 1, NULL)`,
      [gone.orgId, digest],
    );
    await owner.query(
      'INSERT INTO organization_retention_settings (organization_id, retention_years, set_by) VALUES ($1, 30, $2)',
      [gone.orgId, admin],
    );
    // The real list, narrowed to this table's entry so the run touches nothing else in the shared
    // database. Without the entry the list is empty, and the row survives: the purge UPDATEs
    // organizations, so the table's ON DELETE CASCADE never fires.
    await purgeTenant(owner, {
      organizationId: gone.orgId,
      purgedByUserId: admin,
      preconditions: { finalExportDigest: digest },
      childTables: PURGE_CHILD_TABLES.filter(t => t === 'organization_retention_settings'),
    });
    expect(await settingOf(gone), "the organisation's period survived its purge").toBeNull();
    expect((await owner.query('SELECT status FROM organizations WHERE id = $1', [gone.orgId])).rows).toEqual([{ status: 'purged' }]);
  });
});

/**
 * Non-public uuid-tenant isolation contract (ledger C-46).
 *
 * migrations/0021 and the 20260801 sweep are integer-keyed and public-only. The
 * non-public schemas use a uuid tenant key and were policied per subsystem; the
 * subsystems that never added RLS were closed by
 * db/migrations/20260801_uuid_tenant_isolation_nonpublic.sql.
 *
 * The policy shape is the context-less-SAFE COALESCE form the rest of the
 * non-public schemas already use, chosen so a service that queries on the raw
 * pool WITHOUT setting app.current_org_id (as regulatory_intel / manufacturing do)
 * is not filtered to zero rows — the C-44 api_keys failure mode — while a SCOPED
 * reader is isolated. Two tables are intentionally EXEMPT because a per-tenant
 * policy would break a legitimate cross-org reader.
 *
 * This pins: (a) the migration is wired into the deploy set; (b) it policies a
 * per-tenant table on its correct key (org_id / tenant_id) and leaves the exempt
 * ones alone; (c) the COALESCE policy is non-breaking for context-less reads yet
 * isolating for scoped ones, with shared NULL-org rows always visible; (d) it is
 * idempotent.
 *
 * @compliance 21 CFR Part 11 §11.10(d) — limiting access to authorized parties.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  C2C_MIGRATION_FILES,
  TENANT_ISOLATION_SWEEP,
  UUID_TENANT_ISOLATION_NONPUBLIC,
} from '../../scripts/db/migration-set.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Imported rather than re-typed — see the note in tenant-isolation-sweep.contract.test.ts.
const UUID_RLS = UUID_TENANT_ISOLATION_NONPUBLIC;
const T = 180_000;
const readMig = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';

describe('C-46: the uuid RLS migration is wired and deploy-positioned', () => {
  it('is in the C2C deploy set', () => {
    expect(C2C_MIGRATION_FILES).toContain(UUID_RLS);
  });

  it('sits alongside the public integer sweep (both isolation steps at the end)', () => {
    const SWEEP = TENANT_ISOLATION_SWEEP;
    // Both isolation steps are the FINAL PAIR of the set, after every
    // table-creating migration. Their mutual order is immaterial — they touch
    // disjoint schemas (integer/public vs uuid/non-public) and neither creates a
    // table — so this pins "both at the tail", not a strict order between the
    // two. The integer sweep is the very last entry (the tenant-isolation-sweep
    // contract, ledger C-33, requires it so the sweep sees everything the set
    // creates); the uuid non-public step sits immediately before it. An earlier
    // revision asserted `uuid > sweep`, which contradicted C-33's "sweep last"
    // and left the set ungreenable no matter which order was chosen.
    expect(C2C_MIGRATION_FILES).toContain(UUID_RLS);
    expect(C2C_MIGRATION_FILES).toContain(SWEEP);
    const lastTwo = C2C_MIGRATION_FILES.slice(-2);
    expect(lastTwo).toContain(UUID_RLS);
    expect(lastTwo).toContain(SWEEP);
  });
});

describe('C-46: policies the tenant-owned tables, exempts the cross-tenant ones', () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = new PGlite();
    // Minimal stand-ins for the real subsystem tables. The migration guards on
    // to_regclass, so only the tables we create are touched; the rest are skipped.
    await pg.exec(`
      CREATE SCHEMA core;
      CREATE SCHEMA regulatory_harmonization;
      CREATE SCHEMA federated_ml;
      CREATE SCHEMA audit;
      CREATE TABLE core.programs (id serial primary key, org_id uuid, name text);
      CREATE TABLE regulatory_harmonization.canonical_products
        (id serial primary key, tenant_id uuid NOT NULL, organization_id uuid, code text);
      CREATE TABLE federated_ml.safety_signals (id serial primary key, org_id uuid, signal text);
      -- EXEMPT: must be left unpoliced by the migration
      CREATE TABLE federated_ml.federation_participants (id serial primary key, org_id uuid NOT NULL, alias text);
      CREATE TABLE audit.event_log (id serial primary key, org_id uuid, event text);
    `);
    await pg.exec(readMig(UUID_RLS));
    await pg.exec(readMig(UUID_RLS)); // idempotent
  }, T);

  afterAll(async () => {
    await pg.close();
  });

  it('policies core.programs on org_id', async () => {
    const { rows } = await pg.query(
      `SELECT 1 FROM pg_policies WHERE schemaname='core' AND tablename='programs' AND policyname='tenant_isolation_policy'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('policies regulatory_harmonization.canonical_products on tenant_id (not organization_id)', async () => {
    const { rows } = await pg.query<{ qual: string }>(
      `SELECT qual FROM pg_policies WHERE schemaname='regulatory_harmonization' AND tablename='canonical_products' AND policyname='tenant_isolation_policy'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].qual).toContain('tenant_id');
    expect(rows[0].qual).not.toContain('organization_id'); // the real key is tenant_id
  });

  it('policies federated_ml.safety_signals (per-tenant, NULL-org shared signals kept visible)', async () => {
    const { rows } = await pg.query(
      `SELECT 1 FROM pg_policies WHERE schemaname='federated_ml' AND tablename='safety_signals' AND policyname='tenant_isolation_policy'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('leaves federated_ml.federation_participants EXEMPT (coordinator reads all orgs)', async () => {
    const { rows } = await pg.query(
      `SELECT 1 FROM pg_policies WHERE schemaname='federated_ml' AND tablename='federation_participants'`,
    );
    expect(rows).toHaveLength(0);
  });

  it('leaves audit.event_log EXEMPT (Part 11 trigger-written, cross-org compliance readers)', async () => {
    const { rows } = await pg.query(`SELECT 1 FROM pg_policies WHERE schemaname='audit' AND tablename='event_log'`);
    expect(rows).toHaveLength(0);
  });
});

describe('C-46: the non-public tenant policy is non-breaking yet isolating', () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      CREATE SCHEMA core;
      CREATE TABLE core.programs (id serial primary key, org_id uuid, name text);
      INSERT INTO core.programs (org_id, name) VALUES
        ('${ORG_A}','A-prog'), ('${ORG_B}','B-prog'), (NULL,'shared-prog');
    `);
    await pg.exec(readMig(UUID_RLS));
    // A non-superuser role: PGlite's default role is a superuser and bypasses RLS.
    await pg.exec(`CREATE ROLE uuid_reader NOSUPERUSER; GRANT USAGE ON SCHEMA core TO uuid_reader; GRANT SELECT ON core.programs TO uuid_reader;`);
  }, T);

  afterAll(async () => {
    await pg.close();
  });

  /**
   * `enforce` is not incidental: the policy was hardened from a COALESCE
   * (which silently widened to "all rows" whenever the org GUC was unset) to
   * an explicit `app.rls_enforce = 'on'` kill-switch, matching the shape the
   * public tenant_isolation_policy already used. Isolation is therefore a
   * property of an ENFORCING session, and these tests must say which session
   * they are describing rather than leaving the switch unset and reading
   * whatever falls out.
   */
  const namesUnder = async (
    setOrg: string | null,
    { enforce }: { enforce: boolean },
  ): Promise<string[]> => {
    await pg.exec(setOrg ? `SET app.current_org_id = '${setOrg}';` : `RESET app.current_org_id;`);
    await pg.exec(enforce ? `SET app.rls_enforce = 'on';` : `RESET app.rls_enforce;`);
    await pg.exec(`SET ROLE uuid_reader;`);
    const { rows } = await pg.query<{ name: string }>(`SELECT name FROM core.programs ORDER BY name`);
    await pg.exec(`RESET ROLE;`);
    return rows.map((r) => r.name);
  };

  it('with enforcement OFF the policy is a no-op — the service on the raw pool is not broken', async () => {
    expect(await namesUnder(null, { enforce: false })).toEqual(['A-prog', 'B-prog', 'shared-prog']);
    expect(await namesUnder(ORG_A, { enforce: false })).toEqual(['A-prog', 'B-prog', 'shared-prog']);
  });

  it('with enforcement ON a SCOPED read sees only its own org plus shared NULL-org rows', async () => {
    expect(await namesUnder(ORG_A, { enforce: true })).toEqual(['A-prog', 'shared-prog']);
    expect(await namesUnder(ORG_B, { enforce: true })).toEqual(['B-prog', 'shared-prog']);
  });

  it('with enforcement ON an UNSCOPED session sees no tenant rows at all (fail closed)', async () => {
    // The defect the hardening closed: under COALESCE, a session that simply
    // never set the org GUC read every tenant's rows. Now it reads none of
    // them — only the org-less shared rows survive.
    expect(await namesUnder(null, { enforce: true })).toEqual(['shared-prog']);
  });
});

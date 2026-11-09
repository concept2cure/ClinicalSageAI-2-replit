/**
 * Expanded spike check 4 (§19.3), the rules and memory half: tenant A cannot
 * read tenant B's standing rules, skill settings, account canon, conversation
 * memory, client memory or private profile, and cannot write one into B, when
 * it runs as the deployed runtime role with forced row security.
 *
 * Before this suite those tables were in no native-role test. The two-tenant
 * suite proves projects, documents, audit_logs, signatures, design controls,
 * risks and runs (two-tenant-application-rls.dbtest.ts), and the full-schema
 * contract runs on PGlite over the drizzle journal, which does not include the
 * P-104 rule and memory stores (docs/design/ONE_DESIGN_PLAN.md §1d, the
 * expanded spike; docs/evidence/SPINE/S4/2026-11-09-spike-joined-run/).
 *
 * The posture is the production one, asserted by provisionTwoTenantFixture:
 * the runtime pool connects as app_service, not a superuser, without
 * BYPASSRLS, with app.rls_enforce = 'on'. Rows are seeded by the owner; every
 * read and write under test goes through that runtime pool inside tenant A's
 * scope, the path a request takes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '../../server/db/runtime';
import { runWithTenantScope } from '../../server/db/tenantStore';
import {
  ORG_A, ORG_B, TAG, owner, userA, userB,
  provisionTwoTenantFixture, teardownTwoTenantFixture,
} from './two-tenant-fixture';

interface Store {
  table: string;
  /** The row's key column and a value unique to this suite and tenant. */
  key: string;
  seed: (org: number, user: number, key: string, profile: number) => [string, unknown[]];
  /** A column tenant A tries to overwrite on B's row. */
  update: string;
}

const STORES: Store[] = [
  { table: 'account_skill_bundles', key: 'bundle_id', update: 'name',
    seed: (org, user, key) => ['INSERT INTO account_skill_bundles (bundle_id, organization_id, name, bundle_type, created_by_id) VALUES ($1,$2,$3,$4,$5)',
      [key, org, `${TAG} standing rule`, 'skill', user]] },
  { table: 'organization_skill_settings', key: 'skill_key', update: 'reason',
    seed: (org, user, key) => ['INSERT INTO organization_skill_settings (organization_id, skill_key, enabled, reason, updated_by_id) VALUES ($1,$2,false,$3,$4)',
      [org, key, `${TAG} switched off`, user]] },
  { table: 'account_canon_items', key: 'canon_id', update: 'title',
    seed: (org, user, key) => ['INSERT INTO account_canon_items (canon_id, organization_id, category, key, title, content, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [key, org, 'terminology', key, `${TAG} canon`, 'The house term for the primary endpoint.', user]] },
  { table: 'conversation_working_memory', key: 'summary', update: 'summary',
    seed: (org, _user, key) => ['INSERT INTO conversation_working_memory (organization_id, summary, message_count_at_generation) VALUES ($1,$2,1)',
      [org, key]] },
  { table: 'client_memory_entries', key: 'title', update: 'content',
    seed: (org, _user, key, profile) => ['INSERT INTO client_memory_entries (profile_id, organization_id, category, title, content) VALUES ($1,$2,$3,$4,$5)',
      [profile, org, 'preference', key, 'Prefers tables before narrative.']] },
];

const keyOf = (store: Store, org: number) => `${TAG}-${store.table}-${org}`;
const profiles: Record<number, number> = {};

/** The runtime pool, as tenant A's request: app_service with app.rls_enforce on. */
const asTenantA = <T>(body: () => Promise<T>): Promise<T> =>
  runWithTenantScope({ tenantId: String(ORG_A), accountId: userA, role: 'member', source: 'test', caller: 'spike-4-rules-memory' }, body);

describe('spike check 4 (§19.3): rules and memory stores under the runtime role', () => {
  beforeAll(async () => {
    await provisionTwoTenantFixture();
    for (const [org, user] of [[ORG_A, userA], [ORG_B, userB]] as const) {
      const p = await owner.query('INSERT INTO client_intelligence_profiles (organization_id, company_name) VALUES ($1,$2) RETURNING id',
        [org, `${TAG}-${org}`]);
      profiles[org] = Number(p.rows[0].id);
      for (const store of STORES) {
        const [sql, args] = store.seed(org, user, keyOf(store, org), profiles[org]);
        await owner.query(sql, args);
      }
      await owner.query('INSERT INTO user_intelligence_profiles (user_id, organization_id) VALUES ($1,$2)', [user, org]);
    }
  }, 120_000);

  afterAll(async () => {
    if (owner) {
      for (const store of [...STORES].reverse()) {
        await owner.query(`DELETE FROM ${store.table} WHERE ${store.key} LIKE $1`, [`${TAG}-%`]).catch(() => undefined);
      }
      await owner.query('DELETE FROM user_intelligence_profiles WHERE organization_id = ANY($1)', [[ORG_A, ORG_B]]).catch(() => undefined);
      await owner.query('DELETE FROM client_intelligence_profiles WHERE company_name LIKE $1', [`${TAG}-%`]).catch(() => undefined);
    }
    await teardownTwoTenantFixture();
  });

  it('every store is forced row security with a policy, and the runtime role cannot bypass it', async () => {
    const tables = [...STORES.map(s => s.table), 'user_intelligence_profiles'];
    const posture = await owner.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY($1) ORDER BY c.relname`, [tables]);
    expect(posture.rows.map(r => r.relname).sort()).toEqual([...tables].sort());
    for (const row of posture.rows) {
      expect(row, row.relname).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
      expect(row.policies, row.relname).toBeGreaterThan(0);
    }
    const role = await asTenantA(() => getPool().query(
      `SELECT current_user AS role, r.rolbypassrls, current_setting('app.rls_enforce', true) AS enforcement
         FROM pg_roles r WHERE r.rolname = current_user`));
    expect(role.rows[0]).toMatchObject({ rolbypassrls: false, enforcement: 'on' });
  });

  for (const store of STORES) {
    it(`${store.table}: tenant A reads its own row and none of tenant B's, by list or by key`, async () => {
      const mine = keyOf(store, ORG_A), theirs = keyOf(store, ORG_B);
      const listed = await asTenantA(() => getPool().query(
        `SELECT ${store.key} AS k, organization_id FROM ${store.table} WHERE ${store.key} LIKE $1`, [`${TAG}-%`]));
      expect(listed.rows.map(r => r.k)).toEqual([mine]);
      expect(listed.rows.every(r => Number(r.organization_id) === ORG_A)).toBe(true);
      const probe = await asTenantA(() => getPool().query(`SELECT 1 FROM ${store.table} WHERE ${store.key} = $1`, [theirs]));
      expect(probe.rows).toEqual([]);
    });

    it(`${store.table}: tenant A cannot change or delete tenant B's row, and B's row is unchanged`, async () => {
      const theirs = keyOf(store, ORG_B);
      const updated = await asTenantA(() => getPool().query(
        `UPDATE ${store.table} SET ${store.update} = ${store.update} WHERE ${store.key} = $1`, [theirs]));
      expect(updated.rowCount).toBe(0);
      const deleted = await asTenantA(() => getPool().query(`DELETE FROM ${store.table} WHERE ${store.key} = $1`, [theirs]));
      expect(deleted.rowCount).toBe(0);
      const still = await owner.query(`SELECT organization_id FROM ${store.table} WHERE ${store.key} = $1`, [theirs]);
      expect(still.rows.map(r => Number(r.organization_id))).toEqual([ORG_B]);
    });

    it(`${store.table}: a row planted under tenant B from tenant A's scope is refused`, async () => {
      const planted = `${TAG}-${store.table}-planted`;
      const [sql, args] = store.seed(ORG_B, userA, planted, profiles[ORG_B]);
      await expect(asTenantA(() => getPool().query(sql, args))).rejects.toMatchObject({ code: '42501' });
      const none = await owner.query(`SELECT 1 FROM ${store.table} WHERE ${store.key} = $1`, [planted]);
      expect(none.rows).toEqual([]);
    });
  }

  it("user_intelligence_profiles: tenant A sees only its own member's private profile, never B's", async () => {
    const seen = await asTenantA(() => getPool().query(
      'SELECT user_id, organization_id FROM user_intelligence_profiles WHERE organization_id = ANY($1)', [[ORG_A, ORG_B]]));
    expect(seen.rows.map(r => [Number(r.user_id), Number(r.organization_id)])).toEqual([[userA, ORG_A]]);
    await expect(asTenantA(() => getPool().query(
      'INSERT INTO user_intelligence_profiles (user_id, organization_id) VALUES ($1,$2)', [userB, ORG_B]))).rejects.toMatchObject({ code: '42501' });
  });
});

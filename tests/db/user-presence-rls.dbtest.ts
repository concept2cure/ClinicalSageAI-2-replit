/**
 * A person's presence reaches their own organization's members, and only the
 * person writes it (D3, 2026-10-04; evidence docs/evidence/D3/2026-10-04-user-presence/).
 *
 * public.user_presence holds a person's IP address, user agent, current page and
 * current document. It had no row-level security: any scope read and wrote every
 * row. No code reads or writes it yet; migrations/20261004_user_presence_rls.sql
 * gives it a policy before its first writer.
 *
 * As app_service with RLS enforcing (asserted by the fixture), through the
 * production scope helpers.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '../../server/db';
import { runAsAccount, runWithPreAuthScope, runWithTenantScope } from '../../server/db/tenantStore';
import {
  ORG_A,
  owner,
  userA,
  userB,
  provisionMember,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

let colleagueA = 0;
const q = (sql: string, params: unknown[] = []) => getPool().query(sql, params);
const asA = <T>(fn: () => Promise<T>) =>
  runWithTenantScope({ tenantId: String(ORG_A), role: 'member', source: 'request', caller: 'user-presence-rls.dbtest' }, fn);

/** rowCount of a write, a policy refusal counted as nothing written. */
async function written(run: () => Promise<{ rowCount: number | null }>): Promise<number> {
  try {
    return (await run()).rowCount ?? 0;
  } catch (err) {
    if ((err as { code?: string }).code === '42501') return 0;
    throw err;
  }
}

beforeAll(async () => {
  await provisionTwoTenantFixture();
  colleagueA = await provisionMember(ORG_A, 'member', 'presence-colleague');
  for (const [user, ip] of [
    [colleagueA, '10.0.0.1'],
    [userB, '10.0.0.2'],
  ] as const) {
    await owner.query(
      `INSERT INTO user_presence (user_id, status, ip_address, current_page_url, last_activity_at, last_heartbeat_at, created_at)
       VALUES ($1, 'online', $2, '/projects/secret', now(), now(), now())
       ON CONFLICT (user_id) DO UPDATE SET ip_address = EXCLUDED.ip_address`,
      [user, ip]
    );
  }
}, 60_000);

afterAll(async () => {
  if (owner) await owner.query('DELETE FROM user_presence WHERE user_id = ANY($1::int[])', [[colleagueA, userB, userA]]);
  await teardownTwoTenantFixture();
});

describe("a person's presence stays in their organization (D3)", () => {
  it("A's member sees a colleague's presence (positive control)", async () => {
    const { rows } = await asA(() => q('SELECT user_id FROM user_presence WHERE user_id = $1', [colleagueA]));
    expect(rows.map(r => Number(r.user_id))).toEqual([colleagueA]);
  });

  it("A's scope does not see B's member, by id or by scanning", async () => {
    const byId = await asA(() => q('SELECT ip_address FROM user_presence WHERE user_id = $1', [userB]));
    const scan = await asA(() => q("SELECT user_id FROM user_presence WHERE ip_address = '10.0.0.2'"));
    expect(byId.rows).toEqual([]);
    expect(scan.rows).toEqual([]);
  });

  it("A's member cannot rewrite a colleague's presence, nor B's", async () => {
    const colleague = await written(() =>
      asA(() => q("UPDATE user_presence SET current_page_url = '/forged' WHERE user_id = $1", [colleagueA]))
    );
    const other = await written(() =>
      asA(() => q("UPDATE user_presence SET current_page_url = '/forged' WHERE user_id = $1", [userB]))
    );
    expect([colleague, other]).toEqual([0, 0]);
  });

  it('an unbound pre-auth scope reads none', async () => {
    const { rows } = await runWithPreAuthScope('user-presence-rls.dbtest', () => q('SELECT user_id FROM user_presence'));
    expect(rows).toEqual([]);
  });

  it('the person, bound, writes their own presence', async () => {
    const n = await runAsAccount(userA, 'user-presence-rls.dbtest', () =>
      written(() =>
        q(
          `INSERT INTO user_presence (user_id, status, last_activity_at, last_heartbeat_at, created_at)
           VALUES ($1, 'online', now(), now(), now())`,
          [userA]
        )
      )
    );
    expect(n).toBe(1);
  });
});

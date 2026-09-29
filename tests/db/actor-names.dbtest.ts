/**
 * The audit trail names the person who acted, after they leave the
 * organization, and nobody else's account crosses (D3, 2026-09-29; evidence
 * docs/evidence/D3/2026-09-29-actor-names/).
 *
 * Since public.users took row-level security (2026-09-28), a tenant scope reads
 * only its own members' accounts. audit_logs keeps the actor's id and no name,
 * so the audit-trail ledger (server/routes/audit-trail-ledger.routes.ts)
 * resolved the name by joining users — and for someone who has since left the
 * organization, that join now finds nothing: the entry read `user <id>`.
 *
 * public.actor_name(id) answers name and email only, for a member of the
 * calling scope's organization or someone who acted in it (its own audit_logs),
 * and for nobody else. Rows are written by the production audit writer and read
 * by the production ledger reader, in tenant A's request scope, as app_service
 * with RLS enforcing (asserted by the fixture).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '../../server/db';
import { runWithTenantScope } from '../../server/db/tenantStore';
import auditService from '../../server/services/auditService';
import { readRecordAuditHistory } from '../../server/routes/audit-trail-ledger.routes';
import {
  TAG,
  ORG_A,
  owner,
  userB,
  provisionMember,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

const RECORD = `${TAG}-actor-names-record`;
let leaver = 0; // acted in A, then left A
let leaverName = '';

/** A's request scope, as a plain member. */
const inA = <T>(fn: () => Promise<T>) =>
  runWithTenantScope(
    { tenantId: String(ORG_A), role: 'member', source: 'request', caller: 'actor-names.dbtest' },
    fn
  );

const noVerify = async () => ({ ok: true, rowsChecked: 0, firstBreak: null }) as never;

beforeAll(async () => {
  await provisionTwoTenantFixture();
  leaver = await provisionMember(ORG_A, 'member', 'actor-names-leaver');
  leaverName = (await owner.query('SELECT name FROM users WHERE id = $1', [leaver])).rows[0].name;
  // Acts in A while a member, through the production audit writer.
  const res = await inA(() =>
    auditService.logAction({
      tenantId: ORG_A,
      userId: leaver,
      action: 'data_modify',
      resourceType: 'actor_names_contract',
      resourceId: RECORD,
      details: { description: 'acted while a member' },
    })
  );
  expect(res.persisted, 'the audit writer did not persist').toBe(true);
  // Then leaves.
  await owner.query('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2', [
    ORG_A,
    leaver,
  ]);
}, 60_000);

afterAll(async () => {
  await teardownTwoTenantFixture();
});

describe('the audit trail after someone leaves the organization (D3)', () => {
  it("names the person who acted, not only their id", async () => {
    const history = await inA(() =>
      readRecordAuditHistory(getPool(), ORG_A, { tableName: 'actor_names_contract', recordId: RECORD }, noVerify)
    );
    expect(history.data.length, 'the audit row was not found').toBeGreaterThan(0);
    expect(history.data.map(e => e.actor)).toEqual(history.data.map(() => leaverName));
    expect(history.data.map(e => e.actorRef)).toEqual(history.data.map(() => `user:${leaver}`));
  });
});

describe('the name lookup reaches nobody else (D3)', () => {
  it("answers nothing about an account that never belonged to or acted in A", async () => {
    const { rows } = await inA(() =>
      getPool().query('SELECT * FROM public.actor_name($1)', [userB])
    );
    expect(rows, "A's scope resolved another tenant's user").toEqual([]);
  });

  it('answers name and email only — no credential column exists on it', async () => {
    const { rows } = await inA(() => getPool().query('SELECT * FROM public.actor_name($1)', [leaver]));
    expect(rows.map(r => Object.keys(r).sort())).toEqual([['email', 'name']]);
  });

  it("the users table itself still refuses the leaver's row to A", async () => {
    const { rows } = await inA(() =>
      getPool().query('SELECT id, password_hash FROM users WHERE id = $1', [leaver])
    );
    expect(rows).toEqual([]);
  });
});

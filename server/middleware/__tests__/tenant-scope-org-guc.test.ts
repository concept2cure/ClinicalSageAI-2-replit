/**
 * What `app.current_org_id` actually carries on a request — the prerequisite
 * for turning RLS enforcement on over the vault.
 *
 * ── Why this test exists ─────────────────────────────────────────────────────
 * VAULT_DATA_ROOM_ASSESSMENT §4.4 says vault.documents and
 * vault.document_chunks are ENABLE ROW LEVEL SECURITY and never FORCE, so the
 * owner role the app connects as bypasses their policies. Adding FORCE looks
 * like a one-line hardening that matches what 19 other migrations already do.
 *
 * It is not. The vault's policies delegate to core.can_access_program →
 * identity.can_access_program, which resolves a programme against the
 * ORGANISATION UUID in `app.current_org_id`. If that GUC does not carry a real
 * uuid on the request path, FORCE does not harden the vault — it empties it.
 * The §4.4 order is therefore: PROVE the GUC first, then FORCE. Nothing
 * asserted what it carried, so "prove" had no artifact. This is that artifact.
 *
 * ── What it establishes ──────────────────────────────────────────────────────
 * The middleware writes whatever uuid it can find, and the EMPTY STRING when it
 * finds none. Both are pinned below, because the second is the whole risk: it
 * is not a defect today (ENABLE-only policies do not run for the owner role) and
 * it is a vault-wide outage the moment FORCE lands.
 *
 * This says nothing about how OFTEN the uuid is absent — that depends on which
 * mint path issued the token, and orgMembership.ts's own note records that
 * refresh, SSO, enterprise and legacy tokens drop it while the MFA path keeps
 * it. Establishing that distribution is the next step, not this one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

/** Records every statement the lazy client issues on acquisition. */
const issued: Array<{ text: string; params: unknown[] }> = [];
/** What the org-membership lookup finds. Both middlewares resolve `../db` to
 *  the same module, so one mock serves the scope opener and the membership
 *  re-check that runs immediately before it. */
const membershipRows: { rows: Array<Record<string, unknown>> } = { rows: [] };
vi.mock('../../db', () => {
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    limit: async () => membershipRows.rows,
  };
  return {
    getPool: () => ({
      connect: async () => ({
        query: async (text: string, params?: unknown[]) => {
          issued.push({ text: String(text), params: (params ?? []) as unknown[] });
          return { rows: [] };
        },
        release: () => undefined,
      }),
    }),
    db: { select: () => chain },
  };
});

import { establishRequestTenantScope } from '../establishRequestTenantScope';
import { enforceOrgMembership, invalidateOrgMembershipCache } from '../orgMembership';

function makeReq(overrides: Record<string, any> = {}): any {
  return {
    method: 'GET',
    baseUrl: '',
    path: '/api/c2c/project-vault/abc',
    user: { organizationId: '42', role: 'member' },
    tenantContext: {},
    ...overrides,
  };
}

function makeRes(): any {
  const res = new EventEmitter() as any;
  res.finish = () => res.emit('finish');
  return res;
}

/** Open the scope, then force the lazy client to acquire so the session vars
 *  are actually applied — they are not until the first query. */
async function sessionVarsFor(req: any): Promise<Map<string, unknown>> {
  issued.length = 0;
  await new Promise<void>((resolve) => {
    establishRequestTenantScope(req, makeRes(), () => resolve());
  });
  await req.dbClient.query('SELECT 1');
  const byName = new Map<string, unknown>();
  for (const q of issued) {
    const m = q.text.match(/set_config\('([^']+)'/);
    if (m) byName.set(m[1], q.params[0]);
  }
  return byName;
}

beforeEach(() => {
  issued.length = 0;
  vi.clearAllMocks();
});

describe('app.current_org_id on a per-user request', () => {
  it('carries the organisation uuid when the request has one', async () => {
    const vars = await sessionVarsFor(
      makeReq({ user: { organizationId: '42', role: 'member', organizationUuid: '3f1c9b20-0000-4000-8000-00000000abcd' } }),
    );
    expect(vars.get('app.current_org_id')).toBe('3f1c9b20-0000-4000-8000-00000000abcd');
    expect(vars.get('app.current_tenant_id')).toBe('42');
  });

  it('falls back to the uuid on tenantContext when req.user has none', async () => {
    const vars = await sessionVarsFor(
      makeReq({ tenantContext: { organizationUuid: '3f1c9b20-0000-4000-8000-00000000beef' } }),
    );
    expect(vars.get('app.current_org_id')).toBe('3f1c9b20-0000-4000-8000-00000000beef');
  });

  it('writes the EMPTY STRING when neither carries one — the FORCE precondition', async () => {
    /* THIS IS THE FINDING, not an incidental assertion.
     *
     * '' is not a uuid identity.current_org_id() can resolve, so every vault
     * policy that delegates to it evaluates false. Today that is invisible:
     * the policies are ENABLE-only and the app connects as the table owner, so
     * they do not run at all. Add FORCE and this same request reads an EMPTY
     * VAULT — not a leak, an outage, and one that looks like "the customer has
     * no documents" rather than like a misconfiguration.
     *
     * So this assertion is deliberately written the way the code behaves today
     * rather than the way it should behave. When the middleware is changed to
     * resolve the uuid (or to refuse rather than pass ''), THIS TEST SHOULD
     * FAIL, and whoever changes it should read §4.4 before updating it. */
    const vars = await sessionVarsFor(makeReq({ user: { organizationId: '42', role: 'member' }, tenantContext: {} }));
    expect(vars.get('app.current_org_id')).toBe('');
    // The tenant id IS present — so a policy keyed on the integer org works
    // while one keyed on the uuid does not. That asymmetry is the trap.
    expect(vars.get('app.current_tenant_id')).toBe('42');
  });

  it('sets all three session vars on one acquisition, not lazily per read', async () => {
    const vars = await sessionVarsFor(
      makeReq({ user: { organizationId: '7', role: 'admin', organizationUuid: '3f1c9b20-0000-4000-8000-00000000cafe' } }),
    );
    expect([...vars.keys()].sort()).toEqual([
      'app.current_org_id',
      'app.current_tenant_id',
      'app.current_user_role',
    ]);
    expect(vars.get('app.current_user_role')).toBe('admin');
  });
});


/**
 * The two middlewares composed exactly as middleware/auth.ts:183 composes them.
 *
 * orgMembership.ts used to say its resolved uuid "is NOT wired into
 * app.current_org_id". It is: that file's next() IS the scope opener, and
 * attachOrgUuid() sets the field the opener reads, one frame earlier. The note
 * has been corrected, and this is the test that keeps the correction honest —
 * a sentence can rot again, a composition test cannot.
 */
describe('org membership → tenant scope → app.current_org_id', () => {
  const UUID = '3f1c9b20-0000-4000-8000-0000000012ab';

  beforeEach(() => {
    invalidateOrgMembershipCache();
    membershipRows.rows = [];
  });

  /** Run the real pair in the real order and report the session vars. */
  async function composed(rows: Array<Record<string, unknown>>): Promise<Map<string, unknown>> {
    membershipRows.rows = rows;
    issued.length = 0;
    const req = makeReq({ user: { userId: 5, organizationId: '42', role: 'member' } });
    await new Promise<void>((resolve, reject) => {
      const res = makeRes();
      res.status = () => ({ json: () => reject(new Error('membership refused the request')) });
      enforceOrgMembership(req, res, () =>
        establishRequestTenantScope(req, res, () => resolve()),
      );
    });
    await req.dbClient.query('SELECT 1');
    const byName = new Map<string, unknown>();
    for (const q of issued) {
      const m = q.text.match(/set_config\('([^']+)'/);
      if (m) byName.set(m[1], q.params[0]);
    }
    return byName;
  }

  it('carries the uuid the membership lookup resolved', async () => {
    const vars = await composed([{ role: 'member', orgUuid: UUID }]);
    expect(vars.get('app.current_org_id')).toBe(UUID);
  });

  it('carries the empty string when the lookup resolves no uuid', async () => {
    // A member whose organisation row has no uuid, or whose enrichment JOIN
    // fell back. Membership is sound; the uuid is simply absent — and this is
    // the shape that reads as an empty vault once FORCE is on.
    const vars = await composed([{ role: 'member', orgUuid: null }]);
    expect(vars.get('app.current_org_id')).toBe('');
    expect(vars.get('app.current_tenant_id')).toBe('42');
  });
});

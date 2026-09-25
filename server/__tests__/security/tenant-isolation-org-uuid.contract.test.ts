/**
 * Tenant contract test — the organization UUID is a tenant key, not a hint.
 *
 * ── Why this file exists ──────────────────────────────────────────────────────
 * This platform has TWO tenant keys for the same tenant:
 *
 *   organizations.id    serial  (integer)  — the key every public-schema table uses
 *   organizations.uuid  uuid               — the key every NON-public schema uses
 *
 * `cortex.atoms.org_id`, `cortex.threads.org_id` and `cortex.traces.org_id` are all
 * `UUID NOT NULL` (db/migrations/073_*.sql:27,88,100), as are the org columns across
 * innovation.*, ai.*, compliance.* and identity.*. So for those schemas the UUID is
 * not supplemental context — it IS the tenant boundary.
 *
 * Only the integer had a secure accessor. `getSecureOrgId` deliberately ignores
 * client-supplied `x-organization-id`, and says so. The UUID had no equivalent, and
 * the one middleware that published it let the CLIENT SET IT:
 *
 *     // Non-sensitive supplemental context may come from headers
 *     const organizationUuid = (req.headers['x-org-uuid'] as string) || existing.organizationUuid || null;
 *
 * That is `tenantContext.ts`, whose own docblock two lines above states that org
 * identity is "derived exclusively from the authenticated JWT token, NOT from request
 * headers" — a rule it kept for `organizationId` and broke for `organizationUuid`.
 * `resolveOrgUuid` (establishRequestTenantScope.ts:144-149) then falls back to that
 * header-derived value, so a forged header reached the resolver every honest caller
 * was expected to use.
 *
 * The repo already knows the right answer: server/routes/evidence-ask.ts refuses the
 * same header, and its test asserts an attacker-controlled `x-org-uuid` cannot steer
 * retrieval. This file makes that rule general rather than one endpoint's good habit.
 *
 * ── What is asserted ─────────────────────────────────────────────────────────
 * That a forged header cannot become a tenant key, and that an unresolvable tenant
 * fails closed rather than reaching a query as a usable-looking value.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/security-alerts', () => ({
  reportSecurityAlert: vi.fn(),
}));
vi.mock('../../utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createScopedLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const ORG_A_ID = 7;
const ORG_A_UUID = '11111111-1111-4111-8111-111111111111';
const ORG_B_UUID = '99999999-9999-4999-8999-999999999999'; // attacker's target

/** A request as the auth middleware leaves it: identity from the verified JWT. */
function authedRequest(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 1, organizationId: ORG_A_ID, organizationUuid: ORG_A_UUID, role: 'member' },
    headers: {},
    query: {},
    path: '/api/cortex/atoms/x',
    ...overrides,
  } as any;
}

describe('currentTenantOrgUuid — the UUID tenant key, from the verified tenant scope only', () => {
  // It takes no request. A header, a body field or a tenantContext written by
  // anything but the auth boundary cannot reach it, which is the whole point:
  // the routes that used `tenantContext?.organizationUuid || req.headers['x-org-uuid']`
  // now call this instead (docs/evidence/D3/2026-09-24-atom-search-tenant-key/).
  let currentTenantOrgUuid: any;
  let runWithTenantScope: any;
  let runWithSystemTenantScope: any;
  let runWithPreAuthScope: any;
  const db = { query: vi.fn() };

  beforeEach(async () => {
    vi.resetModules();
    ({ currentTenantOrgUuid } = await import('../../db/currentTenant'));
    ({ runWithTenantScope, runWithSystemTenantScope, runWithPreAuthScope } = await import(
      '../../db/tenantStore'
    ));
    db.query.mockReset();
  });

  const inScope = <T>(orgUuid: unknown, fn: () => Promise<T>) =>
    runWithTenantScope(
      { tenantId: String(ORG_A_ID), orgUuid, role: 'member', source: 'request', caller: 'contract' },
      fn,
    );

  it('returns the organization UUID the auth boundary verified, without a query', async () => {
    expect(await inScope(ORG_A_UUID, () => currentTenantOrgUuid(db))).toBe(ORG_A_UUID);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("reads the session's own organization row when the scope carries no UUID", async () => {
    // The degraded membership path — exactly when the header fallbacks fired.
    db.query.mockResolvedValue({ rows: [{ uuid: ORG_A_UUID }] });
    expect(await inScope(null, () => currentTenantOrgUuid(db))).toBe(ORG_A_UUID);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][1]).toEqual([ORG_A_ID]);
  });

  it('does not pass a scope value that is not a UUID to a uuid column; it asks the org row', async () => {
    db.query.mockResolvedValue({ rows: [{ uuid: ORG_A_UUID }] });
    for (const bad of ['7', '', 'not-a-uuid', '../../etc/passwd']) {
      expect(await inScope(bad, () => currentTenantOrgUuid(db))).toBe(ORG_A_UUID);
    }
    for (const call of db.query.mock.calls) expect(call[1]).toEqual([ORG_A_ID]);
  });

  it('answers null when the session names an organization with no row', async () => {
    db.query.mockResolvedValue({ rows: [] });
    expect(await inScope(null, () => currentTenantOrgUuid(db))).toBeNull();
  });

  it('fails closed with no scope, and under the system and pre-auth scopes', async () => {
    expect(await currentTenantOrgUuid(db)).toBeNull();
    expect(await runWithSystemTenantScope('contract', () => currentTenantOrgUuid(db))).toBeNull();
    expect(await runWithPreAuthScope('contract', () => currentTenantOrgUuid(db))).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('tenantContextMiddleware — a forged header must not become the tenant key', () => {
  let tenantContextMiddleware: any;

  beforeEach(async () => {
    vi.resetModules();
    ({ tenantContextMiddleware } = await import('../../middleware/tenantContext'));
  });

  const run = (req: any) => {
    const next = vi.fn();
    tenantContextMiddleware(req, {} as any, next);
    expect(next).toHaveBeenCalled();
    return req.tenantContext;
  };

  it('publishes the verified UUID, not the header', () => {
    const ctx = run(authedRequest({ headers: { 'x-org-uuid': ORG_B_UUID } }));
    expect(ctx.organizationUuid).toBe(ORG_A_UUID);
  });

  it('publishes no UUID at all when only the header offers one', () => {
    const ctx = run(
      authedRequest({
        user: { id: 1, organizationId: ORG_A_ID, role: 'member' },
        headers: { 'x-org-uuid': ORG_B_UUID },
      })
    );
    expect(ctx.organizationUuid).toBeNull();
  });

  it('still keeps the integer org id from the JWT', () => {
    const ctx = run(authedRequest({ headers: { 'x-org-uuid': ORG_B_UUID, 'x-org-id': '999' } }));
    expect(ctx.organizationId).toBe(String(ORG_A_ID));
  });
});

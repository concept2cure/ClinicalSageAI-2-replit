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

describe('getSecureOrgUuid — the UUID tenant key, from verified identity only', () => {
  let getSecureOrgUuid: any;

  beforeEach(async () => {
    vi.resetModules();
    ({ getSecureOrgUuid } = await import('../../utils/tenantContext'));
  });

  it('returns the organization UUID the auth layer verified', () => {
    expect(getSecureOrgUuid(authedRequest())).toBe(ORG_A_UUID);
  });

  it('ignores a forged x-org-uuid header', () => {
    const req = authedRequest({ headers: { 'x-org-uuid': ORG_B_UUID } });
    expect(getSecureOrgUuid(req)).toBe(ORG_A_UUID);
  });

  it('ignores a forged x-org-uuid even when the request carries no verified UUID', () => {
    // The dangerous case: nothing legitimate to shadow, so a naive fallback would
    // hand the attacker's value straight to a WHERE clause.
    const req = authedRequest({
      user: { id: 1, organizationId: ORG_A_ID, role: 'member' },
      headers: { 'x-org-uuid': ORG_B_UUID },
    });
    expect(getSecureOrgUuid(req)).toBeNull();
  });

  it('does not accept a tenantContext UUID that a header could have written', () => {
    const req = authedRequest({
      user: { id: 1, organizationId: ORG_A_ID, role: 'member' },
      headers: { 'x-org-uuid': ORG_B_UUID },
      tenantContext: { organizationId: String(ORG_A_ID), organizationUuid: ORG_B_UUID },
    });
    expect(getSecureOrgUuid(req)).toBeNull();
  });

  it('refuses a value that is not a UUID, rather than passing it to a uuid column', () => {
    // The integer org id is NOT interchangeable with the UUID. Handing '7' to a
    // `uuid` column raises invalid-input-syntax, which surfaces as a 500 and reads
    // as an outage — inviting a tolerance-widening "fix" that reopens the hole.
    for (const bad of ['7', '', 'not-a-uuid', '../../etc/passwd']) {
      const req = authedRequest({
        user: { id: 1, organizationId: ORG_A_ID, organizationUuid: bad, role: 'member' },
      });
      expect(getSecureOrgUuid(req)).toBeNull();
    }
  });

  it('fails closed on a request with no identity at all', () => {
    expect(getSecureOrgUuid({ headers: {} } as any)).toBeNull();
    expect(getSecureOrgUuid({} as any)).toBeNull();
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

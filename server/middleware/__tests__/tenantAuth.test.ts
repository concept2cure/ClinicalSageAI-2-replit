/**
 * The test-assembly tenant gate admits on the verified session alone.
 *
 * tenantAuthMiddleware checks the caller's tenant against
 * ALLOWED_TEST_ASSEMBLY_TENANTS. With no JWT user it fell back to the
 * client's `x-tenant-id` / `x-tenant` header, so a request the auth boundary
 * had not authenticated (AUTH_BOUNDARY_MODE=warn, outside production) could
 * name an allowlisted tenant and be admitted. The tenant comes from the
 * session or the request is refused.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/security-alerts', () => ({ reportSecurityAlert: vi.fn() }));

import { tenantAuthMiddleware } from '../tenantAuth';
import { reportSecurityAlert } from '../../services/security-alerts';

function run(req: Record<string, unknown>) {
  const headers = (req.headers as Record<string, string>) ?? {};
  const full = { ...req, header: (n: string) => headers[n.toLowerCase()] } as any;
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  const next = vi.fn();
  tenantAuthMiddleware(full, res, next);
  return { res, next };
}

describe('test-assembly tenant gate', () => {
  const prev = process.env.ALLOWED_TEST_ASSEMBLY_TENANTS;
  beforeEach(() => {
    process.env.ALLOWED_TEST_ASSEMBLY_TENANTS = '7, 9';
    vi.mocked(reportSecurityAlert).mockClear();
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.ALLOWED_TEST_ASSEMBLY_TENANTS;
    else process.env.ALLOWED_TEST_ASSEMBLY_TENANTS = prev;
  });

  it('admits a session whose tenant is allowlisted (positive control)', () => {
    const { res, next } = run({ user: { id: 1, organizationId: 7 } });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('refuses a session whose tenant is not allowlisted, whatever the header names', () => {
    const { res, next } = run({ user: { id: 1, organizationId: 8 }, headers: { 'x-tenant-id': '7' } });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(reportSecurityAlert).toHaveBeenCalledTimes(1);
  });

  it('refuses a request with no session, even when its header names an allowlisted tenant', () => {
    for (const header of ['x-tenant-id', 'x-tenant']) {
      const { res, next } = run({ headers: { [header]: '7' } });
      expect(next, `admitted on ${header}`).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    }
  });

  it('stands down when no allowlist is configured', () => {
    delete process.env.ALLOWED_TEST_ASSEMBLY_TENANTS;
    const { next } = run({});
    expect(next).toHaveBeenCalledTimes(1);
  });
});

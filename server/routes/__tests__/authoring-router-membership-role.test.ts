/**
 * The Authoring router's principal carries the membership role, not the
 * token's role claim (D6, P-72 slice 1a; docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1a/).
 *
 * The router authenticates for itself (Part 11: its own first middleware
 * verifies the token and re-checks the membership). Until 2026-10-30 it kept
 * `req.user.role = decoded.role`, the copy of the role minted at sign-in, and
 * the image upload re-entered its tenant scope with that string, so a token's
 * claim reached app.current_user_role. Every other authenticator replaces the
 * claim with the membership row's role (server/auth.ts, middleware/auth.ts
 * applyOrganizationRole). The router now does the same, through the same
 * function, after its membership check.
 */
import { describe, it, expect, vi } from 'vitest';
import { SignJWT } from 'jose';

// The live membership check answers with the membership row's role, as enforceOrgMembership does.
vi.mock('../../middleware/orgMembership', () => ({
  enforceOrgMembership: (req: any, _res: unknown, next: () => void) => {
    req.user.organizationRole = 'reviewer';
    next();
  },
  requireEditorAccess: (_req: unknown, _res: unknown, next: () => void) => next(),
  GOVERNED_WRITE_ROLES: new Set(['owner', 'admin', 'approver', 'reviewer']),
  invalidateOrgMembershipCache: () => undefined,
  parseFiniteInt: (v: unknown) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null),
}));
vi.mock('../../db', () => ({
  pool: { query: async () => ({ rows: [], rowCount: 0 }), connect: async () => ({ query: async () => ({ rows: [] }), release: () => undefined }) },
  getPool: () => ({ query: async () => ({ rows: [], rowCount: 0 }) }),
  query: async () => ({ rows: [], rowCount: 0 }),
  db: {},
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-authoring-membership-role';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

async function bearer(claims: Record<string, unknown>): Promise<string> {
  const token = await new SignJWT({ userId: '41', id: '41', sub: '41', email: 'a@test.co', organizationId: '3', type: 'access', ...claims })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m')
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
  return `Bearer ${token}`;
}

/** The router's own first middleware: token, principal, membership. */
async function authenticate(authorization: string) {
  const first = (router as any).stack[0].handle as (req: any, res: any, next: () => void) => unknown;
  const req: any = { headers: { authorization, 'x-roles': 'APP_SUPER_ADMIN' }, method: 'GET', url: '/docs', path: '/docs' };
  const res: any = { statusCode: 200, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
  let nextRan = false;
  await first(req, res, () => { nextRan = true; });
  return { req, res, nextRan };
}

describe('authoring router principal', () => {
  it("replaces the token's role claim with the membership row's role, and derives x-roles from it", async () => {
    const { req, nextRan } = await authenticate(await bearer({ role: 'app_super_admin', roles: ['app_super_admin'] }));
    expect(nextRan).toBe(true);
    expect(req.user.role).toBe('reviewer');
    expect(req.user.roles).not.toContain('app_super_admin');
    expect(req.user.roles).toContain('reviewer');
    expect(String(req.headers['x-roles'])).not.toMatch(/APP_SUPER_ADMIN/);
    expect(String(req.headers['x-roles'])).toMatch(/REVIEWER/);
  });

  it('does so for an ordinary stale claim too: a demoted administrator is the membership role', async () => {
    const { req } = await authenticate(await bearer({ role: 'admin', roles: ['admin'] }));
    expect(req.user.role).toBe('reviewer');
  });
});

/**
 * Contract: the role the guards ask for is a role the platform grants.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * 289 requireRole call sites — GET/POST across submissions, the whole IND
 * lifecycle, global-RI, authoring PDF and IND master data — ask for
 * `regulatory-author`. Nothing granted it. They passed for exactly one caller,
 * the org admin, through the org-admin stand-in, and refused everyone else.
 *
 * Verified live before the fix, against a provisioned database:
 *
 *   member (the role every invitation mints)  GET /api/submissions → 403 AUTH_004
 *   admin  (the founder)                      GET /api/submissions → 200
 *
 * A regulatory associate who cannot open the Submission Center cannot use this
 * product, which is the whole customer.
 *
 * @compliance 21 CFR Part 11 §11.10(d) — limiting system access to authorized
 *             individuals. Authorization has to be grantable to be limited;
 *             a role nobody holds is not access control, it is a locked door.
 */
import { describe, it, expect } from 'vitest';
import { expandRoleClaims } from '../auth';

const AUTHOR = 'regulatory-author';

describe('expandRoleClaims — org roles carry the functional role the guards name', () => {
  it('grants regulatory-author to every org role that does the work', () => {
    for (const role of ['admin', 'owner', 'manager', 'member', 'editor']) {
      expect(expandRoleClaims(role, undefined), role).toContain(AUTHOR);
    }
  });

  it('does NOT grant it to viewer — read-only is the point of that role', () => {
    expect(expandRoleClaims('viewer', undefined)).not.toContain(AUTHOR);
    expect(expandRoleClaims('viewer', undefined)).toEqual(['viewer']);
  });

  it('does not grant it to an unknown role', () => {
    expect(expandRoleClaims('auditor-from-another-system', undefined)).toEqual([
      'auditor-from-another-system',
    ]);
    expect(expandRoleClaims(undefined, undefined)).toEqual(['user']);
  });

  it('grants nothing beyond the functional role — a member does not become an admin', () => {
    const member = expandRoleClaims('member', undefined);
    expect(member).toEqual(['member', AUTHOR]);
    for (const platform of ['admin', 'super_admin', 'platform_admin', 'support']) {
      expect(member).not.toContain(platform);
    }
  });

  it('keeps the declared roles, and does not duplicate a role already present', () => {
    expect(expandRoleClaims('admin', ['admin', 'user'])).toEqual(['admin', 'user', AUTHOR]);
    expect(expandRoleClaims('member', ['member', AUTHOR])).toEqual(['member', AUTHOR]);
  });

  it('reads the roles array when the token carries one, and the role claim otherwise', () => {
    // A token minted with an explicit roles array (the MFA and session paths).
    expect(expandRoleClaims('user', ['manager'])).toEqual(['manager', AUTHOR]);
    // A token carrying only `role` (the password-login path).
    expect(expandRoleClaims('manager', [])).toEqual(['manager', AUTHOR]);
  });

  it('is case-insensitive about the stored role', () => {
    expect(expandRoleClaims('Member', undefined)).toContain(AUTHOR);
  });
});

describe('the guard the grant exists for', () => {
  it('requireRole(regulatory-author) admits a member and refuses a viewer', async () => {
    const { requireRole } = await import('../auth');
    const guard = requireRole(AUTHOR);

    const run = (role: string) => {
      const req = { user: { role, roles: expandRoleClaims(role, undefined) } } as never;
      let status: number | null = null;
      const res = {
        status(code: number) {
          status = code;
          return this;
        },
        json() {
          return this;
        },
      } as never;
      let passed = false;
      guard(req, res, () => {
        passed = true;
      });
      return { passed, status };
    };

    expect(run('member')).toEqual({ passed: true, status: null });
    expect(run('manager')).toEqual({ passed: true, status: null });
    expect(run('admin')).toEqual({ passed: true, status: null });
    expect(run('viewer')).toEqual({ passed: false, status: 403 });
  });

  it('a member still cannot pass a guard that asks for admin or a platform role', async () => {
    const { requireRole } = await import('../auth');
    const run = (role: string, guard: ReturnType<typeof requireRole>) => {
      const req = { user: { role, roles: expandRoleClaims(role, undefined) } } as never;
      let status: number | null = null;
      const res = {
        status(code: number) {
          status = code;
          return this;
        },
        json() {
          return this;
        },
      } as never;
      let passed = false;
      guard(req, res, () => {
        passed = true;
      });
      return { passed, status };
    };

    expect(run('member', requireRole('admin'))).toEqual({ passed: false, status: 403 });
    expect(run('member', requireRole('super_admin'))).toEqual({ passed: false, status: 403 });
    expect(run('manager', requireRole('platform_admin'))).toEqual({ passed: false, status: 403 });
  });
});

/**
 * The same defect, one layer down, on the path that writes FDA submissions.
 *
 * The lesson above — "a role nobody holds is not access control, it is a locked
 * door" — had not reached the governed device/eSTAR writes. Four route files
 * (510k-estar, 510k-device, cerv2-ai, cerv2-export) each carried a private copy
 * of an editor gate admitting `{admin, owner, editor, super_admin}`. Of those
 * four names only `admin` is an organization role: `owner` and `super_admin`
 * belong to the separate PLATFORM vocabulary, and `editor` appears in no
 * vocabulary in this repository at all. `req.userRole` is resolved from
 * `organization_users.role` and nowhere else, so the gate was admin-only in
 * practice — `manager` refused despite sitting above `member`, and `member`,
 * which SSO provisioning assigns, refused too.
 *
 * A regulatory associate who cannot open the Submission Center cannot use this
 * product. Neither can one who cannot save a device trade name.
 */
describe('GOVERNED_WRITE_ROLES — the governed FDA write gate names roles the platform grants', () => {
  it('admits every organization role except viewer', async () => {
    const { GOVERNED_WRITE_ROLES } = await import('../orgMembership');
    // The documented organization vocabulary (shared/schema.ts, organization_users).
    for (const role of ['admin', 'manager', 'member']) {
      expect(GOVERNED_WRITE_ROLES.has(role), role).toBe(true);
    }
    expect(GOVERNED_WRITE_ROLES.has('viewer')).toBe(false);
  });

  it('names no role the platform cannot grant', async () => {
    const { GOVERNED_WRITE_ROLES } = await import('../orgMembership');
    const ORG_ROLES = ['admin', 'manager', 'member', 'viewer'];
    const PLATFORM_ROLES = ['super_admin', 'platform_admin', 'support', 'business_admin', 'owner'];
    for (const role of GOVERNED_WRITE_ROLES) {
      expect(
        ORG_ROLES.includes(role) || PLATFORM_ROLES.includes(role),
        `${role} is in neither the organization nor the platform vocabulary`,
      ).toBe(true);
    }
  });

  it('is the ONE implementation — no route file keeps a private copy', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const routesDir = path.resolve(__dirname, '..', '..', 'routes');
    const offenders: string[] = [];
    for (const f of fs.readdirSync(routesDir)) {
      if (!/\.(ts|js)$/.test(f)) continue;
      const src = fs.readFileSync(path.join(routesDir, f), 'utf8');
      // A local `allowedRoles` set beside a local requireEditorAccess is the
      // shape of the four copies this replaced. They had already drifted:
      // cerv2-ai ran Number(orgId) with no finiteness check, so a malformed
      // context reached the handler as NaN instead of a 400, and cerv2-export
      // read its org from a different source than its three siblings.
      if (/const\s+allowedRoles\s*=\s*new Set\(/.test(src) && /requireEditorAccess/.test(src)) {
        offenders.push(f);
      }
    }
    expect(offenders, 'route files carrying a private copy of the governed-write gate').toEqual([]);
  });

  it('refuses a viewer, admits a member, and requires a usable org context', async () => {
    const { requireEditorAccess } = await import('../orgMembership');
    const run = (req: Record<string, unknown>) => {
      let status: number | null = null;
      let body: unknown = null;
      const res = {
        status(code: number) {
          status = code;
          return this;
        },
        json(payload: unknown) {
          body = payload;
          return this;
        },
      } as never;
      let passed = false;
      requireEditorAccess(req as never, res, () => {
        passed = true;
      });
      return { passed, status, body, req };
    };

    const ctx = { tenantContext: { organizationId: 2 } };
    expect(run({ userRole: 'viewer', ...ctx }).status).toBe(403);
    expect(run({ userRole: '', ...ctx }).status).toBe(403);
    expect(run({ userRole: 'member', ...ctx }).passed).toBe(true);
    expect(run({ userRole: 'manager', ...ctx }).passed).toBe(true);

    // The role decision comes first: a caller who may not write is refused
    // without the route disclosing whether their org context would resolve.
    expect(run({ userRole: 'viewer' }).status).toBe(403);
    expect(run({ userRole: 'member' }).status).toBe(400);

    // A malformed org context is a 400, never a NaN handed to the handler —
    // the drift that cerv2-ai-routes carried before this consolidation.
    const bad = run({ userRole: 'member', tenantContext: { organizationId: 'not-a-number' } });
    expect(bad.status).toBe(400);
    expect((bad.req as { resolvedOrganizationId?: number }).resolvedOrganizationId).toBeUndefined();

    const ok = run({ userRole: 'member', ...ctx });
    expect((ok.req as { resolvedOrganizationId?: number }).resolvedOrganizationId).toBe(2);
  });
});

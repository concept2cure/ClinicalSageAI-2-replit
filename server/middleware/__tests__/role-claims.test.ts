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

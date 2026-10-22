/**
 * The session's `governed:write` permission and requireEditorAccess agree, for
 * every role, because one is derived from the other's role set. If they ever
 * disagreed, the client would hide a control the server allows or offer one it
 * refuses (T2's UI half; shared/constants/permissions.ts).
 */
import { isSigningAuthorized } from '../../services/part11/signing-authority';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { requireEditorAccess, sessionPermissions } from '../orgMembership';
import {
  AUDIT_ATTEST_PERMISSION,
  AUDIT_ATTEST_ROLES,
  GOVERNED_WRITE_PERMISSION,
  REPORT_FINALIZE_PERMISSION,
  REPORT_FINALIZE_ROLES,
  canAttestAuditTrail,
  canFinalizeReport,
  canGovernedWrite,
} from '../../../shared/constants/permissions';
import { requireRole } from '../auth';

function serverAllows(role: string): boolean {
  let allowed = false;
  const res = { status: () => ({ json: () => undefined }) };
  requireEditorAccess({ user: { role, organizationId: 7 } }, res, () => { allowed = true; });
  return allowed;
}

/**
 * What the finalize route does with a session of `role`: its guard
 * (requireRole(...REPORT_FINALIZE_ROLES)), then signing authority (P1-44b:
 * finalize is a signature, refused 403 ESIGNATURE_NO_AUTHORITY without it).
 */
function finalizeAllows(role: string): boolean {
  let allowed = false;
  const res = { status: () => ({ json: () => undefined }) };
  requireRole(...REPORT_FINALIZE_ROLES)({ user: { role, organizationId: 7 } } as never, res as never, () => { allowed = true; });
  return allowed && isSigningAuthorized(role);
}

describe('sessionPermissions', () => {
  const ROLES = ['admin', 'manager', 'member', 'viewer', 'owner', 'super_admin', 'editor', 'user', 'Admin', 'VIEWER', ''];

  it.each(ROLES)('agrees with requireEditorAccess for role %j', (role) => {
    const offered = sessionPermissions(role).includes(GOVERNED_WRITE_PERMISSION);
    expect(offered).toBe(serverAllows(role));
    expect(canGovernedWrite({ permissions: sessionPermissions(role) })).toBe(serverAllows(role));
  });

  it('gives a viewer nothing and a member the write permission', () => {
    expect(sessionPermissions('viewer')).toEqual([]);
    expect(sessionPermissions(null)).toEqual([]);
    expect(sessionPermissions('member')).toEqual([GOVERNED_WRITE_PERMISSION]);
  });

  it('every auth response that returns a user derives its permissions, none hard-codes an empty list', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'routes', 'auth.ts'), 'utf8');
    expect(src).not.toMatch(/permissions:\s*\[\s*\]/);
    // session, login, dev-login, /me, mfa/verify
    expect(src.match(/permissions:\s*sessionPermissions\(/g)?.length).toBe(5);
  });

  /* Reporting review 2026-10-01: the canvas offers Finalize from this
     permission. It must name exactly the roles the finalize guard admits. */
  it.each(ROLES)('report:finalize agrees with the finalize guard for role %j', (role) => {
    expect(sessionPermissions(role).includes(REPORT_FINALIZE_PERMISSION)).toBe(finalizeAllows(role));
    expect(canFinalizeReport({ permissions: sessionPermissions(role) })).toBe(finalizeAllows(role));
  });

  it('a member is not offered Finalize; under the default signing policy an admin is and a manager is not', () => {
    expect(sessionPermissions('member')).not.toContain(REPORT_FINALIZE_PERMISSION);
    // audit:attest joined on 2026-10-12 (coverage review C-24): an admin may
    // attest to the audit trail, and this exact-equality assertion is what
    // makes a silently added permission visible rather than tolerated.
    expect(sessionPermissions('admin')).toEqual([
      GOVERNED_WRITE_PERMISSION,
      REPORT_FINALIZE_PERMISSION,
      AUDIT_ATTEST_PERMISSION,
    ]);
    // The server refuses a manager's finalize with ESIGNATURE_NO_AUTHORITY unless the
    // signing policy names managers, so the canvas must not offer it (P1-44b R2).
    expect(sessionPermissions('manager')).toEqual([GOVERNED_WRITE_PERMISSION]);
  });

  it('a signing policy that names managers offers them Finalize', () => {
    const before = process.env.ESIGNATURE_SIGNING_ROLES;
    process.env.ESIGNATURE_SIGNING_ROLES = 'admin,manager';
    try {
      expect(sessionPermissions('manager')).toContain(REPORT_FINALIZE_PERMISSION);
    } finally {
      if (before === undefined) delete process.env.ESIGNATURE_SIGNING_ROLES;
      else process.env.ESIGNATURE_SIGNING_ROLES = before;
    }
  });
});

/**
 * The attestation permission and the attestation route's own gate agree, for
 * every role (coverage review C-24).
 *
 * The Compliance Reports surface offered "Run attestation" on the catalog's
 * READER verdict — owner, admin, manager, approver — while the route admits
 * admin and owner. A manager pressed a control the server then refused. The
 * session now derives the permission from the SAME list the route reads, so the
 * two cannot drift; these cases are what holds that.
 */
describe('audit:attest', () => {
  const ROLES = ['owner', 'admin', 'manager', 'approver', 'reviewer', 'member', 'viewer', 'user'];

  it('is the admin|owner set exactly — `withExtendingRoles` must not widen it', () => {
    // ROLE_EXTENDS maps approver→manager and reviewer→member, so neither
    // extends owner or admin. If a future role extended admin, this fails and
    // the widening is a decision rather than a side effect.
    expect([...AUDIT_ATTEST_ROLES].sort()).toEqual(['admin', 'owner']);
  });

  it('is granted to exactly the roles the route admits, and to no other', () => {
    for (const role of ROLES) {
      const granted = sessionPermissions(role).includes(AUDIT_ATTEST_PERMISSION);
      expect(granted, `${role}`).toBe(AUDIT_ATTEST_ROLES.includes(role));
    }
  });

  it('is narrower than governed:write — a manager writes, and does not attest', () => {
    const manager = sessionPermissions('manager');
    expect(manager).toContain(GOVERNED_WRITE_PERMISSION);
    // The gap that produced the doomed click: the catalog's reader verdict
    // includes a manager, the attestation route does not.
    expect(manager).not.toContain(AUDIT_ATTEST_PERMISSION);
  });

  it('an admin holds all three; the three gates are not the same gate', () => {
    const admin = sessionPermissions('admin');
    expect(admin).toContain(GOVERNED_WRITE_PERMISSION);
    expect(admin).toContain(REPORT_FINALIZE_PERMISSION);
    expect(admin).toContain(AUDIT_ATTEST_PERMISSION);
  });

  it('offers the control to a session that carries no permissions array, as the two precedents do', () => {
    // An older session is unknown, not refused: the server still decides, and
    // withholding an administrator's control on a guess is the worse failure.
    expect(canAttestAuditTrail({})).toBe(true);
    expect(canAttestAuditTrail(null)).toBe(true);
    expect(canAttestAuditTrail({ permissions: [] })).toBe(false);
    expect(canAttestAuditTrail({ permissions: [AUDIT_ATTEST_PERMISSION] })).toBe(true);
  });

  it('the client predicate agrees with the session for every role', () => {
    for (const role of ROLES) {
      const perms = sessionPermissions(role);
      expect(canAttestAuditTrail({ permissions: perms }), `${role}`).toBe(
        AUDIT_ATTEST_ROLES.includes(role),
      );
    }
  });
});

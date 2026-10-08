/**
 * Product decision P-18 (docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-08):
 * signing authority is assigned, by role, to named people. An administrator can
 * assign `approver` and `reviewer` in Admin and access, with a reason, like any
 * membership change. An approver may do everything a manager may, and sign; a
 * reviewer may do everything a member may, and sign. The signing policy itself
 * (server/services/part11/signing-authority.ts) does not change: a manager
 * still does not sign.
 *
 * One rule (shared/constants/org-roles.ts) widens every allow-list that admits
 * the role a signing role extends; nothing widens a manager or a member.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

import { rolesHeldBy, withExtendingRoles, ASSIGNABLE_ORG_ROLES } from '../../../shared/constants/org-roles';
import { REPORT_FINALIZE_ROLES, REPORT_FINALIZE_PERMISSION, GOVERNED_WRITE_PERMISSION } from '../../../shared/constants/permissions';
import { GOVERNED_WRITE_ROLES, sessionPermissions } from '../orgMembership';
import { expandRoleClaims, requireRole } from '../auth';
import { isSigningAuthorized } from '../../services/part11/signing-authority';
import { AUDIT_READER_ROLES } from '../../services/audit/audit-api-authority';
import { PRIVILEGED_ORG_ROLES } from '../../services/audit/compliance-reports/queries/access-review';
import { canMutateProgram, canCreateProgram } from '../../services/c2c/program-access';
import { canEditProject, canManageProject } from '../../services/project-sharing-access';
import { DEFAULT_POLICY, evaluate } from '../../services/governance/permissions';
import { RBACService } from '../../services/roleBasedAccess';

const project = { createdById: 99, ownerId: 99, settings: { sharing: { visibility: 'private', members: [] } } };

function guard(mw: ReturnType<typeof requireRole>, role: string, roles?: string[]): number {
  let status = 200;
  const req = { user: { id: '1', role, roles: roles ?? expandRoleClaims(role, undefined) } } as unknown as Request;
  const res = {
    status(code: number) { status = code; return this; },
    json() { return this; },
  } as unknown as Response;
  mw(req, res, () => undefined);
  return status;
}

describe('the rule: a signing role holds the role it extends, never the reverse', () => {
  it('approver holds manager, reviewer holds member; manager and member gain nothing', () => {
    expect(rolesHeldBy('approver')).toEqual(['approver', 'manager']);
    expect(rolesHeldBy('Reviewer')).toEqual(['reviewer', 'member']);
    expect(rolesHeldBy('manager')).toEqual(['manager']);
    expect(rolesHeldBy('member')).toEqual(['member']);
    expect(rolesHeldBy(null)).toEqual([]);
    expect(withExtendingRoles(['admin', 'manager'])).toEqual(['admin', 'manager', 'approver']);
    expect(withExtendingRoles(['viewer'])).toEqual(['viewer']);
  });

  it('an administrator can assign both', () => {
    expect(ASSIGNABLE_ORG_ROLES).toEqual(expect.arrayContaining(['admin', 'approver', 'manager', 'reviewer', 'member', 'viewer']));
  });
});

describe('an approver may do everything a manager may, and sign', () => {
  it('signs (policy unchanged: a manager still does not)', () => {
    expect(isSigningAuthorized('approver')).toBe(true);
    expect(isSigningAuthorized('reviewer')).toBe(true);
    expect(isSigningAuthorized('manager')).toBe(false);
  });

  it('writes governed records and finalizes reports, which needs both the manager tier and signing', () => {
    expect(GOVERNED_WRITE_ROLES.has('approver')).toBe(true);
    expect(REPORT_FINALIZE_ROLES).toContain('approver');
    expect(sessionPermissions('approver')).toEqual([GOVERNED_WRITE_PERMISSION, REPORT_FINALIZE_PERMISSION]);
    expect(sessionPermissions('manager')).toEqual([GOVERNED_WRITE_PERMISSION]);
  });

  it('passes every requireRole that admits a manager, and gets the regulatory-author grant', () => {
    expect(guard(requireRole('owner', 'admin', 'manager'), 'approver')).toBe(200);
    expect(guard(requireRole('regulatory-author'), 'approver')).toBe(200);
    // A token minted before the claim expansion still passes: requireRole applies the same rule.
    expect(guard(requireRole('owner', 'admin', 'manager'), 'approver', ['approver', 'user'])).toBe(200);
    expect(guard(requireRole('owner', 'admin', 'manager'), 'reviewer')).toBe(403);
  });

  it('administers programs and projects, reads the audit trail, and is reported as privileged', () => {
    expect(canMutateProgram({ actor: { userId: 1, orgRole: 'approver' }, program: { leadUserId: 2 } })).toBe(true);
    expect(canEditProject({ actor: { userId: 1, orgRole: 'approver' }, project })).toBe(true);
    expect(canManageProject({ actor: { userId: 1, orgRole: 'approver' }, project })).toBe(true);
    expect(AUDIT_READER_ROLES).toContain('approver');
    expect(PRIVILEGED_ORG_ROLES).toContain('approver');
  });

  it('meets the manager tier of the RBAC hierarchy (AnA command minimum roles)', async () => {
    const svc = new RBACService();
    vi.spyOn(svc, 'getUserRoles').mockResolvedValue(['approver']);
    expect(await svc.hasRole(1, 'manager', 1)).toBe(true);
    expect(await svc.hasRole(1, 'admin', 1)).toBe(false);
  });

  it('holds every governance action a manager holds', () => {
    for (const action of ['view', 'author', 'review', 'approve', 'sign', 'assign'] as const) {
      expect(evaluate(DEFAULT_POLICY, 'approver', { action }), action).toBe(evaluate(DEFAULT_POLICY, 'manager', { action }));
    }
  });
});

describe('a reviewer is admitted wherever a member is, and signs', () => {
  it('writes governed records, does not finalize reports (a member does not)', () => {
    expect(GOVERNED_WRITE_ROLES.has('reviewer')).toBe(true);
    expect(sessionPermissions('reviewer')).toEqual([GOVERNED_WRITE_PERMISSION]);
  });

  it('gets the regulatory-author grant a member gets, and creates programs', () => {
    expect(expandRoleClaims('reviewer', undefined)).toContain('regulatory-author');
    expect(guard(requireRole('member'), 'reviewer')).toBe(200);
    expect(canCreateProgram({ orgRole: 'reviewer' })).toBe(true);
  });

  it('meets the member tier, not the manager tier', async () => {
    const svc = new RBACService();
    vi.spyOn(svc, 'getUserRoles').mockResolvedValue(['reviewer']);
    expect(await svc.hasRole(1, 'member', 1)).toBe(true);
    expect(await svc.hasRole(1, 'manager', 1)).toBe(false);
  });

  it('holds every governance action a member holds, and sign', () => {
    for (const action of ['view', 'author', 'review'] as const) {
      expect(evaluate(DEFAULT_POLICY, 'reviewer', { action }), action).toBe(true);
    }
    expect(evaluate(DEFAULT_POLICY, 'reviewer', { action: 'sign' })).toBe(true);
    expect(evaluate(DEFAULT_POLICY, 'reviewer', { action: 'approve' })).toBe(false);
  });

  it('is not a manager anywhere', () => {
    expect(canMutateProgram({ actor: { userId: 1, orgRole: 'reviewer' }, program: { leadUserId: 2 } })).toBe(false);
    expect(AUDIT_READER_ROLES).not.toContain('reviewer');
  });
});

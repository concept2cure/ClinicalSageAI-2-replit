import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { authoringPrincipalFromRequest, decideAuthoringPermission, type AuthoringPermissionAction } from '../authoring-permissions';

const scope = { tenantId: 2, docId: 'owned-document', sectionId: null, documentStatus: 'draft', createdBy: '1' };
const request = (identity?: Record<string, unknown>, organizationRole?: string): Request => ({
  user: { id: '1', userId: '1', organizationId: 2, email: 'OWNER@EXAMPLE.TEST', role: 'admin', roles: ['ADMIN', 'PLATFORM_ADMIN'], organizationRole },
  identity,
} as unknown as Request);

describe('current authoring principal', () => {
  it('replaces stale admin claims with the uncached role for this actor and organization', () => {
    expect(authoringPrincipalFromRequest(request({ legacyUserId: 1, organizationId: 2, role: ' viewer ' }, 'admin')))
      .toEqual({ id: '1', email: 'owner@example.test', roles: ['VIEWER'] });
  });

  it.each([
    { legacyUserId: 99, organizationId: 2, role: 'admin' },
    { legacyUserId: 1, organizationId: 99, role: 'admin' },
    { legacyUserId: 1, organizationId: 2, role: '' },
  ])('does not borrow a foreign or empty identity role: %j', identity => {
    expect(authoringPrincipalFromRequest(request(identity, 'viewer'))?.roles).toEqual(['VIEWER']);
  });

  it('uses the verified membership role when no request identity is attached', () => {
    expect(authoringPrincipalFromRequest(request(undefined, 'member'))?.roles).toEqual(['MEMBER']);
  });

  it('preserves existing claims for a legacy principal with no membership role', () => {
    expect(authoringPrincipalFromRequest(request())?.roles).toEqual(['ADMIN', 'PLATFORM_ADMIN']);
  });
});

describe('organization read-only authority precedes durable object grants', () => {
  const actions: AuthoringPermissionAction[] = ['edit', 'comment', 'review', 'approve', 'export', 'manage_permissions'];
  it.each(['viewer', ' VIEWER ', 'readonly', 'read_only', 'guest'])('%s cannot use OWNER or stale admin to write', async role => {
    const query = vi.fn().mockResolvedValue({ rows: [{ role: 'OWNER' }, { role: 'AUTHOR' }] });
    for (const action of actions) {
      const decision = await decideAuthoringPermission({ pool: { query }, scope, action,
        principal: { id: '1', email: 'owner@example.test', roles: [role, 'ADMIN'] } });
      expect(decision, action).toMatchObject({ allowed: false, reason: 'organization-read-only' });
    }
  });

  it('retains current viewer reads through the existing object ACL', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ role: 'OWNER' }] });
    expect(await decideAuthoringPermission({ pool: { query }, scope, action: 'view',
      principal: { id: '1', email: null, roles: ['VIEWER'] } }))
      .toMatchObject({ allowed: true, reason: 'allowed-object-role', matchedRoles: ['OWNER'] });
  });

  it('preserves the narrower ACL for writing and unknown custom organization roles', async () => {
    for (const role of ['MEMBER', 'MANAGER', 'REVIEWER', 'APPROVER', 'custom-tenant-role']) {
      const query = vi.fn().mockResolvedValue({ rows: [{ role: 'REVIEWER' }] });
      const principal = { id: '1', email: null, roles: [role] };
      expect((await decideAuthoringPermission({ pool: { query }, scope, action: 'edit', principal })).allowed, role).toBe(false);
      expect((await decideAuthoringPermission({ pool: { query }, scope, action: 'review', principal })).allowed, role).toBe(true);
    }
  });
});

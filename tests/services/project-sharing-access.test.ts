import { describe, expect, it } from 'vitest';
import {
  applyProjectSharingState,
  canManageProject,
  canUseProject,
  getProjectSharingState,
} from '../../server/services/project-sharing-access';

describe('project-sharing-access', () => {
  it('defaults to org_public when no sharing settings are present', () => {
    const sharing = getProjectSharingState({
      settings: {},
      ownerId: 11,
      createdById: 11,
    });

    expect(sharing.visibility).toBe('org_public');
    expect(sharing.legacyFallbackApplied).toBe(true);
    expect(sharing.members.some(m => m.userId === 11 && m.role === 'owner')).toBe(true);
  });

  it('honors explicit private sharing for member use access', () => {
    const settings = applyProjectSharingState(
      {},
      {
        visibility: 'private',
        legacyFallbackApplied: false,
        members: [
          { userId: 20, role: 'use', status: 'active' },
          { userId: 30, role: 'edit', status: 'active' },
        ],
      }
    );

    expect(
      canUseProject({
        actor: { userId: 20, orgRole: 'member' },
        project: { createdById: 1, ownerId: 1, settings },
      })
    ).toBe(true);

    expect(
      canUseProject({
        actor: { userId: 99, orgRole: 'member' },
        project: { createdById: 1, ownerId: 1, settings },
      })
    ).toBe(false);
  });

  it('allows org managers to manage regardless of explicit membership', () => {
    const settings = applyProjectSharingState(
      {},
      {
        visibility: 'private',
        legacyFallbackApplied: false,
        members: [{ userId: 50, role: 'use', status: 'active' }],
      }
    );

    expect(
      canManageProject({
        actor: { userId: 77, orgRole: 'admin' },
        project: { createdById: 1, ownerId: 1, settings },
      })
    ).toBe(true);
  });
});

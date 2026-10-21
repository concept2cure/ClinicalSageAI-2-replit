import { describe, expect, it } from 'vitest';
import { isProjectSharingResponse, type ProjectSharingResponse, type ProjectSharingScope } from '../project-sharing';

const scope: ProjectSharingScope = { programId: '11111111-1111-4111-8111-111111111111', projectId: 51,
  actorUserId: 7, organizationId: 4, clientWorkspaceId: 9 };
function response(): ProjectSharingResponse {
  return { projectId: 'proj_51', programId: scope.programId, actorUserId: 7, organizationId: 4, clientWorkspaceId: 9,
    visibility: 'private', legacyFallbackApplied: false, canManage: true, candidates: [{ userId: 8, label: 'Alex · Account #8' }],
    members: [{ userId: 8, role: 'use', status: 'active', addedById: 7, addedAt: null,
      explicit: true, implicitSources: [], canSetRole: true, canRevoke: true }] };
}
describe('existing sharing response scope and controls', () => {
  it('accepts a complete current scope and a server-derived workspace when none was selected', () => {
    expect(isProjectSharingResponse(response(), scope)).toBe(true);
    expect(isProjectSharingResponse(response(), { ...scope, clientWorkspaceId: null })).toBe(true);
  });
  it.each([
    { programId: null }, { programId: '22222222-2222-4222-8222-222222222222' }, { projectId: 'proj_52' },
    { projectId: '51' }, { organizationId: 5 }, { actorUserId: 9 }, { clientWorkspaceId: 10 },
    { clientWorkspaceId: null }, { visibility: 'public' }, { canManage: 'true' }, { legacyFallbackApplied: null },
    { members: null }, { candidates: null },
  ])('rejects wrong or unverifiable scope/shape %j', over => {
    expect(isProjectSharingResponse({ ...response(), ...over }, scope)).toBe(false);
  });
  it.each([
    { userId: 0 }, { role: 'approve' }, { status: 'revoked' }, { explicit: 'true' }, { addedById: 1.5 },
    { addedAt: 'not a timestamp' }, { canRevoke: 'true' }, { implicitSources: ['lead'] },
    { implicitSources: ['project_owner', 'project_owner'] }, { explicit: false },
    { role: 'owner' }, { implicitSources: ['project_creator'] },
  ])('rejects malformed or unsafe member controls %j', over => {
    const data = response(); data.members = [{ ...data.members[0], ...over } as never];
    expect(isProjectSharingResponse(data, scope)).toBe(false);
  });
  it('accepts protected owner and creator facts only with both controls disabled', () => {
    const data = response(); data.members = [{ ...data.members[0], role: 'owner', explicit: false,
      implicitSources: ['project_owner', 'project_creator'], canSetRole: false, canRevoke: false }];
    expect(isProjectSharingResponse(data, scope)).toBe(true);
  });
  it('does not let a nonmanager receive the candidate roster or active controls', () => {
    const data = response(); data.canManage = false;
    expect(isProjectSharingResponse(data, scope)).toBe(false);
    data.candidates = [];
    expect(isProjectSharingResponse(data, scope)).toBe(false);
    data.members = data.members.map(member => ({ ...member, canSetRole: false, canRevoke: false }));
    expect(isProjectSharingResponse(data, scope)).toBe(true);
  });
  it('rejects duplicate member/candidate identities and empty identity labels', () => {
    const members = response(); members.members.push(members.members[0]);
    expect(isProjectSharingResponse(members, scope)).toBe(false);
    const candidates = response(); candidates.candidates.push(candidates.candidates[0]);
    expect(isProjectSharingResponse(candidates, scope)).toBe(false);
    const empty = response(); empty.candidates[0].label = ' ';
    expect(isProjectSharingResponse(empty, scope)).toBe(false);
  });
});

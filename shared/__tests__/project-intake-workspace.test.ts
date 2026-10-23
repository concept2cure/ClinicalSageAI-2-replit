import { describe, expect, it } from 'vitest';
import { isProjectIntakeReceipt, isProjectIntakeWorkspaces, projectIntakeId } from '../project-intake-workspace';
const actor = { actorUserId: 12, organizationId: 7 };
const workspace = { id: '21', name: 'Sponsor A', organizationId: '7', status: 'active' as const };
const directory = () => ({ success: true, clients: [{ ...workspace }], meta: { purpose: 'project-intake', ...actor } });
const receipt = () => ({ data: { id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }, meta: { created: true, projectAnchorId: 31, ...actor, clientWorkspaceId: 21, clientWorkspaceName: 'Sponsor A' } });
describe('the creator-bound project intake wire', () => {
  it('admits a verified active list, including a genuine empty list', () => {
    expect(isProjectIntakeWorkspaces(directory(), actor)).toBe(true);
    expect(isProjectIntakeWorkspaces({ ...directory(), clients: [] }, actor)).toBe(true);
  });
  it.each([null, [], {}, { ...directory(), success: false }, { ...directory(), clients: null }, { ...directory(), meta: { ...actor, purpose: 'other' } }])('rejects malformed directory envelope %j', body => {
    expect(isProjectIntakeWorkspaces(body, actor)).toBe(false);
  });
  it.each([0, -1, 1.5, '01', '1.5', '', '2147483648', true, null, undefined])('rejects invalid database identifier %j', id => {
    expect(projectIntakeId(id)).toBeNull();
  });
  it('admits only a created UUID program linked to the exact actor, parent and name', () => {
    expect(isProjectIntakeReceipt(receipt(), actor, workspace)).toBe(true);
    for (const meta of [{ actorUserId: 99 }, { organizationId: 99 }, { created: false }, { projectAnchorId: '31' }, { projectAnchorId: 0 }, { clientWorkspaceId: 22 }, { clientWorkspaceName: 'Sponsor B' }]) {
      const body = receipt();
      expect(isProjectIntakeReceipt({ ...body, meta: { ...body.meta, ...meta } }, actor, workspace)).toBe(false);
    }
    expect(isProjectIntakeReceipt({ ...receipt(), data: { id: 'new' } }, actor, workspace)).toBe(false);
  });
});

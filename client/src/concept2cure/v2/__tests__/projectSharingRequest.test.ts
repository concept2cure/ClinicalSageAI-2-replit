/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import type { ProjectSharingResponse, ProjectSharingScope } from '@shared/project-sharing';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: request }));
import { ApiRequestError } from '@/lib/queryClient';
import { requestProjectSharing } from '../surfaces/projectSharingRequest';

const scope: ProjectSharingScope = { programId: '11111111-1111-4111-8111-111111111111', projectId: 51,
  actorUserId: 7, organizationId: 4, clientWorkspaceId: 9 };
const token = (id = 7, org = 4) => `x.${btoa(JSON.stringify({ userId: id, organizationId: org }))}.x`;
function data(): ProjectSharingResponse {
  return { projectId: 'proj_51', programId: scope.programId, actorUserId: 7, organizationId: 4, clientWorkspaceId: 9,
    visibility: 'private', legacyFallbackApplied: false, canManage: true, candidates: [{ userId: 8, label: 'Alex' }],
    members: [{ userId: 8, role: 'edit', status: 'active', addedById: 7, addedAt: null,
      explicit: true, implicitSources: [], canSetRole: true, canRevoke: true }] };
}
const reply = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body }) as Response;
beforeEach(() => { setAuthToken(token()); });
afterEach(() => { clearAuthToken(); request.mockReset(); });

describe('project sharing confirmed and unconfirmed outcomes', () => {
  it('preserves numeric anchor, canonical UUID, chosen role and captured actor/workspace headers', async () => {
    request.mockResolvedValue(reply({ success: true, data: data(), meta: { auditTrail: { persisted: true, chained: false } } }));
    expect(await requestProjectSharing(scope, () => true, 'PUT', { memberId: 8, role: 'edit' })).toEqual({ kind: 'confirmed', data: data(), auditWarning: null });
    expect(request).toHaveBeenCalledWith('PUT', `/api/concept2cure/projects/51/sharing/members/8?programId=${scope.programId}`,
      { role: 'edit' }, { Authorization: `Bearer ${token()}`, 'x-organization-id': '4', 'x-client-id': '9' });
  });
  it.each([
    { persisted: false, chained: false }, {}, { persisted: true, attributed: false },
  ])('keeps confirmed data but states an unconfirmed audit outcome %j', async auditTrail => {
    request.mockResolvedValue(reply({ success: true, data: data(), meta: { auditTrail } }));
    const answer = await requestProjectSharing(scope, () => true, 'PUT', { memberId: 8, role: 'edit' });
    expect(answer.kind).toBe('confirmed');
    expect(answer.kind === 'confirmed' && answer.auditWarning).toMatch(/audit/);
  });
  it.each([new Error('network lost'), new ApiRequestError('Failed', 503)])('does not report rollback or automatically resend an uncertain write', async error => {
    request.mockRejectedValue(error);
    const answer = await requestProjectSharing(scope, () => true, 'DELETE', { memberId: 8 });
    expect(answer.kind).toBe('unconfirmed');
    expect('message' in answer && answer.message).toMatch(/Refresh sharing before retrying/);
    expect(request).toHaveBeenCalledOnce();
  });
  it.each([null, { ...data(), projectId: 'proj_52' }, { ...data(), members: [] }])('rejects ambiguous success receipts for the submitted PUT', async body => {
    request.mockResolvedValue(reply({ success: true, data: body }));
    expect((await requestProjectSharing(scope, () => true, 'PUT', { memberId: 8, role: 'edit' })).kind).toBe('unconfirmed');
  });
  it('does not confirm a revoke while its explicit share still exists', async () => {
    request.mockResolvedValue(reply({ success: true, data: data() }));
    expect((await requestProjectSharing(scope, () => true, 'DELETE', { memberId: 8 })).kind).toBe('unconfirmed');
  });
  it('retains a server refusal sentence and keeps GET outages distinct', async () => {
    request.mockRejectedValue(new ApiRequestError('Refused', 409, { error: { message: 'The explicit share is already revoked.' } }));
    const result = await requestProjectSharing(scope, () => true, 'DELETE', { memberId: 8 });
    expect(result).toEqual({ kind: 'refused', message: 'The explicit share is already revoked.' });
    request.mockRejectedValue(new Error('offline'));
    expect((await requestProjectSharing(scope, () => true)).kind).toBe('unavailable');
  });
});

describe('sharing request ownership', () => {
  it('does not issue an old handler after account, organization or scope changes', async () => {
    setAuthToken(token(9));
    expect((await requestProjectSharing(scope, () => true, 'PUT', { memberId: 8, role: 'edit' })).kind).toBe('retired');
    setAuthToken(token(7, 5));
    expect((await requestProjectSharing(scope, () => true)).kind).toBe('retired');
    setAuthToken(token());
    expect((await requestProjectSharing(scope, () => false)).kind).toBe('retired');
    expect(request).not.toHaveBeenCalled();
  });
  it('discards a late receipt after its program/session was retired', async () => {
    let resolve!: (value: Response) => void; let current = true;
    request.mockReturnValue(new Promise(done => { resolve = done; }));
    const pending = requestProjectSharing(scope, () => current, 'PUT', { memberId: 8, role: 'edit' });
    current = false; resolve(reply({ success: true, data: data(), meta: { auditTrail: { persisted: true } } }));
    expect((await pending).kind).toBe('retired');
  });
});

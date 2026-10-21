/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import type { ProjectSharingResponse } from '@shared/project-sharing';
const request = vi.hoisted(() => vi.fn());
const identity = vi.hoisted(() => ({ user: { id: '7', organizationId: '4' } as { id: string; organizationId: string } | null }));
const tenant = vi.hoisted(() => ({ currentOrganization: { id: 4 }, currentClientWorkspace: { id: '9', organizationId: '4' } }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: request }));
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuthUser: () => identity.user }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => tenant }));
import { ProjectTeamSharing } from '../surfaces/ProjectTeamSharing';

const PID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const token = (id = 7, org = 4) => `x.${btoa(JSON.stringify({ userId: id, organizationId: org }))}.x`;
const url = (suffix = '') => `/api/concept2cure/projects/51/sharing${suffix}?programId=${PID}`;
const receipt = (data: unknown, auditTrail: unknown = { persisted: true, chained: false }) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data, meta: { auditTrail } }) }) as Response;
function sharing(): ProjectSharingResponse {
  return { projectId: 'proj_51', programId: PID, organizationId: 4, actorUserId: 7, clientWorkspaceId: 9,
    visibility: 'org_public', legacyFallbackApplied: false, canManage: true,
    candidates: [{ userId: 7, label: 'Coordinator' }, { userId: 8, label: 'Client colleague' }, { userId: 9, label: 'New colleague' }],
    members: [
      { userId: 7, role: 'owner', status: 'active', addedById: null, addedAt: null, explicit: false,
        implicitSources: ['project_owner', 'project_creator'], canSetRole: false, canRevoke: false },
      { userId: 8, role: 'use', status: 'active', addedById: 7, addedAt: null, explicit: true,
        implicitSources: [], canSetRole: true, canRevoke: true },
    ] };
}
function pendingRead() {
  let resolve!: (response: Response) => void;
  return { response: new Promise<Response>(done => { resolve = done; }), resolve: (response: Response) => resolve(response) };
}
let current: ProjectSharingResponse;
const changed = vi.fn();
const props = () => ({ programId: PID, projectId: 51, onChanged: changed });
async function chooseGrant(role = 'edit') {
  fireEvent.change(await screen.findByLabelText('Organization member'), { target: { value: '9' } });
  fireEvent.change(screen.getByLabelText('New sharing role'), { target: { value: role } });
  fireEvent.click(screen.getByRole('button', { name: 'Grant sharing' }));
}
beforeEach(() => {
  current = sharing(); changed.mockReset(); identity.user = { id: '7', organizationId: '4' };
  tenant.currentOrganization = { id: 4 }; tenant.currentClientWorkspace = { id: '9', organizationId: '4' };
  setAuthToken(token()); request.mockImplementation(async () => receipt(current));
});
afterEach(() => { cleanup(); clearAuthToken(); request.mockReset(); });

describe('reached canonical sharing membership operations', () => {
  it('grants the chosen Use role to an exact account and rereads the saved state', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'PUT') current.members.push({ userId: 9, role: 'use', status: 'active', addedById: 7, addedAt: null,
        explicit: true, implicitSources: [], canSetRole: true, canRevoke: true });
      return receipt(current);
    });
    render(<ProjectTeamSharing {...props()} />); await chooseGrant('use');
    await screen.findByText('Project sharing saved.');
    await waitFor(() => expect(request.mock.calls.filter(([method]) => method === 'GET')).toHaveLength(2));
    expect(request).toHaveBeenCalledWith('PUT', url('/members/9'), { role: 'use' }, expect.objectContaining({ 'x-client-id': '9' }));
    expect(changed).toHaveBeenCalledOnce();
    expect((await screen.findByLabelText('Sharing role for New colleague') as HTMLSelectElement).value).toBe('use');
    expect(screen.queryByText(/audit entry could not/)).toBeNull();
  });

  it('prevents overlapping role saves and protects normalized owner/creator rows', async () => {
    const pending = pendingRead();
    request.mockImplementation((method: string) => method === 'PUT' ? pending.response : Promise.resolve(receipt(current)));
    render(<ProjectTeamSharing {...props()} />);
    const select = await screen.findByLabelText('Sharing role for Client colleague');
    expect(screen.queryByLabelText('Sharing role for Coordinator')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Revoke explicit share for Coordinator' })).toBeNull();
    fireEvent.change(select, { target: { value: 'edit' } });
    const save = screen.getByRole('button', { name: 'Save sharing role for Client colleague' });
    fireEvent.click(save); fireEvent.click(save);
    expect(request.mock.calls.filter(([method]) => method === 'PUT')).toHaveLength(1);
    expect((screen.getByRole('button', { name: 'Grant sharing' }) as HTMLButtonElement).disabled).toBe(true);
    current.members[1].role = 'edit'; await act(async () => pending.resolve(receipt(current)));
    await screen.findByText('Project sharing saved.');
  });

  it('confirms explicit revocation and states remaining policy access without removing identity history', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'DELETE') current.members = current.members.filter(member => member.userId !== 8);
      return receipt(current);
    });
    render(<ProjectTeamSharing {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke explicit share for Client colleague' }));
    expect(request.mock.calls.some(([method]) => method === 'DELETE')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke share' }));
    await screen.findByText(/Explicit share revoked\. Owner, creator, organization management/);
    expect(request).toHaveBeenCalledWith('DELETE', url('/members/8'), undefined, expect.any(Object));
    expect(changed).toHaveBeenCalledOnce();
    expect(screen.queryByText(/loses all access|removed from organization/i)).toBeNull();
  });
});

describe('honest sharing outcomes', () => {
  it('preserves the audit persistence warning while team refresh hides private account choices', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'PUT') current.members[1].role = 'edit';
      return receipt(current, method === 'PUT' ? { persisted: false } : { persisted: true });
    });
    const view = render(<ProjectTeamSharing {...props()} />);
    fireEvent.change(await screen.findByLabelText('Sharing role for Client colleague'), { target: { value: 'edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save sharing role for Client colleague' }));
    await screen.findByText(/sharing change was saved, but its audit entry could not be confirmed/);
    view.rerender(<ProjectTeamSharing {...props()} suspended />);
    expect(screen.getByText(/audit entry could not be confirmed/)).toBeTruthy();
    expect(screen.queryByLabelText('Organization member')).toBeNull();
    expect(screen.queryByText('Client colleague', { exact: true })).toBeNull();
    expect(screen.queryByText('New colleague', { exact: true })).toBeNull();
    const count = request.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh sharing' }));
    expect(request).toHaveBeenCalledTimes(count);
  });

  it('requires a read after an unconfirmed transport outcome and never automatically repeats the save', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'PUT') { current.members[1].role = 'edit'; throw new Error('connection lost after write'); }
      return receipt(current);
    });
    render(<ProjectTeamSharing {...props()} />);
    fireEvent.change(await screen.findByLabelText('Sharing role for Client colleague'), { target: { value: 'edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save sharing role for Client colleague' }));
    await screen.findByText(/Could not confirm the sharing change\. Refresh sharing before retrying/);
    expect((screen.getByRole('button', { name: 'Grant sharing' }) as HTMLButtonElement).disabled).toBe(true);
    expect(request.mock.calls.filter(([method]) => method === 'PUT')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh sharing' }));
    await waitFor(() => expect((screen.getByLabelText('Sharing role for Client colleague') as HTMLSelectElement).value).toBe('edit'));
    expect(request.mock.calls.filter(([method]) => method === 'PUT')).toHaveLength(1);
  });

  it('refuses invalid sharing scope without exposing candidate controls', async () => {
    request.mockResolvedValue(receipt({ ...current, programId: OTHER }));
    render(<ProjectTeamSharing {...props()} />);
    await screen.findByText("Couldn't load project sharing");
    expect(screen.queryByLabelText('Organization member')).toBeNull();
    expect(screen.queryByText('New colleague')).toBeNull();
  });
});

describe('sharing session ownership', () => {
  it('does not call a save after the token account changes before React receives the new user', async () => {
    render(<ProjectTeamSharing {...props()} />);
    await screen.findByLabelText('Organization member'); setAuthToken(token(12));
    await chooseGrant();
    expect(request.mock.calls.some(([method]) => method === 'PUT')).toBe(false);
  });

  it('discards a late old-program grant receipt without refreshing its parent or showing its notice', async () => {
    const pending = pendingRead();
    request.mockImplementation((method: string, path: string) => {
      if (method === 'PUT') return pending.response;
      return Promise.resolve(receipt(path.includes(OTHER) ? { ...current, projectId: 'proj_52', programId: OTHER } : current));
    });
    const view = render(<ProjectTeamSharing {...props()} />); await chooseGrant();
    view.rerender(<ProjectTeamSharing {...props()} programId={OTHER} projectId={52} />);
    await screen.findByLabelText('Organization member');
    const oldReceipt = sharing(); oldReceipt.members.push({ ...oldReceipt.members[1], userId: 9, role: 'edit' });
    await act(async () => pending.resolve(receipt(oldReceipt)));
    expect(changed).not.toHaveBeenCalled();
    expect(screen.queryByText('Project sharing saved.')).toBeNull();
  });

  it('retains no old sharing controls across account, organization or workspace changes', async () => {
    const pending = pendingRead(); const view = render(<ProjectTeamSharing {...props()} />);
    await screen.findByLabelText('Organization member');
    request.mockImplementation(() => pending.response);
    identity.user = { id: '12', organizationId: '5' }; setAuthToken(token(12, 5));
    tenant.currentOrganization = { id: 5 }; tenant.currentClientWorkspace = { id: '10', organizationId: '5' };
    view.rerender(<ProjectTeamSharing {...props()} />);
    expect(screen.queryByLabelText('Organization member')).toBeNull();
    expect(screen.queryByText('Client colleague')).toBeNull();
    expect(request.mock.calls.at(-1)?.[3]).toEqual({ Authorization: `Bearer ${token(12, 5)}`, 'x-organization-id': '5', 'x-client-id': '10' });
  });
});

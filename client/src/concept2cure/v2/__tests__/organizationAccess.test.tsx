// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
const { apiRequest, switchOrg, owner } = vi.hoisted(() => ({ apiRequest: vi.fn(), switchOrg: vi.fn(), owner: { id: '33', organizationId: '7', organizationName: 'Current', roles: ['member'] } }));
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: owner, logout: vi.fn() }), authService: { getUser: () => owner } }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ currentOrganization: { id: 7, name: 'Current' } }) }));
vi.mock('../switchOrganization', async (original) => ({ ...(await original<typeof import('../switchOrganization')>()), switchOrganization: switchOrg }));
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import { TopBar } from '../Shell';
import { __resetCeremonies } from '../ceremony';
import { registerCeremonyOpen } from '../ceremony';
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
let pending: boolean;
beforeEach(() => {
  __resetCeremonies(); apiRequest.mockReset(); switchOrg.mockReset(); pending = true;
  localStorage.setItem('currentOrganizationId', '7');
  setAuthToken(`test.${btoa(JSON.stringify({ userId: 33, organizationId: 7 }))}.synthetic`);
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'POST') { pending = false; return reply({ success: true, data: { invitationId: 52, organizationId: 9, userId: 33, status: 'accepted', role: 'reviewer' } }); }
    if (path === '/api/auth/enterprise/organizations') return reply([{ id: 7, name: 'Current', role: 'member', status: 'active' }, { id: 9, name: 'Sponsor', role: 'reviewer', status: 'active' }]);
    if (path === '/api/tenant-users/invitations/mine') return reply(pending ? [{ id: 52, organizationId: 9, organizationName: 'Sponsor', email: 'ada@c2c.test', status: 'pending', role: 'reviewer' }] : []);
    return reply({ data: [] });
  });
});
afterEach(() => { cleanup(); localStorage.clear(); clearAuthToken(); __resetCeremonies(); });
const mount = () => render(<TopBar surface={{ id: 'projects', label: 'Projects' }} segment="biopharma" onSegment={vi.fn()} onPalette={vi.fn()} onNav={vi.fn()} />);
async function open() { mount(); fireEvent.click(screen.getByRole('button', { name: 'Organizations and invitations' })); await screen.findByRole('button', { name: 'Switch to Sponsor' }); }
describe('membership consent and switching in the actual shell', () => {
  it('lets the recipient accept and decline persisted invitations without switching their session', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation from Sponsor' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Accept invitation' }));
    expect(await screen.findByText('No pending invitations.')).toBeTruthy();
    expect(apiRequest.mock.calls.some(([m,p]) => m === 'POST' && p === '/api/tenant-users/invitations/52/accept')).toBe(true);
    expect(switchOrg).not.toHaveBeenCalled();
  });
  it('lets the recipient decline without creating membership or switching', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Decline invitation from Sponsor' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Decline invitation' }));
    expect(await screen.findByText('No pending invitations.')).toBeTruthy();
    expect(apiRequest.mock.calls.some(([m,p]) => m === 'POST' && p === '/api/tenant-users/invitations/52/decline')).toBe(true);
    expect(switchOrg).not.toHaveBeenCalled();
  });
  it('offers a confirmed switch to a returned membership, never the current one', async () => {
    await open();
    expect(screen.getByRole('button', { name: 'Switch to Current' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Sponsor' }));
    expect(switchOrg).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Switch organization' }));
    await waitFor(() => expect(switchOrg).toHaveBeenCalledWith(9, undefined, expect.objectContaining({ userId: '33', organizationId: '7' })));
  });
  it('refuses before token rotation if the native editor has unsaved work', async () => {
    await open();
    const hold = (event: Event) => event.preventDefault(); window.addEventListener('beforeunload', hold);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Switch to Sponsor' }));
      expect(await screen.findByText(/Save or discard your unsaved document/)).toBeTruthy();
      expect(switchOrg).not.toHaveBeenCalled();
    } finally { window.removeEventListener('beforeunload', hold); }
  });
  it('preserves the consent confirmation when the server refuses acceptance', async () => {
    await open();
    apiRequest.mockImplementation(async (method: string) => method === 'POST' ? reply({ success: false, error: 'Seat quota exceeded' }, 403) : reply([]));
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation from Sponsor' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Accept invitation' }));
    expect(await screen.findByText('Seat quota exceeded')).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).toMatch(/invitation offers reviewer/);
    expect(switchOrg).not.toHaveBeenCalled();
  });
  it('will not open another tenant ceremony over an existing governed form', () => {
    mount(); const done = registerCeremonyOpen();
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Organizations and invitations' }));
      expect(screen.getByText(/Finish or cancel the open governed form/)).toBeTruthy();
      expect(screen.queryByRole('dialog')).toBeNull();
    } finally { done(); }
  });
});

// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ apiRequest: vi.fn(), rows: [] as unknown[] }));
vi.mock('@/lib/queryClient', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest: h.apiRequest }));
import { AdminPlatformGrants } from '../surfaces/AdminPlatformGrants';
import { AdminAccess } from '../surfaces/AdminAccess';

const PATH = '/api/admin/access/grants';
const grant = { id: 9, email: 'staff@example.test', name: 'Support staff', role: 'support', granted_by: 'owner@example.test', granted_at: '2026-10-14T00:00:00.000Z' };
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
beforeEach(() => {
  h.rows = []; h.apiRequest.mockReset();
  h.apiRequest.mockImplementation(async (method: string) => method === 'GET' ? response({ grants: h.rows, grantableRoles: ['support', 'platform_admin'] }) : response({ id: 9 }));
});
afterEach(cleanup);

describe('platform grants in the active console', () => {
  it('does not offer elevation when the server refuses platform standing', async () => {
    h.apiRequest.mockResolvedValue(response({ error: 'Platform standing required' }, 403));
    render(<AdminPlatformGrants />);
    await screen.findByText('Platform access is restricted');
    expect(screen.queryByRole('button', { name: 'Grant platform access' })).toBeNull();
    expect(screen.queryByText('No active platform role grants.')).toBeNull();
  });

  it('offers only verified grantable roles and uses the governed form for a real existing account', async () => {
    render(<AdminPlatformGrants />);
    fireEvent.click(await screen.findByRole('button', { name: 'Grant platform access' }));
    const dialog = await screen.findByRole('dialog', { name: 'Grant platform access' });
    const d = within(dialog);
    expect(d.queryByRole('option', { name: /finance/ })).toBeNull();
    fireEvent.change(d.getByRole('textbox', { name: 'Existing user email' }), { target: { value: 'staff@example.test' } });
    fireEvent.change(d.getByRole('combobox', { name: 'Platform role' }), { target: { value: 'support' } });
    fireEvent.change(d.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Designate support personnel' } });
    h.apiRequest.mockImplementation(async (method: string) => {
      if (method === 'POST') { h.rows = [grant]; return response(grant); }
      return response({ grants: h.rows, grantableRoles: ['support', 'platform_admin'] });
    });
    fireEvent.click(d.getByRole('button', { name: 'Grant platform access' }));
    await screen.findByText('Platform role granted with its audit record.');
    await screen.findByText('Support staff');
    expect(h.apiRequest).toHaveBeenCalledWith('POST', PATH, { email: 'staff@example.test', role: 'support', reason: 'Designate support personnel' });
  });

  it('retains a refused grant form and its values', async () => {
    render(<AdminPlatformGrants />);
    fireEvent.click(await screen.findByRole('button', { name: 'Grant platform access' }));
    const dialog = await screen.findByRole('dialog', { name: 'Grant platform access' });
    const d = within(dialog);
    fireEvent.change(d.getByRole('textbox', { name: 'Existing user email' }), { target: { value: 'missing@example.test' } });
    fireEvent.change(d.getByRole('combobox', { name: 'Platform role' }), { target: { value: 'support' } });
    fireEvent.change(d.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Designate support personnel' } });
    h.apiRequest.mockResolvedValue(response({ error: 'No user found with that email.' }, 404));
    fireEvent.click(d.getByRole('button', { name: 'Grant platform access' }));
    await within(dialog).findByText('No user found with that email.');
    expect((d.getByRole('textbox', { name: 'Existing user email' }) as HTMLInputElement).value).toBe('missing@example.test');
  });

  it('requires a revoke reason and states a lost audit record without restoring the revoked access', async () => {
    h.rows = [grant]; render(<AdminPlatformGrants />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Support for Support staff' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revoke Support?' });
    const d = within(dialog);
    fireEvent.click(d.getByRole('button', { name: 'Revoke platform access' }));
    expect(h.apiRequest.mock.calls.filter(c => c[0] === 'DELETE')).toHaveLength(0);
    fireEvent.change(d.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Offboard support personnel' } });
    h.apiRequest.mockImplementation(async (method: string) => {
      if (method === 'DELETE') { h.rows = []; return response({ id: 9, auditTrail: { persisted: false } }); }
      return response({ grants: h.rows, grantableRoles: ['support'] });
    });
    fireEvent.click(d.getByRole('button', { name: 'Revoke platform access' }));
    const warning = await screen.findByRole('alert');
    expect(warning.textContent).toContain('Platform role revoked. Its audit entry could not be confirmed');
    await screen.findByText('No active platform role grants.');
    expect(h.apiRequest).toHaveBeenCalledWith('DELETE', `${PATH}/9`, { reason: 'Offboard support personnel' });
  });

  it('is reachable in the active AdminAccess Roles + scopes tab', async () => {
    h.apiRequest.mockImplementation(async (_method: string, path: string) => path === '/api/mdx/admin' ? response({ data: {
      members: [{ id: 'u-1', name: 'Administrator', groups: [], role: 'Admin', sso: '', mfa: true, state: 'active' }],
      kpis: [], roles: [], grants: [], apiKeys: [], audit: [], settings: [], sso: null,
    }, meta: {} }) : response({ grants: [], grantableRoles: ['support'] }));
    render(<AdminAccess surface={{ id: 'admin-console' } as any} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Roles + scopes' }));
    await screen.findByRole('button', { name: 'Grant platform access' });
  });
});

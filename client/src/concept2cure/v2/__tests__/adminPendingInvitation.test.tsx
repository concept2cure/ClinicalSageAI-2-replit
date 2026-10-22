// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { AdminAccess } from '../surfaces/AdminAccess';
afterEach(cleanup);
describe('an existing account invited into another organization', () => {
  it('reports pending consent and actual delivery, rather than claiming a password email', async () => {
    apiRequest.mockImplementation(async (method: string) => ({ ok: true, status: method === 'POST' ? 202 : 200, json: async () => method === 'POST'
      ? { success: true, pendingInvitation: true, delivery: { emailSent: false, inbox: true } }
      : { data: { organizationId: 7, kpis: [], members: [{ id: 'm1', userId: 1, name: 'Admin', initials: 'A', email: 'a@test.org', role: 'Admin', groups: [], sso: '', mfa: false, lastSeen: '', state: 'active' }], roles: [], grants: [], sso: null, apiKeys: [], audit: [], settings: [] }, meta: { unavailable: [] } } }));
    render(<AdminAccess surface={{ id: 'admin-console', label: 'Admin' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Invite member' }));
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: 'Existing Member' } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'existing@test.org' } });
    fireEvent.change(screen.getByLabelText(/Role/), { target: { value: 'reviewer' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send invite' }));
    const handover = await screen.findByRole('region', { name: 'Invitation results' });
    expect(within(handover).getByText('Awaiting consent')).toBeTruthy();
    expect(handover.textContent).toMatch(/pending invitation was recorded/i);
    expect(handover.textContent).toMatch(/must accept before membership is added/i);
    expect(handover.textContent).toMatch(/no password setup email was sent/i);
    expect(handover.textContent).not.toMatch(/password setup link was sent/);
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toEqual([['POST', '/api/tenant-users', { name: 'Existing Member', email: 'existing@test.org', role: 'reviewer', title: undefined, department: undefined }]]);
  });
});

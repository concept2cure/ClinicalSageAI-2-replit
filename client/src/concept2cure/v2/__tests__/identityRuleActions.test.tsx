// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { IdentityConsole } from '../surfaces/IdentityConsole';
import { ApiRequestError } from '@/lib/queryClient';
const props = { surface: { id: 'identity-console', label: 'Identity' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'admin' };
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
let rule: { id: number; organizationId: number; cidr: string; label: string; enabled: boolean } | null;
let refusal: Error | null;
beforeEach(() => {
  rule = { id: 1, organizationId: 7, cidr: '203.0.113.0/24', label: 'Old egress', enabled: true }; refusal = null;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, path: string, body?: { enabled?: boolean }) => {
    if (method === 'GET') return response(path.endsWith('scim-tenants') ? { tenants: [] } : { rules: rule ? [rule] : [] });
    if (refusal) throw refusal;
    if (method === 'PATCH') { rule = { ...rule!, enabled: body!.enabled! }; return response(rule); }
    rule = null; return response(null, 204);
  });
});
afterEach(cleanup);
const writes = () => apiRequest.mock.calls.filter(([m]) => m !== 'GET');
describe('SCIM allowlist rule lifecycle', () => {
  it('requires confirmation and a reason, then disables and re-enables the stored rule', async () => {
    render(<IdentityConsole {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Disable SCIM rule 203.0.113.0/24' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable rule' }));
    expect(writes()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(/Reason for the allowlist change/), { target: { value: 'IdP egress address retired' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable rule' }));
    await waitFor(() => expect(writes()).toEqual([['PATCH', '/api/admin/scim-ip-allowlist/1', { enabled: false, reason: 'IdP egress address retired' }]]));
    fireEvent.click(await screen.findByRole('button', { name: 'Enable SCIM rule 203.0.113.0/24' }));
    fireEvent.change(screen.getByLabelText(/Reason for the allowlist change/), { target: { value: 'IdP egress address verified again' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enable rule' }));
    expect(await screen.findByRole('button', { name: 'Disable SCIM rule 203.0.113.0/24' })).toBeTruthy();
    expect(writes()).toEqual([
      ['PATCH', '/api/admin/scim-ip-allowlist/1', { enabled: false, reason: 'IdP egress address retired' }],
      ['PATCH', '/api/admin/scim-ip-allowlist/1', { enabled: true, reason: 'IdP egress address verified again' }],
    ]);
  });
  it('removes the stored rule after a reasoned confirmation and refreshes the list', async () => {
    render(<IdentityConsole {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete SCIM rule 203.0.113.0/24' }));
    fireEvent.change(screen.getByLabelText(/Reason for the allowlist change/), { target: { value: 'Incorrect network entered' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete rule' }));
    expect(await screen.findByText('No allowlist rules')).toBeTruthy();
    expect(writes()).toEqual([['DELETE', '/api/admin/scim-ip-allowlist/1', { reason: 'Incorrect network entered' }]]);
  });
  it('keeps the confirmation and entered reason on a server refusal', async () => {
    refusal = new ApiRequestError('The audit record could not be written.', 503);
    render(<IdentityConsole {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete SCIM rule 203.0.113.0/24' }));
    fireEvent.change(screen.getByLabelText(/Reason for the allowlist change/), { target: { value: 'Incorrect network entered' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete rule' }));
    expect(await screen.findByText(/The audit record could not be written/)).toBeTruthy();
    expect((screen.getByLabelText(/Reason for the allowlist change/) as HTMLTextAreaElement).value).toBe('Incorrect network entered');
    expect(screen.getAllByText('203.0.113.0/24').length).toBeGreaterThan(0);
  });
});

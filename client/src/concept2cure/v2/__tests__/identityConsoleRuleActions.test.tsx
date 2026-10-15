// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { ApiRequestError } from '@/lib/queryClient';
import { IdentityConsole } from '../surfaces/IdentityConsole';
const rule = { id: 11, organizationId: 37, cidr: '203.0.113.0/24', label: 'IdP egress', enabled: true };
let rules = [rule];
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const props = { surface: { id: 'identity-console', label: 'Identity' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'admin' };
const reason = 'Reviewed IdP network access';
const giveReason = () => fireEvent.change(screen.getByRole('textbox', { name: 'Reason for the allowlist change' }), { target: { value: reason } });
beforeEach(() => {
  rules = [{ ...rule }]; apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, path: string, body?: { enabled: boolean }) => {
    if (method === 'GET') return json(200, path.endsWith('scim-tenants') ? { tenants: [] } : { rules });
    if (method === 'PATCH') { rules = [{ ...rule, enabled: body!.enabled }]; return json(200, rules[0]); }
    rules = []; return new Response(null, { status: 204 });
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('SCIM allowlist row controls', () => {
  it('requires explicit confirmation to disable a rule and names the unrestricted consequence', async () => {
    render(<IdentityConsole {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Disable SCIM rule 203.0.113.0/24' }));
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
    expect(screen.getByText(/if no enabled rules remain.*any source address/i)).toBeTruthy();
    giveReason();
    fireEvent.click(screen.getByRole('button', { name: 'Disable rule' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('PATCH', '/api/admin/scim-ip-allowlist/11', { enabled: false, reason }));
    expect(await screen.findByRole('button', { name: 'Enable SCIM rule 203.0.113.0/24' })).toBeTruthy();
  });

  it('deletes only the selected rule after confirmation and re-reads the real list', async () => {
    render(<IdentityConsole {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete SCIM rule 203.0.113.0/24' }));
    giveReason();
    fireEvent.click(screen.getByRole('button', { name: 'Delete rule' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('DELETE', '/api/admin/scim-ip-allowlist/11', { reason }));
    expect(await screen.findByText('No allowlist rules')).toBeTruthy();
  });

  it('keeps refused changes pending and preserves platform-administrator authorization', async () => {
    apiRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'GET') return json(200, path.endsWith('scim-tenants') ? { tenants: [] } : { rules });
      throw new ApiRequestError('Platform administrator required', 403);
    });
    render(<IdentityConsole {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Disable SCIM rule 203.0.113.0/24' }));
    giveReason();
    fireEvent.click(screen.getByRole('button', { name: 'Disable rule' }));
    expect(await screen.findByText(/not a platform administrator/i)).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Disable allowlist rule 203.0.113.0/24?' })).toBeTruthy();
    expect(rules[0].enabled).toBe(true);
  });

  it('does not claim a successful rule change from an unrelated or malformed response', async () => {
    apiRequest.mockImplementation(async (method: string, path: string) => method === 'GET'
      ? json(200, path.endsWith('scim-tenants') ? { tenants: [] } : { rules })
      : json(200, { ...rule, id: 99, enabled: false }));
    render(<IdentityConsole {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Disable SCIM rule 203.0.113.0/24' }));
    giveReason();
    fireEvent.click(screen.getByRole('button', { name: 'Disable rule' }));
    expect(await screen.findByText(/allowlist change was not confirmed/i)).toBeTruthy();
    expect(rules[0].enabled).toBe(true);
    expect(screen.getByRole('dialog', { name: 'Disable allowlist rule 203.0.113.0/24?' })).toBeTruthy();
  });

  it('requires a governed reason before sending a rule change', async () => {
    render(<IdentityConsole {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Disable SCIM rule 203.0.113.0/24' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disable rule' }));
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
});

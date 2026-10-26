// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { ApiRequestError } from '@/lib/queryClient';
import { IdentityConsole } from '../surfaces/IdentityConsole';
const tenant = { id: 3, organizationId: 101, label: 'Approved IdP', enabled: true };
let tenants = [tenant];
const auditTrail = { persisted: true, chained: true };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const props = { surface: { id: 'identity-console', label: 'Identity' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'admin' };
const reason = 'Approved directory credential change';
const giveReason = (value = reason) => fireEvent.change(screen.getByRole('textbox', { name: 'Reason for the token change' }), { target: { value } });
async function open(action = 'Rotate') {
  render(<IdentityConsole {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: action }));
}
beforeEach(() => {
  tenants = [{ ...tenant }]; apiRequest.mockReset(); localStorage.clear(); sessionStorage.clear();
  apiRequest.mockImplementation(async (method: string, path: string, body?: { enabled: boolean }) => {
    if (method === 'GET') return json(path.endsWith('scim-tenants') ? { tenants } : { rules: [] });
    if (method === 'POST') return json({ ...tenant, auditTrail, token: 'scim_TEST_REPLACEMENT' });
    if (method === 'PATCH') { tenants = [{ ...tenant, enabled: body!.enabled }]; return json({ ...tenants[0], auditTrail }); }
    tenants = [];
    return new Response(null, { status: 204, headers: { 'X-Audit-Row-Persisted': 'true', 'X-Audit-Row-Chained': 'true' } });
  });
});
afterEach(cleanup);

describe('governed SCIM credential setup', () => {
  it('explains rotation and requires a reason before invalidating the previous token', async () => {
    await open();
    expect(screen.getByText(/Rotation invalidates the previous token immediately/)).toBeTruthy();
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Rotate token' }));
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
    giveReason();
    fireEvent.click(screen.getByRole('button', { name: 'Rotate token' }));
    expect(await screen.findByText('scim_TEST_REPLACEMENT')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/admin/scim-tenants/3/rotate', { reason });
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it('issues a credential only after collecting its organization and governed reason', async () => {
    await open('Issue token');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Organization id' }), { target: { value: '101' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Label' }), { target: { value: 'Approved IdP' } });
    giveReason(); fireEvent.click(screen.getAllByRole('button', { name: 'Issue token' }).at(-1)!);
    await screen.findByText('scim_TEST_REPLACEMENT');
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/admin/scim-tenants', { organizationId: 101, label: 'Approved IdP', reason });
  });
  it('does not claim revocation without confirmation that its audit record was persisted', async () => {
    await open('Revoke'); apiRequest.mockResolvedValueOnce(new Response(null, { status: 204 }));
    giveReason(); fireEvent.click(screen.getByRole('button', { name: 'Revoke token' }));
    await screen.findByText(/token change was not confirmed/);
    expect(tenants).toHaveLength(1);
    expect(screen.queryByText('SCIM token revoked.')).toBeNull();
  });
  it('disables the selected credential after confirmation and clears its displayed secret', async () => {
    await open(); giveReason(); fireEvent.click(screen.getByRole('button', { name: 'Rotate token' }));
    await screen.findByText('scim_TEST_REPLACEMENT');
    fireEvent.click(await screen.findByRole('button', { name: 'Disable' }));
    giveReason(); fireEvent.click(screen.getByRole('button', { name: 'Disable token' }));
    await screen.findByRole('button', { name: 'Enable' });
    expect(apiRequest).toHaveBeenCalledWith('PATCH', '/api/admin/scim-tenants/3', { reason, enabled: false });
    expect(screen.queryByText('scim_TEST_REPLACEMENT')).toBeNull();
  });
  it('revokes only after a governed confirmation and reads back the empty directory', async () => {
    await open('Revoke');
    expect(screen.getByText(/Revocation permanently removes/)).toBeTruthy();
    giveReason(); fireEvent.click(screen.getByRole('button', { name: 'Revoke token' }));
    await screen.findByText('No SCIM tokens issued');
    expect(apiRequest).toHaveBeenCalledWith('DELETE', '/api/admin/scim-tenants/3', { reason });
  });
  it('retains a refused form and its reason for correction', async () => {
    await open();
    apiRequest.mockRejectedValueOnce(new ApiRequestError('Platform administrator required', 403));
    giveReason(); fireEvent.click(screen.getByRole('button', { name: 'Rotate token' }));
    await screen.findByText(/not a platform administrator/);
    expect((screen.getByRole('textbox', { name: 'Reason for the token change' }) as HTMLTextAreaElement).value).toBe(reason);
    expect(screen.queryByText('scim_TEST_REPLACEMENT')).toBeNull();
  });
  it('locks duplicate submission and dismissal while recording a credential change', async () => {
    await open();
    let release!: (value: Response) => void;
    apiRequest.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    giveReason(); const submit = screen.getByRole('button', { name: 'Rotate token' });
    fireEvent.click(submit); fireEvent.click(submit);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('dialog', { name: 'Rotate SCIM token #3?' })).toBeTruthy();
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(1);
    release(json({ ...tenant, token: 'scim_TEST_REPLACEMENT', auditTrail }));
    await screen.findByText('scim_TEST_REPLACEMENT');
  });
  it('requires readback after a lost commit response and does not repeat the mutation', async () => {
    await open();
    apiRequest.mockRejectedValueOnce(new ApiRequestError('Token outcome unknown. Reload the directory.', 503, { code: 'SCIM_TOKEN_COMMIT_UNCONFIRMED' }));
    giveReason(); fireEvent.click(screen.getByRole('button', { name: 'Rotate token' }));
    await screen.findByText(/Token outcome unknown/);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(1);
    expect(apiRequest.mock.calls.filter(([method, path]) => method === 'GET' && path.endsWith('scim-tenants'))).toHaveLength(2);
  });
  it.each([
    { ...tenant, organizationId: 999, auditTrail, token: 'scim_FOREIGN' },
    { ...tenant, token: 'scim_UNCONFIRMED' },
  ])('never reveals an unrelated or unaudited successful response', async response => {
    await open(); apiRequest.mockResolvedValueOnce(json(response));
    giveReason(); fireEvent.click(screen.getByRole('button', { name: 'Rotate token' }));
    await screen.findByText(/token change was not confirmed/);
    expect(screen.queryByText(response.token)).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

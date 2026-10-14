// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiRequestError } from '@/lib/queryClient';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest }));
import { DocumentPermissionsPanel } from '../DocumentPermissionsPanel';

const DOC = '10000000-0000-4000-8000-000000000001';
const SEC = '20000000-0000-4000-8000-000000000001';
const PATH = `/api/authoring/docs/${DOC}/permissions`;
interface PermissionFixture {
  id: string; doc_id: string; principal_id: string; email: string | null; role: string; section_id: string | null;
  valid_from: string; valid_until: string | null; revoked_at: string | null; grant_reason: string | null; revoke_reason: string | null;
}
const OWNER: PermissionFixture = { id: 'owner', doc_id: DOC, principal_id: '1', email: 'owner@example.test', role: 'OWNER', section_id: null, valid_from: '2026-01-01T00:00:00Z', valid_until: null, revoked_at: null, grant_reason: 'Created this document', revoke_reason: null };
const REVIEWER = { ...OWNER, id: 'reviewer', principal_id: '2', email: 'reviewer@example.test', role: 'REVIEWER', section_id: SEC, grant_reason: 'Medical review' };
const MEMBERS = [{ id: 1, name: 'Owner', email: 'owner@example.test' }, { id: 2, name: 'Riley', email: 'reviewer@example.test' }];
const props = { docId: DOC, docTitle: 'Clinical overview', organizationId: '7', sections: [{ id: SEC, code: '2.5.1', title: 'Rationale' }] };
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
let rows: PermissionFixture[];
let roster: unknown;
let change: (method: string, url: string, body: Record<string, unknown>) => Promise<Response>;

beforeEach(() => {
  rows = [OWNER, REVIEWER]; roster = MEMBERS;
  change = async (method, _url, body) => {
    const permission = method === 'POST' ? { ...OWNER, ...body, id: 'new-grant', principal_id: body.principalId, section_id: body.sectionId, valid_until: body.validUntil, grant_reason: body.reason } : { ...REVIEWER, revoked_at: '2026-10-14T12:00:00Z', revoke_reason: body.reason };
    rows = method === 'POST' ? [...rows, permission] as typeof rows : rows.map(r => r.id === permission.id ? permission : r) as typeof rows;
    return ok({ success: true, permission, auditTrail: { persisted: true, chained: true } });
  };
  apiRequest.mockReset().mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (method !== 'GET') return change(method, url, body ?? {});
    if (url === PATH) return ok({ success: true, docId: DOC, permissions: rows });
    if (url === '/api/tenant-users/7') return ok(roster);
    throw new Error('Unexpected request');
  });
});
afterEach(cleanup);

async function grantForm() {
  await waitFor(() => expect((screen.getByRole('button', { name: 'Grant access' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
  const form = within(screen.getByRole('dialog', { name: 'Grant document access' }));
  fireEvent.change(form.getByRole('combobox', { name: 'Member' }), { target: { value: '2' } });
  fireEvent.change(form.getByRole('combobox', { name: 'Document role' }), { target: { value: 'APPROVER' } });
  fireEvent.change(form.getByRole('textbox', { name: 'Reason for access' }), { target: { value: ' Approves the medical assessment ' } });
  return form;
}
const mutations = () => apiRequest.mock.calls.filter(([method]) => method !== 'GET');

describe('governed document access', () => {
  it('shows real names, scope, UTC dates and reasons from the open document', async () => {
    render(<DocumentPermissionsPanel {...props} />);
    expect(await screen.findByText('Riley')).toBeTruthy();
    expect(screen.getByText('Medical review', { exact: false })).toBeTruthy();
    expect(screen.getByText('2.5.1 · Rationale')).toBeTruthy();
    expect(screen.getAllByText('2026-01-01 00:00:00 UTC')).toHaveLength(2);
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/tenant-users/7');
  });

  it('offers duplicate names with the actual email so members can be distinguished', async () => {
    roster = [{ ...MEMBERS[0], name: 'Riley' }, MEMBERS[1]];
    render(<DocumentPermissionsPanel {...props} />);
    const form = await grantForm();
    expect(form.getByRole('option', { name: 'Riley · owner@example.test' })).toBeTruthy();
    expect(form.getByRole('option', { name: 'Riley · reviewer@example.test' })).toBeTruthy();
  });

  it('posts the selected member, role, actual section, UTC expiry and required trimmed reason without a client-provided email', async () => {
    render(<DocumentPermissionsPanel {...props} />);
    const form = await grantForm();
    fireEvent.change(form.getByRole('combobox', { name: 'Scope' }), { target: { value: SEC } });
    fireEvent.change(form.getByLabelText('Expiry date'), { target: { value: '2099-01-01' } });
    fireEvent.click(form.getByRole('button', { name: 'Grant access' }));
    await screen.findByText(/Approver grant recorded for Riley/);
    expect(mutations()).toEqual([['POST', PATH, { principalId: '2', role: 'APPROVER', sectionId: SEC, validUntil: '2099-01-01T23:59:59.999Z', reason: 'Approves the medical assessment' }]]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

});

describe('document access changes and refusals', () => {
  it('requires a reason before changing access', async () => {
    render(<DocumentPermissionsPanel {...props} />);
    const form = await grantForm();
    fireEvent.change(form.getByRole('textbox', { name: 'Reason for access' }), { target: { value: '  ' } });
    fireEvent.click(form.getByRole('button', { name: 'Grant access' }));
    expect(form.getByRole('alert').textContent).toContain('Reason for access');
    expect(mutations()).toHaveLength(0);
  });

  it('rejects past expiry dates and overlong reasons without sending', async () => {
    render(<DocumentPermissionsPanel {...props} />);
    const form = await grantForm();
    fireEvent.change(form.getByLabelText('Expiry date'), { target: { value: '2020-01-01' } });
    fireEvent.click(form.getByRole('button', { name: 'Grant access' }));
    expect(await form.findByText('Choose an expiry date in the future.')).toBeTruthy();
    fireEvent.change(form.getByRole('textbox', { name: 'Reason for access' }), { target: { value: 'x'.repeat(501) } });
    fireEvent.click(form.getByRole('button', { name: 'Grant access' }));
    expect(await form.findByText('Give a reason between 1 and 500 characters.')).toBeTruthy();
    expect(mutations()).toHaveLength(0);
  });

  it('confirms revocation through the governed reason form and displays the server record', async () => {
    render(<DocumentPermissionsPanel {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke reviewer grant' }));
    const form = within(screen.getByRole('dialog', { name: 'Revoke reviewer access' }));
    expect(form.getByText(/Other grants may still provide access/)).toBeTruthy();
    fireEvent.change(form.getByRole('textbox', { name: 'Reason for revocation' }), { target: { value: 'Review completed' } });
    fireEvent.click(form.getByRole('button', { name: 'Revoke access' }));
    await screen.findByText(/Reviewer grant revoked for Riley/);
    expect(mutations()).toEqual([['DELETE', `${PATH}/reviewer`, { reason: 'Review completed' }]]);
    expect(await screen.findByText('Revocation reason: Review completed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Revoke reviewer grant' })).toBeNull();
  });

  it('keeps the form and reason on an owner/admin refusal, without success or local grants', async () => {
    change = async () => { throw new ApiRequestError('Only a document owner or platform administrator may manage permissions.', 403); };
    const toast = vi.fn();
    render(<DocumentPermissionsPanel {...props} fireToast={toast} />);
    const form = await grantForm();
    fireEvent.click(form.getByRole('button', { name: 'Grant access' }));
    expect(await form.findByText(/Access change refused/)).toBeTruthy();
    expect((form.getByRole('textbox', { name: 'Reason for access' }) as HTMLTextAreaElement).value).toBe(' Approves the medical assessment ');
    expect(toast).not.toHaveBeenCalled();
    expect(screen.queryByText(/Approver grant recorded/)).toBeNull();
  });

  it('states the last-owner refusal and keeps the reason for correction', async () => {
    change = async () => { throw new ApiRequestError('A document must retain at least one active owner.', 409); };
    render(<DocumentPermissionsPanel {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke owner grant' }));
    const form = within(screen.getByRole('dialog'));
    fireEvent.change(form.getByRole('textbox', { name: 'Reason for revocation' }), { target: { value: 'Remove duplicate ownership' } });
    fireEvent.click(form.getByRole('button', { name: 'Revoke access' }));
    expect(await form.findByText(/must retain at least one active owner/)).toBeTruthy();
    expect((form.getByRole('textbox', { name: 'Reason for revocation' }) as HTMLTextAreaElement).value).toBe('Remove duplicate ownership');
  });

  it('does not turn a forbidden or malformed access read into an empty list', async () => {
    apiRequest.mockImplementation(async (_method, url) => url === PATH ? ok({ success: true, docId: 'another-document', permissions: [] }) : ok(MEMBERS));
    render(<DocumentPermissionsPanel {...props} />);
    expect(await screen.findByText('Document access could not be read')).toBeTruthy();
    expect(screen.queryByText('No explicit access grants recorded')).toBeNull();
    expect((screen.getByRole('button', { name: 'Grant access' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('retains access history but offers no new grants when members cannot be read', async () => {
    apiRequest.mockImplementation(async (_method, url) => { if (url === PATH) return ok({ success: true, docId: DOC, permissions: rows }); throw new ApiRequestError('Organization access required', 403); });
    render(<DocumentPermissionsPanel {...props} />);
    expect(await screen.findByText('Medical review', { exact: false })).toBeTruthy();
    expect(await screen.findByText(/Members could not be read/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Grant access' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports unavailable member and section details without claiming either was removed', async () => {
    rows = [{ ...REVIEWER, email: null }];
    apiRequest.mockImplementation(async (_method, url) => {
      if (url === PATH) return ok({ success: true, docId: DOC, permissions: rows });
      throw new ApiRequestError('Organization access required', 403);
    });
    render(<DocumentPermissionsPanel {...props} sections={[]} />);
    expect(await screen.findByText('Member details unavailable')).toBeTruthy();
    expect(screen.getByText('Section details unavailable')).toBeTruthy();
    expect(screen.queryByText(/no longer in the roster|no longer in the outline/)).toBeNull();
    expect(screen.getByText('Medical review', { exact: false })).toBeTruthy();
  });

});

describe('document access history and uncertain outcomes', () => {
  it('shows revoked and expired grants with their dates instead of calling them active', async () => {
    rows = [{ ...REVIEWER, valid_until: '2020-01-01T00:00:00Z' }, { ...OWNER, revoked_at: '2026-10-01T00:00:00Z', revoke_reason: 'Replaced ownership' }];
    render(<DocumentPermissionsPanel {...props} />);
    expect(await screen.findByText(/Reviewer · Expired/)).toBeTruthy();
    expect(screen.getByText(/Owner · Revoked/)).toBeTruthy();
    expect(screen.getByText('Revocation reason: Replaced ownership')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Revoke owner grant' })).toBeNull();
  });

  it('requires a reload after a network or unverified receipt outcome and suppresses duplicate changes', async () => {
    change = async () => { throw new Error('Connection lost'); };
    render(<DocumentPermissionsPanel {...props} />);
    const form = await grantForm();
    fireEvent.click(form.getByRole('button', { name: 'Grant access' }));
    await form.findByText(/Access change unconfirmed/);
    fireEvent.click(form.getByRole('button', { name: 'Grant access' }));
    expect(mutations()).toHaveLength(1);
    fireEvent.click(form.getByRole('button', { name: 'Cancel' }));
    expect((screen.getByRole('button', { name: 'Grant access' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reload access' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Grant access' }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('never confirms a changed row for another document or an unconfirmed audit entry', async () => {
    change = async () => ok({ success: true, permission: { ...OWNER, principal_id: '2', role: 'APPROVER', doc_id: 'another-document' }, auditTrail: { persisted: true, chained: true } });
    const toast = vi.fn();
    render(<DocumentPermissionsPanel {...props} fireToast={toast} />);
    const form = await grantForm();
    fireEvent.click(form.getByRole('button', { name: 'Grant access' }));
    expect(await form.findByText(/did not confirm this access change and its audit record/)).toBeTruthy();
    expect(toast).not.toHaveBeenCalled();
  });

  it('isolates late read results after selecting another document', async () => {
    let finish!: (response: Response) => void;
    apiRequest.mockImplementation(async (_method, url) => {
      if (url === PATH) return new Promise<Response>(resolve => { finish = resolve; });
      if (url.includes('new-document')) return ok({ success: true, docId: 'new-document', permissions: [] });
      return ok(MEMBERS);
    });
    const view = render(<DocumentPermissionsPanel {...props} />);
    view.rerender(<DocumentPermissionsPanel {...props} docId="new-document" docTitle="New document" />);
    await screen.findByText('No explicit access grants recorded');
    await act(async () => finish(ok({ success: true, docId: DOC, permissions: rows })));
    expect(screen.queryByText('Medical review', { exact: false })).toBeNull();
    expect(screen.getByText('No explicit access grants recorded')).toBeTruthy();
  });

  it('does not invent a tenant or make requests without an open document', () => {
    render(<DocumentPermissionsPanel {...props} docId={null} />);
    expect(screen.getByText('No document open')).toBeTruthy();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

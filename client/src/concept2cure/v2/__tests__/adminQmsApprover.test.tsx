// @vitest-environment jsdom
/**
 * QMS approvers in Admin and access (decision D-Q of
 * docs/design/REVIEW_ROUTING_2026-10-23.md §7.8; RR4): the member drawer says
 * whether a member approves controlled documents (designated, or as an
 * Approver while nobody is), and an administrator designates or removes the
 * designation with a reason through PUT /api/tenant-users/:org/:user/qms-approver.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { AdminAccess } from '../surfaces/AdminAccess';

const props = () => ({ surface: { id: 'admin-console', label: 'Admin and access' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });
const member = (over: Record<string, unknown>) => ({ initials: 'XX', groups: [], sso: '', mfa: false, lastSeen: '', state: 'active', programs: [], ...over });
const payload = (standIn: boolean, ann: Record<string, unknown>) => ({
  data: {
    organizationId: 7, kpis: [], grants: [], apiKeys: [], audit: [], settings: [], sso: null,
    members: [
      member({ id: 'u-1', userId: 1, self: true, name: 'Ada Admin', email: 'ada@c2c.test', role: 'Admin' }),
      member({ id: 'u-42', userId: 42, self: false, name: 'Ann Approver', email: 'ann@c2c.test', role: 'Approver', ...ann }),
    ],
    roles: [{ id: 'admin', label: 'Admin', members: 1, desc: '', scopes: [] }],
    qmsApprovers: { standIn },
  },
  meta: { count: 2, unavailable: [] },
});
let reply: { status: number; body: unknown } | Error = { status: 200, body: { ok: true, designated: true } };
const writes = () => apiRequest.mock.calls.filter(([m]) => m !== 'GET');
function serve(body: unknown) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/mdx/admin') return { ok: true, status: 200, json: async () => body } as Response;
    if (reply instanceof Error) throw reply;
    const r = reply;
    return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response;
  });
}
async function drawerFor(name: string) {
  await screen.findAllByText('Ada Admin');
  const row = Array.from(document.querySelectorAll('button.ctable-row')).find((b) => (b.textContent || '').includes(name));
  fireEvent.click(row as Element);
  return document.querySelector('.adm-drawer') as HTMLElement;
}
const toastText = () => Array.from(document.querySelectorAll('[role=alert],[role=status]')).map((e) => e.textContent || '').join(' ');

afterEach(cleanup);
beforeEach(() => { apiRequest.mockReset(); reply = { status: 200, body: { ok: true, designated: true } }; });

describe('designating a QMS approver (RR4, D-Q)', () => {
  it('says the Approver role stands in while nobody is designated, and designates with a reason', async () => {
    serve(payload(true, { qmsApprover: true, qmsApproverDesignated: false }));
    render(<AdminAccess {...props()} />);
    const drawer = await drawerFor('Ann Approver');
    expect(within(drawer).getByTestId('member-qms-approver-standing').textContent).toBe('Yes, as an Approver until QMS approvers are designated');
    fireEvent.click(within(drawer).getByTestId('member-qms-approver'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/Designate Ann Approver as a QMS approver\?/);
    expect(dialog.textContent).toMatch(/This is the first designation: from now on only designated members approve controlled documents/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Designate' }));
    expect(within(dialog).getByRole('alert').textContent).toMatch(/Reason/);
    expect(writes()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Site QA lead approves SOPs' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Designate' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual(['PUT', '/api/tenant-users/7/42/qms-approver', { designated: true, reason: 'Site QA lead approves SOPs' }]);
    await waitFor(() => expect(toastText()).toMatch(/Ann Approver is now a designated QMS approver/));
  });

  it('removes a designation, and says a refusal in the server’s words', async () => {
    const verdict = 'Ann Approver does not hold signing authority (role member), so cannot be a QMS approver. Nothing was changed.';
    reply = new ApiRequestError(verdict, 409, { error: 'MEMBER_CANNOT_SIGN', message: verdict }, 'MEMBER_CANNOT_SIGN');
    serve(payload(false, { qmsApprover: true, qmsApproverDesignated: true }));
    render(<AdminAccess {...props()} />);
    const drawer = await drawerFor('Ann Approver');
    expect(within(drawer).getByTestId('member-qms-approver-standing').textContent).toBe('Designated');
    expect(within(drawer).getByTestId('member-qms-approver').textContent).toBe('Remove QMS approver designation');
    fireEvent.click(within(drawer).getByTestId('member-qms-approver'));
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Moved to the manufacturing site' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove designation' }));
    await waitFor(() => expect(writes()[0]).toEqual(['PUT', '/api/tenant-users/7/42/qms-approver', { designated: false, reason: 'Moved to the manufacturing site' }]));
    await waitFor(() => expect(toastText()).toMatch(/does not hold signing authority/));
  });

  it('is not offered on the administrator’s own row', async () => {
    serve(payload(true, {}));
    render(<AdminAccess {...props()} />);
    const drawer = await drawerFor('Ada Admin');
    expect((within(drawer).getByTestId('member-qms-approver') as HTMLButtonElement).disabled).toBe(true);
  });
});

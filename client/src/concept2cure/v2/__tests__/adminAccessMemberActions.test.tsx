// @vitest-environment jsdom
/**
 * QA 2026-10-08 (j9, finding 1, blocker): an administrator could not change a
 * member's role or remove a member. The drawer offered "Grant access" and
 * "Audit activity", both of which typed a sentence into AnA, while
 * PATCH / DELETE /api/tenant-users/:organizationId/:userId — org-admin gated,
 * reason-required, audited in the change's transaction — had no caller.
 *
 * The drawer now opens a governed form for each: the reason is required, the
 * form is the confirmation, and whatever the server answers is shown in its
 * own words. The administrator's own row offers neither (the route refuses a
 * change to one's own membership), and a payload without the ids the routes
 * take offers neither (fail closed).
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

const props = () => ({
  surface: { id: 'admin-console', label: 'Admin and access' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

const member = (over: Record<string, unknown>) => ({
  initials: 'XX', groups: [], sso: '', mfa: false, lastSeen: '', state: 'active', programs: [], ...over,
});

const payload = (over: Record<string, unknown> = {}) => ({
  data: {
    organizationId: 7,
    kpis: [],
    members: [
      member({ id: 'u-1', userId: 1, self: true, name: 'Ada Admin', email: 'ada@c2c.test', role: 'Admin' }),
      member({ id: 'u-42', userId: 42, self: false, name: 'Ben Member', email: 'ben@c2c.test', role: 'Member' }),
    ],
    roles: [
      { id: 'admin', label: 'Admin', members: 1, desc: '', scopes: [] },
      { id: 'member', label: 'Member', members: 1, desc: '', scopes: [] },
    ],
    grants: [],
    apiKeys: [],
    audit: [],
    settings: [],
    sso: null,
    ...over,
  },
  meta: { count: 2, unavailable: [] },
});

type Reply = { status: number; body: unknown } | Error;
let writeReply: Reply = { status: 200, body: { message: 'User role updated successfully' } };
const writes = () => apiRequest.mock.calls.filter(([m]) => m !== 'GET');
const adminReads = () => apiRequest.mock.calls.filter(([m, u]) => m === 'GET' && u === '/api/mdx/admin').length;

function serve(body: unknown) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/mdx/admin') {
      return { ok: true, status: 200, json: async () => body } as Response;
    }
    if (writeReply instanceof Error) throw writeReply;
    const r = writeReply;
    return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response;
  });
}

async function openDrawerFor(name: string) {
  await screen.findAllByText('Ada Admin');
  const row = Array.from(document.querySelectorAll('button.ctable-row')).find((b) => (b.textContent || '').includes(name));
  fireEvent.click(row as Element);
  return document.querySelector('.adm-drawer') as HTMLElement;
}

const dialog = () => screen.getByRole('dialog');
const toastText = () => Array.from(document.querySelectorAll('[role=alert],[role=status]')).map((e) => e.textContent || '').join(' ');

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  writeReply = { status: 200, body: { message: 'User role updated successfully' } };
});

describe('changing a member\'s role', () => {
  it('opens a governed form, requires a reason, and sends nothing without one', async () => {
    serve(payload());
    render(<AdminAccess {...props()} />);
    const drawer = await openDrawerFor('Ben Member');
    fireEvent.click(within(drawer).getByTestId('member-change-role'));

    expect(dialog().textContent).toMatch(/Change Ben Member's role/);
    fireEvent.change(screen.getByLabelText(/New role/), { target: { value: 'viewer' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: /Change role/ }));
    expect(within(dialog()).getByRole('alert').textContent).toMatch(/Reason/);
    expect(writes()).toHaveLength(0);
  });

  it('PATCHes the organization and user the server named, with the role and the reason', async () => {
    serve(payload());
    render(<AdminAccess {...props()} />);
    const drawer = await openDrawerFor('Ben Member');
    fireEvent.click(within(drawer).getByTestId('member-change-role'));
    // The options read as the rest of the page names roles; the values are the route's.
    const select = screen.getByLabelText(/New role/) as HTMLSelectElement;
    // P-18: approver and reviewer are assignable, each described in the form.
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Select…', 'Admin', 'Approver', 'Manager', 'Reviewer', 'Member', 'Viewer']);
    expect(dialog().textContent).toMatch(/Approver: everything a manager may, and signs/);
    expect(dialog().textContent).toMatch(/Reviewer: everything a member may, and signs/);
    fireEvent.change(select, { target: { value: 'viewer' } });
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Quarterly access review' } });
    const readsBefore = adminReads();
    fireEvent.click(within(dialog()).getByRole('button', { name: /Change role/ }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual(['PATCH', '/api/tenant-users/7/42', { role: 'viewer', reason: 'Quarterly access review' }]);
    await waitFor(() => expect(toastText()).toMatch(/Ben Member is now Viewer/));
    expect(toastText()).toMatch(/audit trail/);
    await waitFor(() => expect(adminReads()).toBeGreaterThan(readsBefore));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the server\'s refusal in its own words and keeps the form and its values', async () => {
    const verdict = "This member is the organization's only administrator. Make another member an administrator first. Nothing was changed.";
    writeReply = new ApiRequestError(verdict, 409, { error: 'LAST_ADMINISTRATOR', message: verdict }, 'LAST_ADMINISTRATOR');
    serve(payload());
    render(<AdminAccess {...props()} />);
    const drawer = await openDrawerFor('Ben Member');
    fireEvent.click(within(drawer).getByTestId('member-change-role'));
    fireEvent.change(screen.getByLabelText(/New role/), { target: { value: 'viewer' } });
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Access review' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: /Change role/ }));

    await waitFor(() => expect(toastText()).toContain(verdict));
    expect((screen.getByLabelText(/Reason/) as HTMLTextAreaElement).value).toBe('Access review');
  });

  it('a 401 answer is not reported as a change', async () => {
    writeReply = { status: 401, body: { error: 'Authentication required' } };
    serve(payload());
    render(<AdminAccess {...props()} />);
    const drawer = await openDrawerFor('Ben Member');
    fireEvent.click(within(drawer).getByTestId('member-change-role'));
    fireEvent.change(screen.getByLabelText(/New role/), { target: { value: 'viewer' } });
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Access review' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: /Change role/ }));

    await waitFor(() => expect(toastText()).toMatch(/Role not changed — Authentication required/));
    expect(toastText()).not.toMatch(/is now/);
  });
});

describe('removing a member', () => {
  it('DELETEs with the reason after a governed confirmation, and says what removal does', async () => {
    writeReply = { status: 200, body: { message: 'User removed from organization successfully' } };
    serve(payload());
    render(<AdminAccess {...props()} />);
    const drawer = await openDrawerFor('Ben Member');
    fireEvent.click(within(drawer).getByTestId('member-remove'));

    expect(dialog().textContent).toMatch(/Remove Ben Member from this organization\?/);
    expect(dialog().textContent).toMatch(/cannot sign in/);
    fireEvent.click(within(dialog()).getByRole('button', { name: /Remove member/ }));
    expect(writes()).toHaveLength(0); // no reason, no request

    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Left the company' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: /Remove member/ }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual(['DELETE', '/api/tenant-users/7/42', { reason: 'Left the company' }]);
    await waitFor(() => expect(toastText()).toMatch(/Ben Member was removed from this organization/));
  });
});

describe('what is not offered', () => {
  it('the administrator\'s own row: neither control is enabled, and the drawer says why', async () => {
    serve(payload());
    render(<AdminAccess {...props()} />);
    const drawer = await openDrawerFor('Ada Admin');
    const change = within(drawer).getByTestId('member-change-role') as HTMLButtonElement;
    const remove = within(drawer).getByTestId('member-remove') as HTMLButtonElement;
    expect(change.disabled).toBe(true);
    expect(remove.disabled).toBe(true);
    expect(drawer.textContent).toMatch(/another administrator/i);
    fireEvent.click(change);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a payload without the organization or user id: fail closed', async () => {
    serve(payload({ organizationId: undefined }));
    render(<AdminAccess {...props()} />);
    const drawer = await openDrawerFor('Ben Member');
    expect((within(drawer).getByTestId('member-change-role') as HTMLButtonElement).disabled).toBe(true);
    expect((within(drawer).getByTestId('member-remove') as HTMLButtonElement).disabled).toBe(true);
  });
});

/**
 * QA 2026-10-08 (j9, finding 5): the setup link was handed to the administrator
 * once and could not be had again. For a member who has not set a password the
 * drawer offers "Issue a new setup link", which re-invites through the
 * invitation route (POST /api/tenant-users): the server replaces the token, so
 * the previous link stops working, and the new one is handed over the way the
 * first was. The page claims the clipboard only when the copy succeeded.
 */
describe('issuing a new setup link', () => {
  const invitee = member({ id: 'u-20', userId: 20, self: false, name: 'Pat Pending', email: 'pat@c2c.test', role: 'Manager', state: 'invited' });
  const reissued = {
    reissued: true, id: 20, email: 'pat@c2c.test', name: 'Pat Pending', role: 'manager',
    invitation: { delivery: 'link', emailSent: false, expiresAt: new Date(Date.now() + 21 * 86_400_000).toISOString(), setupUrl: 'http://localhost/concept2cure/password-reset?token=abc123' },
  };
  const withInvitee = () => payload({ members: [...(payload().data.members as object[]), invitee] });

  it('is offered for an invited member only, behind a confirmation that says the old link stops working', async () => {
    writeReply = { status: 200, body: reissued };
    serve(withInvitee());
    render(<AdminAccess {...props()} />);
    const active = await openDrawerFor('Ben Member');
    expect(within(active).queryByTestId('member-reissue')).toBeNull();

    const drawer = await openDrawerFor('Pat Pending');
    fireEvent.click(within(drawer).getByTestId('member-reissue'));
    expect(dialog().textContent).toMatch(/previous link stops working/);
    fireEvent.click(within(dialog()).getByRole('button', { name: /Issue new link/ }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual(['POST', '/api/tenant-users', { name: 'Pat Pending', email: 'pat@c2c.test', role: 'manager' }]);
    // No clipboard in this environment: the link is shown, never claimed to be copied.
    await waitFor(() => expect(toastText()).toMatch(/new setup link/i));
    expect(toastText()).toContain('http://localhost/concept2cure/password-reset?token=abc123');
    expect(toastText()).not.toMatch(/on your clipboard/);
  });

  it('says "on your clipboard" when the copy succeeded', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    try {
      writeReply = { status: 200, body: reissued };
      serve(withInvitee());
      render(<AdminAccess {...props()} />);
      const drawer = await openDrawerFor('Pat Pending');
      fireEvent.click(within(drawer).getByTestId('member-reissue'));
      fireEvent.click(within(dialog()).getByRole('button', { name: /Issue new link/ }));
      await waitFor(() => expect(toastText()).toMatch(/on your clipboard/));
      expect(writeText).toHaveBeenCalledWith('http://localhost/concept2cure/password-reset?token=abc123');
    } finally {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    }
  });

  it('inviting an invited address again through the form says a new link was issued and the role is unchanged', async () => {
    writeReply = { status: 200, body: reissued };
    serve(withInvitee());
    render(<AdminAccess {...props()} />);
    await screen.findAllByText('Ada Admin');
    fireEvent.click(screen.getByTestId('admin-invite-member'));
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: 'Pat Pending' } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'pat@c2c.test' } });
    fireEvent.change(screen.getByLabelText(/^Role/), { target: { value: 'admin' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: /Send invite/ }));

    await waitFor(() => expect(toastText()).toMatch(/new setup link/i));
    expect(toastText()).toMatch(/role is unchanged \(Manager\)/);
    expect(toastText()).not.toMatch(/invited as admin/);
  });
});

/** P-18: an administrator assigns the signing roles from the drawer and the invite form, with a reason. */
describe('assigning a signing role', () => {
  it('PATCHes approver with the reason', async () => {
    serve(payload());
    render(<AdminAccess {...props()} />);
    const drawer = await openDrawerFor('Ben Member');
    fireEvent.click(within(drawer).getByTestId('member-change-role'));
    fireEvent.change(screen.getByLabelText(/New role/), { target: { value: 'approver' } });
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Named approver for the IND' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: /Change role/ }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual(['PATCH', '/api/tenant-users/7/42', { role: 'approver', reason: 'Named approver for the IND' }]);
    await waitFor(() => expect(toastText()).toMatch(/Ben Member is now Approver/));
  });

  it('the invite form offers the same roles, labelled as the rest of the page labels them', async () => {
    serve(payload());
    render(<AdminAccess {...props()} />);
    await screen.findAllByText('Ada Admin');
    fireEvent.click(screen.getByTestId('admin-invite-member'));
    const role = screen.getByLabelText(/^Role/) as HTMLSelectElement;
    expect(Array.from(role.options).map((o) => [o.value, o.textContent])).toEqual([
      ['', 'Select…'], ['admin', 'Admin'], ['approver', 'Approver'], ['manager', 'Manager'],
      ['reviewer', 'Reviewer'], ['member', 'Member'], ['viewer', 'Viewer'],
    ]);
  });
});

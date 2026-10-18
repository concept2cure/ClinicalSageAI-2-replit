// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
const h = vi.hoisted(() => ({ request: vi.fn(), publish: vi.fn() }));
vi.mock('@/lib/queryClient', async (original) => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: h.request }));
vi.mock('../surfaceContext', () => ({ usePublishSurfaceContext: h.publish }));
import { ApiRequestError } from '@/lib/queryClient';
import { AdminAccess } from '../surfaces/AdminAccess';

const setupUrl = 'https://c2c.test/concept2cure/password-reset?token=private-admin-setup';
const data = { organizationId: 7, kpis: [], members: [{ id: 'u-1', userId: 1, self: true, initials: 'AA', name: 'Ada Admin', email: 'ada@c2c.test', role: 'Admin', groups: [], sso: '', mfa: false, lastSeen: '', state: 'active' }], roles: [], grants: [], apiKeys: [], audit: [], settings: [], sso: null };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
let reply: { status: number; body: unknown } | Error;
let delayedReload: boolean;
let adminReads: number;
const props = { surface: { id: 'admin-console', label: 'Admin' } as never, segment: 'admin', onNav: vi.fn(), onAsk: vi.fn() };

beforeEach(() => {
  reply = { status: 201, body: { createdNewUser: true, role: 'reviewer', invitation: { delivery: 'link', emailSent: false, setupUrl } } };
  delayedReload = false; adminReads = 0; h.request.mockReset(); h.publish.mockClear();
  h.request.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === '/api/mdx/admin') {
      adminReads += 1;
      if (delayedReload && adminReads > 1) return new Promise<Response>(() => {});
      return json(200, { data, meta: { unavailable: [] } });
    }
    if (method === 'GET') return json(200, { data: {} });
    if (reply instanceof Error) throw reply;
    return json(reply.status, reply.body);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function invite() {
  render(<AdminAccess {...props} />);
  await screen.findAllByText('Ada Admin');
  fireEvent.click(screen.getByTestId('admin-invite-member'));
  const dialog = screen.getByRole('dialog', { name: 'Invite a member' });
  fireEvent.change(within(dialog).getByLabelText(/^Full name/), { target: { value: 'Lee Review' } });
  fireEvent.change(within(dialog).getByLabelText(/^Email/), { target: { value: 'lee@c2c.test' } });
  fireEvent.change(within(dialog).getByLabelText(/^Role/), { target: { value: 'reviewer' } });
  await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Send invite' })));
}

describe('administrative invitations use the canonical private outcome handover', () => {
  it('keeps a setup link visible during roster reload and copies only on explicit request', async () => {
    delayedReload = true;
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
    await invite();
    const link = await screen.findByRole('textbox', { name: 'Setup link for lee@c2c.test' });
    expect(link).toHaveProperty('value', setupUrl);
    expect(await screen.findByText('Loading admin and access…')).toBeTruthy();
    expect(copy).not.toHaveBeenCalled();
    expect(JSON.stringify(h.publish.mock.calls)).not.toContain('private-admin-setup');
    expect(JSON.stringify(h.publish.mock.calls)).not.toContain('lee@c2c.test');
    fireEvent.click(screen.getByRole('button', { name: 'Copy setup link for lee@c2c.test' }));
    await waitFor(() => expect(copy).toHaveBeenCalledExactlyOnceWith(setupUrl));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss invitation handover' }));
    expect(screen.queryByRole('textbox', { name: 'Setup link for lee@c2c.test' })).toBeNull();
  });

  it('reports pending consent without claiming email delivery or immediate membership', async () => {
    reply = { status: 202, body: { success: true, pendingInvitation: true } };
    await invite();
    expect(await screen.findByText('Awaiting consent')).toBeTruthy();
    expect(screen.getByText(/must accept before membership is added/i)).toBeTruthy();
    expect(screen.queryByText('Email sent')).toBeNull();
  });

  it('treats a malformed success as unconfirmed, rather than inventing an invitation email', async () => {
    reply = { status: 201, body: null };
    await invite();
    expect(await screen.findByText('Outcome unconfirmed')).toBeTruthy();
    expect(screen.queryByText('Email sent')).toBeNull();
    expect(adminReads).toBe(1);
  });

  it('reports network uncertainty without claiming that nothing was created', async () => {
    reply = new Error('ECONNRESET from /api/tenant-users');
    await invite();
    expect(await screen.findByText('Outcome unconfirmed')).toBeTruthy();
    expect(screen.getAllByText(/invitation outcome is unconfirmed/i).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/Nothing was created|ECONNRESET|\/api\/tenant-users/);
  });

  it('keeps a server refusal visible with its actual reason and no setup link', async () => {
    reply = new ApiRequestError('No licensed seats available.', 403, { message: 'No licensed seats available.' });
    await invite();
    expect(await screen.findByText('Invitation refused')).toBeTruthy();
    expect(screen.getAllByText('No licensed seats available.').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Copy setup link/ })).toBeNull();
  });
});

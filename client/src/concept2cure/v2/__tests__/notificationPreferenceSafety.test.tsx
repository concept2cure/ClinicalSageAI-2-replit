// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ request: vi.fn(), userId: 33, organizationId: 1 }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: h.request }));
vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => `actor-${h.userId}-org-${h.organizationId}`,
  capturedActorHeaders: (scope: { userId: number; organizationId: number }) => {
    if (scope.userId !== h.userId || scope.organizationId !== h.organizationId) throw new Error('Your signed-in account or organization changed.');
    return { Authorization: `Bearer actor-${h.userId}-org-${h.organizationId}`, 'x-organization-id': String(h.organizationId) };
  },
}));
import { NotificationPreferences } from '../NotificationPreferences';
const scope = { userId: '33', organizationId: '1' };
const json = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });
const row = { category: 'system', in_app_enabled: true };
beforeEach(() => { h.request.mockReset(); h.userId = 33; h.organizationId = 1; h.request.mockResolvedValue(json([row])); });
afterEach(cleanup);

describe('notification preference safety', () => {
  it.each([
    { rows: [{ category: 'system', in_app_enabled: 'false' }] },
    { rows: [row, { category: 'system', in_app_enabled: false }] },
    { rows: [{ category: 'unrecognized_category', in_app_enabled: false }] },
  ])('refuses invalid or ambiguous saved preferences instead of guessing defaults', async ({ rows }) => {
    h.request.mockResolvedValue(json(rows));
    render(<NotificationPreferences scope={scope} onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('alert');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
  it('does not acknowledge an unconfirmed successful write', async () => {
    h.request.mockImplementation(async method => method === 'PUT' ? json({}) : json([row]));
    const saved = vi.fn(); render(<NotificationPreferences scope={scope} onClose={vi.fn()} onSaved={saved} />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'System notices' }));
    await screen.findByRole('alert');
    expect(saved).not.toHaveBeenCalled();
  });
  it('refuses a stale-organization write before sending it', async () => {
    render(<NotificationPreferences scope={scope} onClose={vi.fn()} onSaved={vi.fn()} />);
    const checkbox = await screen.findByRole('checkbox', { name: 'System notices' });
    h.organizationId = 2; fireEvent.click(checkbox);
    expect(h.request.mock.calls.filter(([method]) => method === 'PUT')).toHaveLength(0);
  });
  it('never delivers an old save acknowledgement to a changed account', async () => {
    let release!: (response: Response) => void;
    h.request.mockImplementation(async method => method === 'PUT' ? new Promise(resolve => { release = resolve; }) : json([row]));
    const saved = vi.fn(); render(<NotificationPreferences scope={scope} onClose={vi.fn()} onSaved={saved} />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'System notices' }));
    await waitFor(() => expect(release).toBeTypeOf('function'));
    h.userId = 44;
    release(json({ organization_id: 1, user_id: 33, category: 'system', in_app_enabled: false }));
    await screen.findByRole('alert');
    expect(saved).not.toHaveBeenCalled();
  });
});


describe('saved preference ownership and request lifecycle', () => {
  it.each([{ organization_id: 2, user_id: 33 }, { organization_id: 1, user_id: 44 }])('rejects a confirmation for another recipient scope', async foreign => {
    h.request.mockImplementation(async method => method === 'PUT' ? json({ ...foreign, category: 'system', in_app_enabled: false }) : json([row]));
    const saved = vi.fn(); render(<NotificationPreferences scope={scope} onClose={vi.fn()} onSaved={saved} />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'System notices' }));
    await screen.findByRole('alert');
    expect(saved).not.toHaveBeenCalled();
    expect(h.request).toHaveBeenCalledWith('PUT', '/api/mdx/notification-subscriptions/system', { inAppEnabled: false }, { Authorization: 'Bearer actor-33-org-1', 'x-organization-id': '1' });
  });
  it('blocks duplicate writes and drops a reply after the settings close', async () => {
    let release!: (response: Response) => void;
    h.request.mockImplementation(async method => method === 'PUT' ? new Promise(resolve => { release = resolve; }) : json([row]));
    const saved = vi.fn(); const view = render(<NotificationPreferences scope={scope} onClose={vi.fn()} onSaved={saved} />);
    const checkbox = await screen.findByRole('checkbox', { name: 'System notices' });
    fireEvent.click(checkbox); fireEvent.click(checkbox);
    expect(h.request.mock.calls.filter(([method]) => method === 'PUT')).toHaveLength(1);
    expect((checkbox as HTMLInputElement).disabled).toBe(true);
    view.unmount();
    await act(async () => release(json({ organization_id: 1, user_id: 33, category: 'system', in_app_enabled: false })));
    expect(saved).not.toHaveBeenCalled();
    expect(h.request.mock.calls.filter(([method]) => method === 'GET')).toHaveLength(1);
  });
});

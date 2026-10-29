// @vitest-environment jsdom
/**
 * Account menu — the Billing entry (D2, fold billing into Licensing, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-billing/).
 *
 * "Billing" was in every member's menu and opened the `billing` screen, whose
 * invoice list answered any member. The invoices are on Licensing now, for
 * billing administrators, and the route refuses anyone else. The entry follows
 * them: it opens Licensing and is offered when the session carries the
 * permission the server derives from the route's own role list
 * (BILLING_ADMIN_PERMISSION). Usage & limits and Compare subscriptions stay in
 * every member's menu.
 *
 * The real Rail over the real NavEntitlementsProvider, network stubbed.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

const auth = vi.hoisted(() => ({ roles: ['admin', 'user'] as string[], permissions: undefined as string[] | undefined }));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({
    user: { firstName: 'Ada', lastName: 'Rowe', displayName: 'Ada Rowe', roles: auth.roles, permissions: auth.permissions },
    logout: vi.fn(),
  }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: null, organizationId: 7 }),
}));

import { NavEntitlementsProvider } from '../navEntitlements';
import { Rail } from '../Shell';

const NAV_URL = '/api/module-subscriptions/navigation';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

async function openAccountMenu() {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === NAV_URL) {
      return ok({ organizationId: 7, tier: 'enterprise', industryMode: 'biotech', masterAdmin: false, platformAdmin: false, resolved: true, surfaces: [] });
    }
    throw new Error(`unexpected ${method} ${url}`);
  });
  const onNav = vi.fn();
  render(
    <NavEntitlementsProvider>
      <Rail activeId="projects" onNav={onNav} collapsed={false} setCollapsed={() => {}} segment="biotech" setSegment={() => {}} />
    </NavEntitlementsProvider>,
  );
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', NAV_URL));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  fireEvent.click(screen.getByTitle('Ada Rowe'));
  return { onNav, items: () => screen.getAllByRole('menuitem').map((b) => (b.textContent ?? '').trim()) };
}

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  auth.roles = ['admin', 'user'];
  auth.permissions = undefined;
});

describe('Account menu — Billing', () => {
  it('is not offered to a member; Usage & limits and Compare subscriptions are', async () => {
    auth.roles = ['member', 'user'];
    auth.permissions = ['governed:write'];
    const { items } = await openAccountMenu();
    expect(items()).not.toContain('Billing');
    expect(items()).toContain('Usage & limits');
    expect(items()).toContain('Compare subscriptions');
  });

  it('is not offered to an organisation administrator whose session lacks the billing permission', async () => {
    // isOrgAdmin admits business_admin; the billing guard does not. The menu
    // follows the guard's permission, not the broader admin test.
    auth.roles = ['business_admin', 'user'];
    auth.permissions = ['governed:write'];
    const { items } = await openAccountMenu();
    expect(items()).toContain('Admin');
    expect(items()).not.toContain('Billing');
  });

  it('is offered to a billing administrator and opens Licensing, never the retired billing screen', async () => {
    auth.permissions = ['governed:write', 'report:finalize', 'audit:attest', 'billing:admin'];
    const { items, onNav } = await openAccountMenu();
    expect(items()).toContain('Billing');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Billing' }));
    expect(onNav).toHaveBeenCalledWith('licensing');
    expect(onNav).not.toHaveBeenCalledWith('billing');
  });
});

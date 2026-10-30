// @vitest-environment jsdom
/**
 * Account menu — the billing administrator's one subscription entry (D2, fold
 * billing into Licensing; decision P-68; docs/evidence/D2-ONE-ANA/2026-10-29/fold-billing/).
 *
 * "Billing" was in every member's menu and opened the `billing` screen, whose
 * invoice list answered any member. Part 1 moved the invoices to Licensing for
 * billing administrators and pointed "Billing" there, which left a billing
 * administrator two doors to one screen, "Billing" and "Compare subscriptions".
 * P-68: a billing administrator's menu has one entry, "Subscription & billing",
 * opening Licensing (INFORMATION_ARCHITECTURE.md section 9); every member keeps
 * "Usage & limits", and a member who is not a billing administrator keeps
 * "Compare subscriptions". The entry follows the permission the server derives
 * from the billing routes' own role list (BILLING_ADMIN_PERMISSION), not the
 * broader org-admin test.
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

describe('Account menu — the subscription entry (P-68)', () => {
  it('a member keeps Usage & limits and Compare subscriptions, and has no billing entry', async () => {
    auth.roles = ['member', 'user'];
    auth.permissions = ['governed:write'];
    const { items, onNav } = await openAccountMenu();
    expect(items()).toContain('Usage & limits');
    expect(items()).toContain('Compare subscriptions');
    expect(items()).not.toContain('Subscription & billing');
    expect(items()).not.toContain('Billing');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Compare subscriptions' }));
    expect(onNav).toHaveBeenCalledWith('licensing');
  });

  it('an organisation administrator whose session lacks the billing permission is offered what a member is', async () => {
    // isOrgAdmin admits business_admin; the billing guard does not.
    auth.roles = ['business_admin', 'user'];
    auth.permissions = ['governed:write'];
    const { items } = await openAccountMenu();
    expect(items()).toContain('Admin');
    expect(items()).toContain('Compare subscriptions');
    expect(items()).not.toContain('Subscription & billing');
  });

  it('a billing administrator has one entry, Subscription & billing, opening Licensing, and Usage & limits', async () => {
    auth.permissions = ['governed:write', 'report:finalize', 'audit:attest', 'billing:admin'];
    const { items, onNav } = await openAccountMenu();
    const toLicensing = items().filter((i) => ['Subscription & billing', 'Compare subscriptions', 'Billing'].includes(i));
    expect(toLicensing).toEqual(['Subscription & billing']);
    expect(items()).toContain('Usage & limits');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Subscription & billing' }));
    expect(onNav).toHaveBeenCalledWith('licensing');
    expect(onNav).not.toHaveBeenCalledWith('billing');
  });
});

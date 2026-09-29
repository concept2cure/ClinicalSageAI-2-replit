// @vitest-environment jsdom
/**
 * Account menu — who is offered the Master Administration licensing console.
 *
 * "Licensing" in the account menu opens `master-licensing`: the PLATFORM
 * operator's console (packaging, every tenant, trials, flags, enforcement). Its
 * whole router sits behind `requirePlatformAdmin`, which has no org-admin
 * bypass. The entry used to be offered on `isOrgAdmin`, so every customer
 * organisation's administrator opened seven tabs that each said "Master
 * Administration access is restricted to platform administrators" — a
 * destination that can never work for them, offered as if it could.
 *
 * The entry is now offered exactly when the navigation payload's
 * `platformAdmin` is true, and the server computes that with the guard's own
 * function. These tests mount the real Rail over the real
 * NavEntitlementsProvider, with only the network stubbed.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

const auth = vi.hoisted(() => ({ roles: ['admin', 'user'] as string[] }));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({
    user: { firstName: 'Ada', lastName: 'Rowe', displayName: 'Ada Rowe', roles: auth.roles },
    logout: vi.fn(),
  }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: null, organizationId: 7 }),
}));

import { NavEntitlementsProvider, type NavEntitlementsPayload } from '../navEntitlements';
import { Rail } from '../Shell';

const NAV_URL = '/api/module-subscriptions/navigation';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

function payload(over: Partial<NavEntitlementsPayload> = {}): NavEntitlementsPayload {
  return {
    organizationId: 7,
    tier: 'enterprise',
    industryMode: 'biotech',
    masterAdmin: false,
    platformAdmin: false,
    resolved: true,
    surfaces: [],
    ...over,
  };
}

function mockNav(impl: () => Promise<Response>) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === NAV_URL) return impl();
    throw new Error(`unexpected ${method} ${url}`);
  });
}

/** Mount the rail, let the nav fetch settle, open the account menu. */
async function openAccountMenu() {
  const onNav = vi.fn();
  render(
    <NavEntitlementsProvider>
      <Rail
        activeId="projects"
        onNav={onNav}
        collapsed={false}
        setCollapsed={() => {}}
        segment="biotech"
        setSegment={() => {}}
      />
    </NavEntitlementsProvider>,
  );
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', NAV_URL));
  // Flush the verdict microtasks so an assertion of ABSENCE cannot pass merely
  // by running before the payload landed.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  fireEvent.click(screen.getByTitle('Ada Rowe'));
  return { onNav, menuItems: () => screen.getAllByRole('menuitem').map((b) => b.textContent) };
}

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  auth.roles = ['admin', 'user'];
});

describe('Account menu — Master Administration licensing entry', () => {
  it('is not offered to a customer org admin the console refuses', async () => {
    mockNav(async () => ok(payload({ platformAdmin: false })));
    const { menuItems } = await openAccountMenu();

    // The org-admin entries are still there; only the platform console is not.
    expect(menuItems()).toContain('Admin');
    expect(menuItems()).toContain('Access requests');
    expect(menuItems()).not.toContain('Licensing');
    // The customer's own plan page stays reachable.
    expect(menuItems()).toContain('View all plans');
  });

  it('is not offered on masterAdmin alone — the commercial unlock is not console access', async () => {
    mockNav(async () => ok(payload({ masterAdmin: true, platformAdmin: false })));
    const { menuItems } = await openAccountMenu();
    expect(menuItems()).not.toContain('Licensing');
  });

  it('is offered when the server says the console guard admits this viewer, and opens it', async () => {
    mockNav(async () => ok(payload({ platformAdmin: true })));
    const { menuItems, onNav } = await openAccountMenu();

    expect(menuItems()).toContain('Licensing');
    fireEvent.click(screen.getByRole('menuitem', { name: /Licensing/ }));
    expect(onNav).toHaveBeenCalledWith('master-licensing');
  });

  it('follows the server, not the org role: a platform admin without an org-admin role sees it', async () => {
    auth.roles = ['member'];
    mockNav(async () => ok(payload({ platformAdmin: true })));
    const { menuItems } = await openAccountMenu();
    expect(menuItems()).toContain('Licensing');
    expect(menuItems()).not.toContain('Admin');
  });

  it('survives resolved:false — the answer does not depend on the catalog read', async () => {
    mockNav(async () => ok(payload({ resolved: false, platformAdmin: true })));
    const { menuItems } = await openAccountMenu();
    expect(menuItems()).toContain('Licensing');
  });

  it('is not offered when the navigation fetch fails', async () => {
    mockNav(async () => {
      throw new Error('Failed to fetch');
    });
    const { menuItems } = await openAccountMenu();
    expect(menuItems()).not.toContain('Licensing');
    expect(menuItems()).toContain('Admin');
  });

  it('is not offered when an older server omits the field', async () => {
    const legacy: Record<string, unknown> = { ...payload() };
    delete legacy.platformAdmin;
    mockNav(async () => ok(legacy));
    const { menuItems } = await openAccountMenu();
    expect(menuItems()).not.toContain('Licensing');
  });
});

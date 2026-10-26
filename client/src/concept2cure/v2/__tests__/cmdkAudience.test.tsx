// @vitest-environment jsdom
/**
 * ⌘K offers an administration page only to who the account menu offers it to.
 *
 * The slice 0 launch walk found the palette's search listing every in-release registry surface that matched:
 * Master licensing ("platform-owner administration") to a customer's administrator, and the Admin console
 * to members (docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/slice0/README.md, "What the walk found", item 3).
 * The account menu offers them on `isOrgAdmin` and `platformAdmin` (Shell.tsx AccountMenu); the palette
 * now reads the same rule (ADMIN_AUDIENCE).
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ roles: ['member'] as string[] }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { firstName: 'Ada', lastName: 'Rowe', displayName: 'Ada Rowe', roles: auth.roles }, logout: vi.fn() }),
}));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ tenant: null, organizationId: 7 }) }));

import { NavEntitlementsProvider, type NavEntitlementsPayload } from '../navEntitlements';
import { CmdK } from '../Shell';

const NAV_URL = '/api/module-subscriptions/navigation';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

function serve(platformAdmin: boolean) {
  const body: NavEntitlementsPayload = {
    organizationId: 7, tier: 'standard', industryMode: 'biotech', masterAdmin: false, platformAdmin, resolved: true, surfaces: [],
  };
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === NAV_URL) return ok(body);
    throw new Error(`unexpected ${method} ${url}`);
  });
}

async function search(term: string): Promise<string[]> {
  render(
    <NavEntitlementsProvider>
      <CmdK open onClose={() => {}} onNav={vi.fn()} onAsk={vi.fn()} onAct={vi.fn()} />
    </NavEntitlementsProvider>,
  );
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', NAV_URL));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: term } });
  return [...document.querySelectorAll('.cmdk-list .cmdk-item .lbl')].map((el) => el.textContent ?? '');
}

afterEach(() => { cleanup(); apiRequest.mockReset(); auth.roles = ['member']; });

describe('⌘K: administration pages by audience', () => {
  it('a member is offered neither the Admin console, Subscription & features, Access requests nor Platform licensing', async () => {
    serve(false);
    const rows = [...await search('admin'), ...await (async () => { cleanup(); return search('licens'); })()];
    expect(rows.filter((r) => /Admin console|Subscription & features|Access requests|Platform licensing/.test(r))).toEqual([]);
  });

  it("a customer's administrator is offered the Admin console, not Platform licensing", async () => {
    auth.roles = ['admin', 'user'];
    serve(false);
    expect(await search('admin')).toContain('Admin console');
    cleanup();
    expect((await search('licens')).filter((r) => /Platform licensing/.test(r))).toEqual([]);
  });

  it('a platform administrator is offered Platform licensing', async () => {
    auth.roles = ['admin', 'user'];
    serve(true);
    expect(await search('licens')).toContain('Platform licensing');
  });
});

// @vitest-environment jsdom
/**
 * Subscription & features is every member's, and a member sees what they may open (P-122, 2026-11-10).
 *
 * Since d97388005 (2026-10-25) the catalog was an organisation administrator's page: the account menu offered it
 * on `isOrgAdmin` and ⌘K withheld it from members (ADMIN_AUDIENCE). A member had no list of the features their
 * organisation had, so the built work areas read as absent (docs/evidence/DESIGN/P-122/inventory/
 * vault-authoring-submission.md §0.3, §4 #1a).
 *
 * Pinned here, for a member:
 *   - the catalog lists only the features this person may open: switched on for the organisation, not locked, and
 *     available in this release by the viewer's own navigation verdicts;
 *   - it offers no administrator controls and no switch, which the server would refuse them (PUT /:moduleId/toggle
 *     is admin-only);
 *   - each feature opens, and the page says it is the member's list, not the organisation's licensing.
 * And for an administrator, nothing changes: every feature, locked ones with their reason, and the admin controls.
 * The account menu and ⌘K cases are in shellQuietChrome.test.tsx and cmdkAudience.test.tsx.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { UiSurface } from '@shared/constants/ui-surface-registry';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const viewer = vi.hoisted(() => ({ roles: ['member'] as string[] }));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => ({ id: 21, firstName: 'Mo', lastName: 'Member', roles: viewer.roles }),
}));

import { Apps } from '../surfaces/AdminSurfaces';

const SURFACE = {
  id: 'apps', label: 'Subscription & features', navTier: 'global', layoutMode: 'apps',
  group: 'workspace', uiKit: null, apiPrefixes: [], anaToolFamilies: [],
  sharedContract: null, discoveryCatalog: null, readiness: 'routes-ready', compliance: [],
} as unknown as UiSurface;

const CATALOG = {
  modules: [
    { moduleId: 'vault', name: 'Vault', description: 'Governed documents', category: 'content',
      isEnabled: true, isAvailable: true, requiredTier: 'standard', sortOrder: 1 },
    { moduleId: 'submission-center', name: 'Submission Center', description: 'eCTD sequences', category: 'submission',
      isEnabled: true, isAvailable: true, requiredTier: 'standard', sortOrder: 2 },
    // Switched off by the organisation's administrator: nobody can open it.
    { moduleId: 'quality', name: 'Quality', description: 'Controlled documents', category: 'quality',
      isEnabled: false, isAvailable: true, subscriptionState: 'disabled', requiredTier: 'standard', sortOrder: 3 },
    // Above the organisation's plan.
    { moduleId: 'insights', name: 'Reporting & analytics', description: 'Reports', category: 'intelligence',
      isEnabled: false, isAvailable: false, requiredTier: 'enterprise', sortOrder: 4 },
  ],
};
const LICENSE = {
  organizationId: 7, tier: 'standard', industryMode: 'biotech', enabledModules: ['vault', 'submission-center'],
  usage: { projects: { withinQuota: true, currentCount: 3, maxAllowed: 10 }, users: { withinQuota: true, currentCount: 4, maxAllowed: 10 } },
};
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

function serve() {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/module-subscriptions/catalog') return ok(CATALOG);
    if (method === 'GET' && url === '/api/module-subscriptions/license') return ok(LICENSE);
    throw new Error(`unexpected ${method} ${url}`);
  });
}

/** Every disclosure opened, as a person reading the whole page would. */
function openAll() {
  for (const d of Array.from(document.querySelectorAll('details'))) {
    if (!(d as HTMLElement & { open: boolean }).open) fireEvent.click(d.querySelector('summary')!);
  }
}

afterEach(() => { cleanup(); apiRequest.mockReset(); viewer.roles = ['member']; });

describe('a member: the features they may open, and nothing they cannot use', () => {
  it('lists the features switched on for the organisation, and none that is locked', async () => {
    serve();
    const onNav = vi.fn();
    render(<Apps surface={SURFACE} onAsk={() => {}} onNav={onNav} segment="biotech" />);
    await screen.findAllByText('Vault');
    openAll();
    expect(screen.getAllByText('Submission Center').length).toBeGreaterThan(0);
    expect(screen.queryByText('Quality')).toBeNull();
    expect(screen.queryByText('Reporting & analytics')).toBeNull();
    expect(document.querySelectorAll('.launch[data-locked]')).toHaveLength(0);
    const open = screen.getAllByRole('button', { name: 'Open' });
    expect(open.length).toBeGreaterThan(0);
    fireEvent.click(open[0]);
    expect(onNav).toHaveBeenCalled();
  });

  it('offers no administrator controls and no switch', async () => {
    serve();
    render(<Apps surface={SURFACE} onAsk={() => {}} onNav={() => {}} segment="biotech" />);
    await screen.findAllByText('Vault');
    openAll();
    expect(screen.queryByRole('button', { name: /Admin controls/ })).toBeNull();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.getByText(/the features you can open/i)).toBeTruthy();
  });
});

describe('an administrator: unchanged', () => {
  it('sees every feature, the locked ones with their reason, and the admin controls', async () => {
    viewer.roles = ['admin'];
    serve();
    render(<Apps surface={SURFACE} onAsk={() => {}} onNav={() => {}} segment="biotech" />);
    await screen.findAllByText('Vault');
    openAll();
    expect(screen.getAllByText(/Quality/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Reporting & analytics/).length).toBeGreaterThan(0);
    // The header's switch for the admin controls, and each switched-off feature's own way to them.
    expect(screen.getAllByRole('button', { name: /Admin controls/ }).length).toBeGreaterThan(0);
  });
});

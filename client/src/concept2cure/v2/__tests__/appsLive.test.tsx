// @vitest-environment jsdom
/**
 * Apps surface ↔ /api/module-subscriptions wiring.
 *
 * Locks the honest live adoption in surfaces/AdminSurfaces.tsx (fixture-free —
 * the surface reads /catalog + /license via useLiveData, with no "Live" /
 * "Sample data" pill):
 *  - GET /catalog + /license render live module names, tier chips, quota numbers
 *  - renewsAt is never invented when live (the backend holds no renewal date)
 *  - toggle PUTs to /:moduleId/toggle; server rejection reverts the switch and
 *    surfaces the reason (no silent fake success)
 *  - offline → fails closed to an honest unavailable/empty state, never a
 *    fabricated fixture (no "Sample data", no invented renewal)
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UiSurface } from '@shared/constants/ui-surface-registry';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { Apps } from '../surfaces/AdminSurfaces';

const SURFACE: UiSurface = {
  id: 'apps', label: 'Apps catalog', navTier: 'workspace', layoutMode: 'apps',
  group: 'workspace', uiKit: null, apiPrefixes: [], anaToolFamilies: [],
  sharedContract: null, discoveryCatalog: null, readiness: 'routes-ready', compliance: [],
} as unknown as UiSurface;

const CATALOG = {
  modules: [
    {
      moduleId: 'cmc-wizard', name: 'CMC Wizard', description: 'ICH Q-series authoring',
      category: 'authoring', icon: 'FlaskConical', path: '/cmc-wizard',
      isEnabled: true, isAvailable: true, requiredTier: 'professional', sortOrder: 20,
    },
    {
      moduleId: 'insight-synthesis', name: 'Insight Synthesis', description: 'Cross-study analysis',
      category: 'intelligence', icon: 'BrainCircuit', path: '/insights',
      isEnabled: false, isAvailable: false, requiredTier: 'enterprise', sortOrder: 31,
    },
  ],
};

const LICENSE = {
  organizationId: 7, tier: 'professional', industryMode: 'biotech',
  enabledModules: ['cmc-wizard'], maxUsers: 50, maxProjects: 25, maxStorageGB: 5,
  usage: {
    projects: { withinQuota: true, currentCount: 14, maxAllowed: 25 },
    users: { withinQuota: true, currentCount: 38, maxAllowed: 50 },
  },
};

function ok(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload } as Response;
}

/** GETs resolve live; PUT behavior injectable per test. */
function mockLive(onPut?: (url: string, body: unknown) => Promise<Response>) {
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (method === 'GET' && url === '/api/module-subscriptions/catalog') return ok(CATALOG);
    if (method === 'GET' && url === '/api/module-subscriptions/license') return ok(LICENSE);
    if (method === 'PUT' && onPut) return onPut(url, body);
    throw new Error(`unexpected ${method} ${url}`);
  });
}

const noop = () => {};
const mount = () => render(<Apps surface={SURFACE} onAsk={noop} onNav={noop} segment="biotech" />);

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe('Apps — live module subscriptions', () => {
  it('adopts /catalog + /license and renders live module data', async () => {
    mockLive();
    mount();
    // Fixture-free (useLiveData): the surface renders live module names directly,
    // with no "Live"/"Sample data" pill. The first live name resolving is the
    // load gate (the catalog seeds via an effect after the fetch resolves).
    expect(await screen.findByText('CMC Wizard')).toBeTruthy();
    expect(screen.getByText('Insight Synthesis')).toBeTruthy();
    expect(screen.getByText('Authoring')).toBeTruthy();
    // tier chips: within-plan → its lowest tier; out-of-plan → Add-on (upgrade
    // path). 'Professional' appears twice: the plan band + the module chip.
    expect(screen.getAllByText('Professional')).toHaveLength(2);
    expect(screen.getByText('Add-on')).toBeTruthy();
    expect(screen.getByText('Upgrade plan')).toBeTruthy();
    // live quota numbers
    expect(screen.getByText('14 / 25')).toBeTruthy();
    expect(screen.getByText('38 / 50')).toBeTruthy();
    // renewsAt cannot be truthfully supplied → never rendered when live
    expect(screen.queryByText(/Renews/)).toBeNull();
  });

  it('toggle PUTs to the real endpoint and reports the result', async () => {
    const put = vi.fn(async () => ok({ moduleId: 'cmc-wizard', enabled: false }));
    mockLive(put);
    mount();
    await screen.findByText('CMC Wizard'); // wait for the live catalog to adopt
    fireEvent.click(screen.getByTitle('Toggle admin controls'));
    fireEvent.click(screen.getByTitle('Disable module')); // the enabled within-plan module
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/api/module-subscriptions/cmc-wizard/toggle', { enabled: false }),
    );
    expect(await screen.findByText(/Disabled CMC Wizard/)).toBeTruthy();
  });

  it('server rejection reverts the switch and surfaces the reason', async () => {
    mockLive(async () => {
      throw new Error('Admin access required');
    });
    mount();
    await screen.findByText('CMC Wizard'); // wait for the live catalog to adopt
    fireEvent.click(screen.getByTitle('Toggle admin controls'));
    const sw = screen.getByTitle('Disable module');
    fireEvent.click(sw);
    expect(await screen.findByText(/Could not disable CMC Wizard -- Admin access required/)).toBeTruthy();
    // reverted — still on, still offering "Disable"
    await waitFor(() => expect(screen.getByTitle('Disable module')).toBeTruthy());
    expect(screen.getByTitle('Disable module').getAttribute('aria-checked')).toBe('true');
  });

  it('fails closed offline without fabricating data', async () => {
    apiRequest.mockRejectedValue(new Error('network down'));
    mount();
    // The surface still renders (no crash) — its header is always present.
    expect(await screen.findByText('Apps catalog')).toBeTruthy();
    // De-mocked to the fixture-free contract: offline it fails closed to an
    // honest unavailable/empty state and must NOT fabricate a "Sample data"
    // fixture, a "Live" pill, or an invented renewal date.
    expect(screen.queryByText('Sample data')).toBeNull();
    expect(screen.queryByText('Live')).toBeNull();
    expect(screen.queryByText(/Renews 2027-01-14/)).toBeNull();
  });
});

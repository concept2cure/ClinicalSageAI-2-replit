// @vitest-environment jsdom
/**
 * Apps surface ↔ /api/module-subscriptions wiring.
 *
 * Locks the FIXTURE-FREE live adoption in surfaces/AdminSurfaces.tsx. This test
 * was rewritten when the surface dropped its Live/Sample pills and curated
 * fixture fallback in the honesty sweep — offline now renders an honest
 * failed-load state, never a fixture:
 *  - GET /catalog + /license adopted (live module names, category groups, tier
 *    chips, quota numbers); renewsAt is never invented (backend holds none)
 *  - toggle PUTs to /:moduleId/toggle; server rejection reverts the switch and
 *    surfaces the reason (no silent fake success)
 *  - offline → honest error states; NO fixture content, NO sample pill
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UiSurface } from '@shared/constants/ui-surface-registry';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
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

describe('Apps — live module subscriptions (fixture-free)', () => {
  it('adopts /catalog + /license: live names, category groups, tiers, quotas', async () => {
    mockLive();
    mount();
    // live module names and grouped-by-category headers
    expect(await screen.findByText('CMC Wizard')).toBeTruthy();
    expect(screen.getByText('Insight Synthesis')).toBeTruthy();
    expect(screen.getByText('Authoring')).toBeTruthy();
    expect(screen.getByText('Intelligence')).toBeTruthy();
    /* Tier chips state the PACKAGING BAND — the lowest plan that includes the
       module — for every row, whether or not this org has reached it.
       'Professional' appears twice: the plan band and the cmc-wizard chip.

       This assertion used to require the literal string 'Add-on' for the
       out-of-plan row, and that was pinning a defect rather than a contract.
       `liveTierLabel` mapped `!isAvailable` to 'Add-on' BEFORE consulting
       `requiredTier`, which threw away the one number a customer actually needs
       — which plan do I need? — and said the same purchasable-sounding word for
       a module withheld by INDUSTRY MODE, which no plan on the price list will
       ever unlock. insight-synthesis requires enterprise, so the chip says so.
       WHY it is unavailable is now the lock's job, asserted separately. */
    expect(screen.getAllByText('Professional')).toHaveLength(2);
    // insight-synthesis is above this org's plan, so the chip carries the lock's
    // own sentence — which names the plan that WOULD include it.
    expect(screen.getByText(/Included from Enterprise/)).toBeTruthy();
    expect(screen.queryByText('Add-on')).toBeNull();
    /* The CTA is the shell's own words now, not a second string for the same
       step. It was 'Upgrade plan'; it is 'View plans', which is what
       lockNotice's tier branch offers everywhere else — and the more honest of
       the two, since pressing it shows you plans rather than committing you to
       one. One vocabulary across the rail, the palette and this catalog. */
    expect(screen.getByText('View plans')).toBeTruthy();
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
    await screen.findByText('CMC Wizard');
    fireEvent.click(screen.getByTitle('Toggle admin controls'));
    fireEvent.click(screen.getByTitle('Disable module')); // the enabled within-plan module
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/api/module-subscriptions/cmc-wizard/toggle', { enabled: false }),
    );
    expect(await screen.findByText(/Disabled CMC Wizard/)).toBeTruthy();
  });

  it('server rejection reverts the switch and surfaces the reason', async () => {
    // An ApiRequestError, not a bare Error, because that is what apiRequest
    // actually throws for a non-OK status — and the surface now renders a
    // thrown message ONLY for that type. A bare Error here is a fetch failing
    // ("Failed to fetch"), whose text is not user copy; simulating a server
    // refusal with one made this test assert a path production cannot reach.
    mockLive(async () => {
      throw new ApiRequestError('Admin access required', 403, { error: 'Admin access required' });
    });
    mount();
    await screen.findByText('CMC Wizard');
    fireEvent.click(screen.getByTitle('Toggle admin controls'));
    fireEvent.click(screen.getByTitle('Disable module'));
    expect(await screen.findByText(/Could not disable CMC Wizard -- Admin access required/)).toBeTruthy();
    // reverted — still on, still offering "Disable"
    await waitFor(() => expect(screen.getByTitle('Disable module')).toBeTruthy());
  });

  it('offline → honest failed-load states, never a fixture or sample pill', async () => {
    apiRequest.mockRejectedValue(new Error('network down'));
    mount();
    // Honest error for the catalog; license band degrades to the honest note.
    expect(await screen.findByText("Couldn't load the apps catalog")).toBeTruthy();
    expect(screen.getByText(/License & entitlement details are unavailable/)).toBeTruthy();
    // No fixture content and no sample markers leak through.
    expect(screen.queryByText('CMC Wizard')).toBeNull();
    expect(screen.queryByText(/Sample data/i)).toBeNull();
    expect(screen.queryByText(/Renews/)).toBeNull();
  });
});

// @vitest-environment jsdom
/**
 * Apps catalog — entitlement honesty.
 *
 * appsLive.test.tsx locks the WIRING (the surface reads the real endpoints and
 * renders no fixture). This file locks what the surface then SAYS, because the
 * five states a module can be in were being rendered as two sentences:
 *
 *   1. on                          → open it
 *   2. in the plan, no row written → "Not switched on for this organization"
 *   3. an administrator switched it off → "turned off for this workspace"
 *   4. above the org's plan        → the plan that includes it, and View plans
 *   5. wrong industry for the workspace → no plan and no switch fixes it
 *
 * Collapsing 2 and 3 invented an administrator's decision for modules nobody
 * had touched. Collapsing 4 and 5 sold a plan to somebody whose module no plan
 * unlocks. And the switch was gated on the chip's LABEL ('Add-on'), so the
 * question "would the server take this write" was answered by display copy —
 * a wording change away from a button whose only outcome is 403
 * MODULE_NOT_AVAILABLE.
 *
 * Mocking follows appsLive.test.tsx exactly: one hoisted `apiRequest` spy, GETs
 * answered per URL, PUT injectable. The catalog rows here are real
 * ModuleCatalogEntry shapes (server/services/license-manager.ts), including
 * `subscriptionState`, which is the field that separates state 2 from state 3.
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

import { Apps } from '../surfaces/AdminSurfaces';

const SURFACE: UiSurface = {
  id: 'apps', label: 'Apps catalog', navTier: 'workspace', layoutMode: 'apps',
  group: 'workspace', uiKit: null, apiPrefixes: [], anaToolFamilies: [],
  sharedContract: null, discoveryCatalog: null, readiness: 'routes-ready', compliance: [],
} as unknown as UiSurface;

interface Row {
  moduleId: string;
  name: string;
  description: string | null;
  category: string | null;
  icon: string | null;
  path: string | null;
  isEnabled: boolean;
  subscriptionState: 'enabled' | 'disabled' | 'none';
  isAvailable: boolean;
  requiredTier: string | null;
  sortOrder: number;
}

function row(over: Partial<Row>): Row {
  return {
    moduleId: 'mod', name: 'Module', description: 'What it does',
    category: 'authoring', icon: null, path: null,
    isEnabled: false, subscriptionState: 'none',
    isAvailable: true, requiredTier: 'standard', sortOrder: 10,
    ...over,
  };
}

/** The org is on `professional`, in `biotech` — the plan every case is read against. */
const LICENSE = {
  organizationId: 7, tier: 'professional', industryMode: 'biotech',
  enabledModules: [], maxUsers: 50, maxProjects: 25, maxStorageGB: 5,
  usage: {
    projects: { withinQuota: true, currentCount: 3, maxAllowed: 25 },
    users: { withinQuota: true, currentCount: 9, maxAllowed: 50 },
  },
};

function ok(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload } as Response;
}

function mockCatalog(
  modules: Row[],
  opts: { license?: unknown; onPut?: (url: string, body: unknown) => Promise<Response> } = {},
) {
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (method === 'GET' && url === '/api/module-subscriptions/catalog') return ok({ modules });
    if (method === 'GET' && url === '/api/module-subscriptions/license') {
      return ok(opts.license === undefined ? LICENSE : opts.license);
    }
    if (method === 'PUT' && opts.onPut) return opts.onPut(url, body);
    throw new Error(`unexpected ${method} ${url}`);
  });
}

const noop = () => {};
const mount = () => render(<Apps surface={SURFACE} onAsk={noop} onNav={noop} segment="biotech" />);

/** Turn on the admin controls, the way an administrator does. */
function showAdminControls() {
  fireEvent.click(screen.getByTitle('Toggle admin controls'));
}

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe('Apps catalog — the five entitlement states are five different cards', () => {
  it('above the plan: names the plan that includes it and routes to plans, with no switch', async () => {
    mockCatalog([
      row({
        moduleId: 'insight-synthesis', name: 'Insight Synthesis',
        subscriptionState: 'none', isEnabled: false,
        isAvailable: false, requiredTier: 'enterprise',
      }),
    ]);
    mount();
    await screen.findByText('Insight Synthesis');

    // The real minimum tier, in the shell's own words — not 'Add-on', which
    // names no plan, and not the org's own tier.
    expect(screen.getByText(/Included from Enterprise/)).toBeTruthy();
    expect(screen.getByText(/Insight Synthesis is not included in your plan\./)).toBeTruthy();
    expect(screen.getByTestId('admin-upgrade-plan').textContent).toContain('View plans');

    // The server refuses this write with 403 MODULE_NOT_AVAILABLE, so the
    // switch is not offered — not before admin controls are shown, and not
    // after. This is the assertion that fails if the gate ever goes back to
    // string-matching the chip.
    expect(screen.queryByTitle('Enable module')).toBeNull();
    showAdminControls();
    expect(screen.queryByTitle('Enable module')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('wrong industry: says so, and offers no plan — because no plan changes it', async () => {
    mockCatalog([
      row({
        moduleId: 'device-510k', name: 'Device 510(k)',
        subscriptionState: 'none', isEnabled: false,
        // Tier is met (org is professional); `isAvailable` is false anyway, so
        // the only remaining cause is the industry gate.
        isAvailable: false, requiredTier: 'standard',
      }),
    ]);
    mount();
    await screen.findByText('Device 510(k)');

    expect(screen.getByText(/Not offered for this workspace/)).toBeTruthy();
    expect(screen.getByText(/Device 510\(k\) is not offered for this workspace\./)).toBeTruthy();
    // The distinction that matters commercially: an org told to upgrade here
    // would buy a plan that unlocks nothing.
    expect(screen.queryByText(/not included in your plan/)).toBeNull();
    expect(screen.queryByTestId('admin-upgrade-plan')).toBeNull();
    showAdminControls();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('an administrator switched it off: a workspace decision, not an upsell, and the switch is offered', async () => {
    mockCatalog([
      row({
        moduleId: 'risk', name: 'Risk Register',
        subscriptionState: 'disabled', isEnabled: false,
        isAvailable: true, requiredTier: 'standard',
      }),
    ]);
    mount();
    await screen.findByText('Risk Register');

    expect(screen.getByText(/Turned off for this workspace/)).toBeTruthy();
    expect(screen.getByText(/Risk Register is turned off for this workspace\./)).toBeTruthy();
    // Nothing is being sold: the plan already includes it.
    expect(screen.queryByText(/not included in your plan/)).toBeNull();
    expect(screen.queryByTestId('admin-upgrade-plan')).toBeNull();
    // The remedy is the switch, and the server accepts this write.
    showAdminControls();
    expect(screen.getByTitle('Enable module')).toBeTruthy();
  });

  it('in the plan but never provisioned: says it is not switched on, and blames nobody', async () => {
    mockCatalog([
      row({
        moduleId: 'labeling', name: 'Labeling',
        subscriptionState: 'none', isEnabled: false,
        isAvailable: true, requiredTier: 'professional',
      }),
    ]);
    mount();
    await screen.findByText('Labeling');

    expect(
      screen.getByText('Included in your plan. Not switched on for this organization.'),
    ).toBeTruthy();
    /* The defect this pins: 'none' and 'disabled' both arrive as isEnabled
       false, and the card used to answer both with "an admin can re-enable
       it" — an administrator's decision invented for a module no administrator
       has ever touched. */
    expect(screen.queryByText(/turned off for this workspace/i)).toBeNull();
    expect(screen.queryByText(/not included in your plan/)).toBeNull();
    // In the plan → the chip states the packaging band, not a lock reason.
    // Twice on screen: the licence band's "Current plan" and this module's chip.
    expect(screen.getAllByText('Professional')).toHaveLength(2);
    showAdminControls();
    expect(screen.getByTitle('Enable module')).toBeTruthy();
  });

  it('switched on: no lock sentence at all, and the card opens', async () => {
    mockCatalog([
      row({
        moduleId: 'ind', name: 'IND Wizard', description: 'Cross-module IND assembly',
        subscriptionState: 'enabled', isEnabled: true,
        isAvailable: true, requiredTier: 'standard',
      }),
    ]);
    mount();
    await screen.findByText('IND Wizard');

    expect(screen.getByText('Cross-module IND assembly')).toBeTruthy();
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.queryByText(/not included in your plan/)).toBeNull();
    expect(screen.queryByText(/turned off for this workspace/i)).toBeNull();
    expect(screen.queryByText(/Not switched on/)).toBeNull();
  });
});

describe('Apps catalog — writes the UI offers are writes the server accepts', () => {
  it('an out-of-plan module that is still RUNNING can be switched off (canAccessModule allows it)', async () => {
    /* The downgrade case: the org dropped to a lower tier, so isAvailable is
       false, but the subscription row is still enabled. canAccessModule returns
       allowed for anything in the org's enabled set, so switching it OFF is a
       write the server takes — and hiding the switch would strand the module
       running with no way to stop it. */
    const put = vi.fn(async () => ok({ moduleId: 'insight-synthesis', enabled: false }));
    mockCatalog(
      [
        row({
          moduleId: 'insight-synthesis', name: 'Insight Synthesis',
          subscriptionState: 'enabled', isEnabled: true,
          isAvailable: false, requiredTier: 'enterprise',
        }),
      ],
      { onPut: put },
    );
    mount();
    await screen.findByText('Insight Synthesis');
    showAdminControls();
    fireEvent.click(screen.getByTitle('Disable module'));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/api/module-subscriptions/insight-synthesis/toggle', {
        enabled: false,
      }),
    );
    expect(await screen.findByText(/Disabled Insight Synthesis/)).toBeTruthy();
    /* After the write the card states the decision that was just made, not the
       state before it: the optimistic row carries the reason, not only the
       switch position. */
    expect(
      await screen.findByText(/Insight Synthesis is turned off for this workspace\./),
    ).toBeTruthy();
  });
});

describe('Apps catalog — no verdict is not a verdict', () => {
  it('a 200 that is not the catalog contract is an error, never "no apps"', async () => {
    /* The failure this pins: a proxy login page, an envelope change, `{data:[]}`
       — all arrive as HTTP 200. The surface used to map any of them to null and
       render "No apps enabled yet", telling a paying customer their
       organization has no applications because a response was malformed, and
       publishing the same claim to AnA. */
    mockCatalog([]);
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/module-subscriptions/catalog') {
        return ok({ data: [] });
      }
      if (method === 'GET' && url === '/api/module-subscriptions/license') return ok(LICENSE);
      throw new Error(`unexpected ${method} ${url}`);
    });
    mount();
    expect(await screen.findByText("Couldn't load the apps catalog")).toBeTruthy();
    expect(screen.queryByText('No apps in the catalog')).toBeNull();
  });

  it('a genuinely empty catalog is still the honest empty state', async () => {
    mockCatalog([]);
    mount();
    expect(await screen.findByText('No apps in the catalog')).toBeTruthy();
    expect(screen.queryByText("Couldn't load the apps catalog")).toBeNull();
  });

  it('with the licence unreadable, an unavailable module is not blamed on the plan', async () => {
    /* Tier and industry are both folded into `isAvailable`, and telling the two
       apart needs the org's tier. Without it the surface must not guess "your
       plan does not include this" — being wrongly told to ask an administrator
       costs a conversation; being wrongly told to upgrade sells somebody a plan
       that changes nothing. This mirrors decideNavEntitlement's own tie-break. */
    mockCatalog(
      [
        row({
          moduleId: 'insight-synthesis', name: 'Insight Synthesis',
          subscriptionState: 'none', isEnabled: false,
          isAvailable: false, requiredTier: 'enterprise',
        }),
      ],
      { license: { tier: 42 } }, // fails mapLiveLicense — no tier to compare against
    );
    mount();
    await screen.findByText('Insight Synthesis');
    expect(screen.getByText(/License & entitlement details are unavailable/)).toBeTruthy();
    expect(screen.queryByText(/not included in your plan/)).toBeNull();
    expect(screen.queryByTestId('admin-upgrade-plan')).toBeNull();
  });
});

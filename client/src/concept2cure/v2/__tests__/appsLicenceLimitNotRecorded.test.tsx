// @vitest-environment jsdom
/**
 * Apps — a licence limit the organization row does not record is shown as
 * "not recorded", and the rest of the licence band still renders.
 *
 * What the code used to do (until 2026-10-15): mapLiveLicense required every
 * `usage.*.maxAllowed` to be a number. GET /license reports an unrecorded limit
 * as `maxAllowed: null` (license-manager reads the row as recorded since
 * 2026-10-15), so one NULL limit discarded the whole band — plan, seats and
 * projects — and the page said the licence was "unavailable" although it had
 * been read.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { UiSurface } from '@shared/constants/ui-surface-registry';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import { Apps } from '../surfaces/AdminSurfaces';

const SURFACE: UiSurface = {
  id: 'apps', label: 'Workflows', navTier: 'workspace', layoutMode: 'apps',
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
  ],
};

/** max_projects is NULL on the row: GET /license says so with maxAllowed null. */
const LICENSE = {
  organizationId: 7, tier: 'professional', industryMode: 'biotech',
  enabledModules: ['cmc-wizard'], maxUsers: 50, maxProjects: null, maxStorageGB: 5,
  usage: {
    projects: { withinQuota: null, currentCount: 14, maxAllowed: null },
    users: { withinQuota: true, currentCount: 38, maxAllowed: 50 },
  },
};

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;

let seen: SurfaceContext | null = null;
function Probe() {
  seen = useActiveSurfaceContext('apps');
  return null;
}

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  seen = null;
});

describe('Apps — licence band with an unrecorded limit', () => {
  it('renders the band, the unrecorded limit as "not recorded" with no bar, and the recorded one as before', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/module-subscriptions/catalog') return ok(CATALOG);
      if (method === 'GET' && url === '/api/module-subscriptions/license') return ok(LICENSE);
      throw new Error(`unexpected ${method} ${url}`);
    });
    const { container } = render(
      <>
        <Apps surface={SURFACE} onAsk={() => {}} onNav={() => {}} segment="biotech" />
        <Probe />
      </>,
    );
    await screen.findByText('CMC Wizard');

    // The band rendered: the plan is on screen, not the "unavailable" note.
    expect(await screen.findByTestId('admin-manage-plan')).toBeTruthy();
    expect(screen.queryByText(/License & entitlement details are unavailable/)).toBeNull();

    const [projects, seats] = Array.from(container.querySelectorAll('.lic-quota'));
    expect(projects.querySelector('.lic-q-l')?.textContent).toBe('Projects');
    expect(projects.textContent).toContain('14 / not recorded');
    expect(projects.querySelector('.lic-q-bar'), 'a bar drawn against no recorded limit').toBeNull();
    expect(seats.textContent).toContain('38 / 50');
    expect(seats.querySelector('.lic-q-bar')).not.toBeNull();

    // AnA is told the same: a count with no recorded limit, never "of null".
    expect(seen?.summary).toMatch(/14 projects \(no recorded limit\) and 38 of 50 users used/);
    expect(seen?.summary).not.toMatch(/null/);
    expect((seen?.facts as { licence?: unknown } | undefined)?.licence).toMatchObject({
      projects: { used: 14, limit: null },
      users: { used: 38, limit: 50 },
    });
  });
});

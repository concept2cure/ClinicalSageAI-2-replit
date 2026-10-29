// @vitest-environment jsdom
/**
 * A project offers a way to its reports.
 *
 * Reporting & analytics (`insights`) is in the launch catalog and already reads
 * the open project: it names it to its overview (`?programId=`, Insights.tsx
 * ReportingCanvasForSession) and leads with it (insightsOpenProgram.test.tsx).
 * But it was reachable only from the rail, so a person inside a project had no
 * door to that project's reports. INFORMATION_ARCHITECTURE.md section 7 (Project
 * home, item 1) places it on the project header: "Reports for this project,
 * opening Reporting & analytics scoped to the project (`insights`, wiring)". The
 * door is named as section 9 names doors: the job, then the place it is done in.
 *
 * Evidence: docs/evidence/D2-ONE-ANA/2026-10-29/reporting-from-project/.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { isLaunchSurface } from '../../../../../shared/constants/launch-scope';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
/* As projectHomeLaunchScope.test.tsx: the real service and guards, with the
   provider hook supplied for this component fixture. */
vi.mock('@/services/portal/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/portal/authService')>();
  return {
    ...actual,
    useAuth: () => ({ user: actual.authService.getUser() }),
    useAuthUser: () => actual.authService.getUser(),
  };
});
/* The server's verdicts with enforcement on. A test may lock a launch surface
   too, as a customer's release can. */
const locked = vi.hoisted(() => new Set<string>());
vi.mock('../navEntitlements', async (importOriginal) => {
  const real = await importOriginal<typeof import('../navEntitlements')>();
  return {
    ...real,
    useNavEntitlements: () => ({
      verdictFor: (id: string) =>
        isLaunchSurface(id) && !locked.has(id) ? null : { id, label: id, entitled: false, source: 'launch-scope', requiredTier: null },
      resolved: true,
      masterAdmin: false,
      platformAdmin: false,
      tier: null,
    }),
  };
});

import { ProjectHome } from '../surfaces/ProjectHome';
import { InsightsCanvas } from '../surfaces/Insights';
import { shellProgramId } from '../shellProject';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const PID = '9a7f0b10-0000-4000-8000-0000000000cd';
const DOOR = 'See this project’s reports in Reporting & analytics';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

/* The overview the server answers for this project: it leads (insights-canvas-routes.ts pickLead). */
const OVERVIEW = {
  data: {
    organizationId: 1, tier: 'standard', segments: ['pharma'], reportTypes: [],
    leadProgram: {
      projectId: 41, code: 'BX-204', label: 'BX-204', filing: null, indication: null, readiness: null,
      scope: 'project', scopeId: '41', agency: null, pdufa: null,
      confidence: 0, status: 'missing', riskLevel: 'low', criticalBlockerCount: 0,
    },
    openProgram: { programId: PID, state: 'lead' },
    portfolio: { entitled: false, requiredTier: 'enterprise', summary: null, programs: null },
  },
};

beforeEach(() => {
  locked.clear();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'BX-204', status: 'active', program_type: 'IND', product_type: 'drug', primary_agency: 'FDA' });
    if (url.startsWith('/api/insights-canvas/overview')) return ok(OVERVIEW);
    return ok({});
  });
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-204' };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

const renderProject = (onNav = vi.fn()) => {
  render(<ProjectHome surface={{ id: 'project-home', label: 'Project home' } as never} onAsk={vi.fn()} onNav={onNav} segment="biotech" />);
  return onNav;
};
/* The header is drawn once the project is open; wait for the step tracker below it. */
const headerReady = () => waitFor(() => expect(document.querySelectorAll('.pj-lc-stage').length).toBe(6));
const overviewUrls = () => apiRequest.mock.calls.map((c) => String(c[1])).filter((u) => u.startsWith('/api/insights-canvas/overview'));

describe("Project home: a door to this project's reports", () => {
  it('the project header offers it, named for the job and the place', async () => {
    const onNav = renderProject();
    await headerReady();
    const door = await screen.findByRole('button', { name: DOOR });
    expect(door.closest('.pj-top'), 'the door is on the project header').not.toBeNull();
    fireEvent.click(door);
    expect(onNav).toHaveBeenCalledWith('insights');
    // The shell's one program channel still names this project for the next surface.
    expect(shellProgramId()).toBe(PID);
  });

  it('opens Reporting & analytics on this project, not on the organisation', async () => {
    renderProject();
    await headerReady();
    fireEvent.click(await screen.findByRole('button', { name: DOOR }));
    // The shell mounts the `insights` view (surfaceViews.ts: InsightsCanvas) in Project home's place.
    cleanup();
    render(<InsightsCanvas surface={{ id: 'insights', label: 'Reporting & analytics' } as OwnedSurfaceViewProps['surface']} segment="pharma" onNav={() => {}} />);
    await waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
    expect(overviewUrls()).toEqual([`/api/insights-canvas/overview?programId=${PID}`]);
    expect(document.querySelector('.rc-ana-head')?.textContent).toMatch(/BX-204/);
    expect(screen.queryByTestId('rc-program-picker')).toBeNull();
  });

  it('is not offered when Reporting & analytics is not in this release', async () => {
    locked.add('insights');
    renderProject();
    await headerReady();
    expect(screen.getByRole('heading', { level: 1, name: 'BX-204' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: DOOR })).toBeNull();
  });

  it('is not offered with no project open', async () => {
    delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
    renderProject();
    expect(await screen.findByText('No project selected')).toBeTruthy();
    expect(screen.queryByRole('button', { name: DOOR })).toBeNull();
  });
});

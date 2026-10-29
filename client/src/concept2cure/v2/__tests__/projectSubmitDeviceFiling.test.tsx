// @vitest-environment jsdom
/**
 * A device project's Submit step holds its filing (D2, 2026-10-29).
 *
 * Submit tells a device project to "Assemble the eSTAR or technical
 * documentation from the approved documents" (PJ_LIFECYCLE nowDevice,
 * fixtures/project-home-data.tsx). The assembly door was only on Plan
 * (ProjectMdxWorkflow's submission-assembly workstream, through
 * PATHWAY_FEATURES). Submit hid every eCTD door for a device project and said
 * only that it files "on their own pathways", so the step that says
 * "assemble" had nothing to click.
 *
 * Submit now offers the same door Plan offers: the recorded pathway's own
 * assembly door (DEVICE_DOORS.pathway, PATHWAY_FEATURES), opening that
 * pathway's feature. One door, for the pathway the project records. None
 * for a pathway with no feature, none before the project is read, and none
 * guessed. When the feature is not in this release the step says so in
 * words and draws no button.
 *
 * This renders the real ProjectHome on its Submit step, as
 * projectHomeSubmitStage.test.tsx does.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuth: () => ({ user: actual.authService.getUser() }),
    useAuthUser: () => actual.authService.getUser() };
});
/* The surfaces this release locks, as the rail's verdicts state them (useSurfaceAvailable). */
const locked = vi.hoisted(() => new Set<string>());
vi.mock('../navEntitlements', async (importOriginal) => {
  const real = await importOriginal<typeof import('../navEntitlements')>();
  return {
    ...real,
    useNavEntitlements: () => ({
      verdictFor: (id: string) => (locked.has(id)
        ? { id, label: id, entitled: false, source: 'launch-scope', requiredTier: null } : null),
      resolved: true,
      masterAdmin: false,
      platformAdmin: false,
      tier: null,
    }),
  };
});

import { authService } from '@/services/portal/authService';
import { ProjectHome } from '../surfaces/ProjectHome';
import { DEVICE_DOORS } from '../projectDoors';
import { getSurfaceMeta } from '../registryModel';

const PID = '3c1e9b40-7d2a-4f6b-9e85-0a1b2c3d4e5f';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

const PROGRAM = {
  id: PID, name: 'Client device', code: 'CD-1', product_name: 'Client device', status: 'active',
  primary_agency: 'FDA', device_flags: [] as string[], program_type: '510k', product_type: 'device', regulatory_path: null as string | null,
};

/* Each pathway's feature, written here as the expectation, not read from PATHWAY_FEATURES:
   a door that opens the wrong feature has to fail. */
const PATHWAYS = [
  { programType: '510k', productType: 'device', door: DEVICE_DOORS.pathway['510k'].assembly, surface: 'device-510k' },
  { programType: 'PMA', productType: 'device', door: DEVICE_DOORS.pathway.pma.assembly, surface: 'device-pma' },
  { programType: 'MDR', productType: 'device', door: DEVICE_DOORS.pathway.mdr.assembly, surface: 'device-cer' },
  { programType: 'IVDR', productType: 'ivd', door: DEVICE_DOORS.pathway.ivdr.assembly, surface: 'device-diagnostics' },
] as const;
const ASSEMBLY_DOORS = Object.values(DEVICE_DOORS.pathway).map((p) => p.assembly);
const STRATEGY_DOORS = Object.values(DEVICE_DOORS.pathway).map((p) => p.strategy);

function serve(program: Record<string, unknown> | Promise<Response>) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, raw: unknown) => {
    const url = String(raw ?? '');
    if (url === `/api/c2c/projects/${PID}`) return program instanceof Promise ? program : ok(program);
    if (url === `/api/submissions?programId=${PID}`) return ok({ data: [], meta: { notOffered: 0 } });
    return ok({});
  });
}

const onNav = vi.fn();
async function openSubmit(): Promise<HTMLElement> {
  render(<ProjectHome surface={{ id: 'project-home', label: 'Project home' } as never} onAsk={vi.fn()} onNav={onNav} segment="medtech" />);
  await waitFor(() => {
    const tab = Array.from(document.querySelectorAll('.pj-lc-stage')).find((b) => b.textContent?.includes('Submit'));
    expect(tab).toBeTruthy();
    fireEvent.click(tab as Element);
  });
  return screen.findByTestId('pj-markets');
}
/** The panel's buttons named for a device pathway's assembly or strategy job. */
const pathwayButtons = (panel: HTMLElement) => within(panel).queryAllByRole('button')
  .filter((b) => [...ASSEMBLY_DOORS, ...STRATEGY_DOORS].some((name) => b.textContent?.includes(name)));
/** The project read has landed: the device note is drawn from it. */
const deviceNoteDrawn = (panel: HTMLElement) => waitFor(() => expect(panel.textContent).toContain('file on their own pathways'));

beforeEach(() => {
  authService.setToken('fixture-device-reader', { id: '7', organizationId: '1' }, 'fixture-device-refresh', 3600);
  onNav.mockReset();
  locked.clear();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'Client device' };
});
afterEach(() => {
  cleanup();
  authService.endSession(null);
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('Submit — a device project assembles its filing from here', () => {
  it.each(PATHWAYS)('a $programType project is offered "$door", which opens $surface', async ({ programType, productType, door, surface }) => {
    serve({ ...PROGRAM, program_type: programType, product_type: productType });
    const panel = await openSubmit();
    const button = await within(panel).findByRole('button', { name: door });
    // One door, for the pathway the project records: no other pathway's assembly or strategy door.
    expect(pathwayButtons(panel)).toEqual([button]);
    fireEvent.click(button);
    expect(onNav).toHaveBeenCalledTimes(1);
    expect(onNav).toHaveBeenCalledWith(surface);
  });

  it('reads the pathway from the recorded regulatory path when the filing type does not name one', async () => {
    serve({ ...PROGRAM, program_type: null, regulatory_path: '510(k)' });
    const panel = await openSubmit();
    fireEvent.click(await within(panel).findByRole('button', { name: DEVICE_DOORS.pathway['510k'].assembly }));
    expect(onNav).toHaveBeenCalledWith('device-510k');
  });

  it.each(PATHWAYS)('when $surface is not in this release, says so in words and draws no button', async ({ programType, productType, door, surface }) => {
    locked.add(surface);
    serve({ ...PROGRAM, program_type: programType, product_type: productType });
    const panel = await openSubmit();
    const words = `${getSurfaceMeta(surface).label}, where this filing is assembled, is not part of this release.`;
    await waitFor(() => expect(panel.textContent).toContain(words));
    expect(within(panel).queryByRole('button', { name: door })).toBeNull();
    expect(pathwayButtons(panel)).toEqual([]);
  });

  it('a pathway with no feature (De Novo) is given no door and no guessed one', async () => {
    serve({ ...PROGRAM, program_type: 'de_novo' });
    const panel = await openSubmit();
    await deviceNoteDrawn(panel);
    expect(pathwayButtons(panel)).toEqual([]);
    expect(panel.textContent).not.toContain('where this filing is assembled');
  });

  it('a device project that records no pathway is given no door', async () => {
    serve({ ...PROGRAM, program_type: null, regulatory_path: null });
    const panel = await openSubmit();
    await deviceNoteDrawn(panel);
    expect(pathwayButtons(panel)).toEqual([]);
  });

  it('offers nothing before the project is read, even when the shell says it is a device project', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'Client device', ws: 'MDX' };
    let finish!: (response: Response) => void;
    serve(new Promise<Response>((resolve) => { finish = resolve; }));
    const panel = await openSubmit();
    await deviceNoteDrawn(panel);
    expect(pathwayButtons(panel)).toEqual([]);
    await act(async () => { finish(ok(PROGRAM)); });
    expect(await within(panel).findByRole('button', { name: DEVICE_DOORS.pathway['510k'].assembly })).toBeTruthy();
  });

  it('a drug project is offered no device door', async () => {
    serve({ ...PROGRAM, program_type: 'IND', product_type: 'drug' });
    const panel = await openSubmit();
    await waitFor(() => expect(within(panel).getByRole('button', { name: /Add a market/ })).toBeTruthy());
    expect(pathwayButtons(panel)).toEqual([]);
  });
});

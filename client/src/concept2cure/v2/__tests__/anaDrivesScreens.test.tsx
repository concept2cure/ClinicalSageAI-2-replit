// @vitest-environment jsdom
/**
 * AnA drives the screens — end-to-end wiring proof for the surface-action bus
 * against the REAL surfaces (not stub handlers).
 *
 * What these tests pin:
 *   - mounting a wave-1 surface registers its registry-declared handlers, and
 *     a validated directive genuinely operates the surface's own state (the
 *     vault search box filters; opening a program publishes the shell project
 *     and navigates) — the same state the human's controls drive, no second
 *     path;
 *   - misses are honest refusals (unknown program, unknown folder), never a
 *     guess or a silent no-op;
 *   - the navigate→mount stash performs the action when the destination
 *     mounts, so AnA's navigate-then-act sequence lands.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { Projects } from '../surfaces/Projects';
import {
  __resetSurfaceActionBus,
  applySurfaceAction,
  registeredSurfaceId,
  validateDriveAction,
} from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

const PID = '11111111-1111-4111-8111-111111111111';

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function vaultPayload() {
  return {
    success: true,
    data: {
      program: 'BX-301',
      spine: 'IND · 21 CFR 312',
      standard: 'pharma',
      documentCount: 2,
      tree: [
        {
          id: 'cabinet',
          code: '',
          label: 'Source files · filing cabinet',
          children: [
            { id: 'cab-unfiled', code: '', label: 'Unfiled · needs review', children: [] },
            {
              id: 'cab-module-3',
              code: '',
              label: 'Module 3 · Quality',
              children: [
                {
                  id: 'd1',
                  num: '3.2.P.8',
                  title: 'stability-summary-24m',
                  type: 'Test reports',
                  status: 'confirmed',
                  pct: 100,
                  owner: 'A',
                  ver: 'v1',
                  updated: 'now',
                  preview: 'stability',
                },
                {
                  id: 'd2',
                  num: '3.2.S.4',
                  title: 'specifications-drug-substance',
                  type: 'Spec',
                  status: 'confirmed',
                  pct: 100,
                  owner: 'A',
                  ver: 'v1',
                  updated: 'now',
                  preview: 'specs',
                },
              ],
            },
            { id: 'cab-corresp', code: '', label: 'Agency correspondence', children: [] },
          ],
        },
      ],
      unfiledCount: 0,
    },
  };
}

const projectRows = [
  {
    id: 'p1',
    code: 'BX-204',
    title: 'BX-204 Oncology IND',
    ws: 'Biotech',
    stage: 'IND',
    status: 'active',
    readiness: 70,
    lead: 'L',
    blocker: null,
    due: 'Q4',
    activity: 'now',
  },
  {
    id: 'p2',
    code: 'MD-11',
    title: 'MD-11 510(k)',
    ws: 'MDX',
    stage: '510(k)',
    status: 'blocked',
    readiness: 40,
    lead: 'L',
    blocker: 'Predicate',
    due: 'Q1',
    activity: 'now',
  },
];

function directive(actionId: string, params: Record<string, unknown>) {
  const res = resolveSurfaceAction(actionId, params);
  if (!res.ok) throw new Error(`fixture action ${actionId} does not resolve: ${res.error}`);
  return res.directive;
}

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === `/api/c2c/project-vault/${PID}`) return ok(vaultPayload());
    if (method === 'GET' && url === '/api/c2c/projects') return ok(projectRows);
    return ok({ success: true, data: {} });
  });
});

afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
  delete (window as any).C2C_PROJECT;
});

describe('Vault — AnA operates the real surface', () => {
  it('registers on mount, and vault.search drives the SAME search state the surface renders', async () => {
    render(
      <Vault surface={{ id: 'vault', label: 'Vault' } as any} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />,
    );
    await waitFor(() => expect(registeredSurfaceId()).toBe('vault'));
    await screen.findByText('stability-summary-24m');

    let outcome: unknown;
    act(() => {
      outcome = applySurfaceAction(directive('vault.search', { query: 'stability' }), vi.fn());
    });
    expect(outcome).toEqual({ status: 'applied', detail: 'Searching the vault for "stability"' });
    // The surface renders ITS OWN search state — the breadcrumb enters search
    // mode and the list narrows to the match. One state, no second path.
    await screen.findByText(/Search "stability"/);
    await waitFor(() =>
      expect(screen.queryAllByText('specifications-drug-substance')).toHaveLength(0),
    );
    expect(screen.getByText('stability-summary-24m')).toBeTruthy();
  });

  it('vault.open-folder refuses an unknown folder honestly', async () => {
    render(
      <Vault surface={{ id: 'vault', label: 'Vault' } as any} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />,
    );
    await waitFor(() => expect(registeredSurfaceId()).toBe('vault'));
    let outcome: any;
    act(() => {
      outcome = applySurfaceAction(directive('vault.open-folder', { folder: 'Narnia' }), vi.fn());
    });
    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toContain('No folder named');
  });

  it('the navigate→mount stash performs when the Vault mounts (AnA acts before the screen exists)', async () => {
    const nav = vi.fn();
    const deferred = vi.fn();
    const immediate = applySurfaceAction(
      directive('vault.search', { query: 'specifications' }),
      nav,
      deferred,
    );
    expect(immediate).toEqual({ status: 'stashed' });
    expect(nav).toHaveBeenCalledWith('vault');

    render(
      <Vault surface={{ id: 'vault', label: 'Vault' } as any} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />,
    );
    await waitFor(() =>
      expect(deferred).toHaveBeenCalledWith(expect.objectContaining({ status: 'applied' })),
    );
    await screen.findByText(/Search "specifications"/);
  });

  it('a data-dependent action stashed pre-mount is HELD through the load and applies when the read lands', async () => {
    // vault.open-folder needs the real tree to resolve the name, so at mount
    // time (data still loading) it answers not-ready — the bus must hold it
    // for the ready signal instead of failing the drive.
    const deferred = vi.fn();
    const immediate = applySurfaceAction(
      directive('vault.open-folder', { folder: 'Agency correspondence' }),
      vi.fn(),
      deferred,
    );
    expect(immediate).toEqual({ status: 'stashed' });

    render(
      <Vault surface={{ id: 'vault', label: 'Vault' } as any} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />,
    );
    await waitFor(() =>
      expect(deferred).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'applied', detail: 'Opened Agency correspondence' }),
      ),
    );
    // The surface genuinely opened it: the folder shows in the tree AND the
    // breadcrumb (two occurrences = tree node + active crumb).
    const occurrences = await screen.findAllByText(/Agency correspondence/);
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Projects — AnA opens a real program', () => {
  it('projects.open-program resolves the portfolio, publishes the shell project, and enters project home', async () => {
    const onNav = vi.fn();
    render(<Projects surface={{ id: 'projects', label: 'Projects' } as any} onAsk={vi.fn()} onNav={onNav} segment="biopharma" />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('projects'));
    await screen.findAllByText(/BX-204/);

    let outcome: any;
    act(() => {
      outcome = applySurfaceAction(directive('projects.open-program', { program: 'bx-204' }), vi.fn());
    });
    expect(outcome.status).toBe('applied');
    expect(outcome.detail).toContain('BX-204');
    expect((window as any).C2C_PROJECT?.id).toBe('p1');
    expect(onNav).toHaveBeenCalledWith('project-home');
  });

  it('an unknown or ambiguous program is an honest refusal, never a guess', async () => {
    render(<Projects surface={{ id: 'projects', label: 'Projects' } as any} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('projects'));
    await screen.findAllByText(/BX-204/);

    let unknown: any;
    act(() => {
      unknown = applySurfaceAction(directive('projects.open-program', { program: 'ZZ-999' }), vi.fn());
    });
    expect(unknown.status).toBe('failed');
    expect(unknown.reason).toContain('No program named');
    expect((window as any).C2C_PROJECT?.id).toBe(PID);
  });

  it('a chip-shaped payload validates through the registry before it can drive anything', () => {
    // The rail's chip click path: validateDriveAction is the gate.
    expect(validateDriveAction({ actionType: 'surface_action', actionId: 'projects.open-program' })).toBeNull();
    const d = validateDriveAction({
      actionType: 'surface_action',
      actionId: 'projects.open-program',
      params: { program: 'BX-204' },
    });
    expect(d).not.toBeNull();
    expect(d!.surfaceId).toBe('projects');
  });
});

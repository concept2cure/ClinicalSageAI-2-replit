// @vitest-environment jsdom
/**
 * Project home's Workspace grid offers only tools that can open.
 *
 * ── The defect (QA 2026-10-08, journey j1) ───────────────────────────────────
 * The Author stage's Workspace grid offered "FDA CRL library" on every project.
 * Its API (/api/clinical-regulatory-evidence) is mounted only when
 * ENABLE_CLINICAL_REGULATORY_GRAPH is on, so with the flag off the tile opened
 * "Couldn't reach the regulatory evidence graph" over a 404. The rail already
 * hid the entry when the flag is off (Shell.tsx railVisible); the grid read
 * only the launch-scope verdict, so on a deployment with launch scope off the
 * tile was offered over a route that does not exist.
 *
 * ── What must be true ────────────────────────────────────────────────────────
 *   • flag off: the grid does not offer the CRL library, launch scope or not;
 *   • launch scope on: the grid offers nothing outside the launch catalog —
 *     neither the CRL library nor Lifecycle management;
 *   • the positive control: with the flag on and no launch-scope verdict, the
 *     same collection DOES find the CRL tile, so the two assertions above can
 *     fail and are not passing on an empty grid.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { isLaunchSurface } from '../../../../../shared/constants/launch-scope';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

/* Which verdicts the server sends: none (enforcement off — every surface
   unlocked), or the enforcement-on set (every surface outside the catalog
   reads 'launch-scope'). */
const scope = vi.hoisted(() => ({ enforced: false }));
vi.mock('../navEntitlements', async (importOriginal) => {
  const real = await importOriginal<typeof import('../navEntitlements')>();
  return {
    ...real,
    useNavEntitlements: () => ({
      verdictFor: (id: string) =>
        scope.enforced && !isLaunchSurface(id)
          ? { id, label: id, entitled: false, source: 'launch-scope', requiredTier: null }
          : null,
      resolved: true,
      masterAdmin: false,
      platformAdmin: false,
      tier: null,
    }),
  };
});

import { ProjectHome } from '../surfaces/ProjectHome';

const PID = '9a7f0b10-0000-4000-8000-0000000000dd';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

/** The surface ids the Workspace grid offers, read by clicking every tile. */
async function workspaceToolIds(): Promise<string[]> {
  const onNav = vi.fn();
  render(<ProjectHome surface={{ id: 'project-home', label: 'Project home' } as never} onAsk={vi.fn()} onNav={onNav} segment="biotech" />);
  await waitFor(() => expect(document.querySelectorAll('.pj-main .pj-toolgrp .pj-tool').length).toBeGreaterThan(0));
  onNav.mockClear();
  for (const b of Array.from(document.querySelectorAll('.pj-main .pj-toolgrp .pj-tool'))) fireEvent.click(b);
  return onNav.mock.calls.map((c) => c[0] as string);
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'BX-256', status: 'active', readiness: null });
    return ok({});
  });
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-256' };
  scope.enforced = false;
  localStorage.removeItem('c2c-crl-graph');
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  localStorage.removeItem('c2c-crl-graph');
});

describe('Project home Workspace grid — a tile is offered only when it can open', () => {
  it('positive control: with the graph flag on and no launch scope, the CRL tile is found', async () => {
    localStorage.setItem('c2c-crl-graph', '1');
    const ids = await workspaceToolIds();
    expect(ids).toContain('crl-library');
    expect(ids).toContain('lifecycle-mgmt');
  });

  it('does not offer the FDA CRL library while its graph flag is off (its API is not mounted)', async () => {
    localStorage.setItem('c2c-crl-graph', '0');
    const ids = await workspaceToolIds();
    expect(ids, 'the CRL tile opens a 404 when the graph is off').not.toContain('crl-library');
  });

  it('offers nothing outside the launch catalog when launch scope is enforced', async () => {
    scope.enforced = true;
    localStorage.setItem('c2c-crl-graph', '1');
    const ids = await workspaceToolIds();
    expect(ids).not.toContain('crl-library');
    expect(ids).not.toContain('lifecycle-mgmt');
    expect(ids.filter((id) => !isLaunchSurface(id)), 'tiles outside the launch catalog').toEqual([]);
  });
});

// @vitest-environment jsdom
/**
 * Project home offers only what this release can open.
 *
 * docs/SURFACE_DECISIONS_2026-10-08.md locked the screens that do not do what
 * their place promises. Project home linked into several of them: each CTD
 * module chip opened the dossier map (always empty for a program created in
 * the product), the data room offered "Trace a claim to its source" (locked),
 * and the Plan, Respond and Lifecycle stages listed tools that are all outside
 * the release. A button that opens "not in this release" is not something
 * this project can do, the rule the Workspace grid already follows.
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
/* The server's verdicts with enforcement on: every surface outside the launch
   scope reads 'launch-scope'. */
vi.mock('../navEntitlements', async (importOriginal) => {
  const real = await importOriginal<typeof import('../navEntitlements')>();
  return {
    ...real,
    useNavEntitlements: () => ({
      verdictFor: (id: string) =>
        isLaunchSurface(id) ? null : { id, label: id, entitled: false, source: 'launch-scope', requiredTier: null },
      resolved: true,
      masterAdmin: false,
      platformAdmin: false,
      tier: null,
    }),
  };
});

import { ProjectHome } from '../surfaces/ProjectHome';

const PID = '9a7f0b10-0000-4000-8000-0000000000cc';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'BX-204', status: 'active' });
    if (url.includes('/workstreams') || url.includes('workstream'))
      return ok({ workstreams: [{ module: 'm2', total: 4, completion_pct: 25 }] });
    return ok({});
  });
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-204' };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

const stage = (label: string) =>
  Array.from(document.querySelectorAll('.pj-lc-stage')).find((b) => b.textContent?.includes(label))!;
const toolIds = (onNav: ReturnType<typeof vi.fn>) => {
  onNav.mockClear();
  for (const b of Array.from(document.querySelectorAll('.pj-tools .pj-tool'))) fireEvent.click(b);
  return onNav.mock.calls.map((c) => c[0] as string);
};

describe('Project home and the launch scope', () => {
  /* Plan and Lifecycle had only locked tools and were removed in
     FILING_SPINE.md F2 (projectHomeStages.test.tsx). Respond keeps its tools
     until F15 gives it its own actions. */
  it.each(['Respond'])('the %s stage offers no locked tool, and says when it has none', async (label) => {
    const onNav = vi.fn();
    render(<ProjectHome surface={{ id: 'project-home', label: 'Project home' } as never} onAsk={vi.fn()} onNav={onNav} segment="biotech" />);
    await waitFor(() => expect(document.querySelectorAll('.pj-lc-stage').length).toBe(5));
    fireEvent.click(stage(label));
    await waitFor(() => expect(stage(label).getAttribute('data-status')).toBe('active'));
    const ids = toolIds(onNav);
    expect(ids.filter((id) => !isLaunchSurface(id)), `${label} offers tools that open "not in this release"`).toEqual([]);
    // A stage left with nothing says so rather than showing an empty grid.
    if (ids.length === 0) expect(screen.getByText('Not in this release')).toBeTruthy();
    else expect(screen.queryByText('Not in this release')).toBeNull();
    // The Plan stage no longer points at meetings, eTMF and grants "above".
    expect(screen.queryByText('Meetings, eTMF and grants open in their own surfaces')).toBeNull();
  });

  it('never offers the source tracer, which this release does not carry', async () => {
    render(<ProjectHome surface={{ id: 'project-home', label: 'Project home' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" />);
    await waitFor(() => expect(document.querySelectorAll('.pj-lc-stage').length).toBe(5));
    expect(screen.queryByText(/Trace a claim to its source/)).toBeNull();
  });

  it('a CTD module chip opens the program\'s documents, not the locked dossier map', async () => {
    const onNav = vi.fn();
    render(<ProjectHome surface={{ id: 'project-home', label: 'Project home' } as never} onAsk={vi.fn()} onNav={onNav} segment="biotech" />);
    const chip = await waitFor(() => {
      const c = document.querySelector('.pj-lmod');
      expect(c).toBeTruthy();
      return c as HTMLElement;
    });
    fireEvent.click(chip);
    expect(onNav).toHaveBeenCalledWith('document-authoring');
    expect(onNav).not.toHaveBeenCalledWith('dossier-map');
  });
});

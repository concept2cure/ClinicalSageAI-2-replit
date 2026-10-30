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
 *
 * FILING_SPINE.md F2 (2026-10-08) removed Plan and Lifecycle. What they and
 * Respond's locked tools promised is one coming-later line of words, with no
 * button; no stage says "Not in this release" (projectHomeStages.test.tsx).
 *
 * Slice A.1 (INFORMATION_ARCHITECTURE.md sections 3, 8 and 9) gave every step
 * its line, Plan, Evidence, Author and Review as well as Submit and Respond,
 * each naming what that step will hold once it works; a device project reads
 * its own line where the step has one (PJ_LIFECYCLE laterDevice).
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
/* The document list now consumes both the auth hook and the service's current-
   session guards. Keep the real service/guards; only supply the provider hook
   for this component fixture, as projectHomeSubmitStage.test.tsx does. */
vi.mock('@/services/portal/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/portal/authService')>();
  return {
    ...actual,
    useAuth: () => ({ user: actual.authService.getUser() }),
    useAuthUser: () => actual.authService.getUser(),
  };
});
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
import { PJ_LIFECYCLE } from '../fixtures/project-home-data';

const PID = '9a7f0b10-0000-4000-8000-0000000000cc';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

/* The project the detail read returns; a test may name the filing. */
const PROJECT = { id: PID, name: 'BX-204', status: 'active' };
let project: Record<string, unknown> = PROJECT;
const FILINGS = {
  'a drug IND': { program_type: 'IND', product_type: 'drug', primary_agency: 'FDA' },
  'a device 510(k)': { program_type: '510K', product_type: 'device', regulatory_path: '510k', primary_agency: 'FDA' },
} as const;

beforeEach(() => {
  project = PROJECT;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}`) return ok(project);
    if (url === `/api/c2c/projects/${PID}/dossier`)
      return ok({ projectId: PID, measuredAt: '2026-10-22T09:00:00.000Z', home: { state: 'measured', pct: 25, counted: 4, complete: 1 }, markets: [],
        rows: [{ group: 'module', module: '2', agency: null, label: 'Module 2 · Summaries', documentId: 'd', counted: 4, complete: 1, inReview: 0, drafted: 0, figure: { state: 'measured', pct: 25, counted: 4, complete: 1 }, lastUpdated: null }] });
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

const STEPS = ['Plan', 'Evidence', 'Author', 'Review', 'Submit', 'Respond'] as const;

describe('Project home and the launch scope', () => {
  it.each(STEPS.flatMap((label) => (Object.keys(FILINGS) as Array<keyof typeof FILINGS>).map((filing) => [label, filing] as const)))(
    'the %s step of %s offers no locked tool, and names what comes later in one bare line of words', async (label, filing) => {
    project = { ...PROJECT, ...FILINGS[filing] };
    const device = filing === 'a device 510(k)';
    const step = PJ_LIFECYCLE.find((s) => s.label === label)!;
    const words = (device && step.laterDevice) || step.later;
    expect(words, `${label} has a Coming later line`).toBeTruthy();
    const onNav = vi.fn();
    render(<ProjectHome surface={{ id: 'project-home', label: 'Project home' } as never} onAsk={vi.fn()} onNav={onNav} segment="biotech" />);
    await waitFor(() => expect(document.querySelectorAll('.pj-lc-stage').length).toBe(6));
    fireEvent.click(stage(label));
    await waitFor(() => expect(stage(label).getAttribute('data-status')).toBe('active'));
    const ids = toolIds(onNav);
    expect(ids.filter((id) => !isLaunchSurface(id)), `${label} offers tools that open "not in this release"`).toEqual([]);
    // What is not in this release is a line of words, never a panel or a button.
    expect(screen.queryByText('Not in this release')).toBeNull();
    // One line per step, read once the project's filing is known (a device reads its own line).
    await waitFor(() => expect(screen.getByTestId('pj-coming-later').textContent).toBe(`Coming later: ${words}`));
    // The same bare line on every step: Respond's sat inside its tool card
    // (filing-spine design review, open item 10, 2026-10-08).
    expect(screen.getByTestId('pj-coming-later').closest('.pj-sec')).toBeNull();
    expect(screen.getByTestId('pj-coming-later').querySelector('button, a')).toBeNull();
    // The removed Plan stage pointed at meetings, eTMF and grants "above".
    expect(screen.queryByText('Meetings, eTMF and grants open in their own surfaces')).toBeNull();
  });

  it('never offers the source tracer, which this release does not carry', async () => {
    render(<ProjectHome surface={{ id: 'project-home', label: 'Project home' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" />);
    await waitFor(() => expect(document.querySelectorAll('.pj-lc-stage').length).toBe(6));
    // The data room, which carried the link, is on Evidence (FILING_SPINE.md F3).
    fireEvent.click(stage('Evidence'));
    expect(await screen.findByRole('heading', { name: 'Data room' })).toBeTruthy();
    expect(screen.queryByText(/Trace a claim to its source/)).toBeNull();
  });

  it('a CTD module chip opens the program\'s document in that module, not the locked dossier map', async () => {
    // Since FILING_SPINE.md F3 the chip opens the editing copy of the filing it
    // measures, by id (projectHomeDocuments.test.tsx), so it needs one.
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'BX-204', status: 'active' });
      if (url === `/api/c2c/projects/${PID}/dossier`) return ok({ projectId: PID, measuredAt: '2026-10-22T09:00:00.000Z', home: { state: 'measured', pct: 25, counted: 4, complete: 1 }, markets: [],
        rows: [{ group: 'module', module: '2', agency: null, label: 'Module 2 · Summaries', documentId: 'd', counted: 4, complete: 1, inReview: 0, drafted: 0, figure: { state: 'measured', pct: 25, counted: 4, complete: 1 }, lastUpdated: null }] });
      if (url === `/api/authoring/docs?programId=${PID}`) {
        return ok({ documents: [{ id: 'doc-2', title: 'Summaries', module: 'M2', status: 'draft', program_id: PID, c2c_document_id: 'd' }] });
      }
      return ok({});
    });
    const onNav = vi.fn();
    render(<ProjectHome surface={{ id: 'project-home', label: 'Project home' } as never} onAsk={vi.fn()} onNav={onNav} segment="biotech" />);
    const chip = await waitFor(() => {
      const c = document.querySelector('button.pj-lmod');
      expect(c).toBeTruthy();
      return c as HTMLElement;
    });
    fireEvent.click(chip);
    expect(onNav).toHaveBeenCalledWith('document-authoring');
    expect(onNav).not.toHaveBeenCalledWith('dossier-map');
    expect((window as unknown as { C2C_EDITOR_TARGET?: { docId?: string } }).C2C_EDITOR_TARGET?.docId).toBe('doc-2');
    delete (window as unknown as { C2C_EDITOR_TARGET?: unknown }).C2C_EDITOR_TARGET;
  });
});

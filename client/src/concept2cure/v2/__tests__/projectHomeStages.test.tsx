// @vitest-environment jsdom
/**
 * The project is the filing: five tabs follow the work, and the start box sits
 * above them (docs/design/FILING_SPINE.md F2).
 *
 * The page had seven tabs. Plan and Lifecycle had nothing this release can
 * open, so both rendered "Not in this release" with no button. Plan's
 * Schedule panel fetched only numeric project ids while the page holds a
 * program UUID, so it never loaded for a project opened from Projects. The
 * start box and the project's Conversations sat inside the Author tab, so
 * opening any other tab unmounted a half-typed message.
 *
 * After F2:
 *   - the tabs are exactly Evidence, Author, Review, Submit, Respond;
 *   - no tab says "Not in this release";
 *   - AnA's `set-stage` still accepts `plan` and `lifecycle` and opens Submit,
 *     where market choice and follow-up sequences now belong;
 *   - Submit names what Plan and Lifecycle promised as coming later, as text,
 *     with nothing to click;
 *   - the start box and Conversations are above the tabs, so a draft survives
 *     switching tabs.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
/* The server's verdicts with launch-scope enforcement on, as in production:
   every surface outside the launch scope reads 'launch-scope'. Without this,
   unread verdicts count as available and a locked tool looks offered. */
vi.mock('../navEntitlements', async (importOriginal) => {
  const real = await importOriginal<typeof import('../navEntitlements')>();
  const { isLaunchSurface } = await import('../../../../../shared/constants/launch-scope');
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
import { __resetSurfaceActionBus, applySurfaceAction, registeredSurfaceId } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

const PID = '9a7f0b10-0000-4000-8000-00000000f002';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

const props = () =>
  ({ surface: { id: 'project-home', label: 'Project home' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });

const tabs = () => Array.from(document.querySelectorAll('.pj-lc-stage'));
const tab = (label: string) => tabs().find((b) => b.textContent?.includes(label))!;
const openTab = () => document.querySelector('.pj-lc-stage[aria-selected="true"]')?.textContent ?? null;

function setStage(stage: string) {
  const res = resolveSurfaceAction('project-home.set-stage', { stage });
  if (!res.ok) throw new Error(`set-stage {stage:'${stage}'} does not resolve: ${res.error}`);
  let outcome: { status: string; reason?: string } = { status: '' };
  act(() => {
    outcome = applySurfaceAction(res.directive, vi.fn()) as typeof outcome;
  });
  return outcome;
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'BX-204', status: 'active' });
    if (url === `/api/c2c/projects/${PID}/sources`) return ok({ projectId: PID, sources: [], unscoped: [] });
    if (url.startsWith('/api/chat/threads')) return ok({ threads: [] });
    return ok({});
  });
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-204' };
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('Project home: five tabs follow the filing (F2)', () => {
  it('the tabs are exactly Evidence, Author, Review, Submit and Respond, in that order', async () => {
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(tabs().length).toBeGreaterThan(0));
    expect(tabs().map((b) => b.textContent?.trim())).toEqual(['Evidence', 'Author', 'Review', 'Submit', 'Respond']);
  });

  it('no tab renders "Not in this release"', async () => {
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(tabs().length).toBeGreaterThan(0));
    for (const label of tabs().map((b) => b.textContent!.trim())) {
      fireEvent.click(tab(label));
      await waitFor(() => expect(openTab()).toContain(label));
      expect(screen.queryByText('Not in this release'), `the ${label} tab says "Not in this release"`).toBeNull();
    }
  });

  it.each(['plan', 'lifecycle'])("AnA's set-stage {stage:'%s'} opens Submit", async (stage) => {
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('project-home'));
    const out = setStage(stage);
    expect(out.status, out.reason).toBe('applied');
    await waitFor(() => expect(openTab()).toContain('Submit'));
  });

  it('Submit names what Plan and Lifecycle promised as coming later, with nothing to click', async () => {
    const onNav = vi.fn();
    render(<ProjectHome {...props()} onNav={onNav} />);
    await waitFor(() => expect(tabs().length).toBeGreaterThan(0));
    fireEvent.click(tab('Submit'));
    const line = await screen.findByTestId('pj-submit-later');
    expect(line.textContent).toMatch(/Coming later/);
    for (const promised of ['agency meetings', 'precedent', 'registrations and variations', 'market access', 'pharmacovigilance']) {
      expect(line.textContent?.toLowerCase(), `"${promised}" is not named`).toContain(promised);
    }
    expect(line.querySelector('button, a')).toBeNull();
  });

  it('the Schedule panel is gone: no schedule read and no Schedule heading on any tab', async () => {
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(tabs().length).toBeGreaterThan(0));
    for (const label of tabs().map((b) => b.textContent!.trim())) {
      fireEvent.click(tab(label));
      await waitFor(() => expect(openTab()).toContain(label));
      expect(screen.queryByRole('heading', { name: 'Schedule' })).toBeNull();
    }
    expect(apiRequest.mock.calls.filter(([, url]) => String(url).includes('schedule-of-events'))).toEqual([]);
  });

  it('a message typed in the start box survives switching tabs', async () => {
    render(<ProjectHome {...props()} />);
    const box = (await screen.findByPlaceholderText('Ask AnA to draft, reconcile or review…')) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Reconcile 3.2.P.5 with the latest batch data' } });

    for (const label of ['Evidence', 'Submit', 'Review', 'Respond']) {
      fireEvent.click(tab(label));
      await waitFor(() => expect(openTab()).toContain(label));
      const still = screen.queryByPlaceholderText('Ask AnA to draft, reconcile or review…') as HTMLTextAreaElement | null;
      expect(still, `the start box is gone on ${label}`).not.toBeNull();
      expect(still!.value).toBe('Reconcile 3.2.P.5 with the latest batch data');
    }
  });

  it("the project's Conversations are listed above the tabs, on every tab", async () => {
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(tabs().length).toBeGreaterThan(0));
    fireEvent.click(tab('Submit'));
    await waitFor(() => expect(openTab()).toContain('Submit'));
    const heading = await screen.findByRole('heading', { name: 'Conversations' });
    const tablist = document.querySelector('[role="tablist"][aria-label="Project lifecycle"]')!;
    expect(heading.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING, 'Conversations is not above the tabs').toBeTruthy();
  });
});

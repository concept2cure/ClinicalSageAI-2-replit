// @vitest-environment jsdom
/**
 * The project is the filing: five tabs, and the start box above them.
 *
 * docs/design/FILING_SPINE.md §1, §2 and slice F2. The project page had seven
 * tabs. Two of them, Plan and Lifecycle, held nothing this release can open:
 * each showed "Not in this release" with no button, and Plan's schedule panel
 * fetched only numeric project ids, so it never loaded for a project opened
 * from Projects. The start box sat inside Author, so leaving Author unmounted
 * a half-typed message.
 *
 * Now:
 *   - the tabs are exactly Evidence, Author, Review, Submit and Respond;
 *   - no tab says "Not in this release"; what Plan and Lifecycle promised is
 *     one line of words on Submit, with no button;
 *   - AnA's `project-home.set-stage` still accepts 'plan' and 'lifecycle', and
 *     both open Submit, which holds market choice and follow-up sequences;
 *   - the start box and the Conversations list sit above the tabs, outside
 *     the tab switch, so what is typed survives a change of tab.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { isLaunchSurface } from '../../../../../shared/constants/launch-scope';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
/* Production's verdicts: every surface outside the launch scope is locked. */
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
import { __resetSurfaceActionBus, applySurfaceAction, registeredSurfaceId } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

const PID = '5b2d7c11-2222-4333-8444-555566667777';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const THREAD = { id: 'ana-ri_9', title: 'Plan the Module 3 stability narrative', created_at: '2026-10-01T09:00:00Z', updated_at: '2026-10-02T09:00:00Z', program_id: PID };

const props = () =>
  ({ surface: { id: 'project-home', label: 'Project home' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

const tabs = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.pj-lc-stage'));
const tab = (label: string) => tabs().find((b) => b.textContent?.trim() === label);
const activeLabel = () => document.querySelector('.pj-lc-stage[data-status="active"]')?.textContent?.trim() ?? null;

type Outcome = { status: string; detail?: string; reason?: string };
function setStage(stage: string): Outcome {
  const res = resolveSurfaceAction('project-home.set-stage', { stage });
  if (!res.ok) throw new Error(`set-stage "${stage}" does not resolve: ${res.error}`);
  let outcome: Outcome = { status: '' };
  act(() => {
    outcome = applySurfaceAction(res.directive, vi.fn()) as Outcome;
  });
  return outcome;
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'BX-410', product_name: 'Torvanib', program_type: 'IND', status: 'active' });
    if (url.startsWith('/api/chat/threads?program_id=')) return ok({ threads: [THREAD] });
    return ok({});
  });
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-410' };
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
});

describe('Project home — five tabs follow the work', () => {
  it('the tabs are exactly Evidence, Author, Review, Submit and Respond, in that order', async () => {
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(tabs().length).toBeGreaterThan(0));
    expect(tabs().map((b) => b.textContent?.trim())).toEqual(['Evidence', 'Author', 'Review', 'Submit', 'Respond']);
  });

  it('no tab says "Not in this release"', async () => {
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(tabs().length).toBeGreaterThan(0));
    for (const b of tabs()) {
      const label = b.textContent?.trim() ?? '';
      fireEvent.click(b);
      await waitFor(() => expect(activeLabel()).toBe(label));
      expect(screen.queryByText('Not in this release'), `${label} says "Not in this release"`).toBeNull();
    }
  });

  it('what Plan and Lifecycle promised is named on Submit as coming later, with no button', async () => {
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(tab('Submit')).toBeTruthy());
    fireEvent.click(tab('Submit')!);
    const line = await screen.findByTestId('pj-coming-later');
    expect(line.textContent).toMatch(/^Coming later:/);
    for (const promised of ['Registrations', 'market access', 'pharmacovigilance', 'regulatory intelligence', 'precedent', 'agency meetings']) {
      expect(line.textContent, `Submit does not name "${promised}"`).toContain(promised);
    }
    expect(within(line).queryByRole('button'), 'a coming-later line offers nothing to click').toBeNull();
  });
});

describe('Project home — AnA can still name the removed tabs', () => {
  it('set-stage "plan" opens Submit, and says so', async () => {
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('project-home'));
    const out = setStage('plan');
    expect(out.status).toBe('applied');
    await waitFor(() => expect(activeLabel()).toBe('Submit'));
    expect(out.detail).toMatch(/submit/i);
  });

  it('set-stage "lifecycle" opens Submit too', async () => {
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('project-home'));
    expect(setStage('review').status).toBe('applied');
    await waitFor(() => expect(activeLabel()).toBe('Review'));
    expect(setStage('lifecycle').status).toBe('applied');
    await waitFor(() => expect(activeLabel()).toBe('Submit'));
  });
});

describe('Project home — the start box sits above the tabs', () => {
  it('a message typed in the start box survives switching tabs', async () => {
    render(<ProjectHome {...props()} />);
    const box = await screen.findByRole('textbox', { name: /Start a conversation in/ });
    fireEvent.change(box, { target: { value: 'Draft the 2.5 clinical overview from the CSR' } });

    for (const label of ['Review', 'Submit', 'Evidence', 'Respond', 'Author']) {
      fireEvent.click(tab(label)!);
      await waitFor(() => expect(activeLabel()).toBe(label));
      const now = screen.getByRole('textbox', { name: /Start a conversation in/ }) as HTMLTextAreaElement;
      expect(now.value, `the message was lost on switching to ${label}`).toBe('Draft the 2.5 clinical overview from the CSR');
    }
  });

  it('the start box and the conversations come before the tabs and stay on every tab', async () => {
    render(<ProjectHome {...props()} />);
    const region = await screen.findByRole('region', { name: /Start a conversation in/ });
    await screen.findByText(THREAD.title);
    const tablist = screen.getByRole('navigation', { name: 'Project lifecycle' });
    // The open stage is told to a screen reader, not only drawn (WCAG 4.1.2).
    expect(within(tablist).getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'step')).toHaveLength(1);
    expect(tablist.querySelector('[aria-selected]')).toBeNull();
    expect(region.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING, 'start box above the tabs').toBeTruthy();
    const threads = screen.getByTestId('pj-threads');
    expect(threads.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING, 'conversations above the tabs').toBeTruthy();

    fireEvent.click(tab('Submit')!);
    await waitFor(() => expect(activeLabel()).toBe('Submit'));
    expect(screen.getByText(THREAD.title)).toBeTruthy();
    expect(screen.getByRole('region', { name: /Start a conversation in/ })).toBeTruthy();
  });
});

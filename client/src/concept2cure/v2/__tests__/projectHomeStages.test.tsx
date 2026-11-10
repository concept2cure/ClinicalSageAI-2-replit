// @vitest-environment jsdom
/**
 * The project is the filing: six steps, and the start box beside them.
 *
 * docs/design/FILING_SPINE.md §1, §2 and slice F2. The project page had seven
 * tabs. Two of them, Plan and Lifecycle, held nothing this release can open:
 * each showed "Not in this release" with no button, and Plan's schedule panel
 * fetched only numeric project ids, so it never loaded for a project opened
 * from Projects. The start box sat inside Author, so leaving Author unmounted
 * a half-typed message.
 *
 * Plan returned on 2026-10-25 (CLIENT_JOURNEY_2026-10-25.md, pass 3) with
 * something to open: what the filing needs, the team and the tasks.
 *
 * Now:
 *   - the steps are exactly Plan, Evidence, Author, Review, Submit and Respond;
 *   - no step says "Not in this release"; what Submit will hold once it works
 *     is one line of words, with no button, rewritten in slice A.1 to name
 *     only what is not yet shown (it named IND annual-report tracking, which
 *     IND forms files today, and regulatory intelligence and agency meetings);
 *   - AnA's `project-home.set-stage` opens Plan by name, and still accepts
 *     'lifecycle', which opens Submit (follow-up sequences);
 *   - the steps come first; the start box and the Conversations list sit in
 *     the side column beside every step (CLIENT_JOURNEY pass 4), outside the
 *     step switch, so what is typed survives a change of step.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { isLaunchSurface } from '../../../../../shared/constants/launch-scope';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null }) }));
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

describe('Project home — six steps follow the work', () => {
  it('names the owning client rather than calling the CRO organization the sponsor', async () => {
    apiRequest.mockImplementation(async (_method: string, url: string) => url === `/api/c2c/projects/${PID}`
      ? ok({ id: PID, name: 'BX-410', product_name: 'Torvanib', program_type: 'IND', status: 'active',
          sponsor_name: 'CRO organization', client_workspace_id: 11, client_name: 'Client Alpha' })
      : ok({}));
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(screen.getByText('Client Alpha')).toBeTruthy());
    const client = screen.getByText('Client Alpha').closest('dl');
    expect(client?.querySelector('dt')?.textContent).toBe('Client');
    expect(document.querySelector('dl.pj-fact')?.textContent).not.toContain('CRO organization');
  });

  it('the steps are exactly Plan, Evidence, Author, Review, Submit and Respond, in that order', async () => {
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(tabs().length).toBeGreaterThan(0));
    expect(tabs().map((b) => b.textContent?.trim())).toEqual(['Plan', 'Evidence', 'Author', 'Review', 'Submit', 'Respond']);
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

  it('no step names a roadmap: the "Coming later" lines are gone (2026-10-31)', async () => {
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(tab('Submit')).toBeTruthy());
    for (const label of ['Plan', 'Evidence', 'Author', 'Review', 'Submit', 'Respond']) {
      fireEvent.click(tab(label)!);
      await waitFor(() => expect(activeLabel()).toBe(label));
      expect(screen.queryByTestId('pj-coming-later'), `${label} has a coming-later line`).toBeNull();
      expect(document.body.textContent, `${label} names something as coming later`).not.toMatch(/Coming later/);
    }
  });
});

describe('Project home — AnA names each step, and the removed one', () => {
  it('set-stage "plan" opens Plan, a step again', async () => {
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('project-home'));
    const out = setStage('plan');
    expect(out.status).toBe('applied');
    await waitFor(() => expect(activeLabel()).toBe('Plan'));
    expect(out.detail).toMatch(/plan/i);
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

describe('Project home — the start box sits beside every step', () => {
  it('a message typed in the start box survives switching tabs', async () => {
    render(<ProjectHome {...props()} />);
    const box = await screen.findByRole('textbox', { name: 'Ask AnA about this project' });
    fireEvent.change(box, { target: { value: 'Draft the 2.5 clinical overview from the CSR' } });

    for (const label of ['Plan', 'Review', 'Submit', 'Evidence', 'Respond', 'Author']) {
      fireEvent.click(tab(label)!);
      await waitFor(() => expect(activeLabel()).toBe(label));
      const now = screen.getByRole('textbox', { name: 'Ask AnA about this project' }) as HTMLTextAreaElement;
      expect(now.value, `the message was lost on switching to ${label}`).toBe('Draft the 2.5 clinical overview from the CSR');
    }
  });

  it('the start box comes first, above the steps; the conversations sit beside them; both stay on every step', async () => {
    render(<ProjectHome {...props()} />);
    const region = await screen.findByRole('region', { name: 'Ask AnA about this project' });
    await screen.findByText(THREAD.title);
    const tablist = screen.getByRole('navigation', { name: 'Project lifecycle' });
    // The open stage is told to a screen reader, not only drawn (WCAG 4.1.2).
    expect(within(tablist).getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'step')).toHaveLength(1);
    expect(tablist.querySelector('[aria-selected]')).toBeNull();
    /* Claude's project page (founder, 2026-11-01; RULE 4), superseding CLIENT_JOURNEY pass 4 decision 5:
       the conversation with AnA first in the main column, then the steps. */
    expect(region.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING, 'start box before the steps').toBeTruthy();
    expect(region.closest('.pj-main'), 'start box in the main column').toBeTruthy();
    /* D3-1 (2026-11-06, D3.md §4.5): the conversations sit under the composer, as Claude lists a project's
       conversations, and before the steps. */
    const threads = screen.getByTestId('pj-threads');
    expect(threads.closest('.pj-main'), 'conversations in the main column').toBeTruthy();
    expect(region.compareDocumentPosition(threads) & Node.DOCUMENT_POSITION_FOLLOWING, 'conversations after the composer').toBeTruthy();
    expect(threads.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING, 'conversations before the steps').toBeTruthy();

    fireEvent.click(tab('Submit')!);
    await waitFor(() => expect(activeLabel()).toBe('Submit'));
    expect(screen.getByText(THREAD.title)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Ask AnA about this project' })).toBeTruthy();
  });
});

/* D3-2a (2026-11-06, D3.md §4.8): Project knowledge is the same column on every step, in Claude's order. Its cards
   were About only, with the readiness, skills, memory and records cards on Author alone. */
describe('Project home — Project knowledge is the same on every step', () => {
  const cards = () => Array.from(document.querySelectorAll('aside.pj-side h3')).map((h) => h.textContent?.trim());

  it('About, Filing, Team, then What AnA knows and Records, on all six steps', async () => {
    render(<ProjectHome {...props()} />);
    await screen.findByRole('region', { name: 'Filing' });
    await waitFor(() => expect(cards()).toContain('Records'));
    const first = cards();
    const at = (name: string) => first.indexOf(name);
    for (const name of ['About', 'Filing', 'Team', 'What AnA knows', 'Records']) expect(at(name), name).toBeGreaterThan(-1);
    expect(at('About')).toBeLessThan(at('Filing'));
    expect(at('Filing')).toBeLessThan(at('Team'));
    expect(at('Team')).toBeLessThan(at('What AnA knows'));
    expect(at('What AnA knows')).toBeLessThan(at('Records'));
    for (const label of ['Plan', 'Evidence', 'Author', 'Review', 'Submit', 'Respond']) {
      fireEvent.click(tab(label)!);
      await waitFor(() => expect(activeLabel()).toBe(label));
      expect(cards(), label).toEqual(first);
    }
  });

  it("the Filing card's readiness figure opens Author, where its detail is", async () => {
    render(<ProjectHome {...props()} />);
    fireEvent.click(tab('Plan')!);
    const filing = await screen.findByRole('region', { name: 'Filing' });
    fireEvent.click(within(filing).getByRole('button', { name: /Dossier readiness/ }));
    await waitFor(() => expect(activeLabel()).toBe('Author'));
  });
});


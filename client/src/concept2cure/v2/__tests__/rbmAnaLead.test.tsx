// @vitest-environment jsdom
/**
 * AnA's conversation leads Risk-based monitoring (the founder, 2026-11-12: "enhance the UI experience and place AnA
 * chat prominently more"; D7.md §C, the work-area pattern).
 *
 * Before: an uppercase eyebrow and a three-sentence description over a "PROJECT" label; AnA in a 352px utility
 * panel titled "AnA — RBM co-monitor" that printed her answers as raw text; closed, she was a sideways strip at the
 * board's edge; and below 1100px the panel dropped under the whole board. Now:
 *
 * - the header is the one work-area header, and its sentence carries the study's sites and subjects;
 * - where there is room the conversation is open on arrival, with a question, what she is looking at and the open
 *   tab's suggestions, and her answers render as prose;
 * - the header's "AnA" button closes and opens it; closed, her composer and the suggestions sit under the title;
 * - on a narrow window it waits behind that composer and opens as a drawer that Escape closes.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { seedCompanySession, endCompanySession } from './_company-session-fixture';

const h = vi.hoisted(() => ({ request: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: h.request }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuthUser: () => actual.authService.getUser() };
});
vi.mock('../../components/ana/useAnaChat', () => ({ useAnaChat: () => ({
  messages: [], isStreaming: false, isLoadingThread: false, threadId: null, runStatus: null, pendingSteers: [], send: h.send,
  reset: vi.fn(), pause: vi.fn(), resume: vi.fn(), interject: vi.fn(), stop: vi.fn(), loadThread: vi.fn(),
}) }));

import { Rbm } from '../surfaces/Rbm';
import { RbmAnaDock } from '../surfaces/RbmSurfaces';
import { RBM_NAV } from '../fixtures/rbm-data';
import { clearShellProject, publishShellProject } from '../shellProject';
import { getSurface } from '@shared/constants/ui-surface-registry';

const rbmSurface = getSurface('rbm');
if (!rbmSurface) throw new Error('Registered RBM surface is required');
const viewProps = { surface: rbmSurface, segment: 'biopharma' };
const A = '11111111-1111-4111-8111-111111111111';
const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const board = {
  programId: A, asOf: '2026-10-30T00:00:00.000Z',
  summary: { overallRisk: 'medium', asOf: '2026-10-30T00:00:00.000Z', riskItems: { total: 1, critical: 0, open: 1, high: 0 }, kris: { total: 0, red: 0, amber: 0, notEvaluated: 0 },
    qtls: { total: 0, breached: 0, approaching: 0, notEvaluated: 0 }, signals: { total: 0, open: 0, high: 0 }, sites: { total: 8, enhanced: 1 }, patients: { scored: 1, flagged: 0, review: 0 } },
  attention: [{ sev: 'high', kind: 'KRI', nav: 'kris', t: 'AE reporting lag is red', d: '21 days against a limit of 10' }],
  report: null, reportMarkdown: null, assessment: null, items: [], kris: [], qtls: [], signals: [], patients: [], sites: [], oversight: {}, plan: null, governingPlanId: null, actions: [], freshness: [],
};

/** jsdom has no matchMedia. A narrow window answers `matches` for the docked-width query. */
function stubWindowWidth(narrow: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: narrow && /max-width/.test(query), media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn() }));
}

beforeEach(() => {
  clearShellProject(); seedCompanySession({ organizationId: '7' }); h.send.mockReset();
  h.request.mockReset().mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === '/api/mdx-rbm/rbm-programs') return envelope([{ id: A, label: 'LMN-201', code: 'LMN-201', productType: 'drug' }]);
    if (method === 'GET' && path.startsWith('/api/mdx-rbm/rbm-board/')) return envelope(board);
    if (method === 'GET') return envelope([]);
    throw new Error(`Unexpected RBM request ${method} ${path}`);
  });
  publishShellProject({ id: A, title: 'LMN-201' });
});
afterEach(() => { cleanup(); endCompanySession(); clearShellProject(); vi.unstubAllGlobals(); });

const dock = () => screen.queryByRole('complementary', { name: 'AnA — risk-based monitoring' });
const toggle = () => screen.getByRole('button', { name: 'AnA' });

describe('the page header is the one work-area header', () => {
  it('has no eyebrow or "Project" caption, and says the study’s sites and subjects in its one sentence', async () => {
    const { container } = render(<Rbm {...viewProps} onNav={vi.fn()} />);
    await screen.findByText('Needs attention now');
    expect(container.querySelector('header.ph')).toBeTruthy();
    expect(container.querySelector('.ph-eyebrow')).toBeNull();
    expect(screen.queryByText(/risk-based quality management$/)).toBeNull();
    expect(container.querySelector('.rbm-study-l')).toBeNull();
    expect(container.querySelector('header.ph')!.textContent).not.toMatch(/Project(?! management)/);
    expect(container.querySelector('.ph-sub')!.textContent).toBe('ICH E6(R3) risk-based quality management for the study: 8 sites, 1 subject scored.');
    expect(container.firstElementChild!.getAttribute('data-work-area')).toBe('rbm');
  });

  it('keeps the four doors to the project, Vault, tasks and biostatistics', async () => {
    const onNav = vi.fn();
    render(<Rbm {...viewProps} onNav={onNav} />);
    await screen.findByText('Needs attention now');
    for (const name of [/Project management/, /Vault Monitoring reports/, /Tasking Unified task board/, /Biostatistics Estimand/]) expect(screen.getByRole('button', { name })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Biostatistics Estimand/ }));
    expect(onNav).toHaveBeenCalledWith('biostatistics');
  });

  it('shows the ten tabs as tabs, in one row', async () => {
    const { container } = render(<Rbm {...viewProps} onNav={vi.fn()} />);
    await screen.findByText('Needs attention now');
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(RBM_NAV.map(n => n.label));
    expect(container.querySelector('.tabs')).toBeTruthy();
    expect(container.querySelector('.reg-tabs')).toBeNull();
  });
});

describe('AnA’s conversation leads the screen', () => {
  it('is open on arrival where there is room, bound to the study and the open tab', async () => {
    stubWindowWidth(false);
    render(<Rbm {...viewProps} onNav={vi.fn()} />);
    await screen.findByText('Needs attention now');
    const panel = dock()!;
    expect(panel).toBeTruthy();
    expect(within(panel).getByText('LMN-201 · Overview')).toBeTruthy();
    expect(within(panel).getByText('What should we look at in LMN-201?')).toBeTruthy();
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    // One composer on the screen: the dock's.
    expect(screen.getAllByRole('textbox', { name: 'Ask AnA about this study' })).toHaveLength(1);
  });

  it('closes from the header; closed, her composer and the tab’s suggestions sit under the title, and a question opens it and sends', async () => {
    stubWindowWidth(false);
    const { container } = render(<Rbm {...viewProps} onNav={vi.fn()} />);
    await screen.findByText('Needs attention now');
    fireEvent.click(toggle());
    expect(dock()).toBeNull();
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    const bar = screen.getByRole('group', { name: 'Ask AnA' });
    // Under the title and above the tabs.
    expect(bar.compareDocumentPosition(container.querySelector('.tabs')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const s of RBM_NAV[0].starters) expect(within(bar).getByRole('button', { name: s })).toBeTruthy();
    const box = within(bar).getByRole('textbox', { name: 'Ask AnA about this study' });
    fireEvent.change(box, { target: { value: 'Which sites worry you?' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(h.send).toHaveBeenCalledWith('Which sites worry you?');
    expect(dock()).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Ask AnA' })).toBeNull();
  });

  it('follows the open tab: the suggestions and the subtitle are the tab’s', async () => {
    stubWindowWidth(false);
    render(<Rbm {...viewProps} onNav={vi.fn()} />);
    await screen.findByText('Needs attention now');
    fireEvent.click(screen.getByRole('tab', { name: 'Site risk' }));
    const panel = dock()!;
    expect(within(panel).getByText('LMN-201 · Site risk')).toBeTruthy();
    const sites = RBM_NAV.find(n => n.id === 'sites')!;
    fireEvent.click(within(panel).getByRole('button', { name: sites.starters[0] }));
    expect(h.send).toHaveBeenCalledWith(sites.starters[0]);
  });

  it('on a narrow window waits behind the composer, and opens as a drawer that Escape closes', async () => {
    stubWindowWidth(true);
    render(<Rbm {...viewProps} onNav={vi.fn()} />);
    await screen.findByText('Needs attention now');
    expect(dock()).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(within(screen.getByRole('group', { name: 'Ask AnA' })).getByRole('button', { name: RBM_NAV[0].starters[0] }));
    expect(h.send).toHaveBeenCalledWith(RBM_NAV[0].starters[0]);
    const drawer = screen.getByRole('dialog', { name: 'AnA — risk-based monitoring' });
    expect(drawer.closest('.de-bd')).toBeTruthy();
    expect(drawer.hasAttribute('data-docked')).toBe(false);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The board never lost its place: it is still there under the composer.
    expect(screen.getByText('Needs attention now')).toBeTruthy();
  });

  it('offers no composer before a study is chosen, because there is nothing for her to read', async () => {
    stubWindowWidth(true);
    clearShellProject();
    render(<Rbm {...viewProps} onNav={vi.fn()} />);
    await screen.findByText('Choose a project for risk-based monitoring');
    expect(screen.queryByRole('group', { name: 'Ask AnA' })).toBeNull();
  });
});

describe('the conversation panel', () => {
  const nav = RBM_NAV[0];

  it('renders her answer as prose, not as markdown source', () => {
    const { container } = render(<RbmAnaDock nav={nav} study="LMN-201" onAsk={vi.fn()} onClose={vi.fn()} msgs={[
      { role: 'user', text: 'What needs attention?' },
      { role: 'assistant', text: '## Two sites\n\n- **Site 104** is red on AE reporting lag\n- Site 106 is amber' },
    ]} />);
    const answer = container.querySelector('.rbm-ana-text')!;
    expect(answer.textContent).not.toMatch(/##|\*\*/);
    expect(answer.querySelector('strong')?.textContent).toBe('Site 104');
    expect(answer.querySelectorAll('li')).toHaveLength(2);
  });

  it('keeps the open tab’s suggestions one tap away once a conversation is under way', () => {
    const onAsk = vi.fn();
    render(<RbmAnaDock nav={nav} study="LMN-201" onAsk={onAsk} onClose={vi.fn()} msgs={[{ role: 'user', text: 'Hello' }]} />);
    expect(screen.queryByText('What should we look at in LMN-201?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: nav.starters[1] }));
    expect(onAsk).toHaveBeenCalledWith(nav.starters[1]);
  });

  it('sends on Enter, keeps Shift+Enter for a new line, and never sends an empty message', () => {
    const onAsk = vi.fn();
    render(<RbmAnaDock nav={nav} study="LMN-201" onAsk={onAsk} onClose={vi.fn()} msgs={[]} />);
    const box = screen.getByRole('textbox', { name: 'Ask AnA about this study' });
    const send = screen.getByRole('button', { name: 'Send message to AnA' });
    expect(box.getAttribute('placeholder')).toBe('Ask AnA about LMN-201');
    expect((send as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onAsk).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: 'Rank the sites' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(onAsk).not.toHaveBeenCalled();
    fireEvent.click(send);
    expect(onAsk).toHaveBeenCalledWith('Rank the sites');
    expect((box as HTMLTextAreaElement).value).toBe('');
  });

  it('closes from its own header', () => {
    const onClose = vi.fn();
    render(<RbmAnaDock nav={nav} study="LMN-201" onAsk={vi.fn()} onClose={onClose} msgs={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close AnA' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('counts no tools and names none', () => {
    const { container } = render(<RbmAnaDock nav={nav} study="LMN-201" onAsk={vi.fn()} onClose={vi.fn()} msgs={[]} />);
    expect(container.textContent).not.toMatch(/9 RBM tools|co-monitor|get_rbm_attention/);
    expect(screen.getByText(/runs the same monitoring tools the buttons run/)).toBeTruthy();
  });
});

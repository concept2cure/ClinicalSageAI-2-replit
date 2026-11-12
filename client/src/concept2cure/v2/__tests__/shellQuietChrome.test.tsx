// @vitest-environment jsdom
/**
 * The quiet chrome: the sidebar (D1-1; .design/claude-convergence/D1.md §D1.A and §D1.I).
 *
 * WHY THIS EXISTS
 * Claude's sidebar opens with "New conversation" (its one orange, a round "+") and
 * Search, then the places, then Recents, with the account at the bottom: the
 * person's name and their organisation. Ours opened with the places, put Search
 * as a seventh place, showed the raw role value ("admin") under the name, drew a
 * grey fill on the brand beside Home's own active row, an orange ".RI" and an
 * orange avatar, and kept a 56px icon strip beside the content at phone width.
 * "What AnA remembers" was reachable only from a conversation's header.
 *
 * WHAT IS PINNED
 *   - the first two `.rail-nav` buttons are "New conversation" and "Search";
 *     New conversation opens Home behind the leave guard;
 *   - the account button's second line is the organisation (the role, as words,
 *     when none is known), and its title names both;
 *   - the account menu: "What AnA remembers" right after Account opens the
 *     drawer, Escape closes it and focus returns to the account button; the
 *     admin entries stay gated exactly as before (isOrgAdmin, platformAdmin);
 *   - Organizations and invitations sits in the sidebar foot, after the account,
 *     and no longer in the top bar;
 *   - at phone width, choosing an item closes the drawer; the top bar's
 *     "Open the sidebar" button opens it;
 *   - in the sidebar's rules: the round "+" is the one orange, group labels are
 *     12px sentence case, nothing under 12px, no brand fill, the avatar in ink;
 *     at ≤640px no strip is reserved and the collapsed rail is not drawn.
 *
 * The top bar (D1-2, §D1.B). Claude's top bar is near-empty: where you are in one
 * quiet line, a few quiet icons. Ours carried "Concept2Cure.RI ›", a tier crumb, a
 * project chip that named the open project a second time, the organisation with an
 * orange mark, a 230px search box, an orange-tinted "Task", Help, and an orange
 * badge. Pinned here:
 *   - no `.tb-cmdk`, `.tb-org`, `.tb-proj`, `.tb-task` in the bar;
 *     the open project is the first crumb, a `.crumb-proj` button that opens its
 *     page, on every screen while one is open; no root or tier crumb;
 *   - on Home with no project open, Search, Collaborate, New task, Your work and
 *     Help, and no text but Search's; at phone width "New conversation" sits last.
 *     P-122 (2026-11-10) brought Search and Help back to the bar
 *     (p122TopBarSearchHelp.test.tsx); D1-2 had moved them to the sidebar and the
 *     account menu;
 *   - in the bar's rules: no orange, nothing under 12px, Home's bar drops its rule,
 *     the badge is ink and turns red when something is overdue; the lazy fallback
 *     is a quiet line ("Loading…"), not a box.
 *
 * The stylesheet cases are in shellQuietChromeRules.test.ts.
 *
 * Red at b854c54c2b (before D1-1): docs/evidence/DESIGN/D1/D1-1/red/.
 * The top bar's cases, red at 16df5ed4b7 (before D1-2): docs/evidence/DESIGN/D1/D1-2/red/.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const viewer = vi.hoisted(() => ({ roles: ['admin'] as string[] }));
// a2f9264a5d: WhatAnaRemembers keys its owner read to authService's session, so keep the real module.
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { firstName: 'Ada', lastName: 'Rowe', displayName: 'Ada Rowe', roles: viewer.roles }, logout: vi.fn() }),
}));
const tenant = vi.hoisted(() => ({
  current: { currentOrganization: { name: 'Concept2Cure Therapeutics' } } as { currentOrganization: { name: string } | null },
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => tenant.current,
}));

import { getSurface, type UiSurface } from '@shared/constants/ui-surface-registry';
import { NavEntitlementsProvider } from '../navEntitlements';
import { registerSurfaceLeaveGuard } from '../navParams';
import { Rail, TopBar } from '../Shell';
import { clearShellProject, publishShellProject } from '../shellProject';
import { SURFACE_VIEWS } from '../surfaceViews';

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;
const NAV = { organizationId: 7, tier: 'enterprise', industryMode: 'biotech', masterAdmin: false, resolved: true, surfaces: [] };

beforeEach(() => {
  viewer.roles = ['admin'];
  tenant.current = { currentOrganization: { name: 'Concept2Cure Therapeutics' } };
  clearShellProject();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === '/api/module-subscriptions/navigation') return ok(NAV);
    if (url.startsWith('/api/chat/threads')) return ok({ threads: [] });
    if (url === '/api/task-management/my-work') return ok({ data: { items: [], total: 0, overdue: 0, dueSoon: 0, blocked: 0, approvalsPending: 0 } });
    if (url.startsWith('/api/mdx/notifications/unread-count')) return ok({ data: { unread: 0 } });
    return ok({ data: [] });
  });
});
afterEach(() => {
  cleanup();
  clearShellProject();
  vi.unstubAllGlobals();
});

function mountRail(props: { collapsed?: boolean; onSearch?: () => void; activeId?: string } = {}) {
  const onNav = vi.fn();
  const setCollapsed = vi.fn();
  render(
    <NavEntitlementsProvider>
      <Rail activeId={props.activeId ?? 'home'} onNav={onNav} collapsed={props.collapsed ?? false} setCollapsed={setCollapsed}
        segment="biopharma" setSegment={() => {}} onSearch={props.onSearch} />
    </NavEntitlementsProvider>,
  );
  const rail = screen.getByRole('navigation', { name: 'Primary' });
  return { onNav, setCollapsed, rail };
}

/** A viewport `(max-width: 640px)` either matches or not, as the shell asks it. */
function viewport(phone: boolean) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: phone && /max-width:\s*640px/.test(query), media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
}

describe('the top of the sidebar: New conversation, then Search (§D1.A step 1)', () => {
  it('the first two .rail-nav buttons are "New conversation" and "Search"', () => {
    const { rail } = mountRail({ onSearch: () => {} });
    const first = Array.from(rail.querySelectorAll('.rail-nav button')).slice(0, 2);
    expect(first.map((b) => b.textContent?.trim())).toEqual(['New conversation', 'Search']);
    // An action beside Search, not a place: it sits above the list of places, not in it.
    expect(rail.querySelector('.rail-scroll .rail-new')).toBeNull();
    expect(first[0].classList.contains('rail-new')).toBe(true);
  });

  it('New conversation opens Home, where a question starts a new conversation', () => {
    const { rail, onNav } = mountRail({ onSearch: () => {} });
    fireEvent.click(within(rail).getByRole('button', { name: 'New conversation' }));
    expect(onNav).toHaveBeenCalledWith('home');
  });

  it('Search still opens the command palette', () => {
    const onSearch = vi.fn();
    const { rail } = mountRail({ onSearch });
    fireEvent.click(within(rail).getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenCalledOnce();
  });
});

describe('the account (§D1.A steps 2–3)', () => {
  it('names the organisation under the person, and in the button’s title', () => {
    const { rail } = mountRail();
    const button = rail.querySelector('.rail-account') as HTMLElement;
    expect(button.querySelector('.rl')?.textContent).toBe('Concept2Cure Therapeutics');
    expect(button.getAttribute('title')).toBe('Ada Rowe · Concept2Cure Therapeutics');
  });

  it('with no organisation known, says the role in words, never the raw value', () => {
    tenant.current = { currentOrganization: null };
    viewer.roles = ['org_admin'];
    const { rail } = mountRail();
    const button = rail.querySelector('.rail-account') as HTMLElement;
    expect(button.querySelector('.rl')?.textContent).toBe('Org admin');
    expect(button.getAttribute('title')).toBe('Ada Rowe');
  });

  it('the menu head names the organisation and the role on one line', () => {
    const { rail } = mountRail();
    fireEvent.click(rail.querySelector('.rail-account') as HTMLElement);
    const head = screen.getByRole('menu').querySelector('.acct-head') as HTMLElement;
    expect(head.querySelector('.nm')?.textContent).toBe('Ada Rowe');
    expect(head.querySelector('.rl')?.textContent).toBe('Concept2Cure Therapeutics · Admin');
  });

  it('"What AnA remembers" follows Account, opens the drawer, and Escape returns focus to the account button', async () => {
    const { rail } = mountRail();
    const button = rail.querySelector('.rail-account') as HTMLButtonElement;
    fireEvent.click(button);
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent?.trim());
    expect(items.slice(0, 2)).toEqual(['Account', 'What AnA remembers']);
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'What AnA remembers' }));
    expect(screen.queryByRole('menu')).toBeNull();
    const drawer = await screen.findByRole('dialog', { name: 'What AnA remembers' });
    expect(drawer).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'What AnA remembers' })).toBeNull());
    expect(document.activeElement).toBe(button);
  });

  it('keeps the admin entries gated exactly as before', async () => {
    viewer.roles = ['member'];
    const { rail } = mountRail();
    fireEvent.click(rail.querySelector('.rail-account') as HTMLElement);
    const member = within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent?.trim());
    expect(member).toContain('What AnA remembers');
    /* P-122 (2026-11-10): the features catalog is every member's, listing what each person may open
       (appsCatalogEveryMember.test.tsx). Administration stays an administrator's. */
    expect(member).toContain('Subscription & features');
    for (const gated of ['Admin', 'Access requests', 'Platform licensing', 'Codebase coverage']) {
      expect(member, gated).not.toContain(gated);
    }
    cleanup();
    viewer.roles = ['admin'];
    const again = mountRail();
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    fireEvent.click(again.rail.querySelector('.rail-account') as HTMLElement);
    const admin = within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent?.trim());
    expect(admin.slice(0, 3)).toEqual(['Account', 'What AnA remembers', 'Admin']);
    expect(admin).toContain('Subscription & features');
    expect(admin).toContain('Access requests');
    // Platform licensing follows the server's guard, not the org role (accountMenuMasterLicensing.test.tsx).
    expect(admin).not.toContain('Platform licensing');
  });

  it('Organizations and invitations sits in the sidebar foot, after the account', () => {
    const { rail } = mountRail();
    const foot = rail.querySelector('.rail-foot') as HTMLElement;
    const buttons = Array.from(foot.querySelectorAll(':scope > button'));
    const account = buttons.findIndex((b) => b.classList.contains('rail-account'));
    const orgs = buttons.findIndex((b) => b.getAttribute('aria-label') === 'Organizations and invitations');
    expect(account).toBeGreaterThanOrEqual(0);
    expect(orgs).toBe(account + 1);
  });

  it('collapsed, the foot stacks the expand toggle, organisation access, then the avatar', () => {
    const { rail } = mountRail({ collapsed: true });
    const foot = rail.querySelector('.rail-foot') as HTMLElement;
    const order = Array.from(foot.querySelectorAll(':scope > button')).map((b) =>
      b.classList.contains('rail-collapse') ? 'toggle' : b.classList.contains('rail-account') ? 'account' : b.getAttribute('aria-label'));
    expect(order).toEqual(['toggle', 'Organizations and invitations', 'account']);
  });
});

describe('the top bar no longer carries organisation access, and opens the sidebar at phone width', () => {
  const bar = (onOpenRail?: () => void) =>
    render(<TopBar surface={{ id: 'vault', label: 'Vault' }} onPalette={() => {}} segment="biopharma" onSegment={() => {}}
      onNav={() => {}} {...(onOpenRail ? { onOpenRail } : {})} />);

  it('"Open the sidebar" is the bar’s first control and opens it', () => {
    const onOpenRail = vi.fn();
    bar(onOpenRail);
    const topbar = document.querySelector('.topbar') as HTMLElement;
    const first = topbar.firstElementChild as HTMLElement;
    expect(first.getAttribute('aria-label')).toBe('Open the sidebar');
    expect(first.classList.contains('tb-rail')).toBe(true);
    fireEvent.click(first);
    expect(onOpenRail).toHaveBeenCalledOnce();
  });

  it('draws no sidebar button that would do nothing', () => {
    bar();
    expect(screen.queryByRole('button', { name: 'Open the sidebar' })).toBeNull();
  });

  it('has no Organizations and invitations button of its own', () => {
    bar(() => {});
    expect(within(document.querySelector('.topbar') as HTMLElement).queryByRole('button', { name: 'Organizations and invitations' })).toBeNull();
  });
});

describe('at phone width, choosing an item closes the drawer (§D1.A step 7)', () => {
  it('a place, New conversation and Search each close it', () => {
    viewport(true);
    const onSearch = vi.fn();
    const { rail, onNav, setCollapsed } = mountRail({ onSearch, activeId: 'projects' });
    fireEvent.click(within(rail.querySelector('.rail-scroll') as HTMLElement).getByRole('button', { name: 'Vault' }));
    expect(onNav).toHaveBeenCalledWith('vault');
    expect(setCollapsed).toHaveBeenLastCalledWith(true);
    setCollapsed.mockClear();
    fireEvent.click(within(rail).getByRole('button', { name: 'New conversation' }));
    expect(setCollapsed).toHaveBeenLastCalledWith(true);
    setCollapsed.mockClear();
    fireEvent.click(within(rail).getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenCalledOnce();
    expect(setCollapsed).toHaveBeenLastCalledWith(true);
  });

  it('the notice a choice raises is still seen once the drawer closes (it sits beside the rail, not in it)', async () => {
    viewport(true);
    const { rail, setCollapsed } = mountRail({ activeId: 'projects' });
    // A project screen with no project open lands on Projects and says why (Rail.open). Vault is global
    // since 5144702d21 (founder, 2026-11-06), so CMC / Module 3, still scope 'project', raises the notice.
    fireEvent.click(within(rail.querySelector('.rail-scroll') as HTMLElement).getByRole('button', { name: 'CMC / Module 3' }));
    expect(setCollapsed).toHaveBeenLastCalledWith(true);
    const notice = await screen.findByText('Open a project to see its CMC / Module 3. Choose one in Projects.');
    // At ≤640px the collapsed rail is display:none, so a notice inside it would not be drawn.
    expect(rail.contains(notice)).toBe(false);
  });

  it('wider than that, the sidebar stays as it is', () => {
    viewport(false);
    const { rail, onNav, setCollapsed } = mountRail({ activeId: 'projects' });
    fireEvent.click(within(rail.querySelector('.rail-scroll') as HTMLElement).getByRole('button', { name: 'Vault' }));
    expect(onNav).toHaveBeenCalledWith('vault');
    expect(setCollapsed).not.toHaveBeenCalled();
  });
});

/* ── The top bar (D1-2, §D1.B) ────────────────────────────────────────────── */

const C2C_101 = { id: '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', code: 'C2C-101', title: 'Brexolimab IND' };
const registry = (id: string): UiSurface => getSurface(id) ?? (() => { throw new Error(`no surface ${id}`); })();

function mountBar(surface: { id: string; label: string }, props: { onOpenRail?: () => void } = {}) {
  const onNav = vi.fn();
  render(<TopBar surface={surface} onPalette={() => {}} segment="biopharma" onSegment={() => {}} onNav={onNav} {...props} />);
  return { onNav, bar: document.querySelector('header.topbar') as HTMLElement };
}
/** The crumbs as a person reads them, separators included. */
const crumbText = (bar: HTMLElement) =>
  Array.from((bar.querySelector('.crumbs') as HTMLElement).children).map((el) => el.textContent?.trim() ?? '');
/** The bar's controls that show above 640px (`.tb-rail` and `.tb-new` are phone-only, by CSS). */
const wideControls = (bar: HTMLElement) =>
  Array.from(bar.querySelectorAll('button')).filter((b) => !b.matches('.tb-rail, .tb-new, .crumb-proj'));
/** What the bar says in visible words: the badge's count and screen-reader text left out. */
const visibleWords = (el: HTMLElement) => {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.tt-badge, .sr-only').forEach((n) => n.remove());
  return copy.textContent?.trim() ?? '';
};

describe('the top bar: where you are, in one quiet line (§D1.B steps 1 and 4)', () => {
  it('draws no organisation label, project chip or Task chip; the open project is a crumb button', () => {
    publishShellProject(C2C_101);
    const { bar } = mountBar(registry('vault'));
    for (const gone of ['.tb-cmdk', '.tb-org', '.tb-proj', '.tb-task', '.crumb-root', '.crumb-tier']) {
      expect(bar.querySelector(gone), gone).toBeNull();
    }
    // Search and Help are back in the bar since P-122 (p122TopBarSearchHelp.test.tsx).
    expect(within(bar).getByRole('button', { name: 'Get help' })).toBeTruthy();
    expect(bar.textContent).not.toContain('Concept2Cure');
    const crumb = bar.querySelector('.crumbs > .crumb-proj') as HTMLElement;
    expect(crumb.tagName).toBe('BUTTON');
    expect((bar.querySelector('.crumbs') as HTMLElement).firstElementChild).toBe(crumb);
    expect(crumb.textContent).toBe('C2C-101');
    expect(crumb.getAttribute('title')).toBe('C2C-101 — Brexolimab IND');
  });

  it('on Vault with C2C-101 open it reads "C2C-101 › Vault", and the project crumb opens the project page', () => {
    publishShellProject(C2C_101);
    const { bar, onNav } = mountBar(registry('vault'));
    expect(crumbText(bar)).toEqual(['C2C-101', '›', 'Vault']);
    const crumb = within(bar).getByRole('button', { name: 'C2C-101' });
    expect(crumb.getAttribute('aria-current')).toBeNull();
    fireEvent.click(crumb);
    expect(onNav.mock.calls).toEqual([['project-home']]);
  });

  it('on the project page it reads "C2C-101" once, as the current page', () => {
    publishShellProject(C2C_101);
    const { bar } = mountBar(registry('project-home'));
    expect(crumbText(bar)).toEqual(['C2C-101']);
    expect(within(bar).getByRole('button', { name: 'C2C-101' }).getAttribute('aria-current')).toBe('page');
    expect(bar.querySelector('.crumbs .here')).toBeNull();
  });

  it('a project feature reads "the project › the feature"; a one-category or admin page names only itself', () => {
    publishShellProject(C2C_101);
    const { bar } = mountBar(registry('device-engineering'));
    expect(crumbText(bar)).toEqual(['C2C-101', '›', registry('device-engineering').label]);
    cleanup();
    clearShellProject();
    for (const id of ['cmc', 'identity-console']) {
      const again = mountBar(registry(id));
      expect(crumbText(again.bar), id).toEqual([registry(id).label]);
      expect(again.bar.textContent, id).not.toMatch(/Biotech & Pharma|Admin ›|Projects ›/);
      cleanup();
    }
  });

  it('on Home with no project open: Search, Collaborate, New task, Your work and Help, and no text but Search’s', () => {
    const { bar } = mountBar({ id: 'home', label: 'Home' }, { onOpenRail: () => {} });
    expect(wideControls(bar).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Search, jump, or run a command', 'Collaborate on this screen', 'New task from this screen', 'Your work', 'Get help',
    ]);
    expect(crumbText(bar)).toEqual([]);
    expect(visibleWords(bar)).toBe('Search⌘K');
  });

  it('on Home and in a conversation with a project open, the project crumb is the bar’s one text', () => {
    publishShellProject(C2C_101);
    for (const surface of [{ id: 'home', label: 'Home' }, registry('conversation-thread')]) {
      const { bar } = mountBar(surface);
      expect(crumbText(bar), surface.id).toEqual(['C2C-101']);
      // Besides the Search field's own words (P-122).
      expect(visibleWords(bar), surface.id).toBe('C2C-101Search⌘K');
      cleanup();
    }
  });

  it('with no project open there is no project button (Projects is the sidebar’s), and none is invented for an id alone', () => {
    const { bar } = mountBar(registry('vault'));
    expect(bar.querySelector('.crumb-proj')).toBeNull();
    expect(bar.textContent).not.toMatch(/No project open|Open project/);
    expect(crumbText(bar)).toEqual(['Vault']);
    cleanup();
    publishShellProject({ id: C2C_101.id });
    const again = mountBar(registry('project-home'));
    expect(again.bar.querySelector('.crumb-proj')).toBeNull();
    expect(crumbText(again.bar)).toEqual([registry('project-home').label]);
  });
});

describe('the top bar’s controls (§D1.B steps 2 and 3)', () => {
  afterEach(() => {
    delete (window as { C2C?: unknown }).C2C;
  });

  it('Collaborate, New task and Your work are icon buttons, in that order, that keep their handlers', () => {
    const open = vi.fn();
    (window as { C2C?: unknown }).C2C = { open };
    const { bar } = mountBar(registry('vault'));
    // After Search, which P-122 put back first (p122TopBarSearchHelp.test.tsx).
    const [, collab, task, work] = wideControls(bar);
    expect(collab.classList.contains('tb-collab') && collab.classList.contains('tb-btn')).toBe(true);
    expect(task.classList.contains('tb-newtask') && task.classList.contains('tb-btn')).toBe(true);
    expect(work.classList.contains('tt-trigger')).toBe(true);
    for (const b of [collab, task]) expect(visibleWords(b)).toBe('');
    fireEvent.click(task);
    expect(open).toHaveBeenLastCalledWith('task');
    fireEvent.click(collab);
    expect(open).toHaveBeenLastCalledWith('collab');
  });

  it('at phone width: the sidebar button first, New conversation last, and it opens Home', () => {
    const { bar, onNav } = mountBar(registry('vault'), { onOpenRail: () => {} });
    const buttons = Array.from(bar.querySelectorAll('button'));
    const last = buttons[buttons.length - 1];
    expect([buttons[0].className, last.className, last.getAttribute('aria-label')]).toEqual(['tb-btn tb-rail', 'tb-btn tb-new', 'New conversation']);
    fireEvent.click(last);
    expect(onNav).toHaveBeenCalledWith('home');
  });

  it('New conversation waits for unsaved work, as the sidebar’s does', () => {
    const release = registerSurfaceLeaveGuard(() => 'Save the pending section changes before switching work.');
    try {
      const { bar, onNav } = mountBar(registry('vault'));
      fireEvent.click(bar.querySelector('.tb-new') as HTMLElement);
      expect(onNav).not.toHaveBeenCalled();
    } finally {
      release();
    }
  });
});

describe('the lazy fallback says "Loading…" (§D1.B step 8)', () => {
  it('a screen still loading shows one quiet status line, still busy for the probes that wait on it', () => {
    const View = SURFACE_VIEWS['access-requests'].component as React.ComponentType<Record<string, unknown>>;
    render(<View surface={registry('access-requests')} onNav={() => {}} onAsk={() => {}} />);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Loading…');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(status.classList.contains('scaf-note')).toBe(true);
    // The look is the sheet's (.scaf-note[aria-busy="true"]), not an inline box.
    expect(status.getAttribute('style')).toBeNull();
  });
});

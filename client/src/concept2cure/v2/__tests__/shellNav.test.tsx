// @vitest-environment jsdom
/**
 * The navigation lists the places, and each client type lands on a real screen.
 *
 * docs/design/ONE_ANA_ONE_CANVAS.md §5 and slice 22; the places are those of
 * docs/SURFACE_DECISIONS_2026-10-08.md.
 *
 * What the rail showed on 2026-10-08: Client categories, Workspace, then a
 * "Science & intelligence" section (CMC, risk-based monitoring, the FDA CRL
 * library) and an "Explore" section (AnA Command, AnA memory, Apps catalog,
 * Artifacts Center, Conversation, three with an "AnA" badge), and Quick access.
 * Quality, a launch app, had no entry at all: it sat in NAV_HIDDEN. Four of the
 * five client types defaulted to a screen outside this release (device
 * workstream, diagnostics, IND checklist, CRO portfolio), so switching to one
 * opened a "Not in this release" panel
 * (docs/evidence/D2-ONE-ANA/2026-10-08/0-inventory/founder-questions-verified.json).
 *
 * Now the rail is the places, in order: New conversation, Projects, Vault,
 * Submission Center, Quality, Reporting & analytics, My work, and Conversation
 * (the conversation in progress, standing in for Recents until slice 3). My
 * work opens the task board on the person's own tasks. Apps catalog and the
 * client type are in the account menu, which the collapsed rail does not clip
 * and which a keyboard can work. Every client type's default screen is in the
 * launch scope.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { isLaunchSurface } from '@shared/constants/launch-scope';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: 7, firstName: 'Ada', lastName: 'Rowe', displayName: 'Ada Rowe', roles: ['admin'] }, logout: vi.fn() }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ currentOrganization: { name: 'Concept2Cure Therapeutics' } }),
}));

import { NavEntitlementsProvider } from '../navEntitlements';
import { CmdK, Rail, TopBar } from '../Shell';
import { CLIENT_CATEGORIES, SEGMENTS } from '../registryModel';
import { resolveSurfaceIdForTarget } from '../navParams';
import { __resetSurfaceActionBus } from '../surfaceActions';
import { TaskBoard } from '../surfaces/TaskBoard';

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;

/* Two tasks on the board: the signed-in person's (assignee 7) and a
   colleague's (assignee 9). */
function taskRow(over: Record<string, unknown>) {
  return {
    taskId: 'T-0', title: 'Task', project: '31', moduleType: 'cmc', taskType: 'document',
    status: 'pending', priority: 'high', assignee: '7', assignedBy: '7', progress: 0,
    impactScore: null, criticalPath: false, regulatoryImpact: false,
    approvalRequired: false, approvalStatus: 'none', approvalHistory: [],
    dependsOn: [], blocks: [], comments: 0, attachments: 0, source: 'manual',
    due: 'Sep 1', dueDateIso: null, lifecyclePhase: null, blocked: false,
    blockedReason: null,
    ...over,
  };
}
const TASK_ROWS = [
  taskRow({ taskId: 'T-1', title: 'Draft stability summary', assignee: '7' }),
  taskRow({ taskId: 'T-2', title: 'Review predicate table', project: '32', status: 'in-progress', assignee: '9' }),
];

beforeEach(() => {
  apiRequest.mockReset();
  /* Every destination entitled: what the rail lists is then the nav model
     itself, not a licence verdict hiding part of it. */
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === '/api/module-subscriptions/navigation') {
      return ok({ organizationId: 7, tier: 'enterprise', industryMode: 'biotech', masterAdmin: false, resolved: true, surfaces: [] });
    }
    if (url.startsWith('/api/task-management/board')) return ok({ success: true, data: TASK_ROWS });
    if (url === '/api/projects') return ok([{ id: 31, name: 'BX-204 Oncology IND' }, { id: 32, name: 'MD-11 510(k)' }]);
    if (url === '/api/task-management/assignees') return ok([]);
    return ok({ data: [] });
  });
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
});

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function mountRail(segment = 'biopharma', collapsed = false) {
  const onNav = vi.fn();
  const setSegment = vi.fn();
  render(
    <NavEntitlementsProvider>
      <Rail activeId="projects" onNav={onNav} collapsed={collapsed} setCollapsed={() => {}} segment={segment} setSegment={setSegment} />
    </NavEntitlementsProvider>,
  );
  await settle();
  const rail = screen.getByRole('navigation', { name: 'Primary' });
  const scroll = rail.querySelector('.rail-scroll') as HTMLElement;
  return { onNav, setSegment, rail, scroll };
}

/** Where every entry in the rail's list goes, in order, by pressing each. */
function destinations(scroll: HTMLElement, onNav: ReturnType<typeof vi.fn>): string[] {
  for (const b of Array.from(scroll.querySelectorAll('button'))) fireEvent.click(b);
  return onNav.mock.calls.map((c) => c[0] as string);
}

const PLACES = [
  'New conversation',
  'Projects',
  'Vault',
  'Submission Center',
  'Quality',
  'Reporting & analytics',
  'My work',
  'Conversation',
];

describe('the rail lists the places', () => {
  it('exactly the places, in order', async () => {
    const { scroll } = await mountRail();
    const labels = Array.from(scroll.querySelectorAll('button .lbl')).map((l) => l.textContent);
    expect(labels).toEqual(PLACES);
  });

  it('every entry opens a screen in this release', async () => {
    const { scroll, onNav } = await mountRail();
    const to = destinations(scroll, onNav).map(resolveSurfaceIdForTarget);
    expect(to).toHaveLength(PLACES.length);
    expect(to.filter((id) => !isLaunchSurface(id)), 'rail entries outside the launch scope').toEqual([]);
  });

  it('Quality is on the rail, and opens Quality', async () => {
    const { scroll, onNav } = await mountRail();
    fireEvent.click(within(scroll).getByRole('button', { name: 'Quality' }));
    expect(onNav).toHaveBeenCalledWith('quality');
  });

  it('New conversation opens Home, where the one conversation starts', async () => {
    const { scroll, onNav } = await mountRail();
    fireEvent.click(within(scroll).getByRole('button', { name: 'New conversation' }));
    expect(onNav).toHaveBeenCalledWith('home');
  });

  it('no entry carries an AnA badge, and no section lists retired or locked screens', async () => {
    const { rail } = await mountRail();
    expect(rail.querySelector('.nav-badge')).toBeNull();
    const text = rail.textContent ?? '';
    for (const gone of ['Science & intelligence', 'Explore', 'Quick access', 'Client categories', 'AnA Command', 'AnA memory', 'Artifacts Center', 'CMC', 'Risk-based monitoring', 'CRL library']) {
      expect(text, gone).not.toContain(gone);
    }
  });

  it('the mark goes to Home', async () => {
    const { rail, onNav } = await mountRail();
    fireEvent.click(within(rail).getByRole('button', { name: 'Home' }));
    expect(onNav).toHaveBeenCalledWith('home');
  });
});

describe('the conversation in progress is one step away', () => {
  /* "New conversation" opens Home, and typing there starts a new conversation:
     it does not lead back to the one in progress. Until Recents is built
     (design slice 3), the rail's last entry opens it. */
  it('the rail’s Conversation entry opens the conversation screen, and is marked when it is open', async () => {
    const { scroll, onNav } = await mountRail();
    fireEvent.click(within(scroll).getByRole('button', { name: 'Conversation' }));
    expect(onNav).toHaveBeenCalledWith('conversation-thread');
    cleanup();
    render(
      <NavEntitlementsProvider>
        <Rail activeId="conversation-thread" onNav={vi.fn()} collapsed={false} setCollapsed={() => {}} segment="biopharma" setSegment={vi.fn()} />
      </NavEntitlementsProvider>,
    );
    await settle();
    const current = screen.getByRole('navigation', { name: 'Primary' }).querySelectorAll('[aria-current="page"]');
    expect(Array.from(current).map((el) => el.textContent?.trim())).toEqual(['Conversation']);
  });

  it('⌘K finds Conversation and opens the conversation screen', async () => {
    const onNav = vi.fn();
    render(
      <NavEntitlementsProvider>
        <CmdK open onClose={vi.fn()} onNav={onNav} onAsk={vi.fn()} onAct={vi.fn()} />
      </NavEntitlementsProvider>,
    );
    await settle();
    fireEvent.change(screen.getByPlaceholderText(/Search surfaces/), { target: { value: 'conversation' } });
    const hit = screen.getAllByRole('button').find((b) => b.querySelector('.lbl')?.textContent === 'Conversation');
    expect(hit, 'a Conversation result').toBeTruthy();
    fireEvent.click(hit!);
    expect(onNav).toHaveBeenCalledWith('conversation-thread');
  });
});

const BOARD_PROPS = { surface: { id: 'tasks', label: 'Tasks' }, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' };

describe('My work is the person’s own work', () => {
  /* The board alone opens on everyone's tasks (TaskBoard `mine` starts
     false). The entry asks it for "My tasks" as it opens it, through the
     same validated screen-action bus AnA's moves use. */
  function Harness() {
    const [on, setOn] = React.useState<string | null>(null);
    return (
      <NavEntitlementsProvider>
        <Rail activeId={on ?? 'projects'} onNav={(id) => setOn(resolveSurfaceIdForTarget(id))} collapsed={false} setCollapsed={() => {}} segment="biopharma" setSegment={() => {}} />
        {on === 'tasks' && (
          <TaskBoard {...(BOARD_PROPS as unknown as React.ComponentProps<typeof TaskBoard>)} />
        )}
      </NavEntitlementsProvider>
    );
  }

  it('opens the task board filtered to the signed-in person’s tasks', async () => {
    render(<Harness />);
    await settle();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: 'My work' }));
    await screen.findByText('Draft stability summary');
    await waitFor(() => expect(screen.queryByText('Review predicate table'), 'a colleague’s task under "My work"').toBeNull());
    const mine = screen.getAllByRole('button').find((b) => b.textContent?.trim() === 'My tasks');
    expect(mine?.className).toMatch(/\bon\b/);
  });

  it('opens the board at its own address, not the action’s alias', async () => {
    const { scroll, onNav } = await mountRail();
    fireEvent.click(within(scroll).getByRole('button', { name: 'My work' }));
    expect(onNav).toHaveBeenCalledWith('tasks');
  });
});

describe('Artifacts center, no longer a rail entry, is reached from ⌘K', () => {
  /* tests/e2e/golden-customer-journey.e2e.ts clicked the rail's "Artifacts
     Center" button. That entry went (registryModel.ts RAIL_CORE). This is the
     path the journey takes instead, by the same accessible names. */
  it('the top bar’s search opens the palette, and the result opens Artifacts center', async () => {
    const onNav = vi.fn();
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <NavEntitlementsProvider>
          <TopBar surface={{ id: 'projects', label: 'Projects' }} onPalette={() => setOpen(true)} segment="biopharma" onSegment={vi.fn()} onNav={onNav} />
          <CmdK open={open} onClose={() => setOpen(false)} onNav={onNav} onAsk={vi.fn()} onAct={vi.fn()} />
        </NavEntitlementsProvider>
      );
    }
    render(<Harness />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Search, jump, or run a command' }));
    fireEvent.change(screen.getByPlaceholderText(/Search surfaces/), { target: { value: 'Artifacts' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Artifacts center/i })[0]);
    expect(onNav).toHaveBeenCalledWith('artifacts-center');
  });
});

describe('the account menu holds Apps and the client type', () => {
  async function openMenu(segment = 'biopharma') {
    const m = await mountRail(segment);
    const button = screen.getByTitle('Ada Rowe');
    fireEvent.click(button);
    return { ...m, button, menu: screen.getByRole('menu') };
  }

  it('offers the Apps catalog', async () => {
    const { menu, onNav } = await openMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Apps catalog/ }));
    expect(onNav).toHaveBeenCalledWith('apps');
  });

  it('offers every client type once, the current one checked, by more than colour', async () => {
    const { menu } = await openMenu('biopharma');
    const group = within(menu).getByRole('group', { name: 'Client type' });
    const types = within(group).getAllByRole('menuitemradio');
    expect(types.map((t) => t.textContent?.trim())).toEqual(CLIENT_CATEGORIES.map((c) => c.label));
    const checked = types.filter((t) => t.getAttribute('aria-checked') === 'true');
    expect(checked.map((t) => t.textContent?.trim())).toEqual(['Biotech & Pharma']);
    // The check mark, not only a tint, says which one is chosen (WCAG 1.4.1).
    expect(checked[0].querySelector('.acct-check')).not.toBeNull();
    expect(types.filter((t) => t.querySelector('.acct-check'))).toHaveLength(1);
  });

  it('choosing a client type sets it', async () => {
    const { menu, setSegment } = await openMenu('biopharma');
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: /Medical Device & IVD/ }));
    expect(setSegment).toHaveBeenCalledWith('medtech');
  });

  it('choosing the type already chosen changes nothing and closes the menu', async () => {
    const { menu, setSegment, button } = await openMenu('biopharma');
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: /Biotech & Pharma/ }));
    expect(setSegment).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});

describe('the account menu works from the keyboard (WAI-ARIA menu pattern)', () => {
  async function openMenu() {
    await mountRail('biopharma');
    const button = screen.getByTitle('Ada Rowe');
    fireEvent.click(button);
    const menu = screen.getByRole('menu');
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]'));
    return { button, menu, items };
  }

  it('the button names the menu it opens, and focus moves into it', async () => {
    const { button, menu, items } = await openMenu();
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe(menu.id);
    expect(menu.id).not.toBe('');
    expect(document.activeElement).toBe(items[0]);
  });

  it('the items are one Tab stop: arrows, Home and End move between them, wrapping', async () => {
    const { menu, items } = await openMenu();
    for (const it of items) expect(it.getAttribute('tabindex'), it.textContent ?? '').toBe('-1');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement?.textContent).toMatch(/Log out/);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
    // The client types are reached the same way.
    const medtech = items.findIndex((i) => /Medical Device & IVD/.test(i.textContent ?? ''));
    for (let n = 0; n < medtech; n++) fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('role')).toBe('menuitemradio');
  });

  it('Escape closes it and gives focus back to the button', async () => {
    const { button, menu } = await openMenu();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('Tab closes it, from the button', async () => {
    const { button, menu } = await openMenu();
    fireEvent.keyDown(menu, { key: 'Tab' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});

describe('the collapsed rail does not clip its account menu', () => {
  /* The rail is collapsed (56px) by default and the menu is 248px wide. With
     overflow:hidden on .rail, a real browser showed a 48px sliver of the menu
     and a click on any item hit the scrim, which closed it
     (docs/evidence/D2-ONE-ANA/2026-10-08/ana-2a-rail-code-and-nav/green/
     account-menu-collapsed-browser.txt is the Chromium run). jsdom has no
     layout, so this pins the rules that decide it. */
  const css = readFileSync(path.resolve(__dirname, '../styles/app-v2.css'), 'utf8');
  const rule = (sel: string) => {
    const m = css.match(new RegExp(`(?:^|\\n)\\.c2c-v2 ${sel.replace(/[.[\]()*+?^$|]/g, '\\$&')}\\{([^}]*)\\}`));
    return m?.[1] ?? null;
  };

  it('.rail does not hide its overflow; the list scrolls and clips inside .rail-scroll', () => {
    expect(rule('.rail')).not.toBeNull();
    expect(rule('.rail')).not.toMatch(/overflow\s*:\s*hidden/);
    expect(rule('.rail-scroll')).toMatch(/overflow-x:hidden/);
    expect(rule('.rail-scroll')).toMatch(/overflow-y:auto/);
  });

  it('the menu opens from the collapsed rail with every item present', async () => {
    await mountRail('biopharma', true);
    fireEvent.click(screen.getByTitle('Ada Rowe'));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Apps catalog/ })).toBeTruthy();
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(CLIENT_CATEGORIES.length);
  });
});

describe('each client type lands on a real screen', () => {
  it('every client type defaults to a screen in this release', () => {
    const outside = SEGMENTS.filter((s) => !isLaunchSurface(s.defaultSurface)).map((s) => `${s.id} → ${s.defaultSurface}`);
    expect(outside).toEqual([]);
  });

  it('the four whose default was outside it now open Projects', () => {
    for (const id of ['medtech', 'diagnostics', 'biopharma', 'cro']) {
      expect(SEGMENTS.find((s) => s.id === id)?.defaultSurface, id).toBe('projects');
    }
  });
});

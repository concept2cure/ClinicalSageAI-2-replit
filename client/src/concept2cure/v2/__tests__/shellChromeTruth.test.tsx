// @vitest-environment jsdom
/**
 * The shell's chrome says where the user is and offers only what works.
 *
 * Launch surface-truth sweep, 2026-09-23 — the shell findings:
 *
 *   128  The breadcrumb's client-category crumb defaulted any surface the
 *        group map did not name to "Biotech & Pharma" — Projects, Vault,
 *        Authoring, Submission Center, every device workbench — while the
 *        rail's own listing (surfacesByTier) defaulted the same surfaces to
 *        both categories. Two answers to one question.
 *   130  The open surface's rail entry carried aria-current="page", which no
 *        rule drew; the chosen client category carried aria-current="true",
 *        which drew the current-page fill and bar. The category was the only
 *        thing ever highlighted.
 *   131  The organisation "switcher" was a button with a chevron, no handler,
 *        and the tooltip "switcher lands with the auth flow phase".
 *   132  The Help button had no handler.
 *   135  Collapsed (the default), the rail's brand mark was 5px wide beside the
 *        collapse toggle.
 *   136  A floating launcher, fixed bottom-right on every screen, duplicated the
 *        header's Task and Collaborate buttons and covered the editor's AnA
 *        Send button.
 *   137  The auto-assign note rendered as three side-by-side columns.
 *   139  The Task form showed the URL slug ("From projects"), the payload field
 *        ("stamped as sourceEntityType: portfolio"), both spellings of two
 *        modules, and lowercase priority keys.
 *
 * Layout (134, 135's geometry, 136's overlap) is proven by the screenshots in
 * docs/evidence/W1/2026-09-28-shell-chrome/; what jsdom can hold is pinned here.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { firstName: 'Ada', lastName: 'Rowe', displayName: 'Ada Rowe', roles: ['member'] }, logout: vi.fn() }),
}));
const tenant = vi.hoisted(() => ({
  current: { currentOrganization: { name: 'Concept2Cure Therapeutics' } } as { currentOrganization: { name: string } | null },
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => tenant.current,
}));

import { UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { breadcrumbTierOf, surfacesByTier } from '../registryModel';
import { NavEntitlementsProvider } from '../navEntitlements';
import { Rail, TopBar } from '../Shell';
import { CollabLayer } from '../surfaces/CollabLauncher';

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) =>
    url === '/api/module-subscriptions/navigation'
      ? ok({ organizationId: 7, tier: 'standard', industryMode: 'biotech', masterAdmin: false, resolved: true, surfaces: [] })
      : ok({ data: [] }),
  );
});
afterEach(cleanup);

describe('breadcrumb client category (finding 128)', () => {
  const surface = (id: string) => {
    const s = UI_SURFACES.find((u) => u.id === id);
    if (!s) throw new Error(`no surface ${id}`);
    return s;
  };

  /* The device workbenches (device-510k, device-pma, risk, …) were checked
     here as client-category surfaces. Since 2026-10-23 they are features of the
     client's project, crumbed Projects › the project › the feature, and
     projectFeatureBreadcrumb.test.tsx holds that. */
  it('names no category for a surface that belongs to both — the launch core', () => {
    for (const id of ['projects', 'vault', 'document-authoring', 'submission-center']) {
      expect(breadcrumbTierOf(surface(id)), id).toBeNull();
    }
  });

  it('names the one category a surface belongs to, and Admin for an admin surface', () => {
    expect(breadcrumbTierOf(surface('cmc'))?.label).toBe('Biotech & Pharma');
    expect(breadcrumbTierOf(surface('identity-console'))?.label).toBe('Admin');
  });

  it('does not repeat the surface’s own name ("Medical Device & IVD › Medical Device & IVD"), for every surface', () => {
    // The device workstream, whose own name was the old tier's, folded into Projects (D2, fold F6, 2026-10-30) and
    // has no registry row now; the rule it was checked for holds for every surface that remains.
    expect(UI_SURFACES.some((s) => s.id === 'device-workstream')).toBe(false);
    for (const s of UI_SURFACES) expect(breadcrumbTierOf(s)?.label, s.id).not.toBe(s.label);
  });

  it('never names a category the rail does not list the surface under — for every surface', () => {
    const tiers = ['mdx', 'biopharma'] as const;
    const listed = Object.fromEntries(tiers.map((t) => [t, new Set(surfacesByTier(t).map((s) => s.id))]));
    for (const s of UI_SURFACES) {
      const crumb = breadcrumbTierOf(s);
      // Projects is the parent of a project feature, not a client category.
      if (!crumb || crumb.id === 'admin' || crumb.id === 'projects') continue;
      const other = crumb.id === 'mdx' ? 'biopharma' : 'mdx';
      expect(listed[other].has(s.id), `${s.id} crumbed ${crumb.label} but listed under ${other}`).toBe(false);
    }
  });

  it('the header draws no category crumb at all', () => {
    render(<TopBar surface={surface('device-510k')} onPalette={() => {}} segment="medtech" onSegment={() => {}} />);
    const crumbs = document.querySelector('.crumbs')?.textContent ?? '';
    expect(crumbs).not.toMatch(/Biotech & Pharma|Medical Device & IVD/);
    // D1-2 (D1.md §D1.B step 1): the root and tier crumbs went (the sidebar's wordmark and
    // its active row say them); a project feature with no project open names itself.
    expect(crumbs.trim()).toBe('510(k) and eSTAR');
  });
});

/* D1-2 (D1.md §D1.B step 4, §D1.I): the organisation label and Help left the top bar.
   The organisation is the sidebar account's second line (D1-1, §D1.A step 2) and Help is
   the account menu's "Get help", the same HELP_SURFACE. These cases follow them there. */
describe('header controls (findings 131, 132), now in the sidebar’s account', () => {
  const renderBar = (onNav = vi.fn()) => {
    render(
      <TopBar surface={{ id: 'projects', label: 'Projects' } as never} onPalette={() => {}} segment="biopharma" onSegment={() => {}} onNav={onNav} />,
    );
    return onNav;
  };
  const mountRail = (onNav = vi.fn()) => {
    render(
      <NavEntitlementsProvider>
        <Rail activeId="projects" onNav={onNav} collapsed={false} setCollapsed={() => {}} segment="biopharma" setSegment={() => {}} />
      </NavEntitlementsProvider>,
    );
    return { onNav, account: document.querySelector('.rail-account') as HTMLElement };
  };

  it('shows the organisation as words under the person, not as a control that does nothing', () => {
    renderBar();
    expect(document.querySelector('.tb-org'), 'the top bar keeps no organisation label').toBeNull();
    cleanup();
    const { account } = mountRail();
    expect(account.querySelector('.rl')?.textContent).toBe('Concept2Cure Therapeutics');
    expect(account.querySelector('.tb-org-chev')).toBeNull();
    expect(document.body.innerHTML).not.toMatch(/switcher lands with the auth flow phase/);
  });

  it('names no organisation when none is known: no "Organization" placeholder (P-25)', () => {
    const named = tenant.current;
    tenant.current = { currentOrganization: null };
    try {
      const { account } = mountRail();
      // The role, as words, stands in its place (D1-1).
      expect(account.querySelector('.rl')?.textContent).toBe('Member');
      expect(screen.queryByText('Organization')).toBeNull();
    } finally {
      tenant.current = named;
    }
  });

  /* D1-2 took Help out of the top bar; P-122 (2026-11-10) put it back. Both go to one
     place (p122TopBarSearchHelp.test.tsx pins the bar's). */
  it('Help is the account menu’s "Get help", and the top bar’s Help goes to the same place', () => {
    renderBar();
    expect(screen.getByRole('button', { name: 'Get help' })).toBeTruthy();
    cleanup();
    const { onNav, account } = mountRail();
    fireEvent.click(account);
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Get help' }));
    expect(onNav).toHaveBeenCalledWith('conversation-thread');
  });
});

describe('rail: where you are vs what you chose (findings 130, 135)', () => {
  const mount = (collapsed = false) =>
    render(
      <NavEntitlementsProvider>
        <Rail activeId="projects" onNav={() => {}} collapsed={collapsed} setCollapsed={() => {}} segment="biopharma" setSegment={() => {}} />
      </NavEntitlementsProvider>,
    );

  it('marks the open surface as the current page, and lists no client category beside it', async () => {
    mount();
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const rail = screen.getByRole('navigation', { name: 'Primary' });
    const current = Array.from(rail.querySelectorAll('[aria-current]'));
    expect(current.map((el) => [el.getAttribute('aria-current'), el.textContent?.trim()])).toEqual([['page', 'Projects']]);
    // The client type is chosen in the account menu now, as a checked menu
    // item (shellNav.test.tsx); the rail lists no category to confuse with
    // where the person is.
    expect(within(rail).queryByRole('button', { name: 'Biotech & Pharma' })).toBeNull();
  });

  it('draws the current page, and no rule draws a client category on the rail', () => {
    const css = readFileSync(path.resolve(__dirname, '../styles/app-v2.css'), 'utf8');
    /* Claude's active row is a soft neutral fill, with no marker bar and no orange
       (D1.md §D1.A step 8; ONE_DESIGN_PLAN §2, "the active item takes a soft fill").
       This pinned `--accent-000` and a `::before` bar, which the sheet stopped drawing
       in 4a5cc0d224; it was red until D1-1. */
    expect(css).toMatch(/\.nav-item\[aria-current="page"\]\{background:var\(--bg-200\)/);
    const active = css.match(/\.nav-item\[aria-current="page"\]\{([^}]*)\}/)?.[1] ?? '';
    expect(active).not.toMatch(/--accent-000/);
    expect(css).not.toMatch(/\.nav-item\[aria-current="page"\]::before/);
    // The rule that drew a category as the current page is gone, and so is
    // the one that drew it as pressed: the rail lists no category.
    expect(css).not.toMatch(/\.nav-item\[aria-current="true"\]/);
    expect(css).not.toMatch(/\.nav-item\[aria-pressed/);
  });

  it('collapsed, the brand mark keeps the top and the toggle moves to the foot', () => {
    const { container } = mount(true);
    expect(container.querySelector('.rail-top .rail-collapse')).toBeNull();
    expect(container.querySelector('.rail-foot .rail-collapse')?.getAttribute('aria-label')).toBe('Expand');
    expect(container.querySelector('.rail-top .rail-logo img')).toBeTruthy();
  });

  it('expanded, the toggle stays at the top', () => {
    const { container } = mount(false);
    expect(container.querySelector('.rail-top .rail-collapse')?.getAttribute('aria-label')).toBe('Collapse');
    expect(container.querySelector('.rail-foot .rail-collapse')).toBeNull();
  });
});

describe('task launcher (findings 136, 137, 139)', () => {
  const openTask = async () => {
    window.history.pushState({}, '', '/concept2cure/projects');
    render(<CollabLayer onNav={vi.fn()} />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent('c2c:open-collab', { detail: { mode: 'task' } }));
    });
    return screen.findByRole('dialog');
  };

  it('draws no floating launcher — the header’s Task and Collaborate buttons open it', () => {
    const { container } = render(<CollabLayer onNav={vi.fn()} />);
    expect(container.querySelector('.cl-fab, .cl-fab-wrap')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a task or collaborate' })).toBeNull();
  });

  it('the header\u2019s Task and Collaborate buttons open it — the path that replaced the floating button', async () => {
    render(
      <>
        <TopBar surface={{ id: 'projects', label: 'Projects' } as never} onPalette={() => {}} segment="biopharma" onSegment={() => {}} />
        <CollabLayer onNav={vi.fn()} />
      </>,
    );
    // D1-2 (§D1.B step 3): icon buttons named by aria-label; the tinted "Task" chip went.
    fireEvent.click(screen.getByRole('button', { name: 'New task from this screen' }));
    let dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByRole('tab', { selected: true }).textContent).toMatch(/New task/);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Collaborate on this screen' }));
    dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByRole('tab', { selected: true }).textContent).toMatch(/Collaborate/);
  });

  it('names the surface, not its URL slug or the payload field', async () => {
    const dlg = await openTask();
    expect(within(dlg).getByText('Projects', { selector: '.cl-ctx-chip' })).toBeTruthy();
    expect(dlg.textContent).not.toMatch(/sourceEntityType/);
    expect(dlg.querySelector('.cl-ctx-meta')?.textContent).toBe('Linked to this portfolio');
  });

  it('offers each module once, by name, with the server’s value', async () => {
    const dlg = await openTask();
    const opts = Array.from((dlg.querySelector('#cl-module') as HTMLSelectElement).options);
    const labels = opts.map((o) => o.textContent);
    expect(new Set(labels).size, 'a module offered twice').toBe(labels.length);
    expect(labels).not.toContain('MedicalDevice');
    expect(labels).not.toContain('ProtocolDesign');
    expect(labels).not.toContain('general');
    expect(opts.find((o) => o.textContent === 'Medical Device')?.value).toBe('MedicalDevice');
    expect(opts.find((o) => o.textContent === 'Protocol Design')?.value).toBe('ProtocolDesign');
  });

  it('labels priorities for people, and posts the server’s values', async () => {
    const dlg = await openTask();
    const opts = Array.from((dlg.querySelector('#cl-priority') as HTMLSelectElement).options);
    expect(opts.map((o) => [o.value, o.textContent])).toEqual([
      ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['critical', 'Critical'],
    ]);
  });

  it('keeps the auto-assign note one sentence beside its icon', async () => {
    const dlg = await openTask();
    const note = Array.from(dlg.querySelectorAll('.cl-note')).find((n) => /Auto-assign/.test(n.textContent ?? '')) as HTMLElement;
    // A flex row: every direct child is a column. Two children — icon, sentence.
    expect(note.children).toHaveLength(2);
    expect(Array.from(note.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())).toHaveLength(0);
    expect(note.children[1].textContent).toMatch(/^Auto-assign: .* roster for Regulatory, balanced on current workload/);
  });
});

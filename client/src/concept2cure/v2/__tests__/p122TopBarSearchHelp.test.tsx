// @vitest-environment jsdom
/**
 * P-122 §3 item 4 (2026-11-10): the top bar shows Search and Help again.
 *
 * WHY THIS EXISTS
 * f7b11e77a (D1-2, 2026-11-02) took the visible search field ("Search, jump, or
 * run a command ⌘K") and the Help button out of the top bar. Search stayed
 * reachable from the sidebar's Search row and ⌘K, and Help from the account
 * menu's "Get help": two clicks into a menu, or a shortcut a new client does not
 * know. P-122 restores both to the bar.
 *
 * WHAT IS PINNED
 *   - the bar carries a visible Search control, with its words and the ⌘K hint,
 *     that opens the same command palette the sidebar's Search and ⌘K open;
 *   - the bar carries Help, which goes where the account menu's "Get help" goes,
 *     behind the same leave guard as the bar's other places;
 *   - both stay visible at phone width (Search as its icon), where Collaborate
 *     and New task move into ⌘K;
 *   - what ⌘K and Recents provide is unchanged: the sidebar's Search still opens
 *     the palette, and the account menu keeps "Get help" (shellQuietChrome.test.tsx,
 *     shellChromeTruth.test.tsx, railRecents.test.tsx).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { firstName: 'Ada', lastName: 'Rowe', displayName: 'Ada Rowe', roles: ['admin'] }, logout: vi.fn() }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ currentOrganization: { name: 'Concept2Cure Therapeutics' } }),
}));

import { getSurface, type UiSurface } from '@shared/constants/ui-surface-registry';
import { TopBar } from '../Shell';
import { clearShellProject } from '../shellProject';
import { APP_V2_CSS, rules } from './_cssRules';

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;
const registry = (id: string): UiSurface => getSurface(id) ?? (() => { throw new Error(`no surface ${id}`); })();

beforeEach(() => {
  clearShellProject();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === '/api/task-management/my-work') return ok({ data: { items: [], total: 0, overdue: 0, dueSoon: 0, blocked: 0, approvalsPending: 0 } });
    if (url.startsWith('/api/mdx/notifications/unread-count')) return ok({ data: { unread: 0 } });
    return ok({ data: [] });
  });
});
afterEach(cleanup);

function mountBar(surface: { id: string; label: string }) {
  const onNav = vi.fn();
  const onPalette = vi.fn();
  render(<TopBar surface={surface} onPalette={onPalette} segment="biopharma" onSegment={() => {}} onNav={onNav} onOpenRail={() => {}} />);
  return { onNav, onPalette, bar: document.querySelector('header.topbar') as HTMLElement };
}

describe('the top bar shows Search and Help (P-122 §3.4)', () => {
  it('a visible Search control, with its words and the ⌘K hint, opens the command palette', () => {
    const { bar, onPalette } = mountBar(registry('vault'));
    const search = within(bar).getByRole('button', { name: /^Search/ });
    expect(search.classList.contains('tb-search')).toBe(true);
    expect(search.textContent).toContain('Search');
    expect(search.querySelector('kbd')?.textContent).toBe('⌘K');
    fireEvent.click(search);
    expect(onPalette).toHaveBeenCalledTimes(1);
  });

  it('Help goes where the account menu’s "Get help" goes', () => {
    const { bar, onNav } = mountBar(registry('vault'));
    const help = within(bar).getByRole('button', { name: 'Get help' });
    // One of the bar's quiet icon buttons (32px, 44px on a phone), as Collaborate and New task are.
    expect(help.className).toBe('tb-btn');
    fireEvent.click(help);
    expect(onNav).toHaveBeenCalledWith('conversation-thread');
  });

  it('on Home too, with no project open: Search first among the controls, Help after Your work', () => {
    const { bar } = mountBar({ id: 'home', label: 'Home' });
    const names = Array.from(bar.querySelectorAll('button'))
      .filter((b) => !b.matches('.tb-rail, .tb-new, .crumb-proj'))
      .map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Search, jump, or run a command', 'Collaborate on this screen', 'New task from this screen', 'Your work', 'Get help']);
  });

  it('both stay visible at phone width: Search as its icon, Help as it is', () => {
    const all = rules(APP_V2_CSS);
    const phone = all.filter((r) => r.media !== null && /max-width:\s*640px/.test(r.media));
    /** Each selector of a rule, split on the commas outside :is(…). */
    const selectors = (list: string) => list.split(/,(?![^(]*\))/).map((s) => s.trim());
    const hidden = phone.filter((r) => /display:\s*none/.test(r.body)).flatMap((r) => selectors(r.selector));
    // No phone rule hides Search itself (a selector that ends on it), or every icon button.
    expect(hidden.filter((s) => /\.tb-(search|btn)$/.test(s) || /:is\([^)]*\.tb-(search|btn)[^)]*\)$/.test(s))).toEqual([]);
    expect(all.some((r) => r.media === null && /\.tb-search(?![\w-])/.test(r.selector))).toBe(true);
    // The words fold away on a phone; the icon and the control stay.
    expect(phone.some((r) => /\.tb-search\s+:is\(\.lbl,\s*kbd\)|\.tb-search\s+\.lbl/.test(r.selector) && /display:\s*none/.test(r.body))).toBe(true);
  });
});

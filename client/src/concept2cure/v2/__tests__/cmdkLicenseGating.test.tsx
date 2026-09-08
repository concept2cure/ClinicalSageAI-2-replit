// @vitest-environment jsdom
/**
 * ⌘K licence gating — the palette is the second door onto every destination.
 *
 * `railLicenseGating.test.tsx` holds these contracts for the rail. This file
 * holds them for the command palette, and it exists because the palette kept
 * NONE of them: it listed every surface in `UI_SURFACES` with no entitlement
 * awareness at all, so a customer whose rail had greyed out Submission center
 * and explained why could reach it in two keystrokes from ⌘K — landing on a
 * surface the organization has not licensed, which 403s or renders empty and
 * reads as "there is nothing here" rather than "you have not bought this".
 *
 * A gate with a second door past it is not a gate. The same four rules apply
 * here as in the rail, and the additional one this file exists to pin down is
 * that both entry points must give ONE explanation and ONE next step — the
 * palette hands over to the same `NavUnlockPanel`, with the same verdict.
 *
 * Mounted the way the rail suite mounts its subject: the real `CmdK` under the
 * real `NavEntitlementsProvider`, with only `apiRequest` stubbed, so every
 * assertion runs the production path — provider → `verdictFor` → `isLocked` →
 * `data-locked` / accessible name / panel.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

// The palette reads the signed-in user for one thing only: whether the viewer
// is an org admin, which decides the unlock panel's next step. A plain member,
// like the rail suite, so the tier branch under test is unambiguous — it offers
// "View plans" to every role.
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({
    user: { firstName: 'Ada', lastName: 'Rowe', displayName: 'Ada Rowe', roles: ['member'] },
    logout: vi.fn(),
  }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: null, organizationId: 7 }),
}));

import { NavEntitlementsProvider, type NavEntitlementsPayload } from '../navEntitlements';
import { CmdK } from '../Shell';

const NAV_URL = '/api/module-subscriptions/navigation';

const ok = (payload: unknown) =>
  ({ ok: true, status: 200, json: async () => payload } as Response);

/** Only the navigation endpoint is served; anything else is a test bug. */
function mockNav(impl: () => Promise<Response>) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === NAV_URL) return impl();
    throw new Error(`unexpected ${method} ${url}`);
  });
}

function payload(over: Partial<NavEntitlementsPayload> = {}): NavEntitlementsPayload {
  return {
    organizationId: 7,
    tier: 'standard',
    industryMode: 'biotech',
    masterAdmin: false,
    resolved: true,
    surfaces: [],
    ...over,
  };
}

const LOCKED_SUBMISSION = {
  id: 'submission-center',
  label: 'Submission center',
  entitled: false,
  source: 'tier' as const,
  requiredTier: 'professional',
};

/**
 * `open` is real state, not a fixed prop.
 *
 * The palette closes as the panel opens, so a harness that pinned `open` to
 * true would never exercise the case that matters: an implementation that
 * rendered the panel inside the palette's own `open` branch would unmount the
 * explanation in the same commit as the activation that asked for it, and the
 * customer would see their keystroke swallowed. Here `onClose` actually closes.
 */
function Harness({
  onNav,
  onAct,
  onAsk,
}: {
  onNav: (id: string) => void;
  onAct: (id: string) => void;
  onAsk: (t: string) => void;
}) {
  const [open, setOpen] = React.useState(true);
  return (
    <NavEntitlementsProvider>
      <CmdK
        open={open}
        onClose={() => setOpen(false)}
        onNav={onNav}
        onAsk={onAsk}
        onAct={onAct}
      />
    </NavEntitlementsProvider>
  );
}

async function mountCmdK() {
  const onNav = vi.fn();
  const onAct = vi.fn();
  const onAsk = vi.fn();
  render(<Harness onNav={onNav} onAct={onAct} onAsk={onAsk} />);
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', NAV_URL));
  // The verdicts land a few microtasks after the request; flush them so an
  // assertion of ABSENCE (no lock) cannot pass merely by running too early.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { onNav, onAct, onAsk };
}

/** Type a query, which switches the list from "Jump to" to search results. */
function search(term: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: term } });
}

const lockedRows = () => Array.from(document.querySelectorAll('.cmdk-item[data-locked]'));
const rows = () => Array.from(document.querySelectorAll('.cmdk-item'));

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe('⌘K licence gating', () => {
  /* CONTRACT 1 — NO VERDICT ⇒ NO LOCK.
     Identical to the rail's first contract and for the identical reason: a lock
     is a claim about the customer's contract, and one derived from a failed
     request tells a paying customer they do not own what they paid for. The
     palette is wayfinding; the security boundary is server-side route gating,
     which is unaffected either way. So the safe failure is a palette that
     navigates, never an invented lock. */
  it('renders no lock and navigates normally when the navigation fetch fails', async () => {
    mockNav(async () => {
      throw new Error('Failed to fetch');
    });
    const { onNav } = await mountCmdK();
    search('submission');

    expect(lockedRows()).toHaveLength(0);
    // The very destination contract 2 locks: with no answer it is an ordinary
    // result that goes where it says it goes.
    const btn = screen.getByRole('button', { name: /^Submission center/ });
    expect(btn.getAttribute('data-locked')).toBeNull();
    fireEvent.click(btn);
    expect(onNav).toHaveBeenCalledWith('submission-center');
    expect(screen.queryByRole('dialog', { name: /Submission center/ })).toBeNull();
  });

  it('renders no lock when the server answers resolved:false', async () => {
    // resolved:false is the server saying "I computed no verdicts". Carrying a
    // surfaces array alongside it must not tempt the palette into reading it.
    mockNav(async () => ok(payload({ resolved: false, surfaces: [LOCKED_SUBMISSION] })));
    const { onNav } = await mountCmdK();
    search('submission');

    expect(lockedRows()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /^Submission center/ }));
    expect(onNav).toHaveBeenCalledWith('submission-center');
  });

  /* CONTRACT 2 — A LOCKED RESULT READS AS LOCKED, AND DOES NOT NAVIGATE.
     The reason reaches the customer through the accessible NAME and the hint
     text, not colour or an icon; the row stays a focusable, activatable button
     because a disabled, reasonless control explains nothing (the entitlements
     spec, §4). And activation goes to the explanation instead of the surface —
     the whole defect this file was written for. */
  it('locks a tier-gated surface, states the real reason, and does not navigate', async () => {
    mockNav(async () => ok(payload({ surfaces: [LOCKED_SUBMISSION] })));
    const { onNav } = await mountCmdK();
    search('submission');

    const btn = await screen.findByRole('button', {
      name: 'Submission center — not included in your plan',
    });
    expect(btn.getAttribute('data-locked')).toBe('true');
    // Exactly one result is locked — the verdict is not smeared onto the other
    // surfaces the same query matched.
    expect(lockedRows()).toEqual([btn]);
    // The reason is visible on the row itself, not only in the accessible name:
    // the hint column carries it where the domain group would otherwise sit.
    expect(btn.querySelector('.hint')?.textContent).toBe('not included in your plan');
    // Hover and screen reader are told the same sentence.
    expect(btn.getAttribute('title')).toBe('Submission center — not included in your plan');

    fireEvent.click(btn);
    expect(onNav).not.toHaveBeenCalled();
  });

  /* CONTRACT 3 — ACTIVATION OPENS THE SAME PANEL THE RAIL OPENS.
     One destination, two entry points, one explanation and one next step. A
     palette that showed its own message — or nothing — would leave a customer
     with two accounts of why they cannot get in. The palette closes as the
     panel opens, and the panel has to survive that. */
  it('hands a locked result to the unlock panel, which outlives the palette', async () => {
    mockNav(async () => ok(payload({ surfaces: [LOCKED_SUBMISSION] })));
    const { onNav } = await mountCmdK();
    search('submission');

    fireEvent.click(
      screen.getByRole('button', { name: 'Submission center — not included in your plan' }),
    );

    const dialog = await screen.findByRole('dialog');
    // The palette itself is gone: its search field no longer exists.
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(within(dialog).getByText('Submission center')).toBeTruthy();
    // The minimum tier is named, and it is the tier the SERVER returned.
    expect(within(dialog).getByText('Included from Professional')).toBeTruthy();
    expect(dialog.textContent).toMatch(/Professional plan/);

    fireEvent.click(within(dialog).getByRole('button', { name: 'View plans' }));
    expect(onNav).toHaveBeenCalledWith('licensing');
  });

  /* CONTRACT 4 — A LOCKED ROW STAYS ON THE KEYBOARD PATH.
     The row a customer most needs an answer about must not be the one row the
     arrow keys skip. `disabled` would have dropped it out of the cursor and out
     of Enter's reach, leaving a keyboard user staring at a greyed line with no
     way to ask what it means. */
  it('keeps a locked result arrow-reachable and Enter-activatable', async () => {
    mockNav(async () => ok(payload({ surfaces: [LOCKED_SUBMISSION] })));
    const { onNav } = await mountCmdK();
    search('submission');

    const idx = rows().findIndex((r) => r.getAttribute('data-locked') === 'true');
    // Third result of twenty-six at the time of writing, so the walk below is
    // doing real work; the assertions do not depend on that staying true.
    expect(idx).toBeGreaterThanOrEqual(0);
    // Walk to it with the arrow keys only; every row before it occupies a
    // cursor slot, and so does this one.
    for (let i = 0; i < idx; i += 1) fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(rows()[idx].className).toContain('on');
    // It does not swallow the cursor either: down leaves it, up returns to it.
    // (This half is what still fails if the locked row ever becomes the first
    // one and the walk above turns into a no-op.)
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(rows()[idx].className).not.toContain('on');
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(rows()[idx].className).toContain('on');

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onNav).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Submission center')).toBeTruthy();
  });

  /* CONTRACT 5 — AN ENTITLED SURFACE IS UNTOUCHED.
     Gating that fires on an `entitled: true` verdict is indistinguishable, to
     the customer, from gating that fires on nothing: they are told they do not
     own something they do own. The presence of a verdict must never by itself
     imply a lock. */
  it('leaves an entitled surface completely alone', async () => {
    mockNav(async () =>
      ok(
        payload({
          tier: 'professional',
          surfaces: [{ ...LOCKED_SUBMISSION, entitled: true, source: 'included' }],
        }),
      ),
    );
    const { onNav } = await mountCmdK();
    search('submission');

    const btn = screen.getByRole('button', { name: /^Submission center/ });
    expect(btn.getAttribute('data-locked')).toBeNull();
    expect(lockedRows()).toHaveLength(0);
    fireEvent.click(btn);
    expect(onNav).toHaveBeenCalledWith('submission-center');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  /* CONTRACT 6 — MASTER ADMIN SEES NO LOCKS.
     The platform owner's grant arrives as the payload itself: every surface
     entitled, source 'master_admin'. A palette that locked anything here would
     be locking the owner out of their own product, from the account most likely
     to be demoing it. */
  it('shows no locks for the master-admin owner grant', async () => {
    mockNav(async () =>
      ok(
        payload({
          masterAdmin: true,
          tier: 'enterprise',
          surfaces: [
            { ...LOCKED_SUBMISSION, entitled: true, source: 'master_admin' },
            { id: 'vault', label: 'Vault', entitled: true, source: 'master_admin', requiredTier: 'professional' },
            { id: 'projects', label: 'Projects', entitled: true, source: 'master_admin', requiredTier: null },
          ],
        }),
      ),
    );
    const { onNav } = await mountCmdK();

    // The default "Jump to" list, then a search: neither branch locks anything.
    expect(lockedRows()).toHaveLength(0);
    search('submission');
    expect(lockedRows()).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/not included in your plan/);
    fireEvent.click(screen.getByRole('button', { name: /^Submission center/ }));
    expect(onNav).toHaveBeenCalledWith('submission-center');
  });

  /* CONTRACT 7 — THE DEFAULT LIST GATES TOO, AND AN UNKNOWN ID NEVER LOCKS.
     Two rules in one mount because they need the same payload. The empty-query
     "Jump to" list is a separate code path from a search hit and was equally
     ungated. And the Apps catalog carries no catalog row on purpose — absent
     from the payload must mean unconditionally available, which is what keeps
     the surface that RESOLVES a lock reachable from a locked palette. */
  it('gates the default list without ever locking a surface the catalog has no row for', async () => {
    mockNav(async () =>
      ok(
        payload({
          surfaces: [
            { id: 'projects', label: 'Projects', entitled: false, source: 'disabled', requiredTier: null },
          ],
        }),
      ),
    );
    const { onNav } = await mountCmdK();

    // No query typed: this is the "Jump to" branch.
    const locked = await screen.findByRole('button', {
      name: 'Projects — turned off for this workspace',
    });
    expect(lockedRows()).toEqual([locked]);
    // An admin switched it off; the reason is that, not a plan gap.
    expect(locked.querySelector('.hint')?.textContent).toBe('turned off for this workspace');

    const apps = screen.getByRole('button', { name: /^Apps/ });
    expect(apps.getAttribute('data-locked')).toBeNull();
    expect(apps.getAttribute('aria-label')).toBeNull();
    fireEvent.click(apps);
    expect(onNav).toHaveBeenCalledWith('apps');
  });

  /* CONTRACT 8 — THE REASON IN THE ACCESSIBLE NAME IS THE REAL ONE.
     "Not included in your plan" is true only of a `tier` verdict. A module an
     administrator switched off needs nothing bought, and one outside the
     workspace's industry mode is not fixed by any plan — an org told to upgrade
     would buy something that changes nothing. Each source must reach the name,
     and the hint, as itself. */
  it.each([
    ['tier' as const, 'not included in your plan'],
    ['disabled' as const, 'turned off for this workspace'],
    ['industry' as const, 'not offered for this workspace'],
  ])('states the real reason for a %s lock', async (source, reason) => {
    mockNav(async () => ok(payload({ surfaces: [{ ...LOCKED_SUBMISSION, source }] })));
    await mountCmdK();
    search('submission');

    expect(lockedRows()).toHaveLength(1);
    const btn = screen.getByRole('button', { name: `Submission center — ${reason}` });
    expect(btn.getAttribute('title')).toBe(`Submission center — ${reason}`);
    expect(btn.querySelector('.hint')?.textContent).toBe(reason);
  });
});

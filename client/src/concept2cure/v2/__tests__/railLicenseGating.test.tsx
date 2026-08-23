// @vitest-environment jsdom
/**
 * Rail licence gating — the four contracts the lock badge has to keep.
 *
 * The rail is the only place in the product that renders a claim about what a
 * customer has bought. `navEntitlements.tsx` states the rules; `Shell.tsx`'s
 * `Rail` is the one component that acts on them. This file mounts the real
 * Rail over the real `NavEntitlementsProvider`, with only the network stubbed
 * at `apiRequest`, so the assertions run through the same code path production
 * does — provider → `verdictFor` → `isLocked` → `data-locked` / accessible
 * name / `NavUnlockPanel`.
 *
 * Each `it` below states WHY the contract matters, not just what it does.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

// The rail reads the signed-in user for its account footer and for the
// org-admin branch of the unlock panel's copy. A plain member: the tier branch
// under test offers "View plans" to every role, so this keeps the test honest
// about which branch it is exercising.
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
import { Rail } from '../Shell';

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
  label: 'Submission Center',
  entitled: false,
  source: 'tier' as const,
  requiredTier: 'professional',
};

/** Mount the real rail under the real provider and let the fetch settle. */
async function mountRail() {
  const onNav = vi.fn();
  render(
    <NavEntitlementsProvider>
      <Rail
        activeId="projects"
        onNav={onNav}
        collapsed={false}
        setCollapsed={() => {}}
        segment="biotech"
        setSegment={() => {}}
      />
    </NavEntitlementsProvider>,
  );
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', NAV_URL));
  // The verdicts land a few microtasks after the request; flush them so an
  // assertion of ABSENCE (no lock) cannot pass merely by running too early.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { onNav };
}

const lockedButtons = () => Array.from(document.querySelectorAll('[data-locked]'));

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe('Rail licence gating', () => {
  /* CONTRACT 1 — NO VERDICT ⇒ NO LOCK.
     A lock badge is a claim about the customer's contract. Deriving one from a
     failed request tells a paying customer they do not own what they paid for:
     the rail would go quiet on modules they are entitled to, and the only
     evidence would be a network blip nobody sees. The security boundary is
     server-side route gating, which is unaffected either way — so the safe
     failure is an unlocked rail, never an invented lock. */
  it('renders no lock at all when the navigation fetch fails', async () => {
    mockNav(async () => {
      throw new Error('Failed to fetch');
    });
    const { onNav } = await mountRail();

    expect(lockedButtons()).toHaveLength(0);
    // Submission Center would be locked under contract 2's payload; with no
    // answer it is an ordinary destination that navigates.
    const btn = screen.getByRole('button', { name: 'Submission Center' });
    expect(btn.getAttribute('data-locked')).toBeNull();
    fireEvent.click(btn);
    expect(onNav).toHaveBeenCalledWith('submission-center');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders no lock when the server answers resolved:false', async () => {
    // resolved:false is the server saying "I computed no verdicts" — carrying a
    // surfaces array with it must not tempt the rail into reading it.
    mockNav(async () => ok(payload({ resolved: false, surfaces: [LOCKED_SUBMISSION] })));
    const { onNav } = await mountRail();

    expect(lockedButtons()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Submission Center' }));
    expect(onNav).toHaveBeenCalledWith('submission-center');
  });

  /* CONTRACT 2 — A LOCKED MODULE RENDERS LOCKED.
     The other half of contract 1: a real verdict must actually reach the user.
     It reaches them through the accessible NAME, not colour or an icon, and the
     entry stays a focusable button that opens an honest panel — a disabled,
     reasonless control explains nothing and cannot be reached by keyboard. The
     panel must name the real reason and the step that resolves THAT reason: an
     org told to upgrade when the block is a tier gap can act on it. */
  it('locks a tier-gated module, keeps it activatable, and routes to plans', async () => {
    mockNav(async () => ok(payload({ surfaces: [LOCKED_SUBMISSION] })));
    const { onNav } = await mountRail();

    const btn = await screen.findByRole('button', {
      name: /Submission Center — not included in your plan$/,
    });
    expect(btn.getAttribute('data-locked')).toBe('true');
    // Exactly one destination is locked — the verdict is not smeared onto siblings.
    expect(lockedButtons()).toEqual([btn]);

    fireEvent.click(btn);
    // A locked entry never navigates into a surface the org has not licensed —
    // that would 403 or, worse, render an empty screen reading as "nothing here".
    expect(onNav).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Submission Center')).toBeTruthy();
    // The minimum tier is named, and it is the tier the SERVER returned.
    expect(within(dialog).getByText('Included from Professional')).toBeTruthy();
    expect(dialog.textContent).toMatch(/Professional plan/);

    fireEvent.click(within(dialog).getByRole('button', { name: 'View plans' }));
    expect(onNav).toHaveBeenCalledWith('licensing');
  });

  /* CONTRACT 3 — AN ENTITLED MODULE IS UNTOUCHED.
     Gating that fires on an `entitled: true` verdict is indistinguishable, to
     the customer, from gating that fires on nothing: they are being told they
     do not own something they do own. The presence of a verdict must never by
     itself imply a lock. */
  it('leaves an entitled module completely alone', async () => {
    mockNav(async () =>
      ok(
        payload({
          tier: 'professional',
          surfaces: [{ ...LOCKED_SUBMISSION, entitled: true, source: 'included' }],
        }),
      ),
    );
    const { onNav } = await mountRail();

    const btn = screen.getByRole('button', { name: 'Submission Center' });
    expect(btn.getAttribute('data-locked')).toBeNull();
    expect(lockedButtons()).toHaveLength(0);
    fireEvent.click(btn);
    expect(onNav).toHaveBeenCalledWith('submission-center');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  /* CONTRACT 4 — MASTER ADMIN SEES NO LOCKS.
     The platform owner's grant is expressed in the payload the server sends:
     every surface comes back entitled with source 'master_admin'. A rail that
     locked anything here would be locking the owner out of their own product,
     and it is the account most likely to be demoing it. */
  it('shows no locks for the master-admin owner grant', async () => {
    mockNav(async () =>
      ok(
        payload({
          masterAdmin: true,
          tier: 'enterprise',
          surfaces: [
            { id: 'submission-center', label: 'Submission Center', entitled: true, source: 'master_admin', requiredTier: 'professional' },
            { id: 'rbm', label: 'Risk-based monitoring', entitled: true, source: 'master_admin', requiredTier: 'enterprise' },
            { id: 'insights', label: 'Reporting & analytics', entitled: true, source: 'master_admin', requiredTier: 'professional' },
          ],
        }),
      ),
    );
    const { onNav } = await mountRail();

    expect(lockedButtons()).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/not included in your plan/);
    fireEvent.click(screen.getByRole('button', { name: 'Risk-based monitoring' }));
    expect(onNav).toHaveBeenCalledWith('rbm');
  });

  /* CONTRACT 5 — AN UNKNOWN ID IS NOT LICENSABLE.
     The payload carries one verdict per catalog module. Destinations with no
     catalog row — AnA Command here, and deliberately the Part 11 surfaces,
     which under 21 CFR §11.10(e) may not be something an org can be sold or an
     admin can switch off — are absent from it. Absent must mean unconditionally
     available; "not in the payload" is not evidence of a licence gap. */
  it('never locks a destination the catalog has no row for', async () => {
    mockNav(async () => ok(payload({ surfaces: [LOCKED_SUBMISSION] })));
    const { onNav } = await mountRail();

    // Same payload as contract 2, so the lock machinery is demonstrably live.
    expect(lockedButtons()).toHaveLength(1);
    // The accessible name carries the entry's "AnA" badge text too; what
    // matters is that it does NOT carry the locked suffix.
    const btn = screen.getByRole('button', { name: /^AnA Command/ });
    expect(btn.getAttribute('aria-label')).toBeNull();
    expect(btn.getAttribute('data-locked')).toBeNull();
    fireEvent.click(btn);
    expect(onNav).toHaveBeenCalledWith('ana-command');
  });

  /* CONTRACT 6 — THE REASON IN THE ACCESSIBLE NAME IS THE REAL ONE.
     The rail used to append "not included in your plan" to every locked entry.
     That is true only of a `tier` verdict. A module an administrator switched
     off needs nothing bought, and one outside the workspace's industry mode is
     not fixed by any plan — so hover and screen-reader users were told a
     different, and wrong, reason from the one the panel gives them on
     activation. Each source must reach the accessible name as itself. */
  it.each([
    ['tier' as const, 'not included in your plan'],
    ['disabled' as const, 'turned off for this workspace'],
    ['industry' as const, 'not offered for this workspace'],
  ])('states the real reason for a %s lock in the accessible name', async (source, reason) => {
    mockNav(async () =>
      ok(payload({ surfaces: [{ ...LOCKED_SUBMISSION, source }] })),
    );
    await mountRail();

    expect(lockedButtons()).toHaveLength(1);
    const btn = screen.getByRole('button', {
      name: new RegExp(`^Submission Center — ${reason}$`),
    });
    // The tooltip is the same sentence — a sighted hover and a screen reader
    // must not be told two different things about one button.
    expect(btn.getAttribute('title')).toBe(`Submission Center — ${reason}`);
  });
});

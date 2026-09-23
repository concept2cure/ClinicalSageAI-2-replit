// @vitest-environment jsdom
/**
 * Live Drive is ON, and its switch is where people type.
 *
 * THE DEFECT, in three parts that compounded:
 *   1. Live Drive shipped OFF. Asking AnA to take you somewhere got a reply and
 *      a screen that never moved.
 *   2. Every prefs write persisted the WHOLE object, so everyone who ever
 *      touched any preference under the old default carried
 *      `liveDrive: false` in storage — not a decision anyone made, just the
 *      default serialised. Flipping DEFAULT_PREFS alone would have changed
 *      nothing for any existing user.
 *   3. The toggle, the tour and the demonstrations lived only in the rail's
 *      collapsed menu, and the rail is not drawn on the screens that own their
 *      conversation — the front door among them.
 *
 * So this pins: a pref written under the old default loads ON; a switch-off
 * made under the new default is KEPT (the migration runs once, it does not
 * override people); and the composer switch reflects and drives the state, and
 * offers only the demonstrations whose every stop is open to this person.
 *
 * `loadPrefs` is module-internal to V2App, so the prefs cases mount the real
 * shell and read the switch it draws — the observable outcome, which is what
 * a person sees anyway.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider } from '@/services/portal/authService';
import { TenantProvider } from '@/contexts/TenantContext';
import { V2App, readDirectiveProgram } from '../V2App';
import { locationForSurface } from '../routing';
import { LiveDriveControlsContext, LiveDriveSwitch, type LiveDriveControlsValue } from '../LiveDriveSwitch';
import { setAnaLockedScreens } from '../../components/ana/anaLockedScreens';
import { listDemoScripts } from '@shared/navigation/demo-scripts';

const PREFS_KEY = 'c2c-v2-prefs';

afterEach(() => {
  cleanup();
  setAnaLockedScreens([]);
});

/* ── The composer switch ─────────────────────────────────────────────────── */

function controls(over: Partial<LiveDriveControlsValue> = {}): LiveDriveControlsValue {
  return {
    on: true,
    locked: null,
    setOn: vi.fn(),
    onStartDemo: vi.fn(),
    onStartTour: vi.fn(),
    ...over,
  };
}

function renderSwitch(value: LiveDriveControlsValue | null) {
  return render(
    <LiveDriveControlsContext.Provider value={value}>
      <LiveDriveSwitch />
    </LiveDriveControlsContext.Provider>,
  );
}

describe('LiveDriveSwitch', () => {
  it('is a switch whose checked state is the shell’s, and pressing it asks for the opposite', () => {
    const on = controls({ on: true });
    renderSwitch(on);
    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(on.setOn).toHaveBeenCalledWith(false);
    cleanup();

    const off = controls({ on: false });
    renderSwitch(off);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('switch'));
    expect(off.setOn).toHaveBeenCalledWith(true);
  });

  it('Demos opens a menu with the tour and every demonstration, and each item starts it', () => {
    const ctl = controls();
    renderSwitch(ctl);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Demos' }));
    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitem').map((b) => b.textContent);
    expect(items[0]).toBe('Show me around');
    // With nothing locked, every registered demonstration is offered.
    expect(items.slice(1)).toEqual(listDemoScripts().map((d) => d.title));

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Show me around' }));
    expect(ctl.onStartTour).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Demos' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sales demonstration' }));
    expect(ctl.onStartDemo).toHaveBeenCalledWith('sales-flagship', 'Sales demonstration');
  });

  it('does not offer a demonstration that walks onto a screen closed to this person', () => {
    // A demo stopping on a locked panel fails in front of the person it was
    // run for; the server refuses it too, so the menu must not offer it.
    setAnaLockedScreens([{ id: 'device-510k', reason: 'not in this release' }]);
    renderSwitch(controls());
    fireEvent.click(screen.getByRole('button', { name: 'Demos' }));
    const titles = within(screen.getByRole('menu'))
      .getAllByRole('menuitem')
      .map((b) => b.textContent);
    expect(titles).not.toContain('Medtech product training');
    expect(titles).not.toContain('Medtech sales demonstration');
    // The biopharma demonstrations never stop there and are still offered.
    expect(titles).toContain('Sales demonstration');
    expect(titles).toContain('Show me around');
  });

  it('under an entitlement lock shows the honest reason and no switch', () => {
    renderSwitch(controls({ locked: { reason: 'not_entitled', requiredTier: 'Professional' } }));
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Demos' })).toBeNull();
    expect(screen.getByText(/Screen moves unavailable/).textContent).toContain('Professional plan');
  });

  it('outside the shell (no controls provided) renders nothing', () => {
    const { container } = renderSwitch(null);
    expect(container.innerHTML).toBe('');
  });
});

/* ── Stored prefs, read by the real shell ────────────────────────────────── */

function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <TenantProvider>{children}</TenantProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe('stored Live Drive preference', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, body: null, json: async () => ({}) })),
    );
    if (!window.matchMedia) {
      window.matchMedia = ((q: string) => ({
        matches: false, media: q, onchange: null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;
    }
    const NoopObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    (window as unknown as { ResizeObserver?: unknown }).ResizeObserver ??= NoopObserver;
    (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver ??= NoopObserver;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
    window.history.pushState({}, '', '/');
  });

  /** Mount the shell on the conversation thread — a screen with no rail,
      where the composer's switch is the only Live Drive control drawn. */
  async function switchStateWith(stored: Record<string, unknown> | null): Promise<string | null> {
    if (stored) localStorage.setItem(PREFS_KEY, JSON.stringify(stored));
    window.history.pushState({}, '', locationForSurface('conversation-thread'));
    render(
      <Providers>
        <V2App />
      </Providers>,
    );
    const sw = await screen.findByRole('switch', {}, { timeout: 5000 });
    return sw.getAttribute('aria-checked');
  }

  it('a first visit starts with AnA’s hands on', async () => {
    expect(await switchStateWith(null)).toBe('true');
  });

  it('a pref serialised under the old OFF default loads ON', async () => {
    // Exactly what every existing user's storage holds: the whole object,
    // written by some unrelated preference change, with no marker.
    expect(
      await switchStateWith({ dark: true, railCollapsed: true, anaOpen: false, liveDrive: false }),
    ).toBe('true');
  });

  it('a switch-off made under the current default is kept', async () => {
    expect(await switchStateWith({ liveDrive: false, liveDriveDefault: 2 })).toBe('false');
  });

  it('the composer switch writes the choice so it survives a reload', async () => {
    await switchStateWith(null);
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false'));
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    expect(saved.liveDrive).toBe(false);
    expect(saved.liveDriveDefault).toBe(2);
  });
});

/* ── The program a drive directive carries ───────────────────────────────── */

describe('readDirectiveProgram', () => {
  /* The program rides beside the registry's directive: tenant data the
     registry cannot vouch for, so it is read defensively — a malformed one
     must never publish a blank or object-shaped program id to the shell. */
  it('accepts a program with a string id, trimming its fields', () => {
    expect(readDirectiveProgram({ program: { id: 'x', name: 'n' } })).toEqual({ id: 'x', name: 'n' });
    expect(readDirectiveProgram({ program: { id: ' p-1 ', name: ' BX-301 ', code: ' BX ' } })).toEqual({
      id: 'p-1',
      name: 'BX-301',
      code: 'BX',
    });
  });

  it('accepts a numeric id as its string form', () => {
    expect(readDirectiveProgram({ program: { id: 42 } })).toEqual({ id: '42' });
  });

  it('drops blank names/codes rather than publishing them', () => {
    expect(readDirectiveProgram({ program: { id: 'x', name: '  ', code: 7 } })).toEqual({ id: 'x' });
  });

  it('rejects a missing, blank or non-scalar id, and non-object inputs', () => {
    expect(readDirectiveProgram({ program: {} })).toBeNull();
    expect(readDirectiveProgram({ program: { id: '' } })).toBeNull();
    expect(readDirectiveProgram({ program: { id: '   ' } })).toBeNull();
    expect(readDirectiveProgram({ program: { id: { nested: true } } })).toBeNull();
    expect(readDirectiveProgram({ program: 'p-1' })).toBeNull();
    expect(readDirectiveProgram({ targetId: 'vault' })).toBeNull();
    expect(readDirectiveProgram(null)).toBeNull();
    expect(readDirectiveProgram(undefined)).toBeNull();
    expect(readDirectiveProgram('p-1')).toBeNull();
  });
});

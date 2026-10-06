// @vitest-environment jsdom
/**
 * Live Drive, as the SHELL runs it — the real V2App receiving a turn's drive
 * events, with only the chat stream and the screen-operation bus stubbed.
 *
 * The reducer and the move queue are each right on their own; these defects
 * lived in the wiring between them, where V2App decides what an event means:
 *
 *   A. A mid-turn promotion to a demonstration arrives as a second
 *      `drive_state` (now marked `promoted`). The shell read it as a fresh
 *      enable — counted a new turn, re-engaged the drive, set demo mode — so a
 *      drive the person had just taken over or switched off re-armed itself.
 *   C. A move that did not land was told to AnA through `interject`, which
 *      records a HUMAN steer. It is the app's observation: `reportScreen`.
 *   D. The report went through "whichever chat is driving now", so a move that
 *      settled after a newer turn began was reported to a run that never made
 *      it; and a turn's leftover queued moves played on into the next turn —
 *      after a new turn began, and after the Demos menu replaced the answer,
 *      and after any Stop but the drive strip's (the chat's `drive_stopped`).
 *   F. A navigation's step was recorded when it ARRIVED, so the strip named a
 *      screen as opened while it was still queued behind another move.
 *   G. A navigation that failed was worded as an operation.
 *
 * Mounted on the conversation thread: a screen with no rail, whose composer
 * draws the Live Drive switch and its Demos menu. The drive strip is scoped by
 * its class, because screen names ("Vault") also appear in the navigation.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { DriveSseEvent, DriveTurnControls } from '../../components/ana/useAnaChat';
import type { SurfaceActionOutcome } from '../surfaceActions';

/* ── The chat stream, stubbed: the shell's own useAnaChat call is the one that
      carries `driveMode`, and its options are where onDriveEvent arrives. ── */
const chat = vi.hoisted(() => ({
  isStreaming: false,
  shellOpts: null as null | {
    driveMode?: string;
    onDriveEvent?: (ev: unknown, controls?: unknown) => void;
  },
  send: vi.fn(),
  stop: vi.fn(),
  interject: vi.fn(async () => true),
  loadThread: vi.fn(async () => undefined),
  reset: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
}));
vi.mock('../../components/ana/useAnaChat', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../components/ana/useAnaChat')>();
  return {
    ...real,
    useAnaChat: (opts: Record<string, unknown>) => {
      if ('driveMode' in opts) chat.shellOpts = opts as typeof chat.shellOpts;
      return {
        messages: [],
        isStreaming: chat.isStreaming,
        isLoadingThread: false,
        loadThread: chat.loadThread,
        send: chat.send,
        stop: chat.stop,
        reset: chat.reset,
        interject: chat.interject,
        pause: chat.pause,
        resume: chat.resume,
        pendingSteers: [],
        runStatus: null,
        threadId: null,
      };
    },
  };
});

/* ── The screen-operation bus, stubbed: an operation answers from
      `bus.immediate` if a test queued an answer, else it is stashed and its
      outcome is delivered when the test calls the captured `bus.deferred`. ── */
const bus = vi.hoisted(() => ({
  immediate: [] as SurfaceActionOutcome[],
  deferred: [] as Array<(o: SurfaceActionOutcome) => void>,
}));
vi.mock('../surfaceActions', async (importOriginal) => {
  const real = await importOriginal<typeof import('../surfaceActions')>();
  return {
    ...real,
    cancelPendingSurfaceAction: vi.fn(real.cancelPendingSurfaceAction),
    applySurfaceAction: vi.fn(
      (_d: unknown, _nav: unknown, onDeferred: (o: SurfaceActionOutcome) => void): SurfaceActionOutcome => {
        const now = bus.immediate.shift();
        if (now) return now;
        bus.deferred.push(onDeferred);
        return { status: 'stashed' } as SurfaceActionOutcome;
      },
    ),
  };
});

/* A navigation to `LANDS_HERE` resolves to the screen already showing, so it
   lands (shown, then settled) without mounting another surface. */
const LANDS_HERE = 'vault';
vi.mock('../navParams', async (importOriginal) => {
  const real = await importOriginal<typeof import('../navParams')>();
  return {
    ...real,
    resolveSurfaceIdForTarget: (t: string) =>
      real.resolveSurfaceIdForTarget(t === 'vault' ? 'conversation-thread' : t),
  };
});

import { AuthProvider } from '@/services/portal/authService';
import { TenantProvider } from '@/contexts/TenantContext';
import { V2App } from '../V2App';
import { locationForSurface } from '../routing';
import { applySurfaceAction, cancelPendingSurfaceAction } from '../surfaceActions';
import { setAnaLockedScreens } from '../../components/ana/anaLockedScreens';

const SEARCH = { actionType: 'surface_action', actionId: 'vault.search', params: { query: 'stability' } };
const FILTER = { actionType: 'surface_action', actionId: 'vault.search', params: { query: 'second' } };
const NAV_CMC = { actionType: 'navigate', targetId: 'cmc' };
const NAV_HERE = { actionType: 'navigate', targetId: LANDS_HERE };

function turnControls(): DriveTurnControls & {
  interject: ReturnType<typeof vi.fn>;
  reportScreen: ReturnType<typeof vi.fn>;
  moveLanded: ReturnType<typeof vi.fn>;
} {
  return {
    stop: vi.fn(),
    interject: vi.fn(async () => true),
    reportScreen: vi.fn(async () => true),
    moveLanded: vi.fn(async () => true),
  };
}

/** Deliver one drive event, as the driving chat's stream does. */
function drive(ev: DriveSseEvent, controls: DriveTurnControls) {
  act(() => {
    chat.shellOpts!.onDriveEvent!(ev, controls);
  });
}
const START_ASSIST: DriveSseEvent = { type: 'drive_state', enabled: true, mode: 'assist' };
const PROMOTED: DriveSseEvent = { type: 'drive_state', enabled: true, mode: 'demo', promoted: true };

function strip(): HTMLElement | null {
  return document.querySelector('.ana-drive-strip');
}
function stepText(): string | null {
  return strip()?.querySelector('.ana-drive-step')?.textContent ?? null;
}
/** Let the move queue's promise chain run. */
async function flush(ms = 20) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

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

async function mountShell() {
  window.history.pushState({}, '', locationForSurface('conversation-thread'));
  render(
    <Providers>
      <V2App />
    </Providers>,
  );
  await screen.findByRole('switch', {}, { timeout: 5000 });
  expect(chat.shellOpts?.onDriveEvent).toBeTypeOf('function');
}

beforeEach(() => {
  localStorage.clear();
  chat.isStreaming = false;
  chat.shellOpts = null;
  for (const f of [chat.send, chat.stop, chat.interject, chat.reset]) f.mockClear();
  bus.immediate.length = 0;
  bus.deferred.length = 0;
  vi.mocked(applySurfaceAction).mockClear();
  vi.mocked(cancelPendingSurfaceAction).mockClear();
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
  cleanup();
  setAnaLockedScreens([]);
  vi.unstubAllGlobals();
  localStorage.clear();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
  window.history.pushState({}, '', '/');
});

describe('A — a mid-turn promotion is a mode change, never a fresh enable', () => {
  it('switches a live drive to a demonstration, keeping the turn and its queued moves', async () => {
    await mountShell();
    const a = turnControls();
    drive(START_ASSIST, a);
    expect(within(strip()!).getByText('AnA is driving')).toBeTruthy();

    // One operation in flight, one queued behind it — both made before the
    // promotion, both still owed to the person.
    drive({ type: 'drive_action', directive: SEARCH }, a);
    drive({ type: 'drive_action', directive: FILTER }, a);
    await flush();
    expect(applySurfaceAction).toHaveBeenCalledTimes(1);

    drive(PROMOTED, a);
    expect(within(strip()!).getByText('AnA is demonstrating')).toBeTruthy();
    // The follow-up turns carry demo mode too.
    expect(chat.shellOpts!.driveMode).toBe('demo');

    act(() => bus.deferred[0]({ status: 'applied' }));
    await waitFor(() => expect(applySurfaceAction).toHaveBeenCalledTimes(2));
  });

  it('does not re-arm a drive the person took over', async () => {
    await mountShell();
    const a = turnControls();
    drive(START_ASSIST, a);
    fireEvent.click(within(strip()!).getByRole('button', { name: /Take over/ }));
    expect(strip()).toBeNull();

    drive(PROMOTED, a);
    expect(strip()).toBeNull();
    expect(chat.shellOpts!.driveMode).toBe('assist');
    // And nothing the promoted turn sends next is applied.
    drive({ type: 'drive_action', directive: SEARCH }, a);
    await flush();
    expect(applySurfaceAction).not.toHaveBeenCalled();
  });

  it('does not re-arm a drive the person switched off', async () => {
    await mountShell();
    const a = turnControls();
    drive(START_ASSIST, a);
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false'));
    expect(strip()).toBeNull();

    drive(PROMOTED, a);
    expect(strip()).toBeNull();
    expect(chat.shellOpts!.driveMode).toBe('assist');
  });

  it('a turn that begins driving after the switch went off does not engage', async () => {
    // The turn was sent while the switch was on; its drive_state arrives after
    // the person switched it off. Engaging then undoes the switch-off exactly
    // as the promotion did.
    await mountShell();
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false'));

    const a = turnControls();
    drive(START_ASSIST, a);
    expect(strip()).toBeNull();
    drive({ type: 'drive_action', directive: SEARCH }, a);
    await flush();
    expect(applySurfaceAction).not.toHaveBeenCalled();
  });
});

describe('C / D — a move that did not land is reported to the run that made it, as an observation', () => {
  it('reports through reportScreen, never as a human steer', async () => {
    await mountShell();
    const a = turnControls();
    drive(START_ASSIST, a);
    bus.immediate.push({ status: 'failed', reason: 'No document matches.' } as SurfaceActionOutcome);
    drive({ type: 'drive_action', directive: SEARCH }, a);

    await waitFor(() => expect(a.reportScreen).toHaveBeenCalledTimes(1));
    expect(a.reportScreen.mock.calls[0][0]).toContain('"Search the vault" on the vault screen did not happen');
    expect(a.reportScreen.mock.calls[0][0]).toContain('No document matches.');
    expect(a.interject).not.toHaveBeenCalled();
    expect(chat.interject).not.toHaveBeenCalled();
  });

  it('a pending move cancelled by a newer turn is reported to ITS turn, not the newer one', async () => {
    await mountShell();
    const a = turnControls();
    drive(START_ASSIST, a);
    drive({ type: 'drive_action', directive: SEARCH }, a);
    await flush();
    expect(bus.deferred).toHaveLength(1);

    // Turn A ends while its operation is still waiting on its screen; the
    // person's next message starts turn B.
    drive({ type: 'drive_turn_end' }, a);
    const b = turnControls();
    drive(START_ASSIST, b);

    act(() => bus.deferred[0]({ status: 'failed', reason: 'The vault screen is not open.' }));
    await waitFor(() => expect(a.reportScreen).toHaveBeenCalledTimes(1));
    expect(a.reportScreen.mock.calls[0][0]).toContain('It was cancelled before it could be made.');
    expect(b.reportScreen).not.toHaveBeenCalled();
    expect(a.interject).not.toHaveBeenCalled();
    expect(b.interject).not.toHaveBeenCalled();
  });
});

describe('every move is settled back to the run that made it, exactly once', () => {
  // The server holds AnA's next round until the screen settles each move of
  // the last one. A move that lands, fails, is refused on arrival or is dropped
  // must each say so — a silent one holds her to the ceiling, and a failure
  // told after she had answered was read by no round at all.
  it('a move that lands is settled as landed, by its id — navigation or operation', async () => {
    await mountShell();
    const a = turnControls();
    drive(START_ASSIST, a);
    bus.immediate.push({ status: 'applied' } as SurfaceActionOutcome);
    drive({ type: 'drive_action', directive: SEARCH, moveId: 'toolu_act' }, a);
    drive({ type: 'drive_navigation', directive: NAV_HERE, moveId: 'toolu_nav' }, a);
    await waitFor(() => expect(a.moveLanded.mock.calls.map(c => c[0])).toEqual(['toolu_act', 'toolu_nav']));
    expect(a.reportScreen).not.toHaveBeenCalled();
  });

  it('a move the screen refuses is settled as not made, with the screen’s reason and its id', async () => {
    await mountShell();
    const a = turnControls();
    drive(START_ASSIST, a);
    bus.immediate.push({ status: 'failed', reason: 'This vault has no documents yet.' } as SurfaceActionOutcome);
    drive({ type: 'drive_action', directive: SEARCH, moveId: 'toolu_act' }, a);
    await waitFor(() => expect(a.reportScreen).toHaveBeenCalledTimes(1));
    expect(a.reportScreen.mock.calls[0][0]).toContain('This vault has no documents yet.');
    expect(a.reportScreen.mock.calls[0][1]).toBe('toolu_act');
    expect(a.moveLanded).not.toHaveBeenCalled();
  });

  it('a move refused on arrival is still settled, with why — never silently dropped', async () => {
    await mountShell();
    const a = turnControls();
    // No drive engaged: the shell refuses it.
    drive({ type: 'drive_action', directive: SEARCH, moveId: 'toolu_early' }, a);
    expect(a.reportScreen).toHaveBeenCalledTimes(1);
    expect(a.reportScreen.mock.calls[0][0]).toMatch(/did not happen: Live Drive is not on/);
    expect(a.reportScreen.mock.calls[0][1]).toBe('toolu_early');
    // Taken over: refused as that.
    drive(START_ASSIST, a);
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    drive({ type: 'drive_navigation', directive: NAV_CMC, moveId: 'toolu_late' }, a);
    await waitFor(() => expect(a.reportScreen).toHaveBeenCalledTimes(2));
    expect(a.reportScreen.mock.calls[1][0]).toMatch(/Opening the .* screen did not happen: The person has taken over/);
    expect(a.reportScreen.mock.calls[1][1]).toBe('toolu_late');
    expect(applySurfaceAction).not.toHaveBeenCalled();
  });

  it('a pending action and the move behind it are both settled as not made when cleared', async () => {
    await mountShell();
    const a = turnControls();
    drive(START_ASSIST, a);
    drive({ type: 'drive_action', directive: SEARCH, moveId: 'toolu_1' }, a); // waiting on its screen
    drive({ type: 'drive_action', directive: FILTER, moveId: 'toolu_2' }, a); // queued behind it
    await flush();
    drive(START_ASSIST, turnControls()); // a new turn clears the queue
    act(() => bus.deferred[0]({ status: 'applied' }));
    await waitFor(() => expect(a.reportScreen).toHaveBeenCalledTimes(2));
    for (const [reason] of a.reportScreen.mock.calls) {
      expect(reason).toContain('It was cancelled before it could be made.');
    }
    expect(a.reportScreen.mock.calls.map(c => c[1])).toEqual(['toolu_1', 'toolu_2']);
    expect(cancelPendingSurfaceAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ actionId: 'vault.search', params: { query: 'stability' } }),
      'It was cancelled before it could be made.',
    );
    expect(a.moveLanded).not.toHaveBeenCalled();
  });

  it('a move is settled once, even when reporting its landing fails', async () => {
    await mountShell();
    const a = turnControls();
    a.moveLanded.mockImplementation(() => {
      throw new Error('network');
    });
    drive(START_ASSIST, a);
    bus.immediate.push({ status: 'applied' } as SurfaceActionOutcome);
    drive({ type: 'drive_action', directive: SEARCH, moveId: 'toolu_1' }, a);
    await flush(50);
    expect(a.moveLanded).toHaveBeenCalledTimes(1);
    // It landed: the queue's catch must not then report it as not made.
    expect(a.reportScreen).not.toHaveBeenCalled();
  });
});

describe('D — a turn’s leftover moves do not play into the next', () => {
  it('a new turn that begins driving drops the moves still queued from the last one', async () => {
    await mountShell();
    const a = turnControls();
    drive(START_ASSIST, a);
    drive({ type: 'drive_action', directive: SEARCH }, a); // in flight
    drive({ type: 'drive_action', directive: FILTER }, a); // queued behind it
    await flush();
    expect(applySurfaceAction).toHaveBeenCalledTimes(1);

    drive(START_ASSIST, turnControls());
    act(() => bus.deferred[0]({ status: 'applied' }));
    await flush(50);
    expect(applySurfaceAction).toHaveBeenCalledTimes(1);
  });

  it('starting a tour over a running answer drops that answer’s queued moves', async () => {
    chat.isStreaming = true;
    await mountShell();
    const a = turnControls();
    drive(START_ASSIST, a);
    drive({ type: 'drive_action', directive: SEARCH }, a); // in flight
    drive({ type: 'drive_action', directive: FILTER }, a); // queued behind it
    await flush();
    expect(applySurfaceAction).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Demos' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show me around' }));
    // The running answer is stopped; the tour waits for it to end.
    expect(chat.stop).toHaveBeenCalled();
    expect(chat.send).not.toHaveBeenCalled();

    act(() => bus.deferred[0]({ status: 'applied' }));
    await flush(50);
    expect(applySurfaceAction).toHaveBeenCalledTimes(1);
  });

  /* useAnaChat.stop() cancels the run on the server FIRST and drops the
     stream only once that answers, so for that round trip the stopped answer's
     stream goes on delivering moves the server had already written. The stub's
     stop returns at once; the move delivered after the click stands in for
     one that arrived during the cancel. Clearing the queue dropped only the
     moves that had arrived BEFORE the click: this one passed the gate and
     played, into the gap and then the tour. */
  it('starting a tour over a running answer also refuses the moves still on their way from it', async () => {
    chat.isStreaming = true;
    await mountShell();
    const a = turnControls();
    drive(START_ASSIST, a);
    drive({ type: 'drive_action', directive: SEARCH }, a); // in flight
    await flush();
    expect(applySurfaceAction).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Demos' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show me around' }));
    expect(chat.stop).toHaveBeenCalled();

    drive({ type: 'drive_action', directive: FILTER }, a); // arrives during the cancel
    act(() => bus.deferred[0]({ status: 'applied' }));
    await flush(50);
    expect(applySurfaceAction).toHaveBeenCalledTimes(1);
  });

  it('the strip’s Stop refuses the moves still on their way from the run it stopped', async () => {
    await mountShell();
    const a = turnControls();
    drive(START_ASSIST, a);
    drive({ type: 'drive_action', directive: SEARCH }, a); // in flight
    await flush();
    expect(applySurfaceAction).toHaveBeenCalledTimes(1);

    fireEvent.click(within(strip()!).getByRole('button', { name: 'Stop' }));
    expect(a.stop).toHaveBeenCalledTimes(1);

    drive({ type: 'drive_action', directive: FILTER }, a); // arrives during the cancel
    act(() => bus.deferred[0]({ status: 'applied' }));
    await flush(50);
    expect(applySurfaceAction).toHaveBeenCalledTimes(1);
  });

  /* Every Stop but the strip's — the rail's composer, the conversation
     screen's, a dock's — reaches only its own chat, which the shell never
     saw: the stopped turn's queued moves played on, and so did the ones still
     arriving while its cancel was out. The chat now says so (`drive_stopped`,
     useAnaChat.stop) before it waits. */
  it('the driving chat’s own Stop halts the drive, queued moves and ones still arriving', async () => {
    await mountShell();
    const a = turnControls();
    drive(START_ASSIST, a);
    drive({ type: 'drive_action', directive: SEARCH }, a); // in flight
    drive({ type: 'drive_action', directive: FILTER }, a); // queued behind it
    await flush();
    expect(applySurfaceAction).toHaveBeenCalledTimes(1);

    drive({ type: 'drive_stopped' }, a);
    expect(strip()).toBeNull();
    drive({ type: 'drive_action', directive: FILTER }, a); // arrives during the cancel
    act(() => bus.deferred[0]({ status: 'applied' }));
    await flush(50);
    expect(applySurfaceAction).toHaveBeenCalledTimes(1);
  });

  it('stopping an older turn’s chat does not end the drive a newer turn began', async () => {
    await mountShell();
    const a = turnControls();
    drive(START_ASSIST, a);
    const b = turnControls();
    drive(START_ASSIST, b);

    drive({ type: 'drive_stopped' }, a);
    expect(within(strip()!).getByText('AnA is driving')).toBeTruthy();
    bus.immediate.push({ status: 'applied' } as SurfaceActionOutcome);
    drive({ type: 'drive_action', directive: SEARCH }, b);
    await waitFor(() => expect(applySurfaceAction).toHaveBeenCalledTimes(1));
  });
});

describe('F / G — the strip names a screen only once it has opened, and words a failure by its kind', () => {
  it('a navigation queued behind another move is not shown as made until it lands', async () => {
    await mountShell();
    const a = turnControls();
    drive(START_ASSIST, a);
    drive({ type: 'drive_action', directive: SEARCH }, a); // in flight
    drive({ type: 'drive_navigation', directive: NAV_HERE }, a); // queued
    await flush();
    // Nothing has landed: the strip names no screen as reached.
    expect(stepText()).toBeNull();

    act(() => bus.deferred[0]({ status: 'applied', detail: 'Searched the vault' }));
    await waitFor(() => expect(stepText()).toContain('Searched the vault'));
    // Now the navigation runs, its screen shows, it settles — and only then
    // is it on the strip.
    await waitFor(() => expect(stepText()).toBe('Vault'));
  });

  /* A move already in flight when a new turn begins still finishes (the queue
     cannot recall it). Recorded on landing, it was claimed for the NEW turn:
     a demonstration started over a running answer read "1 stop", with the
     answer's screen as its latest move, before it had made a move of its own. */
  it('a move from the previous turn that lands after a new turn began is not claimed for it', async () => {
    await mountShell();
    const a = turnControls();
    drive(START_ASSIST, a);
    drive({ type: 'drive_navigation', directive: NAV_HERE }, a);
    await flush(); // shown at once; settling before it lands
    expect(stepText()).toBeNull();

    const b = turnControls();
    drive({ type: 'drive_state', enabled: true, mode: 'demo' }, b);
    expect(within(strip()!).getByText('AnA is demonstrating')).toBeTruthy();
    await flush(500); // turn A's navigation lands
    expect(strip()!.querySelector('.ana-drive-count')).toBeNull();
    expect(stepText()).toBeNull();

    // The demonstration's own move is recorded and counted as before.
    drive({ type: 'drive_navigation', directive: NAV_HERE }, b);
    await waitFor(() => expect(stepText()).toBe('Vault'));
    expect(strip()!.querySelector('.ana-drive-count')?.textContent).toBe('1 stop');
  });

  it('a navigation that cannot be made is worded as a screen that did not open', async () => {
    await mountShell();
    setAnaLockedScreens([{ id: 'cmc', reason: 'not in this release' }]);
    const a = turnControls();
    drive(START_ASSIST, a);
    drive({ type: 'drive_navigation', directive: NAV_CMC }, a);

    await waitFor(() =>
      expect(stepText()).toBe(
        'Could not open CMC / Quality (Module 3): That screen is not in this release for this workspace.',
      ),
    );
    await waitFor(() => expect(a.reportScreen).toHaveBeenCalledTimes(1));
    expect(a.reportScreen.mock.calls[0][0]).toContain('Opening the CMC / Quality (Module 3) screen did not happen');
  });
});

// @vitest-environment jsdom
/**
 * A driving turn has to reach the server as one, and survive what it does.
 *
 * Every one of these was a way AnA's hands failed for a real user while each
 * piece looked right in isolation:
 *
 *   STALE MODE. `send` is memoized, and its dependency list had drifted from
 *   what its body reads — `driveMode` was missing. A demonstration started
 *   while Live Drive was already on was sent as an ordinary turn: three moves
 *   under the assist budget, then silence. `send` now reads options through a
 *   ref at call time, and the one-click asks state their settings on the call.
 *
 *   SELF-UNMOUNT. A panel that owns its conversation (the thread) unmounts
 *   when AnA navigates away from it — and the hook aborted its stream on
 *   unmount. Every driven turn died at its first move: the screen changed
 *   once, the answer stopped mid-sentence, the server logged
 *   `client_disconnected`. A driving turn now runs to its end.
 *
 *   STUCK "AnA IS DRIVING". The shell released the drive only when ITS OWN
 *   chat stopped streaming, so a drive from any other chat never released.
 *   The driving chat now reports `drive_turn_end` itself, with the controls
 *   the overlay's Stop and steer need.
 *
 *   LOCKED SCREENS. AnA's self-drive tools could not know which screens were
 *   closed to this person, so she walked onto "not in this release" panels.
 *
 *   HEADLESS TURNS. The unmount exemption was granted on the enabled
 *   `drive_state` — permission to move, not a move. A turn that had it and
 *   never moved kept generating after the person left the panel. Only a move
 *   exempts a turn now, marked before the shell applies it; the enable alone
 *   still releases the shell's drive when the turn ends.
 *
 *   REPORTS ON THE WRONG CHANNEL, TO THE WRONG RUN. A move that failed was
 *   told to AnA through `interject` — recorded as the person's steer — and
 *   through the live run id, so a report the shell sent after the turn ended
 *   reached whichever turn was running by then. A turn's controls are bound
 *   to that turn's run, and the report has its own action.
 *
 *   A STOP THE SCREEN NEVER HEARD. Only the drive strip's Stop halted the
 *   shell's drive. Every other Stop reached only its chat, and stop() waits
 *   for the server's cancel before dropping the stream, so the stopped turn's
 *   moves went on playing, queued and still arriving. The chat now tells the
 *   shell (`drive_stopped`) before it waits.
 *
 * All asserted on the wire (the request body, the fetch signal) or on what
 * the shell receives — never on the hook's internals.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

import { useAnaChat } from '../useAnaChat';
import type { DriveSseEvent, DriveTurnControls, UseAnaChatOptions } from '../useAnaChat';
import { setAnaLockedScreens } from '../anaLockedScreens';

/** Encode one SSE event. */
const ev = (o: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(o)}\n\n`);

/** An SSE stream that completes immediately, so `send` settles. */
function closedStream(events: unknown[] = [{ type: 'text', content: 'ok' }, { type: 'done' }]) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events) c.enqueue(ev(e));
      c.close();
    },
  });
}

/** A stream the test feeds and closes by hand. */
function openStream() {
  let ctl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      ctl = c;
    },
  });
  return {
    body,
    push: (o: unknown) => ctl.enqueue(ev(o)),
    close: () => ctl.close(),
    /** Fail the read the way a real fetch body does when its signal aborts. */
    failOnAbort: (signal: AbortSignal | null | undefined) =>
      signal?.addEventListener('abort', () =>
        ctl.error(new DOMException('The operation was aborted.', 'AbortError')),
      ),
  };
}

/**
 * Let the reader loop drain what has been enqueued. A real timer, not a
 * microtask flush — the loop awaits a stream fed from another task (see the
 * harness notes in useAnaChat-round-status.test.ts).
 */
const drain = () => new Promise((r) => setTimeout(r, 25));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ({ ok: true, status: 200, body: closedStream() }));
  (globalThis.fetch as unknown) = fetchMock;
});
afterEach(() => {
  cleanup();
  setAnaLockedScreens([]);
});

function streamCall(): [string, RequestInit] {
  const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/ana-ri/stream'));
  if (!call) throw new Error('stream route was never called');
  return call as [string, RequestInit];
}
const sentBody = () => JSON.parse(String(streamCall()[1].body));
const sentSignal = () => streamCall()[1].signal as AbortSignal;

describe('a driving turn says it reports every move back', () => {
  // The server holds AnA's next round until the screen settles each move —
  // only for a client that said it will, or a silent one stalls every round.
  it('declared when the turn asks to drive and its events reach the shell', async () => {
    serveTurns();
    const { result } = renderHook(() => useAnaChat({ projectId: 'p1', liveDrive: true, onDriveEvent: vi.fn() }));
    await act(async () => {
      await result.current.send('take me to CMC');
    });
    expect(sentBody().drive_acks).toBe(true);
  });

  it('not declared by a chat whose drive events reach no one, or a turn that does not drive', async () => {
    serveTurns();
    const noHandler = renderHook(() => useAnaChat({ projectId: 'p1', liveDrive: true }));
    await act(async () => {
      await noHandler.result.current.send('take me to CMC');
    });
    expect(sentBody()).not.toHaveProperty('drive_acks');
    cleanup();
    fetchMock.mockClear();
    serveTurns();
    const notDriving = renderHook(() => useAnaChat({ projectId: 'p1', liveDrive: false, onDriveEvent: vi.fn() }));
    await act(async () => {
      await notDriving.result.current.send('take me to CMC');
    });
    expect(sentBody()).not.toHaveProperty('drive_acks');
  });
});

describe('the drive settings reach the request', () => {
  it('a mode changed after mount is the mode sent (no stale closure)', async () => {
    // Everything but driveMode stays referentially stable across the
    // rerender, so the memoized `send` is NOT rebuilt — exactly the state in
    // which the missing dependency sent the previous render's mode.
    const onDriveEvent = vi.fn();
    const { result, rerender } = renderHook((props: UseAnaChatOptions) => useAnaChat(props), {
      initialProps: { projectId: 'p1', liveDrive: true, driveMode: 'assist', onDriveEvent },
    });
    rerender({ projectId: 'p1', liveDrive: true, driveMode: 'demo', onDriveEvent });
    await act(async () => {
      await result.current.send('run the sales demonstration');
    });
    expect(sentBody().live_drive).toBe(true);
    expect(sentBody().drive_mode).toBe('demo');
  });

  it('per-call overrides win over the hook options for that turn', async () => {
    // The one-click tour/demo asks switch Live Drive on and send in the same
    // tick; the options the hook holds are still the previous render's.
    const { result } = renderHook(() => useAnaChat({ projectId: 'p1', liveDrive: false }));
    await act(async () => {
      await result.current.send('run the sales demonstration', undefined, {
        liveDrive: true,
        driveMode: 'demo',
      });
    });
    expect(sentBody().live_drive).toBe(true);
    expect(sentBody().drive_mode).toBe('demo');
  });

  it('without Live Drive neither field is sent, whatever the mode', async () => {
    const { result } = renderHook(() =>
      useAnaChat({ projectId: 'p1', liveDrive: false, driveMode: 'demo' }),
    );
    await act(async () => {
      await result.current.send('hello');
    });
    expect(sentBody().live_drive).toBeUndefined();
    expect(sentBody().drive_mode).toBeUndefined();
  });
});

describe('screens closed to this person ride every turn', () => {
  it('sends locked_screens when the shell has published some', async () => {
    setAnaLockedScreens([{ id: 'cmc', reason: 'x' }]);
    const { result } = renderHook(() => useAnaChat({ projectId: 'p1', liveDrive: true }));
    await act(async () => {
      await result.current.send('take me to CMC');
    });
    expect(sentBody().locked_screens).toEqual([{ id: 'cmc', reason: 'x' }]);
  });

  it('omits the field entirely when nothing is locked', async () => {
    const { result } = renderHook(() => useAnaChat({ projectId: 'p1', liveDrive: true }));
    await act(async () => {
      await result.current.send('take me to CMC');
    });
    expect('locked_screens' in sentBody()).toBe(false);
  });
});

describe('a driving turn survives the unmount its own navigation causes', () => {
  it('is NOT aborted when the hosting panel unmounts mid-drive', async () => {
    const s = openStream();
    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, body: s.body }));
    const { result, unmount } = renderHook(() =>
      useAnaChat({ projectId: 'p1', liveDrive: true, onDriveEvent: vi.fn() }),
    );
    await act(async () => {
      void result.current.send('take me to CMC');
      await drain();
    });
    await act(async () => {
      s.push({ type: 'drive_state', enabled: true, mode: 'assist' });
      s.push({ type: 'drive_navigation', round: 1, directive: { actionType: 'navigate', targetId: 'cmc' } });
      await drain();
    });
    // The navigation above is what unmounts a panel that owns its chat.
    unmount();
    expect(sentSignal().aborted).toBe(false);
    s.close();
    await drain();
  });

  it('an ordinary turn IS aborted on unmount (no orphaned generation)', async () => {
    const s = openStream();
    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, body: s.body }));
    const { result, unmount } = renderHook(() => useAnaChat({ projectId: 'p1' }));
    await act(async () => {
      void result.current.send('what is in Module 3?');
      await drain();
    });
    await act(async () => {
      s.push({ type: 'text', content: 'Module 3 is' });
      await drain();
    });
    unmount();
    expect(sentSignal().aborted).toBe(true);
  });

  it('a turn the server declined to drive (drive_state disabled) is still aborted on unmount', async () => {
    const s = openStream();
    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, body: s.body }));
    const { result, unmount } = renderHook(() =>
      useAnaChat({ projectId: 'p1', liveDrive: true, onDriveEvent: vi.fn() }),
    );
    await act(async () => {
      void result.current.send('take me to CMC');
      await drain();
    });
    await act(async () => {
      s.push({ type: 'drive_state', enabled: false, reason: 'not_entitled' });
      await drain();
    });
    unmount();
    expect(sentSignal().aborted).toBe(true);
  });
});

describe('the driving chat reports its own end', () => {
  it('emits drive_turn_end, with the run controls, once the driving stream ends', async () => {
    const s = openStream();
    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, body: s.body }));
    const seen: Array<{ ev: DriveSseEvent; controls?: DriveTurnControls }> = [];
    const onDriveEvent = vi.fn((e: DriveSseEvent, controls?: DriveTurnControls) => {
      seen.push({ ev: e, controls });
    });
    const { result } = renderHook(() => useAnaChat({ projectId: 'p1', liveDrive: true, onDriveEvent }));
    let sent!: Promise<void>;
    await act(async () => {
      sent = result.current.send('show me around');
      await drain();
    });
    await act(async () => {
      s.push({ type: 'drive_state', enabled: true, mode: 'assist' });
      s.push({ type: 'text', content: 'Here is the vault.' });
      await drain();
    });
    // Mid-turn: the drive is live, not over.
    expect(seen.map((x) => x.ev.type)).toEqual(['drive_state']);

    await act(async () => {
      s.push({ type: 'done' });
      s.close();
      await sent;
    });
    const types = seen.map((x) => x.ev.type);
    expect(types).toEqual(['drive_state', 'drive_turn_end']);
    const end = seen[1];
    expect(end.ev).toEqual({ type: 'drive_turn_end' });
    // The overlay's Stop and steer must reach THIS chat, which may not be the
    // shell's own — so the controls ride the event.
    expect(typeof end.controls?.stop).toBe('function');
    expect(typeof end.controls?.interject).toBe('function');
    expect(typeof end.controls?.reportScreen).toBe('function');
    // Every drive event carries them, not only the last.
    expect(typeof seen[0].controls?.stop).toBe('function');
  });

  it('a turn that never drove never emits drive_turn_end', async () => {
    const onDriveEvent = vi.fn();
    const { result } = renderHook(() => useAnaChat({ projectId: 'p1', liveDrive: true, onDriveEvent }));
    await act(async () => {
      await result.current.send('what is in Module 3?');
    });
    expect(onDriveEvent).not.toHaveBeenCalled();
  });

  it('a turn the server declined to drive never emits drive_turn_end', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      status: 200,
      body: closedStream([
        { type: 'drive_state', enabled: false, reason: 'not_entitled' },
        { type: 'text', content: 'ok' },
        { type: 'done' },
      ]),
    }));
    const onDriveEvent = vi.fn();
    const { result } = renderHook(() => useAnaChat({ projectId: 'p1', liveDrive: true, onDriveEvent }));
    await act(async () => {
      await result.current.send('take me to CMC');
    });
    expect(onDriveEvent.mock.calls.map((c) => (c[0] as DriveSseEvent).type)).toEqual(['drive_state']);
  });
});

/* ── Only a move exempts a turn from the unmount abort ───────────────────── */

describe('a turn that is allowed to drive but has not moved', () => {
  it('IS aborted when the panel unmounts, and still releases the shell’s drive', async () => {
    const s = openStream();
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      s.failOnAbort(init?.signal);
      return { ok: true, status: 200, body: s.body };
    });
    const onDriveEvent = vi.fn();
    const { result, unmount } = renderHook(() =>
      useAnaChat({ projectId: 'p1', liveDrive: true, onDriveEvent }),
    );
    let sent!: Promise<void>;
    await act(async () => {
      sent = result.current.send('what does the vault hold?');
      await drain();
    });
    await act(async () => {
      s.push({ type: 'drive_state', enabled: true, mode: 'assist' });
      s.push({ type: 'text', content: 'The vault holds' });
      await drain();
    });
    // The person left. Nothing AnA did moved them, so nothing should keep
    // generating for a panel that is gone.
    unmount();
    expect(sentSignal().aborted).toBe(true);
    await sent;
    // The shell engaged its drive on the enable; the aborted turn lets go of
    // it, or "AnA is driving" stays on screen with nobody driving.
    expect(onDriveEvent.mock.calls.map((c) => (c[0] as DriveSseEvent).type)).toEqual([
      'drive_state',
      'drive_turn_end',
    ]);
  });

  it('an operation performed on screen exempts it, not only a navigation', async () => {
    const s = openStream();
    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, body: s.body }));
    const { result, unmount } = renderHook(() =>
      useAnaChat({ projectId: 'p1', liveDrive: true, onDriveEvent: vi.fn() }),
    );
    await act(async () => {
      void result.current.send('search the vault for the stability report');
      await drain();
    });
    await act(async () => {
      s.push({ type: 'drive_state', enabled: true, mode: 'assist' });
      s.push({
        type: 'drive_action',
        round: 1,
        directive: { actionType: 'surface_action', surfaceId: 'vault', actionId: 'search' },
      });
      await drain();
    });
    unmount();
    expect(sentSignal().aborted).toBe(false);
    s.close();
    await drain();
  });

  it('the move is marked before the shell applies it — the unmount it causes finds the turn driving', async () => {
    const s = openStream();
    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, body: s.body }));
    // The shell's handler is what navigates, and navigating is what unmounts
    // a panel that owns this chat: the unmount happens INSIDE the handler.
    let unmountPanel: () => void = () => undefined;
    const onDriveEvent = vi.fn((e: DriveSseEvent) => {
      if (e.type === 'drive_navigation') unmountPanel();
    });
    const { result, unmount } = renderHook(() =>
      useAnaChat({ projectId: 'p1', liveDrive: true, onDriveEvent }),
    );
    unmountPanel = unmount;
    await act(async () => {
      void result.current.send('take me to CMC');
      await drain();
    });
    await act(async () => {
      s.push({ type: 'drive_state', enabled: true, mode: 'assist' });
      s.push({ type: 'drive_navigation', round: 1, directive: { actionType: 'navigate', targetId: 'cmc' } });
      await drain();
    });
    expect(onDriveEvent.mock.calls.map((c) => (c[0] as DriveSseEvent).type)).toContain('drive_navigation');
    expect(sentSignal().aborted).toBe(false);
    s.close();
    await drain();
  });
});

/* ── A turn's controls reach that turn's run, on the right channel ───────── */

/** The run-control requests made so far: [runId, parsed body]. */
function controlRequests(): Array<[string, { action?: string; message?: string }]> {
  return fetchMock.mock.calls
    .filter((c) => /\/api\/ana-ri\/stream\/[^/]+\/control$/.test(String(c[0])))
    .map((c) => {
      const runId = decodeURIComponent(String(c[0]).split('/')[4]);
      return [runId, JSON.parse(String((c[1] as RequestInit).body))];
    });
}

/**
 * Serve the stream route from the given bodies, one per turn, and accept every
 * control request — so any request that is made is observable, and a control
 * that returns false did so without the server refusing it.
 */
function serveTurns(...bodies: Array<ReadableStream<Uint8Array>>) {
  const queue = [...bodies];
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).endsWith('/control')) {
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    return { ok: true, status: 200, body: queue.shift() ?? closedStream() };
  });
}

describe('the drive controls a turn hands the shell', () => {
  it('moveLanded settles a move by its id, and a report can name the move it is about', async () => {
    const s = openStream();
    serveTurns(s.body);
    let controls: DriveTurnControls | undefined;
    renderHook(() =>
      useAnaChat({
        projectId: 'p1',
        liveDrive: true,
        onDriveEvent: (_e, c) => {
          controls = c;
        },
      }),
    ).result.current.send('take me to CMC');
    await act(async () => {
      await drain();
      s.push({ type: 'run_started', runId: 'run-1' });
      s.push({ type: 'drive_state', enabled: true, mode: 'assist' });
      await drain();
    });
    await act(async () => {
      await controls!.moveLanded('toolu_nav_1');
      await controls!.reportScreen('[Screen report] Opening the CMC screen did not happen.', 'toolu_nav_2');
    });
    expect(controlRequests()).toEqual([
      ['run-1', { action: 'move_landed', moveId: 'toolu_nav_1' }],
      [
        'run-1',
        { action: 'screen_report', message: '[Screen report] Opening the CMC screen did not happen.', moveId: 'toolu_nav_2' },
      ],
    ]);
    s.close();
    await drain();
  });

  it('reportScreen sends a screen_report to this turn’s run, and queues no steer', async () => {
    const s = openStream();
    serveTurns(s.body);
    let controls: DriveTurnControls | undefined;
    const { result } = renderHook(() =>
      useAnaChat({
        projectId: 'p1',
        liveDrive: true,
        onDriveEvent: (_e, c) => {
          controls = c;
        },
      }),
    );
    await act(async () => {
      void result.current.send('take me to CMC');
      await drain();
    });
    await act(async () => {
      s.push({ type: 'run_started', runId: 'run-1' });
      s.push({ type: 'drive_state', enabled: true, mode: 'assist' });
      await drain();
    });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await controls!.reportScreen('[Screen report] Opening the CMC screen did not happen.');
    });
    expect(ok).toBe(true);
    expect(controlRequests()).toEqual([
      ['run-1', { action: 'screen_report', message: '[Screen report] Opening the CMC screen did not happen.' }],
    ]);
    // Not the person's words: nothing waits as "You steered AnA".
    expect(result.current.pendingSteers).toEqual([]);
    s.close();
    await drain();
  });

  it('a steer typed into the drive strip is the person’s, queued as pending like the composer’s', async () => {
    const s = openStream();
    serveTurns(s.body);
    let controls: DriveTurnControls | undefined;
    const { result } = renderHook(() =>
      useAnaChat({
        projectId: 'p1',
        liveDrive: true,
        onDriveEvent: (_e, c) => {
          controls = c;
        },
      }),
    );
    await act(async () => {
      void result.current.send('run the sales demonstration');
      await drain();
    });
    await act(async () => {
      s.push({ type: 'run_started', runId: 'run-1' });
      s.push({ type: 'drive_state', enabled: true, mode: 'demo' });
      await drain();
    });
    await act(async () => {
      await controls!.interject('slow down on the vault');
    });
    expect(controlRequests()).toEqual([['run-1', { action: 'interject', message: 'slow down on the vault' }]]);
    // The server confirms steers by position; one it holds that is not
    // pending here would consume another steer's confirmation.
    expect(result.current.pendingSteers).toEqual(['slow down on the vault']);
    s.close();
    await drain();
  });

  it('a report about an earlier turn never reaches a newer run', async () => {
    const first = openStream();
    const second = openStream();
    serveTurns(first.body, second.body);
    const handed: DriveTurnControls[] = [];
    const { result } = renderHook(() =>
      useAnaChat({
        projectId: 'p1',
        liveDrive: true,
        onDriveEvent: (_e, c) => {
          if (c) handed.push(c);
        },
      }),
    );

    let firstSent!: Promise<void>;
    await act(async () => {
      firstSent = result.current.send('take me to CMC');
      await drain();
    });
    await act(async () => {
      first.push({ type: 'run_started', runId: 'run-1' });
      first.push({ type: 'drive_state', enabled: true, mode: 'assist' });
      first.push({ type: 'done' });
      first.close();
      await firstSent;
    });
    const firstTurn = handed[0];

    await act(async () => {
      void result.current.send('now the vault');
      await drain();
    });
    await act(async () => {
      second.push({ type: 'run_started', runId: 'run-2' });
      second.push({ type: 'drive_state', enabled: true, mode: 'assist' });
      await drain();
    });
    const secondTurn = handed[handed.length - 1];
    expect(secondTurn).not.toBe(firstTurn);

    // The shell's queue drains after the first stream ended; a move of the
    // first turn failing now must not be told to the second turn's run.
    let report: boolean | undefined;
    let steer: boolean | undefined;
    await act(async () => {
      report = await firstTurn.reportScreen('[Screen report] Opening the CMC screen did not happen.');
      steer = await firstTurn.interject('stay on CMC');
    });
    expect(report).toBe(false);
    expect(steer).toBe(false);
    expect(controlRequests()).toEqual([]);
    expect(result.current.pendingSteers).toEqual([]);

    // The second turn's own controls reach the second run.
    await act(async () => {
      await secondTurn.reportScreen('[Screen report] "Search" on the vault screen did not happen.');
    });
    expect(controlRequests().map(([runId, b]) => [runId, b.action])).toEqual([['run-2', 'screen_report']]);
    second.close();
    await drain();
  });

  it('with no run to address — before run_started, or once the turn ended — it resolves false, sending nothing', async () => {
    const s = openStream();
    serveTurns(s.body);
    let controls: DriveTurnControls | undefined;
    const { result } = renderHook(() =>
      useAnaChat({
        projectId: 'p1',
        liveDrive: true,
        onDriveEvent: (_e, c) => {
          controls = c;
        },
      }),
    );
    let sent!: Promise<void>;
    await act(async () => {
      sent = result.current.send('take me to CMC');
      await drain();
    });
    await act(async () => {
      s.push({ type: 'drive_state', enabled: true, mode: 'assist' });
      await drain();
    });
    let before: boolean | undefined;
    await act(async () => {
      before = await controls!.reportScreen('[Screen report] too early');
    });
    expect(before).toBe(false);

    await act(async () => {
      s.push({ type: 'run_started', runId: 'run-1' });
      s.push({ type: 'done' });
      s.close();
      await sent;
    });
    let after: boolean | undefined;
    await act(async () => {
      after = await controls!.reportScreen('[Screen report] too late');
    });
    expect(after).toBe(false);
    expect(controlRequests()).toEqual([]);
  });

  it('a steer accepted as the run ends is not left pending into the next turn', async () => {
    const s = openStream();
    // The control request answers only when the test says so: the server
    // accepted the steer, and the answer arrives after the stream has closed.
    let accept: () => void = () => undefined;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/control')) {
        await new Promise<void>((r) => {
          accept = r;
        });
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return { ok: true, status: 200, body: s.body };
    });
    let controls: DriveTurnControls | undefined;
    const { result } = renderHook(() =>
      useAnaChat({
        projectId: 'p1',
        liveDrive: true,
        onDriveEvent: (_e, c) => {
          controls = c;
        },
      }),
    );
    let sent!: Promise<void>;
    await act(async () => {
      sent = result.current.send('run the sales demonstration');
      await drain();
    });
    await act(async () => {
      s.push({ type: 'run_started', runId: 'run-1' });
      s.push({ type: 'drive_state', enabled: true, mode: 'demo' });
      await drain();
    });
    let steered!: Promise<boolean>;
    await act(async () => {
      steered = controls!.interject('slow down on the vault');
      await drain();
    });
    // Her last round ends before the acceptance reaches the client; the run
    // is over and nothing will ever splice the steer.
    await act(async () => {
      s.push({ type: 'done' });
      s.close();
      await sent;
    });
    await act(async () => {
      accept();
      await steered;
    });
    // Left pending, it read as "waiting to reach AnA" with no run to reach —
    // and the next turn's first confirmation, matched by position, would
    // consume it instead of the steer it confirms.
    expect(result.current.pendingSteers).toEqual([]);
  });
});

/* ── A driving turn ended from its own chat halts the shell's drive first ── */

describe('a driving turn ended from its own chat', () => {
  /** A driving turn in flight, whose cancel the server answers only when told. */
  async function drivingTurn(opts: { enabled?: boolean } = {}) {
    const s = openStream();
    let answerCancel: () => void = () => undefined;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/control')) {
        await new Promise<void>((r) => {
          answerCancel = r;
        });
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      s.failOnAbort(init?.signal);
      return { ok: true, status: 200, body: s.body };
    });
    const seen: Array<{ ev: DriveSseEvent; controls?: DriveTurnControls }> = [];
    const onDriveEvent = vi.fn((e: DriveSseEvent, controls?: DriveTurnControls) => {
      seen.push({ ev: e, controls });
    });
    const hook = renderHook(() => useAnaChat({ projectId: 'p1', liveDrive: true, onDriveEvent }));
    let sent!: Promise<void>;
    await act(async () => {
      sent = hook.result.current.send('show me around');
      await drain();
    });
    await act(async () => {
      s.push({ type: 'run_started', runId: 'run-1' });
      s.push({ type: 'drive_state', enabled: opts.enabled ?? true, mode: 'assist' });
      await drain();
    });
    return { hook, seen, sent: () => sent, answerCancel: () => answerCancel() };
  }
  const types = (seen: Array<{ ev: DriveSseEvent }>) => seen.map((x) => x.ev.type);

  /* Only the drive strip's Stop used to halt the drive; the rail's, the
     conversation screen's and the docks' Stop reach only this hook. And stop()
     waits for the server's cancel before it drops the stream, so for that
     round trip the stream goes on delivering moves the server had written —
     which the shell applied, the screen moving on after Stop. */
  it('Stop tells the shell before the cancel is answered, with this turn’s controls', async () => {
    const t = await drivingTurn();
    let stopped!: Promise<void>;
    await act(async () => {
      stopped = Promise.resolve(t.hook.result.current.stop());
      await drain();
    });
    // The cancel is still out, the stream still open — and the shell knows.
    expect(sentSignal().aborted).toBe(false);
    expect(types(t.seen)).toEqual(['drive_state', 'drive_stopped']);
    expect(t.seen[1].controls).toBe(t.seen[0].controls);

    await act(async () => {
      t.answerCancel();
      await stopped;
      await t.sent();
    });
    // Once, and the turn's end still follows so the shell can let go.
    expect(types(t.seen)).toEqual(['drive_state', 'drive_stopped', 'drive_turn_end']);
  });

  it('a new conversation replacing it halts the drive too', async () => {
    const t = await drivingTurn();
    await act(async () => {
      t.hook.result.current.reset();
      await t.sent();
    });
    expect(types(t.seen)).toEqual(['drive_state', 'drive_stopped', 'drive_turn_end']);
  });

  it('a turn the server did not let drive has no drive to halt', async () => {
    const t = await drivingTurn({ enabled: false });
    let stopped!: Promise<void>;
    await act(async () => {
      stopped = Promise.resolve(t.hook.result.current.stop());
      await drain();
      t.answerCancel();
      await stopped;
      await t.sent();
    });
    expect(types(t.seen)).toEqual(['drive_state']);
  });
});

/* A refused turn says why. A rate limit or a usage cap was shown as "AnA is
   unreachable — the network or the AI gateway did not respond", which sent
   people to check a connection that was fine. */
describe('a turn the stream route refuses says why', () => {
  function refuseWith(status: number, body: unknown) {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/api/ana-ri/stream')) {
        return { ok: false, status, body: null, clone: () => ({ json: async () => body }) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    });
  }
  async function answerTo(): Promise<string> {
    const { result } = renderHook(() => useAnaChat({ projectId: 'p1' }));
    await act(async () => {
      await result.current.send('take me to CMC');
    });
    return result.current.messages.at(-1)?.text ?? '';
  }

  it('a rate limit reads as one, not as an unreachable network', async () => {
    refuseWith(429, { error: 'Rate limit exceeded', message: 'Too many AI requests. Please wait before making more.' });
    const text = await answerTo();
    expect(text).toMatch(/^Too many AnA requests in the last minute/);
    expect(text).not.toMatch(/unreachable/);
  });

  it('the weekly usage cap reads as the organization’s limit', async () => {
    refuseWith(429, { error: 'Weekly usage limit reached', code: 'WEEKLY_LIMIT_EXCEEDED' });
    expect(await answerTo()).toMatch(/^This organization has reached its weekly limit/);
  });

  it('no provider configured still says so, and anything else is unreachable', async () => {
    refuseWith(503, { error: { code: 'GATEWAY_UNAVAILABLE' } });
    expect(await answerTo()).toMatch(/^No AI provider is configured/);
    cleanup();
    refuseWith(502, {});
    expect(await answerTo()).toMatch(/^AnA is unreachable/);
  });
});

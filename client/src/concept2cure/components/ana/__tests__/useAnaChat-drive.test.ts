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
  return { body, push: (o: unknown) => ctl.enqueue(ev(o)), close: () => ctl.close() };
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

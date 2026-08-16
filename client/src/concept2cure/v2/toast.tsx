/**
 * The one transient channel a write has to report what happened.
 *
 * ── Why this module exists ──────────────────────────────────────────────────
 * Twenty-six surfaces each defined their own `useToast` + `C2CToast`. Twenty-four
 * of those copies were identical and TONE-LESS:
 *
 *   function useToast(): [string, (m: string) => void] { … }
 *   function C2CToast({ msg }: { msg: string }) {
 *     return <div className="de-toast"><span className="ico">{I.checkCircle}</span>{msg}</div>;
 *   }
 *
 * `.de-toast .ico` is unconditionally `var(--success)`, so the icon is a green
 * tick and the tick is not conditional on anything. A failure had no way to
 * render as a failure. "Couldn't save the specification. Nothing was persisted."
 * arrived under a green check mark, which is precisely the wrong first
 * impression in a regulated record — and on a Part 11 e-signature, a REJECTED
 * PIN drew the success tick.
 *
 * The fix is not a shared file for its own sake. It is that tone becomes a
 * parameter a caller must think about, in the one place the icon and the colour
 * are chosen.
 *
 * ── What this merges ────────────────────────────────────────────────────────
 * Two tone-aware copies already existed and each was correct about something the
 * other got wrong. This takes both:
 *
 *   · from `surfaces/cmcShared.tsx` — the `ToastState` object, the
 *     length-sensitive dismiss delay, and the unmount cleanup. The
 *     `DocumentAuthoring` copy had no cleanup, so a surface unmounted inside the
 *     dismiss window set state on a dead component.
 *
 *   · from `surfaces/DocumentAuthoring.tsx` — `role="alert"` for errors. The
 *     cmcShared copy paired `role="status"` with `aria-live="assertive"`, which
 *     is self-contradictory: `role="status"` carries an implicit POLITE live
 *     region, and assistive tech has historically diverged on whether an
 *     explicit assertive override wins. `role="alert"` implies assertive and
 *     `aria-atomic="true"` with nothing to override. The design review named
 *     this a must-fix and it was fixed in the duplicate but never carried back
 *     to the copy the review called canonical — which is the exact failure mode
 *     that makes duplication a correctness problem rather than a tidiness one.
 */

import React from 'react';
import { I } from './icons';

export type ToastTone = 'ok' | 'error';

export interface ToastState {
  msg: string;
  tone: ToastTone;
}

export function useToast(): [ToastState, (m: string, tone?: ToastTone) => void] {
  const [state, setState] = React.useState<ToastState>({ msg: '', tone: 'ok' });
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const fire = React.useCallback((m: string, tone: ToastTone = 'ok') => {
    setState({ msg: m, tone });
    if (timer.current) clearTimeout(timer.current);
    // A failure matters more and is longer, so it is held longer than the
    // "saved" acknowledgement it replaces. Length is part of the test because a
    // long confirmation is also one a reader cannot finish in 3.2s.
    timer.current = setTimeout(
      () => setState({ msg: '', tone }),
      tone === 'error' || m.length > 90 ? 7000 : 3200,
    );
  }, []);
  return [state, fire];
}

/**
 * Accepts a bare string as well as a `ToastState` so that a surface mid-migration
 * still renders. A bare string is treated as `ok`, which is the pre-existing
 * behaviour of every tone-less copy this replaces.
 */
export function C2CToast({ msg }: { msg: ToastState | string }) {
  const state: ToastState = typeof msg === 'string' ? { msg, tone: 'ok' } : msg;
  if (!state.msg) return null;
  const isError = state.tone === 'error';
  return (
    <div
      className="de-toast"
      data-tone={state.tone}
      // See the header note: `role="alert"` is assertive by definition. Pairing
      // `role="status"` with `aria-live="assertive"` is the contradiction this
      // deliberately does not reproduce.
      role={isError ? 'alert' : 'status'}
    >
      <span className="ico">{isError ? I.alertTriangle : I.checkCircle}</span>
      {state.msg}
    </div>
  );
}

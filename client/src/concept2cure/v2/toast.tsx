/**
 * The one transient acknowledgement channel the v2 surfaces have.
 *
 * ── The defect this exists to make unrepresentable ───────────────────────────
 * `.de-toast .ico` is styled green. A toast whose only parameter is a string
 * therefore reports EVERY outcome with a success tick, including the ones that
 * are failures. BP-W0-6 found this on Word export — a 500 announced as though
 * the document had been produced — and the Wave 0 design review then found the
 * same shape on the §11.50 e-signature dialog, where a REJECTED PIN drew the
 * green tick on the one action in the product that is a legally binding
 * attestation.
 *
 * Both were fixed where they were found. They were not the bug. The bug is that
 * twenty-five surfaces each declared their own
 *
 *   function useToast(): [string, (m: string) => void]
 *
 * so "the toast cannot express failure" was not one defect to fix but a
 * property re-created at every call site, and fixing two of them left
 * twenty-three. This module is the fix: the tone is a required part of the
 * type, so a surface can no longer be built that is unable to say a write
 * failed.
 *
 * ── Why this is not in `cmcShared.tsx` ───────────────────────────────────────
 * It used to be, and three CMC surfaces imported it from there. But the
 * remaining twenty-two consumers are not CMC — they are identity, licensing,
 * pharmacovigilance, gateway transmittals, reporting. A shared component whose
 * module name claims a domain it does not belong to is the reason the other
 * copies were written instead of the import being found. It lives beside
 * `assessmentState.ts` now, at the layer it actually serves.
 *
 * `cmcShared.tsx` does NOT re-export it. A re-export is a second name for one
 * thing, which is the parallel path this change exists to remove.
 *
 * ── The implementation is the best of the three that existed, not a pick ─────
 *   · the ARIA is `DocumentAuthoring`'s. `role="status"` + `aria-live="assertive"`
 *     is contradictory — `status` carries an implicit polite live region and AT
 *     has historically diverged on whether an explicit assertive override wins.
 *     `role="alert"` implies assertive AND `aria-atomic` with nothing to
 *     override.
 *   · the unmount cleanup is `cmcShared`'s. `DocumentAuthoring`'s copy never
 *     cleared its timer, so a surface unmounted inside the dismissal window set
 *     state on a dead component.
 *   · preserving the tone on dismissal is `cmcShared`'s. `DocumentAuthoring`'s
 *     copy reset it to `'ok'`, which flips an error toast to the success
 *     styling for the frame in which it disappears.
 *   · the durations are `DocumentAuthoring`'s longer pair, kept with
 *     `cmcShared`'s long-message clause: a failure says more than "Saved" and
 *     is worth reading twice as long, and so is any confirmation long enough to
 *     be a sentence.
 */

import React from 'react';
import { I } from './icons';

export type ToastTone = 'ok' | 'error';

export interface ToastState {
  msg: string;
  tone: ToastTone;
}

/**
 * The type a component takes when its parent owns the toast.
 *
 * Declare the prop as `FireToast`, never as `(m: string) => void`. Narrowing it
 * at the boundary is how the tone was lost even on surfaces whose own toast
 * could express it: `AuthoringFilingBar` typed the prop one-tone, so a REJECTED
 * §11.50 signature PIN drew the green tick although the caller had passed a
 * tone-aware `fire`. TypeScript accepts the narrowing silently — a two-argument
 * function is assignable to a one-argument type — so nothing warns; the second
 * argument simply becomes unpassable inside the child.
 */
export type FireToast = (m: string, tone?: ToastTone) => void;

/** Anything longer than this is a sentence, not an acknowledgement. */
const LONG_MESSAGE = 90;
const HOLD_BRIEF = 4200;
const HOLD_LONG = 8000;

/**
 * The tone is explicit rather than inferred from the text. Inference was tried
 * — matching on "Couldn't", "failed", "not" — and it is exactly as reliable as
 * it sounds: "Nothing was persisted." is a failure with none of those words in
 * it, and "Signature accepted — no further approvals are required." is a
 * success with two.
 */
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
    timer.current = setTimeout(
      () => setState({ msg: '', tone }),
      tone === 'error' || m.length > LONG_MESSAGE ? HOLD_LONG : HOLD_BRIEF,
    );
  }, []);
  return [state, fire];
}

/**
 * Accepts a bare string as well as a `ToastState` so that a surface with a
 * genuinely tone-free acknowledgement is not forced to construct an object.
 * A bare string is `'ok'` — which is safe here and only here, because the type
 * of `fire` means an error can no longer arrive as one by omission.
 */
export function C2CToast({ msg }: { msg: ToastState | string }) {
  const state: ToastState = typeof msg === 'string' ? { msg, tone: 'ok' } : msg;
  if (!state.msg) return null;
  const isError = state.tone === 'error';
  return (
    <div
      className="de-toast"
      data-tone={isError ? 'error' : undefined}
      role={isError ? 'alert' : 'status'}
    >
      <span className="ico">{isError ? I.alertTriangle : I.checkCircle}</span>
      {state.msg}
    </div>
  );
}

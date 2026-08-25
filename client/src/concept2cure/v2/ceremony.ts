/**
 * The ceremony channel — "a governed form owns the canvas right now."
 *
 * Surface-action handlers must refuse view changes that would disturb or
 * unmount a form a person is mid-way through (an e-signature, a
 * reason-for-change, a credential entry). Most surfaces hold their own form
 * state and guard locally — but several kits open ceremonies from CHILD panes
 * the registering component cannot see (CmcModule's six panes were the
 * recorded wave-2 limitation), and threading a prop through every pane
 * duplicates a fact the ceremony components already know about themselves.
 *
 * So the ceremony components report it. C2CForm and GovernedConfirmDialog —
 * the two components every governed dialog in the product renders through —
 * register here on mount and unregister on unmount. One module-level counter,
 * because ceremonies unmount with their surface: whatever is counted is on the
 * screen the user is looking at.
 *
 * This is a REFUSAL input, not render state: nothing subscribes, nothing
 * re-renders when it changes. Handlers read it synchronously at apply time,
 * which is exactly when it is accurate.
 *
 * @module client/src/concept2cure/v2/ceremony
 */

let openCeremonies = 0;

/** Called by a ceremony component on mount; returns the unregister. */
export function registerCeremonyOpen(): () => void {
  openCeremonies += 1;
  let done = false;
  return () => {
    // Idempotent: React StrictMode double-invokes effect cleanups in dev.
    if (done) return;
    done = true;
    openCeremonies = Math.max(0, openCeremonies - 1);
  };
}

/** True while any governed form/dialog is mounted on the current screen. */
export function ceremonyOpen(): boolean {
  return openCeremonies > 0;
}

/** Test-only: clear the counter between mounts. */
export function __resetCeremonies(): void {
  openCeremonies = 0;
}

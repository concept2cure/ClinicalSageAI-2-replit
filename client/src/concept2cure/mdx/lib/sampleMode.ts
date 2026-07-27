/**
 * sampleMode — explicit, opt-in access to the canonical demo fixtures.
 *
 * The MDX kit ships a full set of realistic example records (predicate
 * devices, risk files, UDI entries, CAPAs). They are genuinely useful
 * for sales demos, design review, and screenshots. They are dangerous
 * as a *fallback*, because a fallback fires exactly when the user is
 * least able to tell: an empty tenant, an expired token, a 500.
 *
 * The rule this module enforces:
 *
 *   Sample data is something the user turns ON, knowing they did.
 *   It is never something the product turns on for them.
 *
 * Enabled only by an explicit, auditable signal:
 *   - `?sample=1` in the URL (shareable demo links), or
 *   - the sample toggle in the MDX top bar, which writes the key below.
 *
 * It is force-disabled in production builds regardless of either signal,
 * so a demo link cannot put a real customer's regulated workspace into
 * example mode.
 */

const STORAGE_KEY = 'c2c_mdx_sample_data';

/** Fires whenever sample mode is toggled, so surfaces re-render. */
const CHANGE_EVENT = 'c2c:sample-mode-change';

/**
 * True in a build where sample fixtures may be shown at all. Production
 * bundles never expose them — a regulated tenant has no legitimate
 * reason to see another company's example predicate devices, and the
 * blast radius of a mis-set flag is a misread submission.
 */
export function sampleModeAvailable(): boolean {
  try {
    return import.meta.env?.PROD !== true;
  } catch {
    return false;
  }
}

/** Whether canonical sample fixtures should be rendered right now. */
export function isSampleMode(): boolean {
  if (!sampleModeAvailable()) return false;
  if (typeof window === 'undefined') return false;

  try {
    const param = new URLSearchParams(window.location.search).get('sample');
    if (param === '1' || param === 'true') return true;
    if (param === '0' || param === 'false') return false;
  } catch {
    /* malformed URL — fall through to stored preference */
  }

  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    /* storage blocked (private mode, embedded frame) — default off */
    return false;
  }
}

/** Turn sample mode on or off and notify every subscribed surface. */
export function setSampleMode(on: boolean): void {
  if (!sampleModeAvailable() || typeof window === 'undefined') return;
  try {
    if (on) window.localStorage.setItem(STORAGE_KEY, 'on');
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage blocked — the event still drives this tab's render */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { on } }));
}

/** Subscribe to sample-mode changes. Returns an unsubscribe function. */
export function onSampleModeChange(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CHANGE_EVENT, fn);
  /* `storage` covers the flag being flipped in another tab. */
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener(CHANGE_EVENT, fn);
    window.removeEventListener('storage', fn);
  };
}

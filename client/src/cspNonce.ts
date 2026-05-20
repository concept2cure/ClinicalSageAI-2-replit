/**
 * CSP nonce plumbing for the SPA.
 *
 * Two responsibilities:
 *
 *   1. Read the per-request nonce the server injected into the HTML
 *      (<meta name="csp-nonce" content="..."/>) and make it available to
 *      app code via `getCspNonce()` / the `useCspNonce` hook.
 *
 *   2. Monkey-patch `document.createElement` so every <style> element
 *      created at runtime carries the same nonce automatically. This
 *      covers third-party libraries (Tiptap / ProseMirror, Radix UI,
 *      etc.) that inject inline <style> blocks for editor decorations,
 *      animations, and floating-element positioning. Those libraries
 *      have no upstream nonce option, but they all go through
 *      `document.createElement('style')` so the patch catches them.
 *
 * Side-effect on import — this file must be imported FIRST in
 * client/src/main.tsx, before any module that might create a <style>
 * element at evaluation time.
 *
 * Why a patch and not a MutationObserver:
 *   MutationObserver fires AFTER the browser has parsed the inserted
 *   element and applied CSP. A <style> without a nonce is already
 *   blocked by the time the observer runs. Patching createElement sets
 *   the nonce BEFORE insertion, so the browser sees a valid element
 *   when it does its CSP check.
 */

const NONCE_META_NAME = 'csp-nonce';

declare global {
  interface Window {
    __cspNonce?: string;
  }
}

function readNonceFromMeta(): string {
  if (typeof document === 'undefined') return '';
  const meta = document.querySelector<HTMLMetaElement>(`meta[name="${NONCE_META_NAME}"]`);
  const value = meta?.content?.trim() ?? '';
  // If the server didn't inject a real nonce (e.g. the placeholder didn't
  // get replaced), treat it as empty — better than emitting "__CSP_NONCE__"
  // which would be flagged as a violation on every CSP check.
  if (!value || value.startsWith('__') || value.endsWith('__')) return '';
  return value;
}

const NONCE = readNonceFromMeta();

if (typeof window !== 'undefined') {
  window.__cspNonce = NONCE;
}

export function getCspNonce(): string {
  return NONCE;
}

/**
 * Install the createElement patch. Idempotent — installing twice is a
 * no-op. Stored on a symbol so a later import doesn't double-wrap.
 */
function installCreateElementPatch(): void {
  if (typeof document === 'undefined') return;
  const installed = (document as unknown as { __cspNoncePatchInstalled?: boolean })
    .__cspNoncePatchInstalled;
  if (installed) return;

  const original = document.createElement.bind(document);

  (document as Document).createElement = function patchedCreateElement(
    this: Document,
    tagName: string,
    options?: ElementCreationOptions,
  ): HTMLElement {
    const element = original(tagName as any, options) as HTMLElement;
    if (NONCE && typeof tagName === 'string' && tagName.toLowerCase() === 'style') {
      element.setAttribute('nonce', NONCE);
    }
    return element;
  } as typeof document.createElement;

  (document as unknown as { __cspNoncePatchInstalled: boolean }).__cspNoncePatchInstalled = true;
}

installCreateElementPatch();

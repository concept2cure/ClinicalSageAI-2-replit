import { getCspNonce } from '../cspNonce';

/**
 * Returns the per-request CSP nonce the server injected into the HTML.
 * Stable for the life of the page, so it's safe to call without
 * useMemo / useEffect. Returns '' if no nonce is set (dev with CSP off,
 * SSR, tests without the meta tag).
 *
 * Pass the result to `<style nonce={...}>` or `<script nonce={...}>`
 * elements you render from React, so they're authorized by the
 * per-request `style-src-elem` / `script-src` directive.
 */
export function useCspNonce(): string {
  return getCspNonce();
}

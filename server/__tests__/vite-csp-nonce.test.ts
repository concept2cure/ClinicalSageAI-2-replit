/**
 * The SPA template carries the request's CSP nonce (server/vite.ts, injectCspNonce).
 *
 * 2026-11-12, the launch screens opened on the built client under the policy a release enforces
 * (docs/evidence/HUMAN-TEST/CLICK-THROUGH/2026-11-11-release-gate/): the build writes an inline theme
 * <style data-vite-theme> into index.html, and only <script> tags were given the nonce. The release's
 * style-src-elem ('self' and the nonce, no 'unsafe-inline') refused that block on every page. A stylesheet defines
 * the same variables, so nothing looked different, but every page load reported a violation, which hides a real one.
 */
import { describe, expect, it } from 'vitest';
import { injectCspNonce } from '../vite';

const NONCE = 'n0nce+/Abc==';
const TEMPLATE = [
  '<!DOCTYPE html><html><head>',
  '<style data-vite-theme="" data-inject-first="">:root { --background: 0 0% 100%; }</style>',
  '<meta name="csp-nonce" content="__CSP_NONCE__" />',
  '<script type="module" crossorigin src="/assets/index.js"></script>',
  '</head><body><div id="root"></div></body></html>',
].join('\n');

describe('the SPA template carries the request nonce', () => {
  it("the build's inline theme <style> gets the nonce, so the release's style-src-elem admits it", () => {
    const page = injectCspNonce(TEMPLATE, NONCE);
    expect(page).toContain(`<style nonce="${NONCE}" data-vite-theme="" data-inject-first="">`);
    expect(page.match(/<style\b(?![^>]*\bnonce=)/gi), 'a <style> was left without the nonce').toBeNull();
  });

  it('scripts get it and the meta placeholder is replaced, as before', () => {
    const page = injectCspNonce(TEMPLATE, NONCE);
    expect(page).toContain(`<script nonce="${NONCE}" type="module" crossorigin src="/assets/index.js">`);
    expect(page).toContain(`<meta name="csp-nonce" content="${NONCE}" />`);
    expect(page).not.toContain('__CSP_NONCE__');
  });

  it('a tag that already has a nonce keeps it, and is not given a second', () => {
    const page = injectCspNonce('<style nonce="kept">a{}</style><script nonce="kept"></script>', NONCE);
    expect(page).toBe('<style nonce="kept">a{}</style><script nonce="kept"></script>');
  });

  it('with no nonce the template is returned as it is', () => {
    expect(injectCspNonce(TEMPLATE, '')).toBe(TEMPLATE);
  });
});

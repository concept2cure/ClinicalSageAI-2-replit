/**
 * Verifies the createElement patch installed by client/src/cspNonce.ts.
 *
 * The patch is the bridge that makes the prod `style-src-elem` (no
 * 'unsafe-inline') actually work — third-party libraries that inject
 * <style> blocks at runtime (Tiptap via createStyleTag, framer-motion's
 * PopChild, vaul's drawer, react-resizable-panels) all go through
 * `document.createElement('style')`. The patch sets the nonce attribute
 * before the element is inserted, so the browser's CSP check sees a
 * valid nonce when the style is added to the DOM.
 *
 * If this test breaks, prod CSS injection from any of those libs will
 * be blocked silently — and our only signal would be the
 * `/api/csp-report` logs, which is a much worse feedback loop.
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const NONCE = 'test-nonce-Abc123';

function installMetaNonce(value: string): void {
  const existing = document.querySelector('meta[name="csp-nonce"]');
  if (existing) existing.remove();
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'csp-nonce');
  meta.setAttribute('content', value);
  document.head.appendChild(meta);
}

function resetPatchState(): void {
  // The patch is idempotent via a flag stashed on document. Strip it so
  // each test re-imports a fresh module evaluation under vitest.resetModules.
  delete (document as unknown as { __cspNoncePatchInstalled?: boolean })
    .__cspNoncePatchInstalled;
  // Restore the prototype createElement so a previous test's wrapper
  // doesn't carry a stale nonce.
  delete (document as { createElement?: typeof document.createElement }).createElement;
}

describe('cspNonce createElement patch', () => {
  beforeEach(() => {
    resetPatchState();
  });

  afterEach(async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
  });

  it('adds nonce attribute to <style> elements created via createElement', async () => {
    installMetaNonce(NONCE);
    await import('../cspNonce');

    const style = document.createElement('style');
    expect(style.getAttribute('nonce')).toBe(NONCE);
  });

  it('leaves other tag names alone', async () => {
    installMetaNonce(NONCE);
    await import('../cspNonce');

    const div = document.createElement('div');
    const span = document.createElement('span');
    expect(div.getAttribute('nonce')).toBeNull();
    expect(span.getAttribute('nonce')).toBeNull();
  });

  it('does not double-install when imported twice', async () => {
    installMetaNonce(NONCE);
    await import('../cspNonce');
    const firstPatched = document.createElement;
    await import('../cspNonce');
    expect(document.createElement).toBe(firstPatched);
  });

  it('skips nonce assignment when the meta tag holds the unreplaced placeholder', async () => {
    installMetaNonce('__CSP_NONCE__');
    await import('../cspNonce');

    const style = document.createElement('style');
    expect(style.getAttribute('nonce')).toBeNull();
  });

  it('skips nonce assignment when the meta tag is empty', async () => {
    installMetaNonce('');
    await import('../cspNonce');

    const style = document.createElement('style');
    expect(style.getAttribute('nonce')).toBeNull();
  });

  it('exposes the nonce on window.__cspNonce', async () => {
    installMetaNonce(NONCE);
    await import('../cspNonce');

    expect((window as Window & { __cspNonce?: string }).__cspNonce).toBe(NONCE);
  });

  it('Tiptap-style flow: createStyleTag-equivalent receives a nonce', async () => {
    // Mirrors @tiptap/core's createStyleTag: createElement('style'),
    // set innerHTML, append to head. The patch must fire before the
    // append (i.e. as part of createElement) so the inserted node is
    // already nonced when the browser does its CSP check.
    installMetaNonce(NONCE);
    await import('../cspNonce');

    const node = document.createElement('style');
    node.setAttribute('data-tiptap-style', '');
    node.innerHTML = '.ProseMirror { white-space: pre-wrap; }';
    document.head.appendChild(node);

    const inserted = document.head.querySelector<HTMLStyleElement>('style[data-tiptap-style]');
    expect(inserted?.getAttribute('nonce')).toBe(NONCE);
    inserted?.remove();
  });
});

/**
 * tests/e2e/design-tokens.spec.ts
 *
 * Regression gate from the 2026-04-26 grey-UI ship. The bug: the global
 * stylesheet did not import `design-system/colors_and_type.css` at the v2
 * app root, so every `var(--accent-100)` resolved to nothing and the entire
 * UI rendered without Claude orange. This spec asserts the canonical tokens
 * resolve at `:root` so a future broken import fails CI instead of shipping
 * silently.
 *
 * Wired into `.github/workflows/sync-design-system.yml` as a follow-up job
 * after every sync of the design-system mirror.
 *
 * Per CLAUDE.md "Token import — the regression that must not repeat".
 */
import { test, expect } from '@playwright/test';

const REQUIRED_TOKENS = [
  // (token name, canonical value)
  ['--accent-100', '#d97757'],
  ['--bg-000', '#faf9f5'],
] as const;

/** Normalize browser-returned color strings so we can compare hex to rgb/oklch. */
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

/** A canonical token resolves correctly if either:
 *  - the literal hex matches (browser kept the hex intact), or
 *  - the rgb()/rgba() form matches the same color (browser normalized).
 */
function colorMatches(actual: string, expectedHex: string): boolean {
  const a = normalize(actual);
  const ehex = normalize(expectedHex);
  if (a === ehex) return true;

  // Convert expected hex → rgb form for comparison.
  const m = ehex.match(/^#([0-9a-f]{6})$/);
  if (!m) return false;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  const expectedRgb = `rgb(${r},${g},${b})`;
  return a.replace(/\s+/g, '') === expectedRgb;
}

test.describe('design-system tokens at :root', () => {
  test('imports colors_and_type.css and resolves the canonical tokens', async ({ page }) => {
    // Land on any v2 surface. The bundle home is the cheapest one because it
    // doesn't require auth and the token sheet is loaded by main.tsx before
    // any component CSS.
    await page.goto('/concept2cure');
    await page.waitForLoadState('networkidle');

    const resolved = await page.evaluate(names => {
      const styles = window.getComputedStyle(document.documentElement);
      return Object.fromEntries(names.map(n => [n, styles.getPropertyValue(n).trim()]));
    }, REQUIRED_TOKENS.map(([n]) => n));

    for (const [token, expected] of REQUIRED_TOKENS) {
      const actual = resolved[token];
      expect(actual, `:root must define ${token}`).not.toBe('');
      expect(
        colorMatches(actual, expected),
        `${token} should resolve to ${expected}, got "${actual}". The token sheet ` +
          'is probably not imported at the app root. Re-check ' +
          'client/src/main.tsx — `design-system/colors_and_type.css` must be ' +
          'imported once, before any component CSS.',
      ).toBe(true);
    }
  });
});

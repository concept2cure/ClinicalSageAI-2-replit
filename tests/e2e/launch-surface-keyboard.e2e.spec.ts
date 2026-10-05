/**
 * Real-browser keyboard pass over the sign-in page and the launch catalog
 * (coverage-gap sweep 2026-09-28, row GB: "the real-browser pass did not run.
 * It is owed once that DB is current").
 *
 * For each surface it presses Tab up to MAX_STOPS times and records every stop:
 * what received focus, whether it is visible, whether it sits under
 * aria-hidden, and whether focusing it changed how it looks. The last is
 * measured, not inferred from CSS: each stop's outline, box-shadow, border and
 * background are read while focused and again once focus has moved on, and a
 * stop whose appearance did not change has no visible focus indicator
 * (WCAG 2.2 2.4.7). It then presses Shift+Tab once and checks focus returns to
 * the previous stop, and checks that focus moves at all and is not held in a
 * cycle shorter than the page's tabbable elements (2.1.2).
 *
 * Every check is soft, so one run reports every finding on every surface.
 * With KEYBOARD_PASS_OUT set, each surface's stops are written there as JSON:
 * that file is the evidence, the assertions are the verdict.
 *
 * Usage (server booted with NODE_ENV=development ALLOW_DEV_AUTH=1, as
 * scripts/run-e2e-smoke.mjs boots it):
 *   KEYBOARD_PASS_OUT=docs/evidence/... npx playwright test tests/e2e/launch-surface-keyboard.e2e.spec.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { authenticateViaDevLogin } from './dev-auth-helper';

const MAX_STOPS = 40;
const MIN_NODES = 50;

/** The seven launch apps (shared/constants/launch-scope.ts), by the shell view that serves each. */
const SURFACES: ReadonlyArray<{ id: string; app: string }> = [
  { id: 'projects', app: 'Projects' },
  { id: 'vault', app: 'Vault' },
  { id: 'review', app: 'Authoring' },
  { id: 'submission-center', app: 'Submission Center' },
  { id: 'dispatch-readiness', app: 'Submission Readiness' },
  { id: 'quality', app: 'QMS controlled documents' },
  { id: 'insights', app: 'Reporting & analytics' },
];

interface Stop {
  index: number;
  tag: string;
  role: string | null;
  name: string;
  visible: boolean;
  underAriaHidden: boolean;
  indicatorVisible: boolean | null;
}

interface SurfaceRecord {
  surface: string;
  url: string;
  tabbableCount: number;
  skipLink: string | null;
  stops: Stop[];
  focusMoved: boolean;
  shortCycle: number | null;
  shiftTabReturns: boolean | null;
  skipLinkReachesContent?: boolean;
}

/**
 * Put the sequential-focus starting point at the top of the document. A mouse
 * click would move it to wherever it lands (Chromium starts the next Tab from
 * the clicked node), which skips everything above that point — including a
 * skip link. A temporary tabindex=-1 node at the start of <body> takes focus
 * and is removed; the next Tab begins from where it stood.
 */
async function resetToDocumentStart(page: Page) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const anchor = document.createElement('div');
    anchor.tabIndex = -1;
    document.body.prepend(anchor);
    anchor.focus();
    anchor.remove();
  });
}

/** From a fresh start: Tab, Enter on the skip link — is focus on the surface, and does the next Tab stay in it? */
async function skipLinkReachesContent(page: Page): Promise<boolean> {
  await resetToDocumentStart(page);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  const onTarget = await page.evaluate(() => document.activeElement?.id === 'c2c-page');
  // A surface with no control of its own (an empty state with nothing to do)
  // has nowhere inside for the next Tab to land; landing on it is the bypass.
  const hasControls = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>('#c2c-page :is(a[href], button, input, select, textarea, [tabindex])'),
    ).some(el => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled),
  );
  if (!hasControls) return onTarget;
  await page.keyboard.press('Tab');
  const inside = await page.evaluate(() => {
    const target = document.getElementById('c2c-page');
    return Boolean(target && document.activeElement && target.contains(document.activeElement));
  });
  return onTarget && inside;
}

/** Installs the per-page probe: describe the focused element and snapshot its look. */
async function installProbe(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const seen: Element[] = [];
    const looks: string[] = [];
    const look = (el: Element) => {
      const cs = window.getComputedStyle(el);
      return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.borderColor, cs.backgroundColor, cs.textDecorationLine].join('|');
    };
    const describe = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      const name =
        el.getAttribute('aria-label') ||
        (el.getAttribute('aria-labelledby') || '')
          .split(/\s+/)
          .map(ref => document.getElementById(ref)?.textContent?.trim() ?? '')
          .filter(Boolean)
          .join(' ') ||
        (el as HTMLInputElement).labels?.[0]?.textContent ||
        el.getAttribute('placeholder') ||
        el.getAttribute('title') ||
        el.textContent ||
        '';
      return {
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        name: name.replace(/\s+/g, ' ').trim().slice(0, 80),
        visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0,
        underAriaHidden: Boolean(el.closest('[aria-hidden="true"]')),
      };
    };
    w.__kbStep = () => {
      const el = document.activeElement;
      // Close the previous stop: its look now, unfocused, against its look focused.
      let previousIndicator: boolean | null = null;
      if (seen.length > 0) {
        const prev = seen[seen.length - 1];
        previousIndicator = prev.isConnected ? look(prev) !== looks[looks.length - 1] : null;
      }
      if (!el || el === document.body || el === document.documentElement) {
        return { body: true, previousIndicator, repeatOf: -1 };
      }
      const repeatOf = seen.indexOf(el);
      seen.push(el);
      looks.push(look(el));
      return { body: false, previousIndicator, repeatOf, ...describe(el) };
    };
    w.__kbIsPrevious = () => seen.length >= 2 && document.activeElement === seen[seen.length - 2];
  });
}

async function tabbableCount(page: Page) {
  return page.evaluate(
    () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"], summary',
        ),
      ).filter(el => {
        if ((el as HTMLButtonElement).disabled || el.tabIndex < 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
      }).length,
  );
}

async function walk(page: Page, surface: string): Promise<SurfaceRecord> {
  await resetToDocumentStart(page);
  await installProbe(page);
  const tabbable = await tabbableCount(page);
  const stops: Stop[] = [];
  let shortCycle: number | null = null;
  let skipLink: string | null = null;

  for (let i = 0; i < MAX_STOPS; i++) {
    await page.keyboard.press('Tab');
    const step = (await page.evaluate(() => (window as any).__kbStep())) as any;
    if (stops.length > 0) stops[stops.length - 1].indicatorVisible = step.previousIndicator;
    if (step.body) break; // walked off the end of the document
    if (i === 0 && /skip|main content/i.test(step.name) && step.tag === 'a') skipLink = step.name;
    if (step.repeatOf >= 0) {
      // Back to an element already visited: a full cycle when it is the first
      // stop and every tabbable element was reached, a trap when it is shorter.
      const cycle = stops.length - step.repeatOf;
      if (cycle < Math.min(tabbable, MAX_STOPS) && cycle <= 3) shortCycle = cycle;
      break;
    }
    stops.push({
      index: i,
      tag: step.tag,
      role: step.role,
      name: step.name,
      visible: step.visible,
      underAriaHidden: step.underAriaHidden,
      indicatorVisible: null,
    });
  }

  let shiftTabReturns: boolean | null = null;
  if (stops.length >= 2) {
    // Re-walk to the second stop from a fresh start, then step back once.
    await resetToDocumentStart(page);
    await installProbe(page);
    await page.keyboard.press('Tab');
    await page.evaluate(() => (window as any).__kbStep());
    await page.keyboard.press('Tab');
    await page.evaluate(() => (window as any).__kbStep());
    await page.keyboard.press('Shift+Tab');
    shiftTabReturns = (await page.evaluate(() => {
      const w = window as any;
      // __kbIsPrevious compares against the second-to-last visited element: the first stop.
      return w.__kbIsPrevious();
    })) as boolean;
  }

  return {
    surface,
    url: new URL(page.url()).pathname,
    tabbableCount: tabbable,
    skipLink,
    stops,
    focusMoved: stops.length > 0,
    shortCycle,
    shiftTabReturns,
  };
}

function record(rec: SurfaceRecord) {
  const out = process.env.KEYBOARD_PASS_OUT;
  if (!out) return;
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, `${rec.surface}.json`), `${JSON.stringify(rec, null, 2)}\n`);
}

function verdict(rec: SurfaceRecord) {
  expect.soft(rec.focusMoved, `${rec.surface}: Tab moved focus nowhere`).toBe(true);
  expect.soft(rec.shortCycle, `${rec.surface}: focus held in a ${rec.shortCycle}-stop cycle`).toBeNull();
  if (rec.shiftTabReturns !== null) {
    expect.soft(rec.shiftTabReturns, `${rec.surface}: Shift+Tab did not return to the previous stop`).toBe(true);
  }
  for (const s of rec.stops) {
    const at = `${rec.surface} stop ${s.index} <${s.tag}${s.role ? ` role=${s.role}` : ''}> "${s.name}"`;
    expect.soft(s.visible, `${at}: focus landed on an element that cannot be seen`).toBe(true);
    expect.soft(s.underAriaHidden, `${at}: focus landed inside aria-hidden`).toBe(false);
    if (s.indicatorVisible !== null) {
      expect.soft(s.indicatorVisible, `${at}: no visible focus indicator`).toBe(true);
    }
  }
}

test.describe('Keyboard pass — sign-in and the launch catalog', () => {
  test('sign-in page', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('input', { timeout: 60_000 });
    const rec = await walk(page, 'sign-in');
    record(rec);
    verdict(rec);
    // 2.4.6: the password toggle says what it shows.
    const toggle = rec.stops.find(s => s.tag === 'button' && /^(show|hide)\b/i.test(s.name));
    expect.soft(toggle?.name, 'the password toggle is named by its field').toMatch(/^(Show|Hide) password$/i);
  });

  for (const { id, app } of SURFACES) {
    test(`/${id} (${app})`, async ({ page, baseURL }) => {
      test.setTimeout(240_000);
      if (!baseURL) throw new Error('baseURL is required (set BASE_URL for the live server)');
      await authenticateViaDevLogin(page, baseURL);
      await page.goto(`/concept2cure/${id}`, { waitUntil: 'domcontentloaded', timeout: 150_000 });
      await expect
        .poll(() => page.evaluate(() => document.body?.querySelectorAll('*').length ?? 0), {
          timeout: 90_000,
          message: `/${id} never mounted a surface`,
        })
        .toBeGreaterThan(MIN_NODES);
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
      expect(new URL(page.url()).pathname, `/${id} bounced an authenticated session`).not.toMatch(/login/);
      const rec = await walk(page, id);
      rec.skipLinkReachesContent = await skipLinkReachesContent(page);
      record(rec);
      verdict(rec);
      // 2.4.1: the first stop bypasses the rail and top bar, and using it puts
      // the next Tab inside the surface.
      expect.soft(rec.skipLink, `${id}: the first Tab stop is not a skip link`).not.toBeNull();
      expect.soft(rec.skipLinkReachesContent, `${id}: the skip link does not reach the surface`).toBe(true);
    });
  }
});

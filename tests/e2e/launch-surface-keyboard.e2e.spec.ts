/**
 * Real-browser keyboard pass over the sign-in page and the launch catalog
 * (coverage-gap sweep 2026-09-28, row GB: "the real-browser pass did not run.
 * It is owed once that DB is current").
 *
 * For each surface it presses Tab up to MAX_STOPS times and records every stop:
 * what received focus, whether it is visible, whether it sits under
 * aria-hidden, and whether focusing it changed how it looks. The last is
 * measured, not inferred from CSS: each stop's painted outline, shadow, border
 * and background are read focused/unfocused. A composer's one enclosing focus
 * frame is compared with its unfocused baseline too. A
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
import { launchQualificationSurfaces } from './launch-catalog';

const MAX_STOPS = 40;
const MIN_NODES = 50;

/** The current launch apps (shared/constants/launch-scope.ts), by the shell view that serves each. */
const SURFACES = launchQualificationSurfaces();

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
  const hasControls = await tabbableCount(page, '#c2c-page :is(a[href], button, input, select, textarea, [tabindex])');
  if (!hasControls) return onTarget;
  await page.keyboard.press('Tab');
  const inside = await page.evaluate(() => {
    const target = document.getElementById('c2c-page');
    return Boolean(target && document.activeElement && target.contains(document.activeElement));
  });
  return onTarget && inside;
}

/** Measure actual paint, including the existing D0 composer's single focus frame. */
async function installPaintProbe(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const transparent = (color: string) => {
      const value = color.trim().toLowerCase();
      if (value === 'transparent') return true;
      if (value.includes('/')) return parseFloat(value.split('/').at(-1)!) === 0;
      const rgba = value.startsWith('rgba(') ? value.slice(5, -1).split(',') : [];
      return rgba.length === 4 && parseFloat(rgba[3]) === 0;
    };
    const painted = (style: string, width: string, color: string) =>
      style !== 'none' && style !== 'hidden' && parseFloat(width) > 0 && !transparent(color);
    const look = (el: Element) => {
      const cs = window.getComputedStyle(el);
      const outline = painted(cs.outlineStyle, cs.outlineWidth, cs.outlineColor)
        ? [cs.outlineStyle, cs.outlineWidth, cs.outlineColor] : null;
      const borders = ['Top', 'Right', 'Bottom', 'Left'].map(side => {
        const [style, width, color] = ['Style', 'Width', 'Color'].map(part => cs.getPropertyValue(`border-${side.toLowerCase()}-${part.toLowerCase()}`));
        return painted(style, width, color) ? [style, width, color] : null;
      });
      const shadow = cs.boxShadow.split(/,(?![^(]*\))/).filter(value => {
        const color = value.match(/(?:rgba?|hsla?|color|lab|lch|oklab|oklch)\([^)]*\)|transparent/i)?.[0] ?? '';
        const lengths = value.replace(color, '').match(/-?\d+(?:\.\d+)?px/g) ?? [];
        return !transparent(color) && lengths.some(length => parseFloat(length) !== 0);
      });
      const decoration = cs.textDecorationLine !== 'none' && !transparent(cs.textDecorationColor)
        ? [cs.textDecorationLine, cs.textDecorationColor] : null;
      return JSON.stringify([outline, borders, shadow, transparent(cs.backgroundColor) ? null : cs.backgroundColor, decoration]);
    };
    const frames = '.landing-composer, .pj-composer, .ct-composer, .rbm-ana-composer, .pj-search';
    const rest = new WeakMap<Element, string>();
    document.querySelectorAll(frames).forEach(frame => rest.set(frame, look(frame)));
    const frameFor = (el: Element) => {
      if (!el.matches('input, textarea, [contenteditable="true"]')) return null;
      const frame = el.closest(frames);
      if (!frame || frame === el) return null;
      const box = frame.getBoundingClientRect(), control = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.left <= control.left && box.top <= control.top &&
        box.right >= control.right && box.bottom >= control.bottom ? frame : null;
    };
    w.__kbLookPaint = look; w.__kbFocusFrame = frameFor; w.__kbFrameRest = rest;
  });
}

/** Installs the per-page probe: describe the focused element and snapshot its look. */
async function installProbe(page: Page) {
  await installPaintProbe(page);
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const seen: Element[] = [];
    const looks: Array<{ self: string; enclosingFrame: boolean }> = [];
    const look = w.__kbLookPaint as (el: Element) => string;
    const frameFor = w.__kbFocusFrame as (el: Element) => Element | null;
    const rest = w.__kbFrameRest as WeakMap<Element, string>;
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
    w.__kbStep = async () => {
      await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
      const el = document.activeElement;
      // Close the previous stop: its look now, unfocused, against its look focused.
      let previousIndicator: boolean | null = null;
      if (seen.length > 0) {
        const prev = seen[seen.length - 1];
        const focused = looks[looks.length - 1];
        previousIndicator = prev.isConnected ? look(prev) !== focused.self || focused.enclosingFrame : null;
      }
      if (!el || el === document.body || el === document.documentElement) {
        return { body: true, previousIndicator, repeatOf: -1 };
      }
      const repeatOf = seen.indexOf(el);
      seen.push(el);
      const frame = frameFor(el);
      looks.push({ self: look(el), enclosingFrame: !!frame && rest.has(frame) && look(frame) !== rest.get(frame) });
      return { body: false, previousIndicator, repeatOf, ...describe(el) };
    };
    w.__kbIsPrevious = () => seen.length >= 2 && document.activeElement === seen[seen.length - 2];
  });
}

async function tabbableCount(page: Page, selector = 'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"], summary') {
  return page.evaluate(
    query =>
      Array.from(
        document.querySelectorAll<HTMLElement>(query),
      ).filter(el => {
        if ((el as HTMLInputElement).type === 'hidden' || (el as HTMLButtonElement).disabled ||
          el.matches(':disabled') || el.tabIndex < 0 || el.hidden || el.closest('[inert]')) return false;
        const r = el.getBoundingClientRect();
        const cs = window.getComputedStyle(el);
        return r.width > 0 && r.height > 0 && el.getClientRects().length > 0 && cs.display !== 'none' &&
          cs.visibility !== 'hidden' && cs.visibility !== 'collapse' && Number(cs.opacity) > 0;
      }).length,
    selector,
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

/** Qualify the measurement itself before using it as a product verdict. */
test.describe('Keyboard probe qualification', () => {
  const skipFixture = (contents: string) => `
    <a href="#c2c-page" onclick="event.preventDefault();document.getElementById('c2c-page').focus()">Skip to content</a>
    <button id="outside">Outside navigation</button>
    <div id="c2c-page" tabindex="-1">${contents}</div>`;

  test('an empty skip target does not acquire controls from hidden file inputs', async ({ page }) => {
    await page.setContent(skipFixture('<input type="file" hidden><input type="hidden">'));
    expect(await skipLinkReachesContent(page)).toBe(true);
  });

  test('the next Tab still has to enter a visible control in the skip target', async ({ page }) => {
    await page.setContent(skipFixture('<input type="file" hidden><button>Current surface action</button>'));
    expect(await skipLinkReachesContent(page)).toBe(true);
  });

  test('a visible control that redirects focus outside still fails the skip check', async ({ page }) => {
    await page.setContent(skipFixture('<button onfocus="document.getElementById(\'outside\').focus()">Broken surface action</button>'));
    expect(await skipLinkReachesContent(page)).toBe(false);
  });

  const focusCases: Array<{ name: string; css: string; visible: boolean; frame?: string }> = [
    { name: 'visible enclosing composer border', css: '.rbm-ana-composer:focus-within { border-color: rgb(173,81,50); }', visible: true },
    { name: 'visible enclosing search frame', frame: 'pj-search', css: '.pj-search:focus-within { border-color: rgb(173,81,50); box-shadow:0 0 0 3px rgb(249,241,225); }', visible: true },
    { name: 'missing focus paint', css: '', visible: false },
    { name: 'transparent outline', css: 'textarea:focus { outline: 2px solid transparent; }', visible: false },
    { name: 'zero-width outline', css: 'textarea:focus { outline: 0 solid rgb(173,81,50); }', visible: false },
    { name: 'zero-width border color', css: 'textarea:focus { border-color: rgb(173,81,50); }', visible: false },
  ];
  for (const example of focusCases) {
    test(`measures ${example.name}`, async ({ page }) => {
      await page.setContent(`<style>
        .focus-frame { width:280px; padding:8px; border:1px solid rgb(127,125,117); }
        textarea { width:240px; height:28px; border:0 solid rgb(127,125,117); outline:none; background:white; }
        ${example.css}
      </style><div class="focus-frame ${example.frame ?? 'rbm-ana-composer'}"><textarea aria-label="Current input"></textarea></div>
      <button>Next action</button>`);
      await resetToDocumentStart(page);
      await installProbe(page);
      await page.getByRole('textbox', { name: 'Current input' }).focus();
      await page.evaluate(() => (window as any).__kbStep());
      await page.getByRole('button', { name: 'Next action' }).focus();
      const step = await page.evaluate(() => (window as any).__kbStep());
      expect(step.previousIndicator).toBe(example.visible);
    });
  }
});

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

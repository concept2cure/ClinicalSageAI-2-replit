#!/usr/bin/env node
/**
 * [visual-qa:a11y] The WCAG failures that ARE visible in static markup.
 *
 * Companion to `check-contrast.mjs`. That one answers SC 1.4.3 because rendered
 * colour needs a browser. This one answers the criteria that need only the DOM —
 * and they are the ones that decide whether the product is operable at all by
 * someone using a screen reader or a keyboard.
 *
 * ── What it checks, and why each one matters ──────────────────────────────────
 *
 *   4.1.2 Name, Role, Value — a control with NO ACCESSIBLE NAME.
 *     An icon-only button announces as "button" and nothing else. A screen
 *     reader user is told a control exists and not what it does. This is the
 *     single most common blocker in a real accessibility audit of a dense
 *     regulatory UI, because dense UIs are full of icon buttons.
 *
 *   3.3.2 Labels or Instructions — an input with no associated label.
 *     `<label>` without `for`, or a bare placeholder, does not name a field.
 *     For a product where a field might be a signature reason or a lot number,
 *     an unnamed input is a data-integrity problem as much as an access one.
 *
 *   1.1.1 Non-text Content — an <img> with no alt attribute at all.
 *     `alt=""` is CORRECT for decoration and is not reported. A MISSING alt is,
 *     because it makes a screen reader read the filename.
 *
 *   1.3.1 Info and Relationships — heading levels that skip (h2 -> h4).
 *     Heading structure is how a screen-reader user navigates a long page, and
 *     these pages are long.
 *
 *   4.1.1 / general — duplicate `id`s.
 *     `aria-labelledby`, `aria-describedby` and `<label for>` all resolve by id.
 *     A duplicate silently points half of them at the wrong element, which is
 *     worse than a missing name because it announces something confidently wrong.
 *
 *   2.4.3 Focus Order — `tabindex` greater than 0.
 *     Any positive tabindex jumps ahead of every natural control on the page and
 *     wrecks the tab order globally, not just locally.
 *
 * ── What it cannot see ────────────────────────────────────────────────────────
 * React event handlers do not survive serialization, so a `<div onClick>` — a
 * control that cannot be reached by keyboard at all — is INVISIBLE here. That is
 * a significant gap and it is stated rather than glossed: it needs the live app.
 * Nothing in this file should be read as "keyboard operability is fine".
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/ac3f78ab-3333-5b63-a6cd-1b4e9abe8f98/scratchpad/pw/node_modules/playwright-core/index.mjs';

const TAG = '[visual-qa:a11y]';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARKUP = path.join(REPO, '.visual-qa/markup');

const AUDIT = () => {
  const root = document.querySelector('.c2c-v2');
  const findings = [];
  const add = (rule, el, detail) =>
    findings.push({
      rule,
      detail,
      selector:
        el.tagName.toLowerCase() +
        (typeof el.className === 'string' && el.className.trim()
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
          : ''),
      html: el.outerHTML.slice(0, 120),
    });

  /** Accessible name, computed the way an AT would resolve the common cases. */
  const accName = (el) => {
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const t = labelledby
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .join(' ')
        .trim();
      if (t) return t;
    }
    const label = el.getAttribute('aria-label')?.trim();
    if (label) return label;
    const text = el.textContent?.trim();
    if (text) return text;
    const title = el.getAttribute('title')?.trim();
    if (title) return title;
    // An icon button is named if its SVG carries <title> or aria-label.
    const svgTitle = el.querySelector('svg > title')?.textContent?.trim();
    if (svgTitle) return svgTitle;
    const svgLabel = el.querySelector('svg[aria-label]')?.getAttribute('aria-label')?.trim();
    if (svgLabel) return svgLabel;
    if (el.tagName === 'INPUT') {
      const v = el.getAttribute('value')?.trim();
      if (v && ['submit', 'button', 'reset'].includes(el.getAttribute('type') ?? '')) return v;
    }
    return '';
  };

  // 4.1.2 — controls with no accessible name.
  for (const el of root.querySelectorAll('button, a[href], [role="button"], [role="link"], [role="tab"], [role="radio"], [role="checkbox"], [role="menuitem"]')) {
    if (el.getAttribute('aria-hidden') === 'true') continue;
    if (!accName(el)) add('4.1.2 control has no accessible name', el, el.tagName.toLowerCase());
  }

  // 3.3.2 — form fields with no label.
  for (const el of root.querySelectorAll('input, select, textarea')) {
    const type = (el.getAttribute('type') ?? '').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;
    if (el.getAttribute('aria-hidden') === 'true') continue;
    const id = el.getAttribute('id');
    const hasFor = id ? !!root.querySelector(`label[for="${CSS.escape(id)}"]`) : false;
    const wrapped = !!el.closest('label');
    if (hasFor || wrapped || accName(el)) continue;
    add(
      '3.3.2 form field has no label',
      el,
      el.getAttribute('placeholder') ? 'placeholder only — a placeholder is not a label' : 'no label, no aria-label',
    );
  }

  // 1.1.1 — images with alt entirely absent (alt="" is correct for decoration).
  for (const el of root.querySelectorAll('img')) {
    if (!el.hasAttribute('alt')) add('1.1.1 img has no alt attribute', el, el.getAttribute('src') ?? '');
  }

  // 1.3.1 — skipped heading levels.
  const levels = [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((el) => ({
    el, n: Number(el.tagName[1]),
  }));
  for (let i = 1; i < levels.length; i++) {
    const jump = levels[i].n - levels[i - 1].n;
    if (jump > 1) {
      add('1.3.1 heading level skipped', levels[i].el, `h${levels[i - 1].n} -> h${levels[i].n}`);
    }
  }

  // 4.1.1 — duplicate ids break every aria-*by reference that resolves by id.
  const seen = new Map();
  for (const el of root.querySelectorAll('[id]')) {
    const id = el.getAttribute('id');
    if (seen.has(id)) add('4.1.1 duplicate id', el, `#${id}`);
    else seen.set(id, el);
  }

  // 2.4.3 — a positive tabindex reorders the WHOLE page, not just its subtree.
  for (const el of root.querySelectorAll('[tabindex]')) {
    const t = Number(el.getAttribute('tabindex'));
    if (Number.isFinite(t) && t > 0) add('2.4.3 positive tabindex', el, `tabindex=${t}`);
  }

  return findings;
};

const files = fs.existsSync(MARKUP)
  ? fs.readdirSync(MARKUP).filter((f) => f.endsWith('.html')).sort()
  : [];
if (files.length === 0) {
  console.error(`${TAG} no captured markup in .visual-qa/markup — run the capture specs first.`);
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// Prove the audit detects what it claims to, and does NOT flag the correct forms.
{
  const p = await ctx.newPage();
  await p.setContent(
    `<div class="c2c-v2">
       <button></button>
       <button aria-label="Close">x</button>
       <img src="a.png">
       <img src="b.png" alt="">
       <input type="text">
       <label for="ok">Named</label><input id="ok" type="text">
       <div tabindex="3"></div>
       <h2>a</h2><h4>b</h4>
     </div>`,
    { waitUntil: 'load' },
  );
  const probe = await p.evaluate(AUDIT);
  await p.close();
  const rules = probe.map((f) => f.rule);
  const expected = [
    '4.1.2 control has no accessible name',
    '3.3.2 form field has no label',
    '1.1.1 img has no alt attribute',
    '1.3.1 heading level skipped',
    '2.4.3 positive tabindex',
  ];
  const missing = expected.filter((e) => !rules.includes(e));
  // The false-positive half matters more: a labelled input, an aria-labelled
  // button and a decorative alt="" must NOT be reported.
  const falsePositives = probe.filter((f) => /aria-label="Close"|alt=""|id="ok"/.test(f.html));
  if (missing.length || falsePositives.length) {
    console.error(`${TAG} SELF-CHECK FAILED — the audit does not measure what it claims.`);
    if (missing.length) console.error(`${TAG}   did not detect: ${missing.join(', ')}`);
    if (falsePositives.length) {
      console.error(`${TAG}   false positives on correct markup: ${falsePositives.map((f) => f.rule).join(', ')}`);
    }
    await browser.close();
    process.exit(2);
  }
  console.log(`${TAG} self-check OK — detects all 5 seeded failures, flags none of the 3 correct forms.`);
}

const byRule = new Map();
const bySurface = [];
const examples = new Map();
const allFindings = [];

for (const file of files) {
  const name = file.replace(/\.html$/, '');
  const markup = fs.readFileSync(path.join(MARKUP, file), 'utf8');
  const p = await ctx.newPage();
  await p.setContent(`<!doctype html><html><body><div class="c2c-v2 shell">${markup}</div></body></html>`, {
    waitUntil: 'load',
  });
  const findings = await p.evaluate(AUDIT);
  await p.close();

  if (findings.length) bySurface.push({ name, n: findings.length });
  for (const f of findings) {
    allFindings.push({ ...f, surface: name });
    byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
    if (!examples.has(f.rule)) examples.set(f.rule, { ...f, surface: name });
  }
}

await browser.close();

const total = [...byRule.values()].reduce((a, b) => a + b, 0);
console.log(`\n${TAG} ${files.length} surfaces · ${total} findings.\n`);

if (total === 0) {
  console.log('  No statically-detectable WCAG failures found.');
} else {
  console.log('  BY CRITERION:');
  for (const [rule, n] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(5)}  ${rule}`);
    const ex = examples.get(rule);
    console.log(`           e.g. ${ex.selector} — ${ex.detail}  [${ex.surface}]`);
  }
  // `--all` prints every finding, because 21 is a fixable number and a summary
  // you cannot act on is a summary that does not get acted on.
  if (process.argv.includes('--all')) {
    console.log('\n  EVERY FINDING:');
    for (const f of allFindings) {
      console.log(`    [${f.surface}] ${f.rule}`);
      console.log(`      ${f.detail}`);
      console.log(`      ${f.html}`);
    }
  }

  console.log('\n  WORST SURFACES:');
  for (const s of bySurface.sort((a, b) => b.n - a.n).slice(0, 12)) {
    console.log(`    ${String(s.n).padStart(5)}  ${s.name}`);
  }
}

console.log(
  `\n${TAG} BLIND SPOT, stated deliberately: React event handlers do not survive\n` +
    `${TAG} serialization, so a <div onClick> — a control unreachable by keyboard —\n` +
    `${TAG} is invisible here. Nothing above should be read as "keyboard operability\n` +
    `${TAG} is fine". That needs the live app and, ultimately, a human.`,
);

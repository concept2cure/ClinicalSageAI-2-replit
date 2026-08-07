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
import { launchChromium } from './playwright.mjs';
import { assertCaptureIsFresh } from './capture-freshness.mjs';
import {
  auditA11y,
  SELF_CHECK_HTML,
  SELF_CHECK_EXPECTED,
  SELF_CHECK_MUST_NOT_FLAG,
} from './a11y-rules.mjs';

const TAG = '[visual-qa:a11y]';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARKUP = path.join(REPO, '.visual-qa/markup');

/*
 * The rules are NOT redefined here.
 *
 * This file used to carry its own full copy of the audit, and the two had
 * already drifted — a different escaping strategy for the label lookup, a
 * different html truncation length, a Map where the other used a Set. That is
 * precisely the failure `a11y-rules.mjs` was extracted to prevent, and a rule
 * that disagrees with the CI ratchet is worse than no rule: the two runs argue
 * and a reader has no way to know which one is the product's real state.
 *
 * The shared function cannot simply be called from here. `page.evaluate`
 * serializes the function it is handed and runs it inside the browser, where
 * this module's imports do not exist. So the shared function's SOURCE is
 * injected once per context and invoked by name — one definition, two runtimes.
 */
const AUDIT = () =>
  // eslint-disable-next-line no-undef -- installed by ctx.addInitScript below
  window.__auditA11y(document.querySelector('.c2c-v2') || document.body, document);

const files = fs.existsSync(MARKUP)
  ? fs.readdirSync(MARKUP).filter((f) => f.endsWith('.html')).sort()
  : [];
if (files.length === 0) {
  console.error(`${TAG} no captured markup in .visual-qa/markup — run the capture specs first.`);
  process.exit(1);
}

assertCaptureIsFresh(TAG, MARKUP, REPO);

const browser = await launchChromium();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript({ content: `window.__auditA11y = ${auditA11y.toString()};` });

// Prove the audit detects what it claims to, and does NOT flag the correct forms.
// Same markup and same expectations as the CI ratchet, from the same module.
{
  const p = await ctx.newPage();
  await p.setContent(`<div class="c2c-v2">${SELF_CHECK_HTML}</div>`, { waitUntil: 'load' });
  const probe = await p.evaluate(AUDIT);
  await p.close();
  const rules = probe.map((f) => f.rule);
  const missing = SELF_CHECK_EXPECTED.filter((e) => !rules.includes(e));
  // The false-positive half matters more: a tool that flags correct markup
  // teaches people to ignore it, and then it protects nothing.
  const falsePositives = probe.filter((f) => SELF_CHECK_MUST_NOT_FLAG.some((re) => re.test(f.html)));
  if (missing.length || falsePositives.length) {
    console.error(`${TAG} SELF-CHECK FAILED — the audit does not measure what it claims.`);
    if (missing.length) console.error(`${TAG}   did not detect: ${missing.join(', ')}`);
    if (falsePositives.length) {
      console.error(`${TAG}   false positives on correct markup: ${falsePositives.map((f) => f.rule).join(', ')}`);
    }
    await browser.close();
    process.exit(2);
  }
  console.log(
    `${TAG} self-check OK — detects all ${SELF_CHECK_EXPECTED.length} seeded failures, ` +
      `flags none of the ${SELF_CHECK_MUST_NOT_FLAG.length} correct forms.`,
  );
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

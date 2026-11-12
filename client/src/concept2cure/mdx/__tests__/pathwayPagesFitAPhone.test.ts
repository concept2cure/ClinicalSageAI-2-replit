/**
 * D8 slice 2b (founder decision P-128): a pathway page does not scroll sideways on a phone.
 *
 * Measured at 390 px on 2026-11-12 (docs/evidence/DESIGN/D8/slice-2b/): the 510(k), PMA and Diagnostics pages'
 * container scrolled to 710, 712 and 720 px. Five layouts ran past the edge and carried their controls with them:
 * the tab row, the stage strip (and PMA's phases), the two-column body, the four health cards, and the filing
 * panel's row of two selects and a button. On the 510(k) screen 47 controls were past the edge.
 *
 * This is a text comparison, as pageHeaderWrapsAtPhoneWidth.test.ts is: jsdom does not lay out. It pins what the
 * sheets say. What the screens do is measured in the running app, in the evidence folder.
 *
 * Nothing a screen shows is removed (P-122): every tab, stage, panel, card and control is still drawn. Wider than a
 * phone the layouts are as they were.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sheet = (name: string): string => readFileSync(resolve(__dirname, '..', name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const app = sheet('app.css');
const tabs = sheet('pathway-tabs.css');
const escape = (selector: string): string => selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The declarations of the first rule whose selector is exactly this; '' when the text has none. */
const rule = (selector: string, within: string): string => {
  // nosemgrep: detect-non-literal-regexp -- the selector is a literal of this file, escaped
  const found = new RegExp(`(?:^|[{},])\\s*${escape(selector)}\\s*\\{([^}]*)\\}`, 'm').exec(within);
  return found ? found[1] : '';
};
/** The bodies of every `@media (max-width: 640px)` block of the device sheet, joined. */
const phone = [...app.matchAll(/@media \(max-width: 640px\)\s*\{((?:[^{}]*\{[^}]*\})*)\s*\}/g)].map((m) => m[1]).join('\n');
/** The device sheet without its phone blocks: what a wider screen gets. */
const wide = app.replace(/@media \(max-width: 640px\)\s*\{(?:[^{}]*\{[^}]*\})*\s*\}/g, '');

describe('a pathway page on a phone (D8 slice 2b)', () => {
  it('the tab row scrolls inside itself', () => {
    expect(rule('.mdx-shell .pwt-bar', tabs)).toMatch(/overflow-x:\s*auto/);
  });

  it.each(['.mdx-shell .stage-strip', '.mdx-shell .phases'])('%s scrolls inside itself at phone width', (selector) => {
    expect(rule(selector, phone)).toMatch(/overflow-x:\s*auto/);
  });

  it('the two-column body stacks at phone width', () => {
    expect(rule('.mdx-shell .col2', phone)).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it('the health cards go two to a row at phone width', () => {
    expect(rule('.mdx-shell .health', phone)).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  });

  it('a section header and its row of controls wrap at phone width, and no select is wider than the screen', () => {
    expect(rule('.mdx-shell .section-hdr', phone)).toMatch(/flex-wrap:\s*wrap/);
    expect(rule('.mdx-shell .section-hdr > div', phone)).toMatch(/flex-wrap:\s*wrap/);
    expect(rule('.mdx-shell .section-hdr select', phone)).toMatch(/max-width:\s*100%/);
  });

  it('wider than a phone the layouts are as they were', () => {
    expect(rule('.mdx-shell .col2', wide)).toMatch(/grid-template-columns:\s*1\.4fr 1fr/);
    expect(rule('.mdx-shell .health', wide)).toMatch(/grid-template-columns:\s*repeat\(4,\s*1fr\)/);
    expect(rule('.mdx-shell .stage-strip', wide)).toMatch(/grid-template-columns:\s*repeat\(7,\s*1fr\)/);
    expect(rule('.mdx-shell .stage-strip', wide)).not.toMatch(/overflow/);
    expect(rule('.mdx-shell .section-hdr', wide)).not.toMatch(/flex-wrap/);
  });
});

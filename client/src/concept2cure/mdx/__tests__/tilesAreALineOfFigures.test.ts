/**
 * D8 slice 3 (founder decision P-128): a device screen's figures are one quiet line, not a row of tiles.
 *
 * ONE_DESIGN_PLAN §2 retires stat tiles as permanent chrome. P-122 keeps every figure a screen shows: so the tiles
 * become the line of figures the canonical register has (`.c2c-v2 .reg-kpis`, v2/styles/app-v2.css; Quality's
 * registers, P-122 item 3). Each figure keeps its label, its unit, its tone and its note, in the order the markup gives them.
 *
 * Measured at 390 px on 2026-11-12 (docs/evidence/DESIGN/D8/slice-3/): four tiles stacked one to a row took the
 * first screen, so the work under them started below the fold.
 *
 * This is a text comparison, as the other D8 sheet tests are: jsdom does not lay out. What the screens look like is
 * in the evidence folder, from the running app.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const escape = (selector: string): string => selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The declarations of the first rule whose selector is exactly this; '' when the sheet has none. */
const rule = (selector: string, within: string = css): string => {
  // nosemgrep: detect-non-literal-regexp -- the selector is a literal of this file, escaped
  const found = new RegExp(`(?:^|[{},])\\s*${escape(selector)}\\s*\\{([^}]*)\\}`, 'm').exec(within);
  return found ? found[1] : '';
};
/** The bodies of every `@media (max-width: 640px)` block, joined: what a phone gets. */
const phone = [...css.matchAll(/@media \(max-width: 640px\)\s*\{((?:[^{}]*\{[^}]*\})*)\s*\}/g)].map((m) => m[1]).join('\n');

describe('a device screen’s figures (D8 slice 3)', () => {
  it('are a line that wraps, not a grid of equal tiles', () => {
    const row = rule('.mdx-shell .metrics-row');
    expect(row).toMatch(/display:\s*flex/);
    expect(row).toMatch(/flex-wrap:\s*wrap/);
    expect(row).not.toMatch(/grid-template-columns/);
  });

  it('on a phone, the space between figures is wider than the space inside one', () => {
    const between = Number(/row-gap:\s*(\d+)px/.exec(rule('.mdx-shell .metrics-row', phone))?.[1]);
    const inside = Number(/row-gap:\s*(\d+)px/.exec(rule('.mdx-shell .metric-card'))?.[1]);
    expect(between).toBeGreaterThanOrEqual(20);
    expect(inside).toBeLessThan(between);
  });

  it('nothing runs out of a figure: its column keeps the figure\'s width and the label may wrap', () => {
    const card = rule('.mdx-shell .metric-card');
    expect(card).toMatch(/grid-template-columns:\s*minmax\(0,\s*max-content\)\s+minmax\(min-content,\s*1fr\)/);
    expect(rule('.mdx-shell .metric-label')).toMatch(/min-width:\s*0/);
    expect(rule('.mdx-shell .metric-label')).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('on a phone each figure is a wrapping line: the figure moves under its label rather than out of its space', () => {
    expect(rule('.mdx-shell .metric-card', phone)).toMatch(/display:\s*flex/);
    expect(rule('.mdx-shell .metric-card', phone)).toMatch(/flex-wrap:\s*wrap/);
    expect(rule('.mdx-shell .metric-val', phone)).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule('.mdx-shell .metric-meta', phone)).toMatch(/flex-basis:\s*100%/);
  });

  it('a figure has no box: no border, no ground, no padding', () => {
    const card = rule('.mdx-shell .metric-card');
    expect(card).toMatch(/border:\s*0/);
    expect(card).toMatch(/background:\s*none/);
    expect(card).toMatch(/padding:\s*0/);
  });

  it('the figure is the canonical register figure: the section size, weight 600, not the serif', () => {
    const val = rule('.mdx-shell .metric-val');
    expect(val).toMatch(/font-size:\s*var\(--fs-section\)/);
    expect(val).toMatch(/font-weight:\s*600/);
    expect(val).not.toMatch(/font-serif/);
  });

  it('the label is the canonical small label and the note a caption', () => {
    expect(rule('.mdx-shell .metric-label')).toMatch(/font-size:\s*var\(--fs-small\)/);
    expect(rule('.mdx-shell .metric-meta')).toMatch(/font-size:\s*var\(--fs-caption\)/);
  });

  it('still says a figure’s tone on the figure', () => {
    expect(rule('.mdx-shell .metric-card[data-tone="err"] .metric-val')).toMatch(/color:\s*var\(--error\)/);
    expect(rule('.mdx-shell .metric-card[data-tone="warn"] .metric-val')).toMatch(/color:\s*var\(--warning\)/);
  });

  it('keeps the label, the figure, its unit and its note as rules, none hidden (P-122)', () => {
    for (const selector of ['.mdx-shell .metrics-row', '.mdx-shell .metric-card', '.mdx-shell .metric-label', '.mdx-shell .metric-val', '.mdx-shell .metric-val .unit', '.mdx-shell .metric-meta']) {
      const body = rule(selector);
      expect(body, selector).not.toBe('');
      expect(body, selector).not.toMatch(/display:\s*none|visibility:\s*hidden/);
    }
  });
});

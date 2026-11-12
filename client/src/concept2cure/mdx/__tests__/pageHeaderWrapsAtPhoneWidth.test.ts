/**
 * D8 slice 2 (founder decision P-126): a device screen's header is laid out as the canonical page header is
 * (`.c2c-v2 .ph`, v2/styles/app-v2.css): its text block and its actions wrap, and at phone width each takes a
 * full line.
 *
 * Measured at 390 px on 2026-11-12 (docs/evidence/DESIGN/D8/slice-2/): the header was one row that never wrapped.
 * The Pre-Sub manager's title stood in a 113 px column beside "Ask AnA to start a Q-Sub", which ran from 284 to
 * 472 px on a 390 px screen. On Post-market vigilance the host's context line (the way back to the project, the
 * project's name and the scope note) stood as three narrow columns 336 px tall, and the first figure was at 965 px,
 * below the fold.
 *
 * This is a text comparison, as sharedLookRetiredPatterns.test.ts is: jsdom does not lay out. It pins what the
 * sheet says. What the screens do is measured in the running app, in the evidence folder.
 *
 * Nothing a screen shows is removed (P-122): every word and every action of the header is still drawn.
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
/** The bodies of every `@media (max-width: 640px)` block, joined. */
const phone = [...css.matchAll(/@media \(max-width: 640px\)\s*\{((?:[^{}]*\{[^}]*\})*)\s*\}/g)].map((m) => m[1]).join('\n');

describe('the device header’s layout (D8 slice 2)', () => {
  it('wraps, with its actions level with the top of its text', () => {
    const body = rule('.mdx-shell .page-header');
    expect(body).toMatch(/flex-wrap:\s*wrap/);
    expect(body).toMatch(/align-items:\s*flex-start/);
  });

  it('gives the text block the canonical floor, so the actions wrap under it before they squeeze it', () => {
    const body = rule('.mdx-shell .page-header > :first-child');
    expect(body).toMatch(/flex:\s*1 1 0%/);
    expect(body).toMatch(/min-width:\s*min\(420px,\s*100%\)/);
  });

  it('at phone width gives the actions a full line, lets a row of actions wrap, and sets the canonical phone title', () => {
    expect(rule('.mdx-shell .page-header > :not(:first-child)', phone)).toMatch(/flex:\s*1 1 100%/);
    expect(rule('.mdx-shell .page-actions', phone)).toMatch(/flex-wrap:\s*wrap/);
    expect(rule('.mdx-shell .page-title', phone)).toMatch(/font-size:\s*22px/);
  });

  it('wider than a phone leaves a row of actions on one line, as it was', () => {
    expect(rule('.mdx-shell .page-actions')).not.toMatch(/flex-wrap/);
  });

  it('keeps the header, its eyebrow, title, description and actions as rules, none hidden', () => {
    for (const selector of ['.mdx-shell .page-header', '.mdx-shell .page-eyebrow', '.mdx-shell .page-title', '.mdx-shell .page-sub', '.mdx-shell .page-actions']) {
      const body = rule(selector);
      expect(body, selector).not.toBe('');
      expect(body, selector).not.toMatch(/display:\s*none|visibility:\s*hidden/);
    }
  });
});

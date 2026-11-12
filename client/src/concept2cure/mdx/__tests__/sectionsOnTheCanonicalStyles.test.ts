/**
 * D8 slice 4 (founder decision P-128): a device screen's section headings, sub-lines, the Audit trail tab's labels
 * and the Pre-Sub detail's empty state take the canonical styles.
 *
 * Read in the running app on 2026-11-12, every device screen on arrival and with each tab opened
 * (docs/evidence/DESIGN/D8/slice-4/):
 *   - section headings were drawn four ways: a 17 px serif (six screens), a 14 px serif set inline, 14 px sans and,
 *     on the pathway header, 14 px sans. The canonical is one: `.c2c-v2 .pj-sec-h h2`, the section size, weight 600,
 *     sans (v2/styles/app-v2.css). ONE_DESIGN_PLAN §2 keeps the serif for the page title;
 *   - a heading's sub-line was 11 px in --text-400; the canonical `.pj-sec-h .sec-sub` is the small size in
 *     --text-300. Two rules set `.section-sub`, the later winning;
 *   - the Audit trail tab of 510(k), PMA and Diagnostics read "THURSDAY, NOVEMBER 12", "HASH CHAIN" and
 *     "PREV · THIS", uppercase and letter-spaced (§2: sentence case everywhere). The keys are written "prev", "this"
 *     and "seal" in markup another session holds, so their first letter is capitalised by style;
 *   - the Pre-Sub detail's empty state was a dashed, tinted box with its own type; the canonical empty state
 *     (`.c2c-v2 .c2c-empty-state`) has no box.
 * Table headings already matched the canonical and are not changed.
 *
 * A text comparison, as the other D8 sheet tests are; what the screens do is measured in the running app.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sheet = (name: string): string => readFileSync(resolve(__dirname, '..', name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const app = sheet('app.css');
const tabs = sheet('pathway-tabs.css');
const escape = (selector: string): string => selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The declarations of every rule whose selector list contains exactly this selector, joined in sheet order. */
const rules = (selector: string, within: string): string[] => {
  // nosemgrep: detect-non-literal-regexp -- the selector is a literal of this file, escaped
  const re = new RegExp(`(?:^|[{}])\\s*((?:[^{}]*,\\s*)?${escape(selector)}(?:\\s*,[^{}]*)?)\\s*\\{([^}]*)\\}`, 'gm');
  return [...within.matchAll(re)].filter((m) => m[1].split(',').map((s) => s.trim()).includes(selector)).map((m) => m[2]);
};
const rule = (selector: string, within: string = app): string => rules(selector, within).join(';');

describe('device sections on the canonical styles (D8 slice 4)', () => {
  it.each(['.mdx-shell .section-head h2', '.mdx-shell .eng-awareness-head h2', '.mdx-shell .section-title'])(
    '%s is the canonical section heading: the section size, weight 600, not the serif',
    (selector) => {
      const body = rule(selector);
      expect(body).toMatch(/font-size:\s*var\(--fs-section\)/);
      expect(body).toMatch(/font-weight:\s*600/);
      expect(body).not.toMatch(/font-serif/);
    },
  );

  it('a sub-line is set once, in the small size and the muted text', () => {
    expect(rules('.mdx-shell .section-sub', app)).toHaveLength(1);
    expect(rule('.mdx-shell .section-sub')).toMatch(/font-size:\s*var\(--fs-small\)/);
    expect(rule('.mdx-shell .section-sub')).toMatch(/color:\s*var\(--text-300\)/);
  });

  it.each(['.mdx-shell .audit-day', '.mdx-shell .audit-chain-label', '.mdx-shell .audit-chain-k'])(
    '%s is sentence case, not letter-spaced',
    (selector) => {
      const body = rule(selector, tabs);
      expect(body).not.toBe('');
      expect(body).not.toMatch(/text-transform:\s*uppercase/);
      expect(body).not.toMatch(/letter-spacing:\s*0\.\d+em/);
    },
  );

  it('the chain keys, written lowercase in markup, read with a capital first letter', () => {
    expect(rule('.mdx-shell .audit-chain-k::first-letter', tabs)).toMatch(/text-transform:\s*uppercase/);
  });

  it('the Pre-Sub detail’s empty state has no box, as the canonical empty state', () => {
    const body = rule('.mdx-shell .ps-empty');
    expect(body).toMatch(/border:\s*0/);
    expect(body).toMatch(/background:\s*none/);
    expect(rule('.mdx-shell .ps-empty-t')).toMatch(/font-size:\s*var\(--fs-body\)/);
    expect(rule('.mdx-shell .ps-empty-s')).toMatch(/font-size:\s*var\(--fs-small\)/);
  });

  /* Measured 2026-11-12: on all 114 rows of the 510(k) Audit trail tab the event code ran under the person's name. */
  it('an audit row’s event code takes its own width and ends in an ellipsis, so it never runs under the name', () => {
    expect(rule('.mdx-shell .audit-row', tabs)).toMatch(/grid-template-columns:\s*56px\s+minmax\(0,\s*max-content\)\s+minmax\(0,\s*1fr\)\s+auto/);
    const chip = rule('.mdx-shell .audit-chip', tabs);
    expect(chip).toMatch(/overflow:\s*hidden/);
    expect(chip).toMatch(/text-overflow:\s*ellipsis/);
    expect(chip).toMatch(/max-width:\s*\d+px/);
  });

  /* Eight rules of the pathway sheet set uppercase; this slice takes the three a person meets on the Audit trail tab.
     A `::first-letter` capital is sentence case, not uppercase, and is not counted. */
  it('the pathway sheet sets uppercase on no more than the five rules this slice leaves', () => {
    const upper = [...tabs.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => /text-transform:\s*uppercase/.test(m[2]) && !/::first-letter/.test(m[1]));
    expect(upper.length).toBeLessThanOrEqual(5);
  });
});

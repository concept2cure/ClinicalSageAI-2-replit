/**
 * D8 slice 2c (founder decision P-128): text a person reads on a device screen is not drawn in the disabled ink.
 *
 * Measured in the running app on 2026-11-12 (docs/evidence/DESIGN/D8/slice-2c/, and first by the phone and dark
 * audit, docs/evidence/HUMAN-TEST/PHONE-DARK/2026-11-12/): on the 510(k) screen the eSTAR list's 38 "empty" pills
 * were 1.91:1 in light and 2.41:1 in dark, and its 36 section numbers 3.90:1 and 4.29:1. WCAG AA asks 4.5:1.
 *
 * `--text-500` is the disabled ink (`--ink-disabled`, design-system/colors_and_type.css). "empty" is not a disabled
 * control: it is the state of a section a person has to fill. The pill's dashed border still says it is empty.
 *
 * This is a text comparison, as the other D8 sheet tests are. The ratios are measured in the running app.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sheet = (name: string): string => readFileSync(resolve(__dirname, '..', name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const app = sheet('app.css');
const escape = (selector: string): string => selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The declarations of the first rule whose selector is exactly this; '' when the sheet has none. */
const rule = (selector: string): string => {
  // nosemgrep: detect-non-literal-regexp -- the selector is a literal of this file, escaped
  const found = new RegExp(`(?:^|[{},])\\s*${escape(selector)}\\s*\\{([^}]*)\\}`, 'm').exec(app);
  return found ? found[1] : '';
};

describe('device text and the disabled ink (D8 slice 2c)', () => {
  it.each(['.mdx-shell .status-pill.empty', '.mdx-shell .status-pill.na'])('%s is drawn in the muted ink, on the same ground', (selector) => {
    const body = rule(selector);
    expect(body).toMatch(/background:\s*var\(--bg-100\)/);
    expect(body).toMatch(/(?:^|[;\s])color:\s*var\(--text-300\)/);
    expect(body).not.toMatch(/var\(--text-500\)/);
  });

  it('the empty pill still says it is empty by its dashed border', () => {
    expect(rule('.mdx-shell .status-pill.empty')).toMatch(/border-style:\s*dashed/);
  });

  it('the eSTAR section number is drawn in the muted ink', () => {
    expect(rule('.mdx-shell .estar-num')).toMatch(/(?:^|[;\s])color:\s*var\(--text-300\)/);
  });

  /* The count of declarations that drew text in the disabled ink was held here from slice 2c. From 2026-11-12 the
     shared v2/__tests__/faintestTextTier.test.ts reads the device stylesheets too and refuses any readable use, which
     is stricter, so the count is not kept twice. */
});

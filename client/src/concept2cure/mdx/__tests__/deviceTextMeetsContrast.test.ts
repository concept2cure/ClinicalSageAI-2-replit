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
/** How many declarations draw text in the disabled ink (`color:`, not `background:` or `border-color:`). */
const disabledInkTexts = (css: string): number => (css.match(/(?:^|[;{\s])color:\s*var\(--text-500\)/g) ?? []).length;

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

  /* Seven declarations drew text in the disabled ink in app.css, two in pathway-tabs.css and one in files-tree.css.
     The two a screen shows on arrival are gone. The other eight style states this slice did not open (a project
     list's "no blocker", an editor's provenance label, a dossier drawer's hints, a truncated file path); each is
     measured when its state is opened. The count only goes down. */
  it('no more text is drawn in the disabled ink than this slice leaves', () => {
    expect(disabledInkTexts(app)).toBeLessThanOrEqual(5);
    expect(disabledInkTexts(sheet('pathway-tabs.css'))).toBeLessThanOrEqual(2);
    expect(disabledInkTexts(sheet('files-tree.css'))).toBeLessThanOrEqual(1);
  });
});

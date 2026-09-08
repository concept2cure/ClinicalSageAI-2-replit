/**
 * The AnA rail must not out-size a phone or crush a tablet.
 *
 * ── The defect this pins ─────────────────────────────────────────────────────
 * The shell grid is `var(--rail) 1fr var(--ana)`. The rail column already had a
 * phone-width rule (≤640px: collapsed strip + fixed drawer over a scrim). The
 * AnA column had none: with the rail open on a 390px screen the grid was
 * `56px | 0px | 380px` at 430px — no content column at all — and at 390px the
 * conversation rail was wider than the viewport with its composer past the
 * right edge; at 768px the content column was 332px. Measured in the
 * validation report (docs/reports/ANA_UI_VALIDATION_REPORT_2026-09-06.md).
 *
 * The browser walk is the real proof; this test keeps the rule from being
 * dropped in a stylesheet tidy-up. It reads the phone-width block of
 * app-v2.css and asserts the four facts that make the drawer work.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const css = fs.readFileSync(path.join(ROOT, 'client/src/concept2cure/v2/styles/app-v2.css'), 'utf8');
const v2app = fs.readFileSync(path.join(ROOT, 'client/src/concept2cure/v2/V2App.tsx'), 'utf8');

/** The ≤900px block that carries the AnA drawer rules (the rail's own drawer lives in the ≤640px block). */
function phoneBlock(): string {
  const start = css.indexOf('@media (max-width: 900px)');
  expect(start, 'the narrow-width AnA block exists').toBeGreaterThan(-1);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error('unbalanced phone-width block');
}

describe('AnA rail at phone width', () => {
  const block = phoneBlock();

  it('gives the AnA column up when the rail is open (the grid no longer reserves 380px)', () => {
    expect(block).toMatch(/\.c2c-v2\.shell\[data-ana-open="true"\]\s*\{\s*grid-template-columns:\s*var\(--rail\)\s+1fr\s+0;?\s*\}/);
    expect(block).toMatch(/\[data-ana-open="true"\]\[data-collapsed="true"\]\s*\{\s*grid-template-columns:\s*var\(--rail-collapsed\)\s+1fr\s+0;?\s*\}/);
  });

  it('paints the open rail as a fixed drawer from the right, no wider than the screen', () => {
    const rule = block.match(/\.c2c-v2\.shell\[data-ana-open="true"\]\s*\.ana\s*\{([^}]*)\}/);
    expect(rule, 'the drawer rule exists').not.toBeNull();
    expect(rule![1]).toMatch(/position:\s*fixed/);
    expect(rule![1]).toMatch(/right:\s*0/);
    expect(rule![1]).toMatch(/width:\s*min\(380px,\s*92vw\)/);
  });

  it('shows a scrim behind the drawer only at narrow width', () => {
    expect(block).toMatch(/\.c2c-v2\.shell\[data-ana-open="true"\]\s*\.ana-scrim\s*\{\s*display:\s*block;?\s*\}/);
    // Outside the block the scrim is display:none — never a desktop overlay.
    const outside = css.replace(block, '');
    expect(outside).toMatch(/\.c2c-v2\s*\.ana-scrim\s*\{[^}]*display:\s*none/);
  });

  it('the shell renders the scrim and Escape closes the drawer', () => {
    expect(v2app).toMatch(/className="ana-scrim"[^>]*onClick=\{\(\) => set\('anaOpen', false\)\}/);
    expect(v2app).toMatch(/set\('anaOpen', false\)/);
    expect(v2app).toMatch(/matchMedia\('\(max-width: 900px\)'\)/);
  });
});

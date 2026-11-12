/**
 * Three shell styling defects from the GA readiness map
 * (docs/evidence/GA-READINESS/2026-11-10), asserted against the stylesheet
 * source because jsdom applies no stylesheet. Each was also seen in the running
 * app at 1440 and 390 px (fix-L7-shell/README.md).
 *
 *   GA-UI-03  the bell's count sat on the bell's corner and covered its glyph
 *             at 1440: the count now sits beside the bell, in the button's flow.
 *   GA-UI-07  the filing picker's tabs (.rpk-tabs) scrolled at 390 only inside
 *             New project (.npw); everywhere else the last tabs were cut off.
 *   GA-UI-05  the "audit entry is unconfirmed" notice is mounted at the root,
 *             outside .c2c-v2, so the error-state rules never reached it: it had
 *             no background and the page showed through it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.resolve(here, '../styles/app-v2.css'), 'utf8');

/** The declarations of every rule whose selector list is exactly `selector`. */
function declsOf(selector: string): string {
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    if (m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' ') === selector) out.push(m[2]);
  }
  return out.join(';').replace(/\s+/g, '');
}

describe('GA-UI-03: the bell count sits beside the bell', () => {
  it('the count is in the button flow, not on its corner', () => {
    const badge = declsOf('.c2c-v2 .tt-badge');
    expect(badge).not.toBe('');
    expect(badge).not.toMatch(/position:absolute/);
  });
  it('a trigger with a count widens to hold the bell and the count side by side', () => {
    const trigger = declsOf('.c2c-v2 .tt-trigger:has(.tt-badge)');
    expect(trigger).toMatch(/width:auto/);
    expect(trigger).toMatch(/gap:/);
  });
});

describe('GA-UI-07: every filing picker reaches all its tabs at 390', () => {
  it('the base .rpk-tabs rule scrolls sideways, and its tabs keep their width', () => {
    expect(declsOf('.c2c-v2 .rpk-tabs')).toMatch(/overflow-x:auto/);
    expect(declsOf('.c2c-v2 .rpk-tabs > *')).toMatch(/flex-shrink:0/);
  });
});

describe('GA-UI-05: the audit notice has a background of its own', () => {
  it('the root-mounted notice is opaque, bordered and padded', () => {
    const notice = declsOf('.c2c-global-errors .c2c-error-state');
    expect(notice).toMatch(/background:[^;]*var\(--bg-000\)/);
    expect(notice).toMatch(/border:1pxsolidvar\(--error\)/);
    expect(notice).toMatch(/padding:/);
  });
});

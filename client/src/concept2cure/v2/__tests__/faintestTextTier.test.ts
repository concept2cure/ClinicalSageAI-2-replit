/**
 * The faintest text tier is for what a person need not read: an icon beside a label, a separator, a placeholder, a
 * disabled control. scripts/ci/check-token-contrast.mjs states it (the --text-500 exception, 2026-09-03): "what is
 * left on --text-500 is genuinely disabled or ornamental". It checks the tokens, not where they are used.
 *
 * Measured in the running app on 2026-11-12 (docs/evidence/HUMAN-TEST/PHONE-DARK/2026-11-12/, S11's audit, and
 * docs/evidence/HUMAN-TEST/CLICK-THROUGH/2026-11-12-phone-dark/): text a person reads was set in it, at about 2.1:1
 * in light and 2.6:1 in dark against WCAG 2.2 AA's 4.5:1. "No tasks" on an empty Tasks column, an activity's due
 * date, a regulation citation, the RBM board's empty-column message, a coverage count. One step up the ramp,
 * --text-400, is 4.5:1 on the page and is re-based on every tinted surface (styles/surface-text-ramp.css).
 *
 * So every `color: var(--text-500)` in the v2 stylesheets must be one of the kinds below, named with its reason.
 * A new use on text fails here.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const STYLES = resolve(__dirname, '../styles');

/** Icons and glyphs beside a label that says the same thing; the label carries the meaning. */
const ORNAMENT: Record<string, string> = {
  '.reg-doc-go': 'row-go arrow beside the document title',
  '.nda-mod-go': 'row-go arrow beside the module name',
  '.ct-ref-go': 'row-go arrow beside the reference',
  '.ct-work-go': 'row-go arrow beside the work item',
  '.pj-cap .go': 'row-go arrow beside the capability',
  '.py-risk-row .go': 'row-go arrow beside the risk',
  '.py-next-row .go': 'row-go arrow beside the next step',
  '.py-cp-arrow': 'arrow between two named steps',
  '.rbm-att-go': 'row-go arrow beside the attachment name',
  '.ec-caret': 'tree caret beside the node label',
  '.pdev-arrow': 'arrow between two named steps',
  '.pdev-arrow2': 'arrow between two named steps',
  '.gov-hc-arrow': 'arrow between two named checks',
  '.rpkd-chev': 'disclosure chevron beside its label',
  '.mem-pin': 'pin glyph beside the pinned memory',
  '.pv-arrow': 'arrow between two named versions',
  '.ub-i': 'invoice glyph whose title names the invoice; the row says it in words',
  '.tb-dot': 'separator dot between two values',
};

/** Selectors whose kind their own syntax says. */
const exempt = (sel: string) =>
  /::placeholder\b/.test(sel) ? 'placeholder (WCAG 1.4.3 exempts it)' :
  /:disabled\b/.test(sel) ? 'disabled control (WCAG 1.4.3 exempts it)' :
  /::(after|before)\b/.test(sel) ? 'generated separator glyph' : null;

interface Use { sheet: string; line: number; selector: string }

/** Every rule in the v2 stylesheets whose own `color` is --text-500. */
function uses(): Use[] {
  const out: Use[] = [];
  for (const sheet of readdirSync(STYLES).filter((n) => n.endsWith('.css') && n !== 'surface-text-ramp.css')) {
    const css = readFileSync(resolve(STYLES, sheet), 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    const re = /([^{}]*)\{([^{}]*)\}/g;
    for (let m = re.exec(css); m; m = re.exec(css)) {
      if (!/(^|[;\s{])color\s*:\s*var\(--text-500\)/.test(m[2])) continue;
      const prelude = m[1].slice(m[1].lastIndexOf(';') + 1).trim().replace(/\s+/g, ' ');
      const line = css.slice(0, m.index + m[0].indexOf(m[2])).split('\n').length;
      for (const sel of prelude.split(',')) out.push({ sheet, line, selector: sel.trim().replace(/^\.c2c-v2 /, '') });
    }
  }
  return out;
}

describe('the faintest text tier holds no text a person reads', () => {
  it('finds the uses it checks (the reader works)', () => {
    expect(uses().length).toBeGreaterThan(10);
  });

  it('every --text-500 text colour is an ornament, a separator, a placeholder or a disabled control', () => {
    const readable = uses().filter((u) => !ORNAMENT[u.selector] && !exempt(u.selector));
    expect(readable.map((u) => `${u.sheet}:${u.line} ${u.selector}`), 'readable text in the faintest tier; use --text-400').toEqual([]);
  });

  it('every ornament named here is still in a stylesheet, so the list cannot keep a stale exception', () => {
    const present = new Set(uses().map((u) => u.selector));
    expect(Object.keys(ORNAMENT).filter((s) => !present.has(s))).toEqual([]);
  });
});

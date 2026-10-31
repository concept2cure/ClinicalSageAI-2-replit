/**
 * The RR5 review flow at a phone's width (390 x 844), pinned where jsdom
 * cannot see it: in the rules that decide the layout.
 *
 * RR5's browser acceptance at 390px (docs/evidence/D2-REVIEW-ROUTING/
 * 2026-10-30-RR5/, phone run) sends a document to two reviewers, has one sign
 * the review and the other request changes, and checks the route returns and
 * the author is told. Each rule below is one it found broken, measured in the
 * browser, on a screen that flow crosses:
 *
 *  - The Review board laid its list and detail side by side. The 340px list
 *    was wider than the page column, so the detail (Open in editor, Request
 *    changes...) sat off the right of the screen.
 *  - The board's detail cut off what did not fit (its overflow is hidden):
 *    Record review decision, half of Request changes..., Open in editor and
 *    Comment. Its project switch did not wrap and ran 36px past the screen.
 *  - Controls a reviewer taps were under 44px: Open in editor 28px; in the
 *    Tasks tray Close 26px, Mark read 24px, the notices' buttons 32px; in the
 *    review decision dialog the decision 36px and its buttons 32px.
 *  - The signing dialog's buttons lost their padding and background to the
 *    shell's `.c2c-v2 button` reset, which outranked one class: "Sign and
 *    commit", Cancel and Done were bare text 20px tall, on every surface that
 *    signs, at any width. (The reset is now `:where(.c2c-v2) button`, which
 *    any class outranks: shellButtonResetYields.test.ts.)
 *
 * The Authoring toolbar's half (its scroller now holds the Download menu's
 * live region) is pinned beside that menu, in downloadWorkingCopy.test.tsx.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHARED = path.resolve(V2, '..', '_shared', 'components');

interface Rule { media: string[]; selectors: string[]; decls: string }

/** Every style rule in a stylesheet, nesting resolved, with the @media it sits in. */
function rulesOf(file: string): Rule[] {
  const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Rule[] = [];
  const walk = (src: string, media: string[], parents: string[]) => {
    let i = 0;
    let decls = '';
    while (i < src.length) {
      const open = src.indexOf('{', i);
      const semi = src.indexOf(';', i);
      if (open < 0) { decls += src.slice(i); break; }
      if (semi >= 0 && semi < open) { decls += src.slice(i, semi + 1); i = semi + 1; continue; }
      const prelude = src.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      for (; j < src.length && depth > 0; j++) depth += src[j] === '{' ? 1 : src[j] === '}' ? -1 : 0;
      const block = src.slice(open + 1, j - 1);
      if (prelude.startsWith('@media')) walk(block, [...media, prelude], parents);
      else if (!prelude.startsWith('@')) {
        const own = prelude.split(',').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
        const full = parents.length ? parents.flatMap(p => own.map(s => (s.includes('&') ? s.replace(/&/g, p) : `${p} ${s}`))) : own;
        walk(block, media, full);
      }
      i = j;
    }
    if (parents.length && decls.trim()) out.push({ media, selectors: parents, decls });
  };
  walk(css, [], []);
  return out;
}

/** Whether a media list applies on a 390px-wide screen in its ordinary state. */
const atPhoneWidth = (media: string[]) => media.length > 0 && media.every((m) => {
  const max = m.match(/max-width:\s*(\d+)px/);
  return max !== null && Number(max[1]) >= 390 && !/min-width|prefers-reduced-motion/.test(m);
});

const declares = (decls: string, prop: string, value: RegExp) =>
  decls.split(';').some((d) => {
    const at = d.indexOf(':');
    return at > 0 && d.slice(0, at).trim() === prop && value.test(d.slice(at + 1).trim());
  });

/** Whether a rule for `selector`, in force at 390px, declares `prop` matching `value`. */
function phoneRule(file: string, selector: string, prop: string, value: RegExp): boolean {
  return rulesOf(file).some(r => atPhoneWidth(r.media) && r.selectors.includes(selector) && declares(r.decls, prop, value));
}

const AT_LEAST_44 = /^(4[4-9]|[5-9]\d|\d{3,})px$/;
const surfaces = path.join(V2, 'styles', 'surfaces-v2.css');
const app = path.join(V2, 'styles', 'app-v2.css');
const decision = path.join(V2, 'styles', 'review-decision.css');
const esign = path.join(SHARED, 'EsignModal.css');

describe('The Review board at 390px', () => {
  it('stacks the list above the detail', () => {
    expect(phoneRule(surfaces, '.c2c-v2 .split', 'grid-template-columns', /^(minmax\(0, ?1fr\)|1fr)$/)).toBe(true);
  });

  it('wraps what does not fit in the detail, which cuts off what overflows it', () => {
    for (const sel of ['.c2c-v2 .dt-head', '.c2c-v2 .dt-acts', '.c2c-v2 .rv-doc-h', '.c2c-v2 .rv-reply']) {
      expect(phoneRule(surfaces, sel, 'flex-wrap', /^wrap$/), sel).toBe(true);
    }
    expect(phoneRule(surfaces, '.c2c-v2 .rv-reply-in', 'min-width', /^0(px)?$/)).toBe(true);
    expect(phoneRule(surfaces, '.c2c-v2 .btn.rv-scope-program', 'white-space', /^normal$/)).toBe(true);
    expect(phoneRule(surfaces, '.c2c-v2 .btn.rv-scope-program', 'max-width', /^100%$/)).toBe(true);
  });

  it('makes every control a reviewer taps there a 44px target', () => {
    for (const sel of ['.c2c-v2 .dt-acts .btn', '.c2c-v2 .btn.rv-doc-open', '.c2c-v2 .rv-reply .btn']) {
      expect(phoneRule(surfaces, sel, 'min-height', AT_LEAST_44), sel).toBe(true);
    }
  });

  it('marks the controls those rules name, and sets no inline height a rule cannot override', () => {
    const src = fs.readFileSync(path.join(V2, 'surfaces', 'Review.tsx'), 'utf8');
    expect(src).toMatch(/className="dt-acts"/);
    expect(src).toMatch(/className="btn ghost rv-doc-open"[^>]*data-testid="rv-open-in-editor"/);
    expect(src).toMatch(/className="btn ghost rv-scope-program"/);
    expect(src).not.toMatch(/style=\{\{ height: 28 \}\}[^>]*data-testid="rv-open-in-editor"/);
  });
});

describe('The Tasks tray at 390px', () => {
  it('makes Close and each notice’s Mark read 44px square', () => {
    for (const sel of ['.c2c-v2 .tt-close', '.c2c-v2 .tt-read']) {
      expect(phoneRule(app, sel, 'width', AT_LEAST_44), sel).toBe(true);
      expect(phoneRule(app, sel, 'height', AT_LEAST_44), sel).toBe(true);
    }
  });

  it('makes Triage, Show more, Open the task board and every button in the tray 44px tall', () => {
    for (const sel of ['.c2c-v2 .tt-triage', '.c2c-v2 .tt-more', '.c2c-v2 .tt-foot', '.c2c-v2 .tt-panel .btn']) {
      expect(phoneRule(app, sel, 'min-height', AT_LEAST_44), sel).toBe(true);
    }
  });
});

describe('The review decision dialog at 390px', () => {
  it('makes the decision, the reason and each button a 44px target', () => {
    for (const sel of ['.c2c-v2 .rv-decision-actions .btn', '.c2c-v2 .rv-decision-dialog .esign-field select', '.c2c-v2 .rv-decision-dialog .esign-field textarea']) {
      expect(phoneRule(decision, sel, 'min-height', AT_LEAST_44), sel).toBe(true);
    }
  });
});

describe('The signing dialog keeps its buttons inside the v2 shell', () => {
  /** [ids, classes/attributes/pseudo-classes, types], enough for these selectors. */
  const specificity = (raw: string): [number, number, number] => {
    // `:where()` counts nothing, as in CSS.
    const sel = raw.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, ' ');
    return [
    (sel.match(/#[\w-]+/g) ?? []).length,
    (sel.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? []).length,
    (sel.replace(/\[[^\]]+\]|[.#:][\w-]+/g, ' ').match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length,
    ];
  };
  const outranks = (a: [number, number, number], b: [number, number, number]) =>
    a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];

  const reset = rulesOf(app).find(r => r.media.length === 0 && r.selectors.includes(':where(.c2c-v2) button') && declares(r.decls, 'padding', /^0$/));
  const BUTTONS = ['es-btn-primary', 'es-btn-secondary', 'es-close', 'es-meaning-opt'];

  it('the shell resets every button’s padding and background', () => {
    expect(reset).toBeDefined();
    expect(declares(reset!.decls, 'background', /^none$/)).toBe(true);
  });

  it.each(BUTTONS)('every rule that gives .%s its box outranks that reset', (cls) => {
    const boxes = rulesOf(esign).filter(r => r.media.length === 0
      && r.selectors.some(s => new RegExp(`\\.${cls}$`).test(s))
      && (declares(r.decls, 'padding', /./) || declares(r.decls, 'background', /./) || declares(r.decls, 'width', /./)));
    expect(boxes.length).toBeGreaterThan(0);
    const resetRank = specificity(reset!.selectors[0]);
    for (const r of boxes) for (const s of r.selectors) expect(outranks(specificity(s), resetRank), s).toBe(true);
  });

  it('at 390px Sign and commit, Cancel, Done and each meaning are 44px tall, and the close control 44px square', () => {
    for (const sel of ['.es-modal .es-btn-primary', '.es-modal .es-btn-secondary', '.es-modal .es-meaning-opt']) {
      expect(phoneRule(esign, sel, 'min-height', AT_LEAST_44), sel).toBe(true);
    }
    expect(phoneRule(esign, '.es-modal .es-close', 'width', AT_LEAST_44)).toBe(true);
    expect(phoneRule(esign, '.es-modal .es-close', 'height', AT_LEAST_44)).toBe(true);
  });

  it('reduced motion still stops their transitions, at the same rank', () => {
    const still = rulesOf(esign).filter(r => r.media.some(m => /prefers-reduced-motion/.test(m)) && declares(r.decls, 'transition', /^none$/));
    for (const cls of BUTTONS) expect(still.some(r => r.selectors.includes(`.es-modal .${cls}`)), cls).toBe(true);
  });

  it('no second copy of the meaning pills’ rules works around the reset elsewhere', () => {
    const authoring = rulesOf(path.join(V2, 'styles', 'authoring-v2.css'));
    expect(authoring.filter(r => r.selectors.some(s => s.includes('es-meaning-opt')))).toEqual([]);
  });
});

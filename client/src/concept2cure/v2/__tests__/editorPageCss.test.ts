/**
 * The one editor's page, read from its two stylesheets (D4-1, CSS only).
 *
 * WHY THIS EXISTS
 * The D4 spec (.design/claude-convergence/D4.md §D4.A, §D4.C, §D4.D) measured these in the running app.
 * No component test can see them, because jsdom applies no stylesheet:
 *   1. The document did not read at the prose size. design-system/colors_and_type.css
 *      `.body, p, .p` gives every <p> its own size and leading. An element rule beats inheritance, so the
 *      page's size never reached a paragraph (the `type` probe measured `p` at 13px in the sans).
 *   2. A drafted section's dot in the outline was invisible. The markup is `data-s="ok"`
 *      (editor/DocumentWorkbench.tsx), and no rule coloured it.
 *   3. The outline's current row, the masthead's section code and document view's active section were
 *      orange. Claude marks the current item with a soft fill.
 *   4. The Authoring page opened scrolled under the top bar. The outline's fixed parts overflowed
 *      `.ed-tree`, so `.page` had 82px to scroll, and the active row's scrollIntoView took 61 of them.
 *   5. The ribbon wrapped to two rows. Its notes and links were orange and under the 12px floor.
 *
 * WHAT IS PINNED
 * Each fix, by selector and declaration, in `styles/rich-section-editor.css` and `styles/authoring-v2.css`.
 * Nesting is resolved and `:is()` lists are expanded, so a selector is matched however it is grouped.
 * Only base rules count (outside `@media`, `@container` and `@supports`), unless a case says otherwise.
 * The editor's page type is scoped to `.ed`: RichSectionEditor has other hosts (Quality's controlled
 * text editor, the eCTD co-author, protocol development), and D4-1 does not restyle them.
 *
 * Red before D4-1's CSS, green after: docs/evidence/DESIGN/D4/D4-1/red/ and green/.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss, { type Container } from 'postcss';
import { describe, expect, it } from 'vitest';

const STYLES = resolve(__dirname, '../styles');
const RSE = 'rich-section-editor.css';
const AUTH = 'authoring-v2.css';

/** The type scale (design-system/colors_and_type.css §3, D0-1), to resolve a token written without a fallback. */
const FS: Record<string, number> = {
  '--fs-caption': 12,
  '--fs-small': 13,
  '--fs-body': 14,
  '--fs-section': 15,
  '--fs-prose': 16,
  '--fs-title': 26,
};

interface Block {
  selectors: string[];
  conditional: boolean;
  decls: Map<string, string>;
}

/** Split a selector list on its top-level commas. */
function splitTopLevel(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** `.a :is(.b, .c) d` → `.a .b d`, `.a .c d`. */
function expandIs(sel: string): string[] {
  const m = /:(?:is|where)\(/.exec(sel);
  if (!m) return [sel];
  const open = m.index + m[0].length;
  let depth = 1;
  let i = open;
  for (; i < sel.length && depth > 0; i++) {
    if (sel[i] === '(') depth++;
    else if (sel[i] === ')') depth--;
  }
  return splitTopLevel(sel.slice(open, i - 1)).flatMap((alt) => expandIs(sel.slice(0, m.index) + alt + sel.slice(i)));
}

const norm = (s: string) =>
  s.replace(/"/g, "'").replace(/\s+/g, ' ').replace(/\s*([>+~])\s*/g, ' $1 ').trim();

function blocks(file: string): Block[] {
  const root = postcss.parse(readFileSync(resolve(STYLES, file), 'utf8'));
  const out: Block[] = [];
  const walk = (node: Container, parents: string[], conditional: boolean) => {
    node.each((child) => {
      if (child.type === 'rule') {
        const own = splitTopLevel(child.selector);
        const selectors = parents.length
          ? parents.flatMap((p) => own.map((s) => (s.includes('&') ? s.split('&').join(p) : `${p} ${s}`)))
          : own;
        const decls = new Map<string, string>();
        child.each((d) => {
          if (d.type === 'decl') decls.set(d.prop, d.value.trim());
        });
        out.push({ selectors: selectors.flatMap(expandIs).map(norm), conditional, decls });
        walk(child, selectors, conditional);
      } else if (child.type === 'atrule' && child.name !== 'keyframes') {
        walk(child, parents, conditional || /^(media|container|supports)$/.test(child.name));
      }
    });
  };
  walk(root, [], false);
  return out;
}

const SHEETS: Record<string, Block[]> = { [RSE]: blocks(RSE), [AUTH]: blocks(AUTH) };

/** The value the last base rule in `file` gives `prop` on exactly `selector`, as the cascade within one file would. */
function value(file: string, selector: string, prop: string): string | undefined {
  const want = norm(selector);
  let found: string | undefined;
  for (const b of SHEETS[file]) {
    if (b.conditional || !b.selectors.includes(want)) continue;
    const v = b.decls.get(prop);
    if (v !== undefined) found = v;
  }
  return found;
}

/** A font-size in px: `13px`, `var(--fs-small, 13px)` or `var(--fs-small)`. */
function px(size: string | undefined): number {
  if (!size) return NaN;
  const fallback = /var\(\s*(--[\w-]+)\s*,\s*([\d.]+)px\s*\)/.exec(size);
  if (fallback) return Number(fallback[2]);
  const token = /var\(\s*(--[\w-]+)\s*\)/.exec(size);
  if (token) return FS[token[1]] ?? NaN;
  const plain = /^([\d.]+)px$/.exec(size);
  return plain ? Number(plain[1]) : NaN;
}

describe("the one editor's page type (D4-1, .design/claude-convergence/D4.md §D4.K)", () => {
  it('parses nesting and :is() lists', () => {
    const b = postcss.parse('.c2c-v2 { .x :is(.a, .b) { color: red } }');
    expect(b.nodes.length).toBe(1);
    expect(expandIs('.ed .t :is(p, li)')).toEqual(['.ed .t p', '.ed .t li']);
    expect(px('var(--fs-small, 13px)')).toBe(13);
    expect(px('var(--fs-caption)')).toBe(12);
    expect(px('10.5px')).toBe(10.5);
  });

  it('reads the section in the serif at the prose size, and its paragraphs inherit it (defect 1)', () => {
    expect(value(RSE, '.ed .rse-body .tiptap', 'font-family')).toBe('var(--font-serif)');
    expect(px(value(RSE, '.ed .rse-body .tiptap', 'font-size'))).toBe(16);
    expect(value(RSE, '.ed .rse-body .tiptap', 'line-height')).toBe('1.7');
    for (const el of ['p', 'li', 'blockquote']) {
      for (const prop of ['font-family', 'font-size', 'line-height', 'color']) {
        expect(value(RSE, `.ed .rse-body .tiptap ${el}`, prop), `${el} ${prop}`).toBe('inherit');
      }
    }
    /* Tables stay in the sans, at a table's size. */
    expect(value(RSE, '.ed .rse-body .tiptap table', 'font-family')).toBe('var(--font-sans)');
  });

  it('reads document view the same way, wherever a section body is drawn', () => {
    expect(value(AUTH, '.c2c-v2 .ed-full-sec-body', 'font-family')).toBe('var(--font-serif)');
    expect(px(value(AUTH, '.c2c-v2 .ed-full-sec-body', 'font-size'))).toBe(16);
    expect(value(AUTH, '.c2c-v2 .ed-full-sec-body', 'line-height')).toBe('1.7');
    for (const el of ['p', 'li', 'blockquote']) {
      expect(value(AUTH, `.c2c-v2 .ed-full-sec-body ${el}`, 'font-size'), el).toBe('inherit');
      expect(value(AUTH, `.c2c-v2 .ed-full-sec-body ${el}`, 'line-height'), el).toBe('inherit');
    }
    /* Paragraphs keep their spacing: the design system's `p` has no margin. */
    expect(value(AUTH, '.c2c-v2 .ed-full-sec-body p', 'margin')).toBe('0 0 12px');
  });

  it("scopes the page type to `.ed`, so RichSectionEditor's other hosts keep theirs", () => {
    const prose = SHEETS[RSE].filter((b) => [...b.decls.values()].some((v) => v.includes('--fs-prose')));
    expect(prose.length).toBeGreaterThan(0);
    for (const b of prose) for (const s of b.selectors) expect(s.startsWith('.ed '), s).toBe(true);
    /* The unscoped rule the other hosts read is still there. */
    expect(value(RSE, '.rse-body .tiptap', 'font-family')).toBeDefined();
  });
});

describe("the one editor's outline, page and ribbon (D4-1, .design/claude-convergence/D4.md §D4.K)", () => {
  it("colours a drafted section's dot in the outline (defect 2)", () => {
    expect(value(AUTH, ".c2c-v2 .ed-dot[data-s='ok']", 'background')).toBe('var(--success)');
    expect(value(AUTH, ".c2c-v2 .ed-dot[data-s='complete']", 'background')).toBe('var(--success)');
    expect(value(AUTH, ".c2c-v2 .ed-dot[data-s='review']", 'background')).toBe('var(--warning)');
    /* Draft, and any other state, is the quiet default. */
    expect(value(AUTH, '.c2c-v2 .ed-dot', 'background')).toBe('var(--idle)');
  });

  it('marks the current item with a soft fill, not orange (defect 3)', () => {
    const row = ".c2c-v2 .ed-tree-row[data-active='true']";
    expect(value(AUTH, row, 'background')).toBe('var(--bg-200)');
    expect(value(AUTH, row, 'color')).toBe('var(--text-100)');
    expect(value(AUTH, '.c2c-v2 .ed-mast-num', 'color')).toBe('var(--text-300)');
    expect(value(AUTH, ".c2c-v2 .ed-full-sec[data-active]", 'background')).toBe('var(--bg-050)');
    expect(value(AUTH, ".c2c-v2 .ed-full-sec[data-active]", 'box-shadow')).toBe('none');
    for (const [file, sel] of [
      [AUTH, row],
      [AUTH, '.c2c-v2 .ed-mast-num'],
      [AUTH, '.c2c-v2 .ed-full-sec-num'],
      [RSE, '.ed .rse-link'],
    ] as const) {
      for (const prop of ['color', 'background', 'box-shadow']) {
        expect(value(file, sel, prop) ?? '', `${sel} ${prop}`).not.toMatch(/accent/);
      }
    }
  });

  it('contains the outline in its own scroll, so the page does not scroll (defect 4)', () => {
    expect(value(AUTH, '.c2c-v2 .ed-tree', 'overflow-y')).toBe('auto');
    expect(value(AUTH, '.c2c-v2 .ed-tree-scroll', 'min-height')).toBe('0');
    expect(value(AUTH, '.c2c-v2 .ed-doc-scroll', 'min-height')).toBe('0');
    expect(value(AUTH, '.c2c-v2 .ed-doc-scroll', 'overflow-y')).toBe('auto');
  });

  it('sets the page on a centred reading measure', () => {
    expect(value(AUTH, '.c2c-v2 .ed-doc-inner', 'max-width')).toBe('816px');
    expect(value(AUTH, '.c2c-v2 .ed-doc-inner', 'margin')).toBe('0 auto');
    expect(value(AUTH, '.c2c-v2 .ed-mast-t', 'font-family')).toBe('var(--font-serif)');
    expect(value(AUTH, '.c2c-v2 .ed-mast-t', 'font-weight')).toBe('500');
  });

  it('keeps the ribbon on one row that scrolls inside itself, each control at its own width (defect 5)', () => {
    expect(value(RSE, '.ed .rse-ribbon', 'flex-wrap')).toBe('nowrap');
    expect(value(RSE, '.ed .rse-ribbon', 'overflow-x')).toBe('auto');
    /* A labelled control ("Ask for a source", "Track changes") must not shrink and wrap inside itself. */
    expect(value(RSE, '.ed .rse-ribbon > *', 'flex-shrink')).toBe('0');
    expect(value(RSE, '.ed .rse-track', 'white-space')).toBe('nowrap');
  });

  it('keeps notes and links quiet in the editor (defect 5)', () => {
    expect(value(AUTH, '.c2c-v2 .ed .scaf-note', 'background')).toBe('var(--bg-100)');
    expect(value(AUTH, '.c2c-v2 .ed .scaf-note', 'border')).toBe('0');
    expect(value(AUTH, ".c2c-v2 .ed .scaf-note[role='alert']", 'color')).toBe('var(--error)');
    expect(value(RSE, '.ed .rse-link', 'color')).toBe('var(--text-300)');
  });

  it("holds the outline's and the page's own text at the 12px floor or above (D0 §3)", () => {
    const checks: [string, string][] = [
      [AUTH, '.c2c-v2 .ed-tree-t'],
      [AUTH, '.c2c-v2 .ed-tree-m'],
      [AUTH, '.c2c-v2 .ed-tree-row'],
      [AUTH, '.c2c-v2 .ed-num'],
      [AUTH, '.c2c-v2 .ed-basis-chip'],
      [AUTH, '.c2c-v2 .ed-basis-l'],
      [AUTH, '.c2c-v2 .ed-basis-d'],
      [AUTH, '.c2c-v2 .ed-provline'],
      [AUTH, '.c2c-v2 .ed-mast-num'],
      [AUTH, '.c2c-v2 .ed-full-sec-num'],
      [RSE, '.ed .rse-track'],
      [RSE, '.ed .rse-link'],
      [RSE, '.ed .rse-gate'],
    ];
    for (const [file, sel] of checks) {
      const size = px(value(file, sel, 'font-size'));
      expect(size, `${sel} font-size`).toBeGreaterThanOrEqual(12);
    }
  });
});

/* B5 (demo walk 2026-11-05, 43-390-csr-build-panel.png): at 390 wide the CSR's "Build from the study's data"
   panel was cut off at the right edge, its paragraph and its Study data select not wrapped. `.ed-source-detail`
   is a one-column grid with an `auto` track, so its longest unbreakable item (the select, naming the manifest
   file and version) set the track wider than the panel. Four of its other hosts carried an inline `minWidth: 0`
   to get round it (AuthoringAssemblyBuild, AssemblySourcesNotice, SavedAssemblySourcesNotice). */
describe("the editor's source panels at phone width (B5)", () => {
  it('sizes the one column to the panel, so no item can set it wider', () => {
    expect(value(AUTH, '.c2c-v2 .ed-source-detail', 'grid-template-columns')).toBe('minmax(0, 1fr)');
  });

  it('keeps a select inside the panel', () => {
    expect(value(AUTH, '.c2c-v2 .ed-source-detail select', 'max-width')).toBe('100%');
  });

  /* Measured in the running app at 390 wide: the CSR build, assembly and review blocks are inline grids whose
     `auto` track took a sequence select's longest option (458px in a 334px panel). */
  it("lets the items of the panel's inline grids be as narrow as the panel", () => {
    expect(value(AUTH, ".c2c-v2 .ed-source-detail [style*='display: grid'] > *", 'min-width')).toBe('0');
  });
});

/* D4-5 (D4.md §D4.A, D0 layout grid): beside an open document the conversation keeps 420 to 560 px. It was
   clamp(340px, 34%, 520px), 400 px at 1440 and 345 px at 1280 (docs/evidence/D4/2026-11-09-composer-beside-canvas/). */
describe('the conversation beside an open document (D4-5)', () => {
  it('keeps a 420 to 560 px column', () => {
    expect(value(AUTH, '.c2c-v2 .ct-main[data-canvas-open] > .ct-conv', 'flex')).toBe('0 0 clamp(420px, 38%, 560px)');
  });
});

/* §D4.K "Page": inside the panel, the page's side padding follows the panel's width, not the window's. At 729 px
   beside the conversation the page kept the full-width 48 px sides, so the text column was 633 px of a 729 px panel;
   the phone rule (16 px) only ever applied to the window. The variable moves with the padding, because the ribbon
   spans the padding through it (rich-section-editor.css). */
describe('the page inside a narrow panel (§D4.K artifact container)', () => {
  const root = postcss.parse(readFileSync(resolve(STYLES, AUTH), 'utf8'));
  const inContainer = (params: RegExp, selector: string): Map<string, string> | null => {
    let found: Map<string, string> | null = null;
    root.walkAtRules('container', (at) => {
      if (!params.test(at.params)) return;
      at.walkRules((rule) => {
        if (!splitTopLevel(rule.selector).some((s) => norm(s) === norm(selector))) return;
        const decls = new Map<string, string>();
        rule.walkDecls((d) => { decls.set(d.prop, d.value.trim()); });
        found = decls;
      });
    });
    return found;
  };

  it('gives the page 28 px sides in a panel under 900 px', () => {
    const d = inContainer(/^artifact \(max-width: 899px\)$/, '.ed-doc-inner');
    expect(d?.get('--ed-page-pad-x')).toBe('28px');
    expect(d?.get('padding')).toBe('24px var(--ed-page-pad-x) 96px');
  });

  it('gives the page 16 px sides, and a 22 px title, in a panel under 560 px', () => {
    const d = inContainer(/^artifact \(max-width: 560px\)$/, '.ed-doc-inner');
    expect(d?.get('--ed-page-pad-x')).toBe('16px');
    expect(d?.get('padding')).toBe('20px var(--ed-page-pad-x) 80px');
    expect(inContainer(/^artifact \(max-width: 560px\)$/, '.ed-mast-t')?.get('font-size')).toBe('22px');
  });
});

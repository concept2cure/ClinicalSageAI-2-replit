/**
 * Every class DocumentsPanel renders has a rule in the stylesheet it names.
 *
 * ── The defect this exists for ───────────────────────────────────────────────
 * DocumentsPanel shipped with no CSS at all. Its docblock said "CSS lives in
 * client/src/concept2cure/mdx/app.css (DOCUMENTS PANEL section)" and there was
 * no such section: the port from design-system/ui_kits/mdx brought the JSX and
 * left the stylesheet behind. All 24 `docs-*` classes matched nothing in any
 * bundle, on the five surfaces that render it — Vault, Engineering, UDI,
 * Post-market and Analytics — where the document list is the main content.
 *
 * ── Why no existing check saw it ─────────────────────────────────────────────
 * The render tests assert the rows are in the DOM, and they were. jsdom does
 * not cascade, so `getComputedStyle` answers the same whether a rule exists or
 * not. `visual-qa:styling` asks whether a SURFACE receives the cascade, and
 * these surfaces do — page, sections, metrics and tables are all styled — so a
 * wholly unstyled component inside a styled surface is exactly the shape it
 * cannot see. And a docblock naming a file is a claim no gate reads.
 *
 * It was found from the far end, as one entry in an overflow baseline, which is
 * a long way to travel for "this component has no CSS".
 *
 * ── What this asserts, and what it does not ──────────────────────────────────
 * That each rendered `docs-*` class is *selected by something*. It is a text
 * comparison, not a cascade: it cannot tell whether the rule is correct, wins
 * against a competing one, or ships in a bundle this surface loads. Those need
 * a browser and live in scripts/visual-qa. This catches the one failure mode
 * that is both catastrophic and invisible here — no rule whatsoever.
 *
 * ── Its relationship to the repo-wide gate ───────────────────────────────────
 * `scripts/ci/check-component-class-coverage.mjs` now asks this question of
 * EVERY component in client/src, against the BUILT css rather than the source
 * sheet — the generalisation of this file, written because DocumentsPanel was
 * not the only component that had been ported as markup and left behind as
 * stylesheet. This file is kept and is not a second copy of it: it covers two
 * things the general gate deliberately does not, because they are specific to
 * this component and cannot be asked generically —
 *
 *   · the dynamic prefixes `docs-fw-` and `docs-esig-`, whose suffix is only
 *     known at runtime. The gate skips every interpolated name rather than
 *     guessing at a fragment; here the prefix is known and checkable.
 *   · the docblock pointer. "CSS lives in …/app.css" was false for months and
 *     no gate reads a comment. This one does.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMPONENT = path.join(HERE, '..', 'components', 'DocumentsPanel.tsx');
const SHEET = path.join(HERE, '..', 'app.css');

const source = fs.readFileSync(COMPONENT, 'utf8');
const css = fs.readFileSync(SHEET, 'utf8');

/**
 * The `docs-*` classes the component actually renders.
 *
 * Template literals matter: `docs-esig-${d.esigState}` and
 * `docs-fw-${d.framework}` are real classes whose prefix is all that survives
 * static reading, so the prefix is what gets checked.
 */
function renderedDocsClasses(): string[] {
  const found = new Set<string>();
  for (const m of source.matchAll(/docs-[a-z0-9-]*/g)) {
    const cls = m[0];
    // A bare prefix left by an interpolation — `docs-fw-` — is checked as the
    // prefix, since the suffix is only known at runtime.
    found.add(cls);
  }
  return [...found].sort();
}

describe('DocumentsPanel is styled', () => {
  const classes = renderedDocsClasses();

  it('renders the docs-* classes this test is meant to cover', () => {
    // A guard on the guard: if the component stops using this namespace, the
    // loop below would pass by having nothing to check.
    expect(classes.length).toBeGreaterThanOrEqual(20);
    expect(classes).toContain('docs-panel');
    expect(classes).toContain('docs-row');
  });

  it.each(classes)('app.css has a rule selecting .%s', (cls) => {
    // A trailing hyphen means an interpolation truncated here — `docs-fw-` is
    // the static half of `docs-fw-${d.framework}` — so the suffix is only known
    // at runtime and what must exist is at least one rule built on the prefix.
    // Everything else is a whole class name: `.docs-row` may be followed by
    // `{`, `:hover`, `[data-…]` or a descendant, but must NOT match
    // `.docs-rowacts`, which is a different class.
    const selected = cls.endsWith('-')
      ? new RegExp(String.raw`\.${cls}[\w-]`).test(css)
      : new RegExp(String.raw`\.${cls}(?![\w-])`).test(css);
    expect(selected).toBe(true);
  });

  it('names the stylesheet it actually lives in', () => {
    // The docblock pointed at a section that did not exist. If the CSS moves,
    // this fails rather than the pointer quietly going stale again.
    expect(source).toContain('mdx/app.css');
    expect(css).toContain('DOCUMENTS PANEL');
  });
});

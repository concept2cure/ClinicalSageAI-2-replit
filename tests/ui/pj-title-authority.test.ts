/**
 * `.pj-title` stays serif, and only one rule owns it.
 *
 * WHY THIS EXISTS
 * A product-owner decision of 2026-07-28 — recorded in
 * `config/ui-surface-registry.json` under `decision`, sourced from
 * `docs/audits/ANA_UI_FORENSIC_AUDIT_2026-07-28.md` — says `.pj-title`,
 * `.ana-ctx-section` and `.ana-greet-t` stay serif. They had been moved to
 * `--font-sans` once and reverted. Until now **nothing executable protected
 * that**: no test mentioned `serif` or `.pj-title` typography, and the only
 * `.pj-title` references in test code are jsdom existence checks, which cannot
 * see a stylesheet at all. The decision was guarded by prose in two audit
 * documents.
 *
 * It was also already being partly undone by accident. `.pj-title` was declared
 * twice at identical specificity — `app-v2.css` (serif, 30px) and
 * `journey-v2.css` (24px, no family) — both unscoped, both imported globally,
 * journey second. So journey won every property it declared, on every surface,
 * and ProjectHome rendered a journey-surface size. The family survived only
 * because the second rule happened not to mention it. A future edit that added
 * `font-family` there, or that "tidied" the duplicate by deleting the app-v2
 * rule, would have silently reversed a recorded decision.
 *
 * Neither CI gate could catch it: `check-css-selector-shadowing.mjs` looks for
 * duplicates WITHIN one file, and `check-shell-css-collisions.mjs` only flags
 * selectors not prefixed by a shell root — both rules are correctly
 * `.c2c-v2`-prefixed.
 *
 * WHAT IS PINNED
 * That exactly one rule declares `font-family` for `.pj-title`, that it is
 * serif, and that no bare `.c2c-v2 .pj-title` rule exists outside the file that
 * owns it — which is what let a surface-specific value go global.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const STYLE_DIR = join(process.cwd(), 'client/src/concept2cure/v2/styles');
const OWNER = 'app-v2.css';

/** Every `.pj-title` rule in the family sheets, with its file and selector. */
function pjTitleRules(): { file: string; selector: string; body: string }[] {
  const out: { file: string; selector: string; body: string }[] = [];
  for (const file of readdirSync(STYLE_DIR).filter((f) => f.endsWith('.css'))) {
    const css = readFileSync(join(STYLE_DIR, file), 'utf8')
      // Strip comments first, so prose mentioning the selector is not read as a
      // rule — the failure mode `ci:token-contrast` already hit once.
      .replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]*\.pj-title)\s*\{([^}]*)\}/g)) {
      out.push({ file, selector: m[1].trim(), body: m[2] });
    }
  }
  return out;
}

describe('.pj-title — the 2026-07-28 serif decision', () => {
  it('is declared by at least one rule', () => {
    expect(pjTitleRules().length).toBeGreaterThan(0);
  });

  it('has exactly one rule declaring font-family, and it is serif', () => {
    const withFamily = pjTitleRules().filter((r) => /font-family\s*:/.test(r.body));
    expect(
      withFamily.map((r) => `${r.file} { ${r.selector} }`),
      'font-family for .pj-title must be declared in exactly one place',
    ).toHaveLength(1);
    expect(withFamily[0].file).toBe(OWNER);
    expect(withFamily[0].body).toMatch(/--font-serif|serif/);
  });

  it('no sheet other than the owner declares a BARE .pj-title rule', () => {
    /* A bare rule is the collision: same specificity as the owner, global
       reach, and whichever file imports last wins. A surface may still override
       size or spacing — but scoped to its own wrapper, so it cannot leak. */
    const bareElsewhere = pjTitleRules().filter(
      (r) => r.file !== OWNER && /^\.c2c-v2\s+\.pj-title$/.test(r.selector),
    );
    expect(
      bareElsewhere.map((r) => `${r.file}: ${r.selector}`),
      'a bare .pj-title outside the owning sheet wins globally by import order',
    ).toEqual([]);
  });
});

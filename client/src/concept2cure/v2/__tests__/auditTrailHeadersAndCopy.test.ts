/**
 * Launch sweep findings 47, 53, 54 and 129 — checked on the source, because
 * jsdom applies no stylesheet cascade and these are a class collision and
 * copy.
 *
 * 47: `.ct-head` is the grid header row of every `.ct-table`
 * (surfaces-v2.css). The conversation thread reused the name for its flex
 * header, and app-v2.css's rule for it (loaded later) turned every table's
 * header row into flex: the audit trail's ID / WHEN / ACTOR / EVENT / TARGET /
 * SIG headers bunched into the first 270px over the wrong columns, and the
 * same on Projects, Task board, CRO portfolio, Client portal and Artifacts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const V2 = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(V2, rel), 'utf8');
/** Rules whose selector ends in exactly `.ct-head` (not `.ct-head-t` etc). */
const ctHeadRules = (css: string) => css.match(/\.ct-head(?![\w-])[^{]*\{[^}]*\}/g) ?? [];

describe('finding 47 — one meaning for .ct-head', () => {
  it('is defined only as the table grid header', () => {
    const app = read('styles/app-v2.css');
    const surfaces = read('styles/surfaces-v2.css');
    expect(ctHeadRules(app)).toEqual([]);
    const grid = ctHeadRules(surfaces);
    expect(grid.length).toBeGreaterThan(0);
    for (const r of grid) expect(r).toMatch(/display:\s*grid/);
  });

  it('is not the conversation thread header', () => {
    expect(read('surfaces/ConversationThread.tsx')).not.toMatch(/className="ct-head"/);
  });
});

describe('findings 53 and 54 — the audit trail and Apps catalog in words', () => {
  const src = read('surfaces/AdminSurfaces.tsx');
  it('cites §11.10(e), not "ss11.10(e)", and never writes "entry(ies)"', () => {
    expect(src).not.toMatch(/ss11\.10/);
    expect(src).not.toMatch(/entry\(ies\)/);
  });
  it('shows no API route as the Apps catalog eyebrow', () => {
    expect(src).not.toMatch(/eyebrow="[^"]*\/api\//);
  });
});

describe('finding 129 — no empty breadcrumb', () => {
  it('draws the tier crumb and its separator only when there is a tier', () => {
    expect(read('Shell.tsx')).not.toMatch(/\{tier \? tier\.label : ''\}/);
  });
});

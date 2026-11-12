/**
 * The Vault's folder names, document titles and field lines are read whole.
 *
 * The founder, 2026-11-10: "The vault UI seems to be lacking in a lot of ways." Measured in the running app at
 * 1440px on the demo's IND project: 102 of 118 folder names in the binder tree were cut to an ellipsis
 * ("Module 1 · Admini…", "1.1.1 Form FD…"), 6 of 10 document titles, and 5 of 10 lines of fields. On a 1920px
 * screen the same, with the page held at the 1120px reading width and empty margins either side. A person could
 * not read their own filing structure. P-122: where minimalism and a customer seeing their own work conflict, the
 * work wins.
 *
 * jsdom applies no stylesheet, so this pins the rules that decide it, as d0Primitives.test.ts does. The
 * measurements, before and after, are in docs/evidence/SPINE/S6/2026-11-11-vault-names-read-whole/.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The v2 stylesheets: this folder, or a copy of it (the evidence's red run points the test at HEAD's). */
const STYLES = process.env.VAULT_NAMES_STYLES ?? resolve(__dirname, '../styles');
const css = readFileSync(resolve(STYLES, 'misc-surfaces-v2.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of every rule whose selector is exactly `selector` (this sheet nests its rules one level). */
function bodies(selector: string): string[] {
  const out: string[] = [];
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  const rule = new RegExp(`(?:^|[\\s;{}])${escaped}\\s*\\{([^{}]*)\\}`, 'g');
  for (let m = rule.exec(css); m; m = rule.exec(css)) out.push(m[1].replace(/\s+/g, ''));
  return out;
}
const CUT = /text-overflow:ellipsis|white-space:nowrap/;

describe('the Vault reads a name whole', () => {
  it('a folder name in the binder tree wraps and is never cut', () => {
    const label = bodies('.vd-flabel');
    expect(label.length).toBeGreaterThan(0);
    for (const body of label) expect(body).not.toMatch(CUT);
    expect(label.join(';')).toContain('overflow-wrap:anywhere');
    // The caret, the folder icon and the count keep their size beside a name of several lines.
    for (const part of ['.vd-caret', '.vd-fico', '.vd-fcount']) expect(bodies(part).join(';')).toContain('flex:none');
    expect(bodies('.vd-folder').join(';')).toContain('align-items:flex-start');
  });

  it('a document title in the list wraps, ranked above the one-line title other lists keep', () => {
    const title = bodies('.vd-list .vd-row .vd-col-name .vd-row-t');
    expect(title).toHaveLength(1);
    expect(title[0]).toContain('white-space:normal');
    expect(title[0]).toContain('overflow-wrap:anywhere');
    expect(title[0]).not.toContain('text-overflow:ellipsis');
    for (const body of bodies('.vd-list .vd-row-t')) expect(body).not.toMatch(CUT);
  });

  it('a document’s line of fields (type, versions, review stage, owner, date) wraps', () => {
    const line = bodies('.vd-list .vd-row .vd-row-s');
    expect(line.length).toBeGreaterThan(0);
    for (const body of line) expect(body).not.toMatch(CUT);
    expect(line.join(';')).toContain('overflow-wrap:anywhere');
  });

  it('the Vault takes a wide screen: its page is wider than the reading width, and the tree takes part of it', () => {
    const page = bodies('.page-inner.vd-wrap').join(';');
    const max = Number(/max-width:(\d+)px/.exec(page)?.[1] ?? 0);
    expect(max).toBeGreaterThan(1120);
    const browse = bodies('.vd-browse').join(';');
    const tree = /grid-template-columns:clamp\((\d+)px,[\d.]+%,(\d+)px\)minmax\(0,1fr\)/.exec(browse);
    expect(tree).not.toBeNull();
    expect(Number(tree![1])).toBeGreaterThanOrEqual(220);
    expect(Number(tree![2])).toBeGreaterThan(Number(tree![1]));
  });
});

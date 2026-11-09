/**
 * Sweep defect D3 (a), 2026-11-09 (docs/evidence/SPINE/S12/2026-11-09-sweep-fixes/d3-filing-card/): clicking the
 * Filing card's market row ("Dispatch blocked · 4 blockers") moved the whole app shell up 48px and hid the top bar.
 *
 * The screen-reader text beside a market's verdict (`.pj-sr`) is the usual visually-hidden span: position:absolute.
 * Neither of its hosts was positioned, so its containing block was the page itself. It hung off the document at its
 * static position, made the document scrollable, and the Submit verdict's scrollIntoView scrolled the document along
 * with the column. Measured in the running app: scrollTop 48, top bar at -48 (walk-red.json there).
 *
 * jsdom lays nothing out, so this pins the rule that fixes it; walk.cjs in that folder is the evidence that it works.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rules } from './_cssRules';

const css = rules(readFileSync(resolve(__dirname, '../styles/project-home-v2.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''));
const decl = (body: string, prop: string) => body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`))?.[1].trim() ?? null;
/** The position a class's own unscoped rules give it (`.c2c-v2 .<cls>` in a selector list), last one winning. */
const positionOf = (cls: string) => css
  .filter((r) => r.media === null && r.selector.split(',').some((s) => s.trim() === `.c2c-v2 .${cls}`))
  .map((r) => decl(r.body, 'position'))
  .filter((v): v is string => v !== null)
  .pop() ?? 'static';

/* Every element that holds a `.pj-sr` span directly or one level down. A new use of `.pj-sr` names its host here,
   with a rule that positions it, or it hangs off the document again. */
const HOSTS = ['pj-status-open', 'pj-mkt-verdict'];

describe("the Filing card's market row does not move the app shell", () => {
  it('the screen-reader text is taken out of flow (the premise: it needs a positioned host)', () => {
    expect(positionOf('pj-sr')).toBe('absolute');
  });

  it.each(HOSTS)('`.%s`, which holds that text, is its containing block', (cls) => {
    expect(positionOf(cls)).not.toBe('static');
  });

  /* The Commitments row (D3 (b)) lands on Respond's commitments with scrollIntoView. Respond's letters carry `.sr-only`
     text below the fold, so the same 48px shift came back there until each step body was positioned. */
  it("each step body is the containing block of its visually-hidden text (`.sr-only`, `.pj-sr`)", () => {
    expect(positionOf('pj-stagebody')).not.toBe('static');
  });

  it('every `.pj-sr` in the v2 surfaces sits inside one of those hosts', () => {
    const root = resolve(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (name === '__tests__' || name === 'node_modules') continue;
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.tsx')) files.push(p);
      }
    };
    walk(root);
    const loose: string[] = [];
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!/className="pj-sr"/.test(line)) return;
        /* The host's opening tag is on the same line or within the three before it. */
        const around = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
        if (!HOSTS.some((h) => around.includes(h))) loose.push(`${f.slice(root.length + 1)}:${i + 1}`);
      });
    }
    expect(loose).toEqual([]);
  });
});

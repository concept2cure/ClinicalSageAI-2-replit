/**
 * Human test J1 (2026-11-06, docs/evidence/HUMAN-TEST/J1/), two layout defects a tester hit, measured in the running
 * app at 1440 and 390 (walk.cjs there measures them again):
 *
 *  1. Project home's column moved sideways between steps: `.pj` is a flex item of the shell's `.page-full` row and was
 *     as wide as its content, so Review (narrower content) put the title 61px right of where Plan had it.
 *  2. The Projects list spilled a lead's e-mail over the target date at 1440, and at 390 squeezed the project's name to a
 *     word per line and cut four columns off with no way to reach them.
 *
 * jsdom lays nothing out, so this pins the rules that fix them; the walk is the evidence that they work.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rules } from './_cssRules';

const sheet = (name: string) => rules(readFileSync(resolve(__dirname, '../styles', name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''));
const decl = (body: string, prop: string) => body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`))?.[1].trim() ?? null;

describe('Project home keeps one column width on every step', () => {
  it('`.pj` claims the flex row it sits in', () => {
    const pj = sheet('journey-v2.css').filter((r) => r.selector === '.c2c-v2 .pj' && r.media === null);
    expect(pj.some((r) => /^1/.test(decl(r.body, 'flex') ?? ''))).toBe(true);
    expect(pj.some((r) => decl(r.body, 'min-width') === '0')).toBe(true);
  });
});

describe('The Projects list reads at 1440 and at 390', () => {
  const css = sheet('project-home-v2.css');
  it("a cell's text wraps inside its column", () => {
    const cell = css.find((r) => r.selector.includes('.pj-index .ct-row > div') && r.media === null);
    expect(cell && decl(cell.body, 'overflow-wrap')).toBe('anywhere');
    expect(cell && decl(cell.body, 'min-width')).toBe('0');
  });
  it('on a phone the table scrolls inside its frame and keeps its columns', () => {
    const phone = css.filter((r) => r.media?.includes('max-width: 640px'));
    expect(phone.some((r) => r.selector === '.c2c-v2 .pj-index .ctable' && decl(r.body, 'overflow-x') === 'auto')).toBe(true);
    const row = phone.find((r) => r.selector.includes('.pj-index .ct-row') && decl(r.body, 'min-width'));
    expect(parseInt(decl(row!.body, 'min-width')!, 10)).toBeGreaterThanOrEqual(1000);
  });
});

describe("Project home's section actions stay on a phone's screen", () => {
  // At 390, before this, buttons on Author, Review and Submit ended at 398–456px (walk.cjs measures every step).
  it('the head and its actions wrap at ≤640px', () => {
    const phone = sheet('project-home-v2.css').filter((r) => r.media?.includes('max-width: 640px'));
    expect(phone.some((r) => r.selector === '.c2c-v2 .pj .pj-sec-h' && decl(r.body, 'flex-wrap') === 'wrap')).toBe(true);
    const acts = phone.find((r) => r.selector === '.c2c-v2 .pj .pj-sec-acts');
    expect(acts && decl(acts.body, 'flex-wrap')).toBe('wrap');
    expect(acts && decl(acts.body, 'max-width')).toBe('100%');
  });
});

describe("New project's filing tabs reach every client type on a phone", () => {
  // At 390 the tab row was 661px wide and clipped: "Diagnostics & IVD" and "Cross-Cutting Documents" could not be reached.
  it('the wizard scrolls its filing tabs sideways and does not shrink them', () => {
    const css = sheet('project-home-v2.css');
    const row = css.find((r) => r.selector === '.c2c-v2 .npw .rpk-tabs');
    expect(row && decl(row.body, 'overflow-x')).toBe('auto');
    const tab = css.find((r) => r.selector === '.c2c-v2 .npw .rpk-tabs > *');
    expect(tab && decl(tab.body, 'flex-shrink')).toBe('0');
  });
});

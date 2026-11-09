/**
 * S5d-0 (2026-11-09): the S5 three-valued helpers have one home, `immunogenicity-reference.ts`, beside the shared
 * stated-input readers (`statedBoolean`, `booleanInputStates`, `statedNumber`, `statedOneOf`).
 *
 * Before: the "every answer" search (`everyAnswer`, `conclusions`, `decidingFacts`, with `uniqueStrings`) lived only
 * in `biomarker-knowledge.ts`, and the three-valued `unstated` / `anyOf` / `allOf` were copied, identical, into the
 * GCP and GMP engines, with `unstated` a fourth time in the medical-device engine. The S5d plans would have copied
 * the search into more engines. Each engine now imports them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  allOf,
  anyOf,
  conclusions,
  decidingFacts,
  everyAnswer,
  uniqueStrings,
  unstated,
} from '../immunogenicity-reference';

const SERVICES = fileURLToPath(new URL('../../', import.meta.url));
const HOME = 'immunogenicity/immunogenicity-reference.ts';
const NAMES = ['unstated', 'anyOf', 'allOf', 'uniqueStrings', 'everyAnswer', 'conclusions', 'decidingFacts'] as const;

/**
 * Module-level helpers that share a name but are not these, each with its reason. A stale entry fails the test, so
 * this list cannot outlive what it excuses.
 */
const NOT_THESE: Record<string, { names: readonly string[]; reason: string }> = {
  'research-compliance/compliance-checklist.ts': { names: ['anyOf', 'allOf'], reason: 'combine its own Condition type, not booleans' },
  'study-design/external-control-plan.ts': { names: ['unstated'], reason: "lists a plan's unstated elements as text" },
  'study-design/master-protocol.ts': { names: ['unstated'], reason: 'builds a not-stated protocol element' },
};

/** Every non-test .ts file under server/services, relative to it. */
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : sources(p);
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [path.relative(SERVICES, p)] : [];
  });
}

/** The helper names a file defines at module level, by name, as a function or a const/let binding. */
function defines(text: string): string[] {
  return NAMES.filter((name) =>
    new RegExp(`^(?:export\\s+)?(?:function\\s+${name}\\b|(?:const|let)\\s+${name}\\s*[=:])`, 'm').test(text),
  );
}

const T = true;
const F = false;
const U = undefined;
const N = null;

describe('the S5 three-valued helpers have one home', () => {
  it('no other module under server/services defines one of them by name', () => {
    const found = sources(SERVICES)
      .filter((file) => file !== HOME)
      .flatMap((file) => defines(fs.readFileSync(path.join(SERVICES, file), 'utf8')).map((name) => ({ file, name })));
    const copies = found
      .filter(({ file, name }) => !NOT_THESE[file]?.names.includes(name))
      .map(({ file, name }) => `${file}: ${name}`);
    expect(copies).toEqual([]);
    const stale = Object.entries(NOT_THESE).flatMap(([file, { names }]) =>
      names.filter((name) => !found.some((f) => f.file === file && f.name === name)).map((name) => `${file}: ${name}`),
    );
    expect(stale).toEqual([]);
  });

  it('the home defines all seven', () => {
    expect(defines(fs.readFileSync(path.join(SERVICES, HOME), 'utf8'))).toEqual([...NAMES]);
  });

  it('unstated is true only for an omitted or null value', () => {
    expect([U, N].map(unstated)).toEqual([T, T]);
    expect([F, T, 0, '', Number.NaN, {}].map(unstated)).toEqual([F, F, F, F, F, F]);
  });

  it.each([
    [T, T, T], [T, F, T], [T, U, T], [T, N, T],
    [F, T, T], [F, F, F], [F, U, U], [F, N, U],
    [U, T, T], [U, F, U], [U, U, U], [U, N, U],
    [N, T, T], [N, F, U], [N, U, U], [N, N, U],
  ])('anyOf(%s, %s) is %s', (a, b, expected) => {
    expect(anyOf(a, b)).toBe(expected);
  });

  it.each([
    [T, T, T], [T, F, F], [T, U, U], [T, N, U],
    [F, T, F], [F, F, F], [F, U, F], [F, N, F],
    [U, T, U], [U, F, F], [U, U, U], [U, N, U],
    [N, T, U], [N, F, F], [N, U, U], [N, N, U],
  ])('allOf(%s, %s) is %s', (a, b, expected) => {
    expect(allOf(a, b)).toBe(expected);
  });

  it('anyOf of nothing is false and allOf of nothing is true', () => {
    expect(anyOf()).toBe(false);
    expect(allOf()).toBe(true);
  });

  it('uniqueStrings keeps first-seen order', () => {
    expect(uniqueStrings(['b', 'a', 'b', 'c', 'a'])).toEqual(['b', 'a', 'c']);
  });

  it('everyAnswer keeps each stated fact and tries both answers for each unstated one', () => {
    expect(everyAnswer({ a: true, b: undefined })).toEqual([{ a: true, b: true }, { a: true, b: false }]);
    expect(everyAnswer({ a: false })).toEqual([{ a: false }]);
    expect(everyAnswer({ a: undefined, b: undefined })).toHaveLength(4);
  });

  it('conclusions lists the distinct conclusions, and decidingFacts the unstated facts that change one', () => {
    const conclude = (f: Record<'x' | 'y', boolean>): string => (f.x ? 'yes' : f.y ? 'maybe' : 'no');
    expect(conclusions({ x: undefined, y: false }, conclude)).toEqual(['yes', 'no']);
    expect(conclusions({ x: true, y: undefined }, conclude)).toEqual(['yes']);
    expect(decidingFacts({ x: undefined, y: undefined }, conclude)).toEqual(['x', 'y']);
    expect(decidingFacts({ x: true, y: undefined }, conclude)).toEqual([]);
  });
});

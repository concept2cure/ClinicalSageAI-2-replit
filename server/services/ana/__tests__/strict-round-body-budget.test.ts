/** D2/W2 pure result-body qualification over synthetic serialized results.
 * Legacy allocator bytes remain controls. New exports are feature-checked so
 * baseline red tests fail on real strict behavior, never a missing import.
 * No provider, source, receipt persistence or database is qualified here. */
import { describe, expect, it } from 'vitest';
import * as loop from '../agentic-loop.js';
import type { ToolResultBudgetOptions, ToolResultEntry } from '../agentic-loop.js';

type StrictOptions = ToolResultBudgetOptions & { strictTotal?: boolean };
type BudgetError = Error & { code: string };
const optional = loop as typeof loop & {
  ToolResultBudgetExceededError?: new (...args: never[]) => BudgetError;
  assertToolResultBodyBudget?: (entries: readonly ToolResultEntry[], totalBudget?: number) => void;
};
const ERROR_CODE = 'ANA_TOOL_RESULT_BUDGET_EXCEEDED';
const ERROR_MESSAGE = 'This tool round could not be passed to the assistant within its result limit. Some actions or source receipts may already exist; inspect the current state before repeating them.';
const PASSAGE = 'search_document_passages';
const PASSAGE_WITHHELD = JSON.stringify({ delivered: false, code: 'PASSAGE_RESULT_WITHHELD',
  message: 'This round withheld the passage result. Do not infer matches or absence. Narrow the query or read a known source.' });
const retry = (readAgainFrom: number): string => JSON.stringify({ delivered: false,
  reason: 'This round returned more than can be read at once.', readAgainFrom });
const entry = (id: string, content: string, name = 'ordinary'): ToolResultEntry => ({ tool_use_id: id, name, content });
const total = (entries: readonly ToolResultEntry[]): number => entries.reduce((sum, e) => sum + e.content.length, 0);
const strict = (entries: ToolResultEntry[], options: StrictOptions = {}): ToolResultEntry[] =>
  loop.budgetToolResultsForModel(entries, { ...options, strictTotal: true });

function jsonBody(size: number, label: string): string {
  const body = { label, text: '診断 🧬 "quoted" \\ path </section>', padding: '' };
  const base = JSON.stringify(body);
  if (base.length > size) throw new Error('Synthetic JSON size is too small.');
  body.padding = 'x'.repeat(size - base.length);
  return JSON.stringify(body);
}

function frozen(entries: ToolResultEntry[]): ToolResultEntry[] {
  entries.forEach(Object.freeze);
  return Object.freeze(entries) as unknown as ToolResultEntry[];
}

function expectOverflow(run: () => unknown): void {
  let caught: unknown;
  try { run(); } catch (error) { caught = error; }
  // This assertion is intentionally meaningful before the class is exported:
  // the historical allocator returns an over-budget array instead of throwing.
  expect(caught).toBeInstanceOf(Error);
  expect((caught as BudgetError).code).toBe(ERROR_CODE);
  expect((caught as Error).message).toBe(ERROR_MESSAGE);
  if (optional.ToolResultBudgetExceededError) expect(caught).toBeInstanceOf(optional.ToolResultBudgetExceededError);
}

function ordinaryWithheld(content: string): void {
  const body = JSON.parse(content) as Record<string, unknown>;
  expect(body.delivered).toBe(false);
  expect(body.code).toBe('TOOL_RESULT_WITHHELD');
  const guidance = Object.values(body).filter(value => typeof value === 'string').join(' ');
  expect(guidance).toMatch(/withheld/i);
  expect(guidance).toMatch(/success/i);
  expect(guidance).toMatch(/failure/i);
  expect(guidance).toMatch(/absence/i);
  expect(guidance).toMatch(/may already|already.*may/i);
  expect(guidance).toMatch(/inspect/i);
  expect(guidance).toMatch(/before.*repeat|repeat.*before/i);
  expect(content).not.toMatch(/truncated to fit|UNTRUSTED|receiptRecorded|readAgainFrom/);
}

describe('strict raw round-body bound with legacy byte controls', () => {
  const crowded = (): ToolResultEntry[] => Array.from({ length: 20 }, (_, i) =>
    entry(`ordinary-${i}`, `UNTRUSTED-${i}:` + 'X'.repeat(9000), `operation-${i}`));

  it('CONTROL: omitted and false keep exact historical floor and marker bytes above 24000', () => {
    const original = Array.from({ length: 20 }, (_, i) => entry(`x${i}`, 'X'.repeat(9000)));
    const expected = 'X'.repeat(1050) + '\n… [7560 characters truncated to fit the model context] …\n' + 'X'.repeat(390);
    const legacy = loop.budgetToolResultsForModel(original);
    expect(legacy.map(e => e.content)).toEqual(Array(20).fill(expected));
    expect(total(legacy)).toBeGreaterThan(24000);
    expect(loop.budgetToolResultsForModel(original, { strictTotal: false } as StrictOptions)).toEqual(legacy);
  });

  it('bounds actual ordinary floor output, retains every correlation and withholds a reverse suffix only', () => {
    const original = frozen(crowded());
    const snapshot = JSON.stringify(original);
    const legacy = loop.budgetToolResultsForModel(original);
    const out = strict(original);
    expect(total(legacy)).toBeGreaterThan(24000);
    expect(total(out)).toBeLessThanOrEqual(24000);
    expect(out.map(e => [e.tool_use_id, e.name])).toEqual(original.map(e => [e.tool_use_id, e.name]));
    const firstChanged = out.findIndex((e, i) => e.content !== legacy[i].content);
    expect(firstChanged).toBeGreaterThanOrEqual(0);
    expect(out.slice(0, firstChanged)).toEqual(legacy.slice(0, firstChanged));
    out.slice(firstChanged).forEach(e => ordinaryWithheld(e.content));
    expect(new Set(out.slice(firstChanged).map(e => e.content)).size).toBe(1);
    expect(total(out) + legacy[firstChanged].content.length - out[firstChanged].content.length).toBeGreaterThan(24000);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(strict(original)).toEqual(out);
  });

  it('keeps a valid under-budget round byte-identical including whole protected JSON', () => {
    const original = frozen([entry('ordinary', 'done'), entry('passage', jsonBody(2000, 'passage'), PASSAGE),
      entry('read', jsonBody(2000, 'private read'), 'read_project_document')]);
    const whole = new Map([['read', Object.freeze({ span: Object.freeze({ start: 37 }) })]]);
    const before = JSON.stringify([...whole]);
    expect(strict(original, { wholeOrNothing: whole })).toEqual(original);
    expect(JSON.stringify([...whole])).toBe(before);
  });

  it('uses a fixed ordinary envelope without copying source-controlled outcome or metadata', () => {
    const raw = JSON.stringify({ receiptRecorded: true, delivered: true, success: true,
      readAgainFrom: 777, message: 'UNTRUSTED action completed', padding: 's'.repeat(9000) });
    const out = strict([entry('action', raw, 'write_document')], { totalBudget: 500, minPerResult: 1500 });
    ordinaryWithheld(out[0].content);
    expect(out[0].content).not.toContain('777');
    expect(out[0].content).not.toContain('write_document');
    expect(total(out)).toBeLessThanOrEqual(500);
  });

  it('measures real legacy marker bytes under custom per-result ceiling and ordinary floor', () => {
    const original = [entry('custom', 'C'.repeat(10000))];
    const options = { totalBudget: 500, perResultMax: 700, minPerResult: 1000 };
    const legacy = loop.budgetToolResultsForModel(original, options);
    expect(legacy[0].content).toBe('C'.repeat(700) + '\n… [9060 characters truncated to fit the model context] …\n' + 'C'.repeat(240));
    expect(total(legacy)).toBeGreaterThan(500);
    const out = strict(original, options);
    ordinaryWithheld(out[0].content);
    expect(total(out)).toBeLessThanOrEqual(500);
  });
});

describe('observable class priority, exact protected bytes and no enlargement', () => {
  it('keeps short ordinary siblings, then withholds the last passage before any private read', () => {
    // A zero custom floor is supported by the existing allocator. Its whole
    // passages fill the target while one ordinary byte remains above target.
    const original = frozen([entry('p0', jsonBody(900, 'first passage'), PASSAGE),
      entry('r', jsonBody(600, 'read'), 'read_project_document'), entry('tiny', 'x'),
      entry('p1', jsonBody(900, 'last passage'), PASSAGE)]);
    const whole = new Map([['r', Object.freeze({ span: Object.freeze({ start: 65537 }) })]]);
    const before = JSON.stringify([...whole]);
    const options = { totalBudget: 2400, minPerResult: 0, wholeOrNothing: whole };
    const legacy = loop.budgetToolResultsForModel(original, options);
    expect(legacy).toEqual(original);
    expect(total(legacy)).toBe(2401);
    const out = strict(original, options);
    expect(out.map(e => [e.tool_use_id, e.name])).toEqual(original.map(e => [e.tool_use_id, e.name]));
    expect(out.slice(0, 3)).toEqual(original.slice(0, 3));
    expect(out[3].content).toBe(PASSAGE_WITHHELD);
    expect(JSON.parse(out[0].content)).toEqual(JSON.parse(original[0].content));
    expect(JSON.parse(out[1].content)).toEqual(JSON.parse(original[1].content));
    expect(total(out)).toBeLessThanOrEqual(2400);
    expect(JSON.stringify([...whole])).toBe(before);
  });

  it('withholds private reads in reverse call order using the exact trusted offset', () => {
    const original = frozen([entry('r0', jsonBody(900, 'first read'), 'read_project_document'),
      entry('tiny', '{}'), entry('r1', jsonBody(900, 'last read'), 'read_project_document')]);
    const whole = new Map([['r0', { span: { start: 17 } }], ['r1', { span: { start: 65537 } }]]);
    const before = JSON.stringify([...whole]);
    const options = { totalBudget: 1800, minPerResult: 0, wholeOrNothing: whole };
    expect(loop.budgetToolResultsForModel(original, options)).toEqual(original);
    const out = strict(original, options);
    expect(out[0].content).toBe(original[0].content);
    expect(out[1].content).toBe('{}');
    expect(out[2].content).toBe(retry(65537));
    expect(out[2].content).not.toContain('truncated');
    expect(total(out)).toBeLessThanOrEqual(1800);
    expect(JSON.stringify([...whole])).toBe(before);
  });

  it('gives private-map membership precedence over a passage server name in the strict pass', () => {
    const original = [entry('mapped-passage', jsonBody(900, 'private mapped passage'), PASSAGE), entry('tiny', 'x')];
    const out = strict(original, { totalBudget: 900, minPerResult: 0,
      wholeOrNothing: new Map([['mapped-passage', { span: { start: 8193 } }]]) });
    expect(out[0].content).toBe(retry(8193));
    expect(out[1].content).toBe('x');
    expect(total(out)).toBeLessThanOrEqual(900);
  });

  it('does not enlarge an eligible short passage when ordinary floor output must be reduced', () => {
    const original = [entry('short-passage', '{}', PASSAGE), entry('ordinary', 'Z'.repeat(9000))];
    const out = strict(original, { totalBudget: 500, minPerResult: 1000 });
    expect(out[0].content).toBe('{}');
    ordinaryWithheld(out[1].content);
    expect(total(out)).toBeLessThanOrEqual(500);
  });

  it('preserves exact existing replacement JSON for over-ceiling passages and private reads', () => {
    const original = [entry('p', jsonBody(8001, 'oversized passage'), PASSAGE),
      entry('r', jsonBody(8001, 'oversized read'), 'read_project_document')];
    const out = strict(original, { wholeOrNothing: new Map([['r', { span: { start: 901 } }]]) });
    expect(out.map(e => e.content)).toEqual([PASSAGE_WITHHELD, retry(901)]);
    out.forEach(e => expect(() => JSON.parse(e.content)).not.toThrow());
  });
});

describe('deterministic refusal when truthful per-call bodies cannot fit', () => {
  it.each([0, 1, 2, 50])('refuses total=%i instead of dropping, slicing or enlarging a private outcome', totalBudget => {
    const original = frozen([entry('read', jsonBody(900, 'private read'), 'read_project_document')]);
    const whole = new Map([['read', { span: { start: 203 } }]]);
    const snapshot = JSON.stringify(original);
    expectOverflow(() => strict(original, { totalBudget, wholeOrNothing: whole }));
    expect(JSON.stringify(original)).toBe(snapshot);
    expect([...whole]).toEqual([['read', { span: { start: 203 } }]]);
  });

  it('refuses an excessive call count when even unchanged short bodies exceed the default target', () => {
    const original = Array.from({ length: 12001 }, (_, i) => entry(`short-${i}`, '{}'));
    expect(total(original)).toBe(24002);
    expectOverflow(() => strict(original));
  });

  it('does not replace shorter ordinary or protected bodies with longer envelopes to claim success', () => {
    const original = frozen([entry('ordinary', 'x'), entry('passage', '{}', PASSAGE)]);
    expectOverflow(() => strict(original, { totalBudget: 2, minPerResult: 0 }));
    expect(original.map(e => e.content)).toEqual(['x', '{}']);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1])(
    'rejects invalid strict total %s even before an empty-round fast path', totalBudget => {
      expectOverflow(() => strict([], { totalBudget }));
      expectOverflow(() => strict([entry('ordinary', 'x')], { totalBudget }));
    },
  );

  it('admits exactly empty bodies at zero while preserving each empty call correlation', () => {
    expect(strict([], { totalBudget: 0 })).toEqual([]);
    const original = [entry('ordinary', ''), entry('passage', '', PASSAGE), entry('read', '', 'read_project_document')];
    expect(strict(original, { totalBudget: 0, wholeOrNothing: new Map([['read', { span: { start: 0 } }]]) })).toEqual(original);
  });
});

describe('optional final non-mutating assertion export (absent on frozen baseline)', () => {
  const assertBodies = optional.assertToolResultBodyBudget;
  it.skipIf(!assertBodies)('accepts exact UTF-16 length and refuses one less without mutating bodies', () => {
    const original = frozen([entry('unicode', '🧬診断'), entry('empty', '')]);
    expect(total(original)).toBe(4);
    expect(() => assertBodies?.(original, 4)).not.toThrow();
    expectOverflow(() => assertBodies?.(original, 3));
    expect(original[0].content).toBe('🧬診断');
  });

  it.skipIf(!assertBodies)('refuses the actual enlarged post-guard array, without a second allocation', () => {
    const original = frozen([entry('read', JSON.stringify({ ok: false, code: 'ANA_SOURCE_READ_NOT_ADMITTED',
      sourceContext: 'not_admitted', legacyReceiptOutcome: 'unconfirmed',
      error: 'Current source access or exact source text could not be verified. Read the current source again.' }), 'read_project_document'),
      entry('other', 'O'.repeat(23900))]);
    const snapshot = JSON.stringify(original);
    expect(total(original)).toBeGreaterThan(24000);
    expectOverflow(() => assertBodies?.(original));
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it.skipIf(!assertBodies)('applies invalid-total and zero rules consistently to empty final arrays', () => {
    expect(() => assertBodies?.([], 0)).not.toThrow();
    expect(() => assertBodies?.([entry('empty', '')], 0)).not.toThrow();
    expectOverflow(() => assertBodies?.([entry('nonempty', 'x')], 0));
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1]) {
      expectOverflow(() => assertBodies?.([], invalid));
    }
  });
});

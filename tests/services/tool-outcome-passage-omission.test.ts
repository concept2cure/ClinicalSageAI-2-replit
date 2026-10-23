/** Existing shortfall reader/adaptation note over a successful all-omitted
 * passage response. Pure consumer proof; no retrieval, model or database. */
import { describe, expect, it } from 'vitest';
import { buildShortfallNote, shortfallOf, type RoundStep } from '../../server/services/ana/tool-outcome';

const json = (value: unknown) => JSON.stringify(value);
const MESSAGE = 'Matching passages existed but were omitted because complete source locators did not fit.';
const omitted = (over: Record<string, unknown> = {}) => json({
  ok: true, passages: [], omittedPassages: 2, message: MESSAGE, ...over,
});
const step = (label: string, result: string, extra: Partial<RoundStep> = {}): RoundStep =>
  ({ label, status: 'success', result, ...extra });

describe('successful passage matches omitted from the tool response', () => {
  it.each([1, 2, Number.MAX_SAFE_INTEGER])('recognizes %s explicitly omitted matches without declaring a miss', count => {
    const result = shortfallOf(omitted({ omittedPassages: count }));
    expect(result?.kind).toBe('omitted');
    expect(result?.detail).toBe(MESSAGE);
    expect(result?.kind).not.toBe('empty');
  });

  it('uses the structured omission count even when the response gives no explanatory prose', () => {
    expect(shortfallOf(json({ ok: true, passages: [], omittedPassages: 3 }))).toEqual({ kind: 'omitted' });
  });

  it('keeps an omitted response detail bounded like existing shortfall details', () => {
    const message = `${MESSAGE} ${'Use the source record. '.repeat(30)}`;
    const result = shortfallOf(omitted({ message }));
    expect(result?.kind).toBe('omitted');
    expect(result?.detail).toBeDefined();
    expect(result!.detail!.length).toBeLessThanOrEqual(160);
    expect(result!.detail).toContain(MESSAGE);
  });
});

describe('invalid or incomplete omission declarations do not manufacture matches', () => {
  it.each([undefined, null, 0, -1, 1.5, '2', true, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'keeps a real empty list empty for invalid omittedPassages %j', count => {
      expect(shortfallOf(omitted({ omittedPassages: count }))).toEqual({ kind: 'empty' });
    },
  );

  it.each([undefined, null, 'true', 1])('requires strict ok: true, rather than %j', ok => {
    expect(shortfallOf(omitted({ ok }))).toEqual({ kind: 'empty' });
  });

  it.each([undefined, null, {}, 'not a list'])('requires an actual empty passage list, rather than %j', passages => {
    expect(shortfallOf(omitted({ passages }))).toBeNull();
  });

  it('does not apply a passage-specific omission count to an unrelated empty lookup', () => {
    expect(shortfallOf(json({ ok: true, results: [], omittedPassages: 3 }))).toEqual({ kind: 'empty' });
  });

  it('keeps a genuine passage miss empty with its existing classification', () => {
    expect(shortfallOf(json({ ok: true, query: 'stability', passages: [],
      coverage: { total: 3, indexed: 3 }, message: 'No passage matched "stability".' }))).toEqual({ kind: 'empty' });
  });
});

describe('existing higher-priority outcomes remain authoritative', () => {
  it.each([
    { error: 'Source access refused.' },
    { refused: true, reason: 'Source access refused.' },
    { ok: false, code: 'PASSAGE_RESULT_TOO_LARGE', resultOmitted: true },
  ])('does not reinterpret an existing refusal as omitted matches: %j', refusal => {
    expect(shortfallOf(omitted(refusal))).toBeNull();
  });

  it.each([
    { status: 'unavailable', expected: 'unavailable' },
    { status: 'lookup_failed', expected: 'unavailable' },
    { status: 'needs_parameters', expected: 'needs_input' },
    { status: 'not_found', expected: 'empty' },
  ])('preserves a declared $status status over omission metadata', ({ status, expected }) => {
    expect(shortfallOf(omitted({ status }))?.kind).toBe(expected);
  });

  it('preserves an unavailable flag over omission metadata', () => {
    expect(shortfallOf(omitted({ unavailable: true }))?.kind).toBe('unavailable');
  });

  it('does not turn an old indexing-failure diagnostic into a whole-search outage after known matches', () => {
    const message = `${MESSAGE} One document previously failed to index (API unavailable).`;
    expect(shortfallOf(omitted({ message }))).toEqual({
      kind: 'omitted', detail: message,
    });
  });

  it.each([undefined, 0, 1.5])('keeps the existing detail-only outage heuristic without a valid omission count: %j', count => {
    expect(shortfallOf(omitted({ omittedPassages: count, message: 'The API is currently unavailable.' }))).toEqual({
      kind: 'unavailable', detail: 'The API is currently unavailable.',
    });
  });

  it.each([
    { passages: [{ documentId: 'source-1', locator: 'p.3' }] },
    { records: [{ id: 'record-1' }] },
    { molecules: [{ chemblId: 'CHEMBL25' }] },
  ])('does not call returned records an omitted-only shortfall: %j', returned => {
    expect(shortfallOf(omitted(returned))).toBeNull();
  });
});

describe('the next model turn receives omission guidance instead of absence', () => {
  it('names omitted matches and guides narrowing/reading without saying nothing matched', () => {
    const note = buildShortfallNote([step('Searched Vault passages', omitted())], 1);
    expect(note).toContain('[Adaptation note]');
    expect(note).toContain('Searched Vault passages');
    expect(note).toMatch(/omitted/i);
    expect(note).toMatch(/match(?:es|ing)/i);
    expect(note).toMatch(/narrow/i);
    expect(note).toMatch(/read/i);
    expect(note).toMatch(/not[\s\S]*(?:absence|absent|missing)|(?:absence|absent|missing)[\s\S]*not/i);
    expect(note).not.toContain('returned no results');
    expect(note).not.toContain('No passage matched');
  });

  it('keeps a mixed round truthful about omission, a real miss and returned records', () => {
    const note = buildShortfallNote([
      step('Vault passages', omitted()),
      step('Literature lookup', json({ articles: [], count: 0 })),
      step('Existing study records', json({ records: [{ id: 'study-1' }] })),
    ], 3);
    expect(note).toContain('Vault passages');
    expect(note).toMatch(/omitted/i);
    expect(note).not.toContain('Vault passages — returned no results');
    expect(note).toContain('Literature lookup — returned no results');
    expect(note).not.toContain('Existing study records');
    expect(note).toMatch(/narrow/i);
    expect(note).toMatch(/not[\s\S]*(?:absence|absent|missing)|(?:absence|absent|missing)[\s\S]*not/i);
  });

  it('keeps the previous note byte-identical when no omitted shortfall exists', () => {
    const note = buildShortfallNote([
      step('Literature lookup', json({ articles: [], count: 0 })),
      step('Label lookup', json({ status: 'unavailable', reason: 'openFDA timed out' })),
      step('Study records', json({ records: [{ id: 'study-1' }] })),
    ], 3);
    expect(note).toBe('[Adaptation note] 2 of 3 tool calls this round returned nothing usable: ' +
      'Literature lookup — returned no results; Label lookup — the service could not be reached (openFDA timed out). ' +
      'Do not present what these did not return as found: vary the input or try another source, ' +
      'ask the person for what is missing, or say plainly what could not be found.');
  });

  it.each([
    { status: 'error' }, { status: 'stopped' }, { heldBack: true },
  ])('does not add omission guidance for a failed/stopped/held step: %j', state => {
    expect(buildShortfallNote([step('Vault passages', omitted(), state)], 1)).toBe('');
  });
});

/** Contract-first completion of the existing shortfall reader and note.
 * Pure native consumer proof: no handler, gateway, retrieval or database. */
import { describe, expect, it } from 'vitest';
import { buildShortfallNote, shortfallOf, type RoundStep } from '../../server/services/ana/tool-outcome';

const json = (value: unknown) => JSON.stringify(value);
const CODE = 'PASSAGE_RESULT_WITHHELD';
const MESSAGE = 'This round withheld the passage result. Do not infer matches or absence. Narrow the query or read a known source.';
const withheld = (over: Record<string, unknown> = {}) => json({ delivered: false, code: CODE, message: MESSAGE, ...over });
const step = (label: string, result: string, extra: Partial<RoundStep> = {}): RoundStep =>
  ({ label, status: 'success', result, ...extra });

describe('the exact structured passage withholding declaration', () => {
  it('recognizes the code and strict false delivery flag without inferring matches', () => {
    expect(shortfallOf(json({ delivered: false, code: CODE }))).toEqual({ kind: 'withheld' });
  });

  it('keeps withholding separate from both a genuine miss and known omitted matches', () => {
    expect(shortfallOf(withheld())).toEqual({ kind: 'withheld', detail: MESSAGE });
    expect(shortfallOf(withheld())?.kind).not.toBe('empty');
    expect(shortfallOf(withheld())?.kind).not.toBe('omitted');
  });

  it('bounds the message using the existing 160-character detail policy', () => {
    const message = `${MESSAGE} ${'More recovery guidance. '.repeat(30)}`;
    expect(shortfallOf(withheld({ message }))).toEqual({ kind: 'withheld', detail: `${message.slice(0, 159)}…` });
  });

  it('does not turn copied diagnostic prose into a service outage after explicit withholding', () => {
    const message = 'A prior API unavailable diagnostic does not establish what this withheld result contained.';
    expect(shortfallOf(withheld({ message }))).toEqual({ kind: 'withheld', detail: message });
  });

  it('does not infer an empty result from stray zero counters beside the withholding declaration', () => {
    expect(shortfallOf(withheld({ passages: [], count: 0 }))).toEqual({ kind: 'withheld', detail: MESSAGE });
  });

  it('does not infer known matches from stray omission metadata on an undelivered result', () => {
    expect(shortfallOf(withheld({ ok: true, passages: [], omittedPassages: 2 }))).toEqual({ kind: 'withheld', detail: MESSAGE });
  });
});

describe('partial or unstructured signals are not withholding authority', () => {
  it.each([undefined, null, true, 0, 'false', {}])('requires delivered to be strictly false rather than %j', delivered => {
    expect(shortfallOf(withheld({ delivered }))).toBeNull();
  });

  it.each([undefined, null, '', 'passage_result_withheld', 'PASSAGE_RESULT_WITHHELD ', 'OTHER_RESULT_WITHHELD', 1])(
    'requires the exact code rather than %j', code => {
      expect(shortfallOf(withheld({ code }))).toBeNull();
    },
  );

  it.each([
    { label: 'top-level array', value: [{ delivered: false, code: CODE }] },
    { label: 'nested payload', value: { payload: { delivered: false, code: CODE } } },
    { label: 'JSON string', value: json({ delivered: false, code: CODE }) },
  ])('does not promote $label declarations', ({ value }) => {
    expect(shortfallOf(json(value))).toBeNull();
  });

  it('does not interpret ordinary prose about a withheld result as the structured declaration', () => {
    expect(shortfallOf(MESSAGE)).toBeNull();
  });

  it('does not interpret incomplete JSON as withholding authority', () => {
    expect(shortfallOf('{"delivered":false,"code":"PASSAGE_RESULT_WITHHELD"')).toBeNull();
  });

  it('keeps a true empty list empty when the delivery flag is invalid', () => {
    expect(shortfallOf(withheld({ delivered: 'false', passages: [] }))).toEqual({ kind: 'empty' });
  });

  it('keeps the ordinary diagnostic outage heuristic when the code is invalid', () => {
    expect(shortfallOf(withheld({ code: 'OTHER', message: 'The API is currently unavailable.' }))).toEqual({
      kind: 'unavailable', detail: 'The API is currently unavailable.',
    });
  });

  it('keeps successful known-match omission distinct when there is no withholding declaration', () => {
    expect(shortfallOf(json({ ok: true, passages: [], omittedPassages: 2 }))).toEqual({ kind: 'omitted' });
  });
});

describe('existing higher-priority outcomes remain authoritative', () => {
  it.each([
    { error: 'Source access refused.' },
    { refused: true, reason: 'Source access refused.' },
    { ok: false },
  ])('does not override an existing refusal: %j', refusal => {
    expect(shortfallOf(withheld(refusal))).toBeNull();
  });

  it.each([
    { status: 'unavailable', expected: 'unavailable' },
    { status: 'lookup_failed', expected: 'unavailable' },
    { status: 'needs_parameters', expected: 'needs_input' },
    { status: 'not_found', expected: 'empty' },
  ])('preserves declared $status ahead of the withholding marker', ({ status, expected }) => {
    expect(shortfallOf(withheld({ status }))?.kind).toBe(expected);
  });

  it('preserves an explicit unavailable flag', () => {
    expect(shortfallOf(withheld({ unavailable: true }))).toEqual({ kind: 'unavailable', detail: MESSAGE });
  });

  it.each([
    { passages: [{ documentId: 'source-1', locator: 'p.3' }] },
    { records: [{ id: 'record-1' }] },
    { molecules: [{ chemblId: 'CHEMBL25' }] },
  ])('does not call returned records withheld: %j', returned => {
    expect(shortfallOf(withheld(returned))).toBeNull();
  });
});

describe('adaptation guidance distinguishes withholding, omission and absence', () => {
  it('names the withheld result and guides recovery without asserting matches or a miss', () => {
    const note = buildShortfallNote([step('Vault passage search', withheld())], 1);
    expect(note).toContain('[Adaptation note] 1 of 1 tool call');
    expect(note).toMatch(/Vault passage search[^;]*withheld/i);
    expect(note).toMatch(/narrow/i);
    expect(note).toMatch(/read/i);
    expect(note).toMatch(/do not (?:infer|quote)|does not establish|not evidence absence/i);
    expect(note).not.toContain('returned no results');
    expect(note).not.toContain('matching passages were omitted');
    expect(note).not.toContain('the service could not be reached');
  });

  it('keeps mixed-round withholding, known omitted matches, a true miss and returned records distinct', () => {
    const note = buildShortfallNote([
      step('Withheld passage search', withheld()),
      step('Known omitted matches', json({ ok: true, passages: [], omittedPassages: 2 })),
      step('Literature lookup', json({ articles: [], count: 0 })),
      step('Study records', json({ records: [{ id: 'study-1' }] })),
    ], 4);
    expect(note).toContain('3 of 4 tool calls');
    expect(note).toMatch(/Withheld passage search[^;]*withheld/i);
    expect(note).toContain('Known omitted matches — matching passages were omitted');
    expect(note).toContain('Literature lookup — returned no results');
    expect(note).not.toContain('Withheld passage search — returned no results');
    expect(note).not.toContain('Study records');
    expect(note).toMatch(/not evidence absence/);
  });

  it('keeps ordinary notes byte-identical without a withheld result', () => {
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

  it('keeps known-omitted notes byte-identical without a withheld result', () => {
    const note = buildShortfallNote([step('Vault passages', json({ ok: true, passages: [], omittedPassages: 2 }))], 1);
    expect(note).toBe('[Adaptation note] 1 of 1 tool call this round returned nothing usable: ' +
      'Vault passages — matching passages were omitted to fit the result. ' +
      'Omitted matches are not evidence absence. Do not quote text that was not returned: narrow the query or read the source files. ' +
      'For other shortfalls, vary the input or source, or ask the person for missing input.');
  });

  it.each([{ status: 'error' }, { status: 'stopped' }, { heldBack: true }])(
    'does not add a shortfall note for a failed/stopped/held result: %j', state => {
      expect(buildShortfallNote([step('Vault passage search', withheld(), state)], 1)).toBe('');
    },
  );

  it('adds no note when a structured declaration also returned records', () => {
    expect(buildShortfallNote([step('Vault passage search', withheld({ records: [{ id: 'record-1' }] }))], 1)).toBe('');
  });

  it('adds no note to an empty round', () => {
    expect(buildShortfallNote([], 0)).toBe('');
  });
});

/** Canonical round budgeting over synthetic complete handler bodies. The
 * approved contract is docs/evidence/D2-PASSAGE-ROUND-DELIVERY/2026-10-21/CONTRACT.md.
 * Pure budget seam; canonical setup mocks pg. No live source, provider or
 * database operation is qualified. */
import { describe, expect, it } from 'vitest';
import { budgetToolResultsForModel, capToolResultForModel, type ToolResultEntry } from '../agentic-loop.js';

const PASSAGE = 'search_document_passages';
const entry = (id: string, content: string, name = PASSAGE): ToolResultEntry => ({ tool_use_id: id, name, content });

function payload(id: string, size: number, extra: Record<string, unknown> = {}): string {
  const body = {
    ok: true, query: '診断 device response', ranking: 'text',
    coverage: { total: 9, indexed: 6, pending: 2, failed: 1, failureReasons: ['OCR needs review'],
      unfiledUploads: null, unfiledUploadsMore: false },
    passages: [{ documentId: id, contentHash: 'a'.repeat(64), documentTitle: '試験 🧬 "quoted" \\ path',
      locator: 'p.7 · 結果 </section>', pageNumber: 7, chunkIndex: 3,
      hitSpan: { start: 17, end: 29 }, context: { status: 'available', text: 'Result\u0000 "12/30" 🧬',
        reference: { documentId: id, contentHash: 'a'.repeat(64), span: { start: 10, end: 40, totalChars: 90 },
          source: { kind: 'vault_document', id }, textSha256: 'b'.repeat(64) },
        chunkRange: [2, 4], clipped: true, hitWithinText: { start: 7, end: 19 } } }],
    ...extra, message: '',
  };
  const base = JSON.stringify(body);
  if (base.length > size) throw new Error(`Synthetic body needs ${base.length} characters, asked ${size}`);
  body.message = 'x'.repeat(size - base.length);
  return JSON.stringify(body);
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(child => freeze(child));
    Object.freeze(value);
  }
  return value;
}

/** Independent contract shape, never copied from a production replacement export. */
function withheld(content: string): void {
  const out = JSON.parse(content) as Record<string, unknown>;
  expect(Object.keys(out).sort()).toEqual(['code', 'delivered', 'message']);
  expect(out.code).toBe('PASSAGE_RESULT_WITHHELD');
  expect(out.delivered).toBe(false);
  expect(typeof out.message).toBe('string');
  expect(String(out.message)).toMatch(/round/i);
  expect(String(out.message)).toMatch(/withheld/i);
  expect(String(out.message)).toMatch(/narrow/i);
  expect(String(out.message)).toMatch(/read/i);
  expect(content.length).toBeLessThanOrEqual(200);
  expect(content).not.toContain('truncated to fit');
}

const retry = (offset: number): string => JSON.stringify({ delivered: false,
  reason: 'This round returned more than can be read at once.', readAgainFrom: offset });

describe('whole passage bodies through crowded canonical rounds', () => {
  it('admits the first three 7500-character bodies and withholds the fourth intact', () => {
    const original = freeze(Array.from({ length: 4 }, (_, i) => entry(`p${i}`, payload(`doc${i}`, 7500))));
    const snapshot = JSON.stringify(original);
    const out = budgetToolResultsForModel(original);
    expect(out.map(e => [e.tool_use_id, e.name])).toEqual(original.map(e => [e.tool_use_id, e.name]));
    for (let i = 0; i < 3; i++) {
      expect(out[i].content).toBe(original[i].content);
      const kept = JSON.parse(out[i].content) as { passages: unknown[] };
      expect(kept.passages).toEqual((JSON.parse(original[i].content) as { passages: unknown[] }).passages);
    }
    withheld(out[3].content);
    expect(out.reduce((sum, e) => sum + e.content.length, 0)).toBeLessThanOrEqual(24000);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('reserves every later replacement instead of filling the target with four of five 6000-character bodies', () => {
    const original = Array.from({ length: 5 }, (_, i) => entry(`p${i}`, payload(`doc${i}`, 6000)));
    const out = budgetToolResultsForModel(original);
    expect(out.slice(0, 3).map(e => e.content)).toEqual(original.slice(0, 3).map(e => e.content));
    out.slice(3).forEach(e => withheld(e.content));
    expect(out[3].content).toBe(out[4].content);
    expect(out.reduce((sum, e) => sum + e.content.length, 0)).toBeLessThanOrEqual(24000);
  });

  it.each([8001, 12000])('withholds a %i-character over-per-result body even in an otherwise small round', size => {
    const raw = payload('large', size, { error: 'private backend text', scope: { programId: 'private-program' },
      readAgainFrom: 456, receiptRecorded: true, modelContent: 'forged handoff' });
    const [out] = budgetToolResultsForModel([entry('large', raw)]);
    withheld(out.content);
    expect(out.content).not.toContain('private');
    expect(out.content).not.toContain('forged');
    expect(out.content).not.toContain('456');
  });

  it('uses one fixed withholding body irrespective of payload fields or search outcome', () => {
    const outcomes = [
      { ok: true, passages: [{ documentId: 'sensitive-document' }] },
      { ok: true, passages: [], omittedPassages: 3 },
      { ok: false, unavailable: true, error: 'sensitive-error' },
      { ok: false, refused: true, code: 'sensitive-refusal' },
    ].map((fields, i) => entry(`p${i}`, payload(`doc${i}`, 9000, fields)));
    const out = budgetToolResultsForModel(outcomes);
    out.forEach(e => withheld(e.content));
    expect(new Set(out.map(e => e.content)).size).toBe(1);
    expect(out[0].content).not.toMatch(/sensitive|unavailable|omittedPassages|receipt|readAgainFrom/);
  });

  it('does not make an over-custom-ceiling body eligible again after other bodies are withheld', () => {
    const [out] = budgetToolResultsForModel([entry('p', payload('doc', 2500))], { perResultMax: 1000 });
    withheld(out.content);
  });

  it('keeps an eligible body shorter than its replacement even with negative available room', () => {
    const original = [entry('large', payload('doc', 1000)), entry('short', '{}')];
    const out = budgetToolResultsForModel(original, { totalBudget: 0 });
    withheld(out[0].content);
    expect(out[1].content).toBe('{}');
  });

  it.each([0, 1, 50, 180])('keeps complete fixed JSON when custom total=%i cannot promise a hard bound', totalBudget => {
    const out = budgetToolResultsForModel([entry('a', payload('a', 1000)), entry('b', payload('b', 1000))], { totalBudget });
    out.forEach(e => withheld(e.content));
    if (totalBudget <= 50) expect(out.reduce((sum, e) => sum + e.content.length, 0)).toBeGreaterThan(totalBudget);
  });

  it('keeps every small success, miss, omission, error and refusal byte-identical', () => {
    const bodies = [
      payload('doc', 1000),
      JSON.stringify({ ok: true, passages: [], message: 'No passage matched.' }),
      JSON.stringify({ ok: true, passages: [], omittedPassages: 3, message: 'Matches omitted.' }),
      JSON.stringify({ ok: false, unavailable: true, error: 'Index not available.' }),
      JSON.stringify({ ok: false, refused: true, message: 'Source access denied.' }),
    ];
    expect(budgetToolResultsForModel(bodies.map((s, i) => entry(String(i), s))).map(e => e.content)).toEqual(bodies);
  });
});

describe('private read placement keeps priority and its existing replacement', () => {
  it('reserves the same read floors/admission before allocating non-read passages in call order', () => {
    const reads = Array.from({ length: 4 }, (_, i) => entry(`r${i}`, 'R'.repeat(4900), 'read_project_document'));
    const original = freeze([entry('p0', payload('doc0', 7500)), ...reads, entry('p1', payload('doc1', 7500)),
      entry('p2', payload('doc2', 7500))]);
    const whole = new Map(reads.map((e, i) => [e.tool_use_id, freeze({ span: { start: 100 + i * 10 } })]));
    const mapBefore = JSON.stringify([...whole]);
    const sourceBefore = JSON.stringify(original);
    const out = budgetToolResultsForModel(original, { wholeOrNothing: whole });
    expect(out.slice(1, 4).map(e => e.content)).toEqual(reads.slice(0, 3).map(e => e.content));
    expect(out[4].content).toBe(retry(130));
    expect(out[0].content).toBe(original[0].content);
    withheld(out[5].content);
    withheld(out[6].content);
    expect(JSON.stringify([...whole])).toBe(mapBefore);
    expect(JSON.stringify(original)).toBe(sourceBefore);
  });

  it('gives a private-map entry precedence even when its server tool name is passage search', () => {
    const original = [entry('private-read', payload('private-doc', 9000)), entry('passage', payload('doc', 1000))];
    const out = budgetToolResultsForModel(original, { wholeOrNothing: new Map([['private-read', { span: { start: 65537 } }]]) });
    expect(out[0].content).toBe(retry(65537));
    expect(out[1].content).toBe(original[1].content);
  });

  it('keeps ordinary results under their per-result ceiling when passage withholding frees a larger share', () => {
    const passages = Array.from({ length: 4 }, (_, i) => entry(`p${i}`, payload(`doc${i}`, 1800)));
    const ordinary = entry('ordinary', 'O'.repeat(4000), 'search_literature');
    const out = budgetToolResultsForModel([...passages, ordinary], { perResultMax: 2000, totalBudget: 6800 });
    expect(out.slice(0, 2).map(e => e.content)).toEqual(passages.slice(0, 2).map(e => e.content));
    out.slice(2, 4).forEach(e => withheld(e.content));
    expect(out[4].content).toBe('O'.repeat(1400) + '\n… [2060 characters truncated to fit the model context] …\n' + 'O'.repeat(540));
    expect(out[4].content.length).toBeLessThanOrEqual(2000);
    expect(capToolResultForModel(out[4].content)).toBe(out[4].content);
  });
});

describe('legacy ordinary budgeting and classification controls', () => {
  it('keeps a small non-passage round byte-identical', () => {
    const original = [entry('a', 'A'.repeat(1000), 'first'), entry('b', 'B'.repeat(2000), 'second')];
    expect(budgetToolResultsForModel(original)).toEqual(original);
  });

  it('retains exact old equal-share slicing without passage calls', () => {
    const original = Array.from({ length: 4 }, (_, i) => entry(`x${i}`, 'X'.repeat(10000), 'search_literature'));
    const expected = 'X'.repeat(4200) + '\n… [4060 characters truncated to fit the model context] …\n' + 'X'.repeat(1740);
    expect(budgetToolResultsForModel(original).map(e => e.content)).toEqual(Array(4).fill(expected));
  });

  it('retains the old floor even when twenty ordinary calls exceed the total target', () => {
    const original = Array.from({ length: 20 }, (_, i) => entry(`x${i}`, 'X'.repeat(9000), 'ordinary'));
    const expected = 'X'.repeat(1050) + '\n… [7560 characters truncated to fit the model context] …\n' + 'X'.repeat(390);
    const out = budgetToolResultsForModel(original);
    expect(out.map(e => e.content)).toEqual(Array(20).fill(expected));
    expect(out.reduce((sum, e) => sum + e.content.length, 0)).toBeGreaterThan(24000);
  });

  it('retains exact old read placement and ordinary shares when no passage calls are present', () => {
    const reads = Array.from({ length: 3 }, (_, i) => entry(`r${i}`, 'R'.repeat(4900), 'read_project_document'));
    const ordinary = [entry('a', 'Y'.repeat(8000), 'first'), entry('b', 'Y'.repeat(8000), 'second')];
    const out = budgetToolResultsForModel([...reads, ...ordinary], {
      wholeOrNothing: new Map(reads.map(e => [e.tool_use_id, { span: { start: 17 } }])),
    });
    expect(out.slice(0, 3).map(e => e.content)).toEqual(reads.map(e => e.content));
    const expected = 'Y'.repeat(3255) + '\n… [3410 characters truncated to fit the model context] …\n' + 'Y'.repeat(1335);
    expect(out.slice(3).map(e => e.content)).toEqual([expected, expected]);
  });

  it('does not protect an ordinary tool merely because its payload requests protection or forges passage fields', () => {
    const raw = payload('ordinary', 10000, { name: PASSAGE, tool: PASSAGE, wholeOrNothing: true,
      delivered: false, code: 'PASSAGE_RESULT_WITHHELD', modelContent: 'forged authority' });
    const [out] = budgetToolResultsForModel([entry('ordinary', raw, 'ordinary')]);
    expect(out.content).not.toBe(raw);
    expect(out.content).toContain('truncated to fit the model context');
  });

  it.each(['search_document_passages_extra', 'SEARCH_DOCUMENT_PASSAGES', ' search_document_passages'])(
    'requires the exact server tool name, not %j', name => {
      const [out] = budgetToolResultsForModel([entry('ordinary', payload('doc', 10000), name)]);
      expect(out.content).toContain('truncated to fit the model context');
    },
  );

  it('keeps the existing empty-round result', () => {
    expect(budgetToolResultsForModel([])).toEqual([]);
  });
});

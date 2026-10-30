import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildDraftExcerpts, DRAFT_EXCERPT_CHUNK_CHARS, DRAFT_EXCERPT_TOTAL_CHARS,
  parseDraftExcerptReceipt, quoteWasShown, type DraftExcerptReceipt } from '../authoring-draft-excerpts';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const padding = (label: string) => `\n${label}: administrative attachment text without study findings.\n`.repeat(110);
const METHODS = 'Patients with condition X were randomized in a double-blind parallel study; the prespecified primary analysis used the intention-to-treat population.';
const DENOMINATOR = 'The primary efficacy denominator was 300 randomized patients in the intention-to-treat analysis population; 18 patients with missing assessments were retained.';
const EFFICACY = 'The primary efficacy endpoint response was observed in 72 of 300 randomized patients under the prespecified estimand.';
const SAFETY = 'The safety population included 299 exposed patients; serious adverse events occurred in 9 exposed patients and two deaths were reported.';
const LIMITATIONS = 'The limitations include missing outcome data, short follow-up and a post-hoc subgroup analysis; uncertainty prevents extrapolation to excluded patients.';
const CSR = 'Clinical Study Report\nProtocol CLR-203, version 3, 14 September 2026\n'
  + 'Table of Contents\n9 Study methods and population .... 14\n11 Primary efficacy denominator .... 40\n12 Safety population adverse events .... 70\n13 Limitations missing data .... 90\n'
  + padding('Appendix A') + '\n9 Study methods and population\n' + METHODS
  + padding('Appendix B') + '\n11.1 Analysis populations and denominator\n' + DENOMINATOR
  + padding('Appendix C') + '\n11.4.1 Primary efficacy endpoint\n' + EFFICACY
  + padding('Appendix D') + '\n12.2.1\nSerious adverse events\n' + SAFETY
  + padding('Appendix E') + '\n13 Discussion and limitations\n' + LIMITATIONS;
const clinical = (content = CSR, extra: { maxChars?: number; remainingChars?: number } = {}) =>
  buildDraftExcerpts(content, { query: 'Primary efficacy endpoint response', code: '11.4.1', ...extra });
const receipt = (value: ReturnType<typeof buildDraftExcerpts>): DraftExcerptReceipt => {
  return { version: value.version, basis: value.basis, originalTextLength: value.originalTextLength,
    originalTextSha256: value.originalTextSha256, budgetChars: value.budgetChars, shownChars: value.shownChars,
    omittedChars: value.omittedChars, promptChars: value.promptChars, spans: value.spans };
};

function exactSpans(content: string, result: ReturnType<typeof buildDraftExcerpts>) {
  expect(result.originalTextSha256).toBe(sha(content));
  expect(result.originalTextLength).toBe(content.length);
  expect(result.promptChars).toBe(result.promptText.length);
  expect(result.shownChars).toBe(result.spans.reduce((sum, span) => sum + span.end - span.start, 0));
  expect(result.omittedChars).toBe(content.length - result.shownChars);
  expect(result.shownChars).toBeLessThanOrEqual(result.budgetChars);
  for (const [index, span] of result.spans.entries()) {
    expect(span.sha256).toBe(sha(content.slice(span.start, span.end)));
    expect(result.promptText).toContain(content.slice(span.start, span.end));
    if (index > 0) expect(span.start).toBeGreaterThan(result.spans[index - 1].end);
    expect(/[\uD800-\uDBFF]$/.test(content.slice(span.start, span.end))).toBe(false);
    expect(/^[\uDC00-\uDFFF]/.test(content.slice(span.start, span.end))).toBe(false);
  }
  expect(parseDraftExcerptReceipt(receipt(result))).toEqual(receipt(result));
}

describe('bounded editor excerpts reuse source windows without treating an opening prefix as clinical evidence', () => {
  it('retains distant CSR metadata, methods, denominator, result, safety and limitations beyond the table of contents', () => {
    const result = clinical();
    for (const statement of ['Protocol CLR-203, version 3', METHODS, DENOMINATOR, EFFICACY, SAFETY, LIMITATIONS]) {
      expect(result.promptText).toContain(statement);
    }
    expect(result.basis).toBe('clinical-context-windows');
    expect(result.spans.filter(span => span.start > 600).length).toBeGreaterThanOrEqual(4);
    expect(result.promptText).toMatch(/omitted.*not shown|not shown.*omitted/i);
    expect(result.promptText).toMatch(/not.*whole.document review|not.*sufficiency/i);
    exactSpans(CSR, result);
  });

  it('keeps different efficacy and exposed-safety populations attached to their own denominators', () => {
    const result = clinical();
    expect(quoteWasShown(CSR, result, DENOMINATOR)).toBe(true);
    expect(quoteWasShown(CSR, result, SAFETY)).toBe(true);
    expect(quoteWasShown(CSR, result, 'The safety population included 300 exposed patients')).toBe(false);
    expect(quoteWasShown(CSR, result, LIMITATIONS)).toBe(true);
  });

  it('uses relevant CMC text without clinical-topic windows or instructions', () => {
    const target = 'Stability batches showed assay and impurity results within the recorded specifications at the stated storage condition.';
    const content = 'Background clinical safety population and patient history.\n' + padding('Manufacturing records') + '\nStability assay impurity batches storage condition\n' + target;
    const result = buildDraftExcerpts(content, { query: 'Stability assay impurity batches storage condition', code: '3.2.P.8' });
    expect(result.promptText).toContain(target);
    expect(result.spans.flatMap(span => span.basis).every(basis => !['methods-population', 'denominator', 'safety', 'limitations'].includes(basis))).toBe(true);
    expect(result.basis).toBe('section-window');
    exactSpans(content, result);
  });

  it('does not convert nonclinical safety pharmacology into a clinical-topic search', () => {
    const target = 'Safety pharmacology telemetry in dogs assessed cardiovascular and respiratory endpoints under the nonclinical protocol.';
    const content = padding('Study archive') + target;
    const result = buildDraftExcerpts(content, { query: 'Nonclinical safety pharmacology telemetry dogs cardiovascular respiratory', code: '2.6.2' });
    expect(result.promptText).toContain(target);
    expect(result.spans.flatMap(span => span.basis).every(basis => !['methods-population', 'denominator', 'safety', 'limitations'].includes(basis))).toBe(true);
    exactSpans(content, result);
  });

  it('preserves Unicode source coordinates after lowercase expansion and never slices a surrogate pair', () => {
    const statement = '主要評価項目の有効性解析では、対象患者300人を分母として評価した。🧬';
    const content = 'İ'.repeat(300) + padding('資料') + '\n有効性解析\n' + statement + '🧬'.repeat(900);
    const result = buildDraftExcerpts(content, { query: '有効性解析 対象患者', code: '2.7.3', maxChars: 801 });
    expect(result.promptText).toContain(statement);
    exactSpans(content, result);
  });

  it('masks long dotted ToC entries for searching without shifting original Unicode offsets', () => {
    const target = 'Recorded stability assay impurity storage results are provided for the stated batches and sampling interval.';
    const content = `Contents\r\nİ🧬 Stability assay impurity storage ${'.'.repeat(2000)} 41\r\n`
      + padding('Batch archive') + '\n' + target;
    const result = buildDraftExcerpts(content, { query: 'Stability assay impurity storage', code: '3.2.P.8' });
    expect(result.promptText).toContain(target);
    expect(result.spans[0].start).toBeGreaterThan(2000);
    exactSpans(content, result);
  });
});

describe('source-character budgets are explicit and independent from prompt wrapper characters', () => {
  it('uses the full short chunk without claiming a whole-document review', () => {
    const content = 'The supplied chunk states the recorded assay result; the remainder of the document is not supplied.';
    const result = buildDraftExcerpts(content, { query: 'assay result', code: '3.2.S.4' });
    expect(result.spans).toHaveLength(1);
    expect(result.spans[0]).toMatchObject({ start: 0, end: content.length });
    expect(result.basis).toBe('whole');
    expect(result.omittedChars).toBe(0);
    expect(result.promptChars).toBeGreaterThan(result.shownChars);
    exactSpans(content, result);
  });

  it('bounds every chunk and the passed remaining total allowance across seven sources', () => {
    let remaining = DRAFT_EXCERPT_TOTAL_CHARS;
    const results = Array.from({ length: 7 }, (_, index) => {
      const result = buildDraftExcerpts(`${index} ${'Recorded stability result. '.repeat(250)}`, { query: 'stability result', code: '3.2.P.8', maxChars: 99_999, remainingChars: remaining });
      expect(result.shownChars).toBeLessThanOrEqual(DRAFT_EXCERPT_CHUNK_CHARS);
      expect(result.shownChars).toBeLessThanOrEqual(remaining);
      remaining -= result.shownChars;
      return result;
    });
    expect(results.reduce((sum, result) => sum + result.shownChars, 0)).toBe(DRAFT_EXCERPT_TOTAL_CHARS);
    expect(results.at(-1)?.spans).toEqual([]);
    expect(results.at(-1)?.basis).toBe('budget-exhausted');
  });

  it('shows no source text at budget zero and names the omitted characters', () => {
    const content = 'SOURCE TEXT WHICH WAS NOT SHOWN';
    const result = buildDraftExcerpts(content, { query: 'source', remainingChars: 0 });
    expect(result.spans).toEqual([]);
    expect(result.shownChars).toBe(0);
    expect(result.omittedChars).toBe(content.length);
    expect(result.promptText).not.toContain(content);
    expect(result.promptText).toMatch(/no source text.*shown|zero.*shown/i);
    expect(result.promptText).toContain(String(content.length));
    expect(quoteWasShown(content, result, content)).toBe(false);
    exactSpans(content, result);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('rejects invalid source budgets %s', value => {
    expect(() => clinical(CSR, { maxChars: value })).toThrow(RangeError);
    expect(() => clinical(CSR, { remainingChars: value })).toThrow(RangeError);
  });

  it('deduplicates nearby clinical topics rather than charging the same source characters twice', () => {
    const content = padding('Archive') + '\n' + [METHODS, DENOMINATOR, EFFICACY, SAFETY, LIMITATIONS].join('\n');
    const result = clinical(content);
    exactSpans(content, result);
    expect(result.spans.some(span => span.basis.length > 1)).toBe(true);
  });

  it.each([0, 1, 2, 3, 7])('keeps exact code-point boundaries at a tiny %s character allowance', maxChars => {
    const content = '🧬🧬🧬🧬';
    const result = buildDraftExcerpts(content, { maxChars });
    exactSpans(content, result);
  });
});

describe('persisted excerpt receipts authenticate the entire original and every shown span', () => {
  it('rejects a quote present only in omitted text or stitched across two shown spans', () => {
    const result = clinical();
    expect(result.spans.length).toBeGreaterThan(1);
    const first = result.spans[0]; const second = result.spans[1];
    const joined = CSR.slice(first.end - 12, first.end) + CSR.slice(second.start, second.start + 12);
    expect(quoteWasShown(CSR, result, joined)).toBe(false);
    const gap = CSR.slice(first.end + 1, Math.min(second.start, first.end + 50));
    expect(gap.length).toBeGreaterThan(0);
    expect(quoteWasShown(CSR, result, gap)).toBe(false);
    expect(quoteWasShown(CSR, result, 'UTF-16 source offsets')).toBe(false);
    expect(quoteWasShown(CSR, result, '')).toBe(false);
  });

  it('rejects a changed original even when the requested quote and all shown text are unchanged', () => {
    const result = clinical();
    const changedAt = result.spans[0].end + 10;
    const changed = CSR.slice(0, changedAt) + '#' + CSR.slice(changedAt + 1);
    expect(quoteWasShown(changed, result, CSR.slice(result.spans[0].start, result.spans[0].start + 10))).toBe(false);
  });

  it('authenticates an unrelated shown span before accepting a quote from the first', () => {
    const result = clinical();
    const forged = receipt(result);
    forged.spans = forged.spans.map((span, index) => index === 1 ? { ...span, sha256: '0'.repeat(64) } : span);
    expect(quoteWasShown(CSR, forged, CSR.slice(result.spans[0].start, result.spans[0].start + 10))).toBe(false);
  });

  it.each([
    { version: 2 }, { originalTextSha256: 'not-a-hash' }, { originalTextLength: -1 }, { shownChars: 100_000 },
    { omittedChars: -1 }, { budgetChars: 2401 }, { promptChars: Number.NaN }, { basis: 'sufficient' },
  ])('rejects malformed persisted receipt arithmetic or authority %j', patch => {
    expect(parseDraftExcerptReceipt({ ...receipt(clinical()), ...patch })).toBeNull();
  });

  it('rejects reversed, out-of-bounds, overlapping and split-surrogate span receipts', () => {
    const result = clinical();
    for (const patch of [{ start: 50, end: 1 }, { start: 0, end: CSR.length + 1 }, { start: -1 }, { start: Number.MAX_SAFE_INTEGER + 1 }]) {
      const spans = result.spans.map((span, index) => index === 0 ? { ...span, ...patch } : span);
      expect(parseDraftExcerptReceipt({ ...receipt(result), spans })).toBeNull();
    }
    const overlapping = result.spans.map((span, index) => index === 1 ? { ...span, start: result.spans[0].start } : span);
    expect(parseDraftExcerptReceipt({ ...receipt(result), spans: overlapping })).toBeNull();
    const unicode = buildDraftExcerpts('🧬abc', { maxChars: 2 });
    const split: DraftExcerptReceipt = { ...receipt(unicode), spans: [{ start: 1, end: 2, sha256: sha('\uDDEC'), basis: ['source-opening'] }], shownChars: 1, omittedChars: 4 };
    expect(quoteWasShown('🧬abc', split, '\uDDEC')).toBe(false);
  });
});

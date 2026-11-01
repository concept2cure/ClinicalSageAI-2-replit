/**
 * The drafted-figure check (S5a): a figure the cited source states is found,
 * with where; one it does not state is unverified, never accepted. The figure
 * reader is the one AnA's answer check uses, so a number found only as a page
 * number or a date does not count.
 */
import { describe, expect, it } from 'vitest';
import {
  checkSectionFigures, figureSpansInContent, FINDINGS_KEPT,
  unverifiedFiguresAtSigning, figureAcknowledgementDigest, figureAcknowledgementVerdict,
} from '../draft-figure-check';

const CSR = [
  'CLINICAL STUDY REPORT BX-301-02 (data cut-off 2024-12-31).',
  'A total of 212 patients were randomized at 31 sites.',
  'The objective response rate was 47% in the bexotinib arm.',
  'Progression-free survival: HR 0.62 (95% CI 0.50-0.77), p = 0.0003.',
].join('\n');
const SOURCE = { documentId: '10000000-0000-4000-8000-000000000001', contentHash: 'a'.repeat(64), text: CSR };

describe('checkSectionFigures', () => {
  it('finds each figure the cited source states, with the document and the offset where it stands', () => {
    const out = checkSectionFigures('In 212 patients, the response rate was 47%; HR 0.62 (95% CI 0.50-0.77).', [SOURCE]);
    expect(out.unverified).toBe(0);
    expect(out.found).toBe(out.checked);
    const pct = out.figures.find((f) => f.kind === 'percent');
    expect(pct?.source).toMatchObject({ documentId: SOURCE.documentId, contentHash: SOURCE.contentHash });
    expect(CSR.slice(pct!.source!.offset!)).toMatch(/^47%/);
  });

  it('flags a figure the source does not state as unverified, listed first', () => {
    const out = checkSectionFigures('The response rate was 52% in 212 patients.', [SOURCE]);
    expect(out.unverified).toBe(1);
    expect(out.figures[0]).toMatchObject({ text: expect.stringContaining('52'), status: 'unverified' });
    expect(out.figures[0].source).toBeUndefined();
  });

  it('does not take a number that stands without its measure: 31 sites is not 31%', () => {
    const out = checkSectionFigures('The response rate was 31%.', [SOURCE]);
    expect(out.figures[0].status).toBe('unverified');
  });

  it('with no cited source every figure is unverified', () => {
    expect(checkSectionFigures('The response rate was 47%.', [])).toMatchObject({ checked: 1, unverified: 1, found: 0 });
  });

  it('names the document but no position when the reader could not confirm one (a link shifts its count)', () => {
    const linked = { ...SOURCE, text: `See https://example.org/a/very/long/path/to/a/page for methods. The response rate was 47%.` };
    const out = checkSectionFigures('The response rate was 47%.', [linked]);
    expect(out.figures[0]).toMatchObject({ status: 'found', source: { documentId: SOURCE.documentId } });
    const offset = out.figures[0].source!.offset;
    if (offset !== null) expect(linked.text.slice(offset)).toMatch(/^47/);
  });

  it('keeps complete counts when the findings kept are bounded', () => {
    const many = Array.from({ length: FINDINGS_KEPT + 5 }, (_, i) => `rate ${i + 1}%`).join('; ');
    const out = checkSectionFigures(many, [SOURCE]);
    expect(out.checked).toBe(FINDINGS_KEPT + 5);
    expect(out.figures).toHaveLength(FINDINGS_KEPT);
    expect(out.truncated).toBe(true);
  });
});

describe('figureSpansInContent (S5c)', () => {
  const doc = SOURCE.documentId;
  const found = (text: string, offset: number | null = 3) =>
    ({ text, kind: 'percent' as const, status: 'found' as const, source: { documentId: doc, contentHash: SOURCE.contentHash, offset } });
  const check = (figures: Array<ReturnType<typeof found> | { text: string; kind: 'percent'; status: 'unverified' }>) =>
    ({ checked: figures.length, found: figures.length, unverified: 0, truncated: false, figures });

  it('places a found figure at its characters in the stored content, with the source locator', () => {
    const content = '<p>The response rate was <strong>47%</strong> overall.</p>';
    const [span] = figureSpansInContent(content, check([found('47%', 812)]));
    expect(content.slice(span.charStart, span.charEnd)).toBe('47%');
    expect(span).toMatchObject({ vaultDocumentId: doc, contentHash: SOURCE.contentHash, sourceLocator: 'offset:812' });
  });

  it('never places a figure inside a tag or an attribute', () => {
    const content = '<table style="width: 47%"><tr><td>Rate 47%</td></tr></table>';
    const [span] = figureSpansInContent(content, check([found('47%')]));
    expect(span.charStart).toBe(content.lastIndexOf('47%'));
  });

  it('takes repeated figures in document order, and leaves out what it cannot place or was not found', () => {
    const content = '<p>47% then 47%.</p>';
    const spans = figureSpansInContent(content, check([found('47%'), found('47%'), found('99%'), { text: '12%', kind: 'percent', status: 'unverified' }]));
    expect(spans.map((s) => s.charStart)).toEqual([content.indexOf('47%'), content.lastIndexOf('47%')]);
  });

  it('a found figure with no confirmed offset names the document and no position', () => {
    expect(figureSpansInContent('<p>47%</p>', check([found('47%', null)]))[0].sourceLocator).toBeNull();
  });
});

/**
 * P-89 (2026-11-01): an approval or a seal checks the text being signed, so
 * what the signer acknowledges is the current text's unverified figures, each
 * by its own key, and nothing else stands in for it.
 */
describe('unverifiedFiguresAtSigning', () => {
  const section = (text: string, code = '2.5.4') => ({ id: 's-1', code, title: 'Overview of efficacy', text });

  it('lists each figure the signed text states and its cited source does not, by section', () => {
    const items = unverifiedFiguresAtSigning(
      [section('The response rate was 52% in 212 patients.')],
      [{ sectionCode: '2.5.4', excerpts: [SOURCE] }],
    );
    expect(items).toEqual([{
      key: 's-1#1:52%', sectionId: 's-1', sectionCode: '2.5.4', sectionTitle: 'Overview of efficacy',
      text: '52%', kind: 'percent', reason: 'not_in_cited_source',
    }]);
  });

  it('a figure corrected after the save is no longer listed: the check reads the text as it is now', () => {
    expect(unverifiedFiguresAtSigning(
      [section('The response rate was 47% in 212 patients.')],
      [{ sectionCode: '2.5.4', excerpts: [SOURCE] }],
    )).toEqual([]);
  });

  it('when a cited source no longer verifies, every figure of its section is listed as unchecked', () => {
    const items = unverifiedFiguresAtSigning(
      [section('The response rate was 47% in 212 patients.')],
      [{ sectionCode: '2.5.4', excerpts: null }],
    );
    expect(items.map((i) => [i.text, i.reason])).toEqual([
      ['47%', 'source_unavailable'], ['212 patients', 'source_unavailable'],
    ]);
  });

  it('a section that cites no saved sources is outside the check (P-89 scope)', () => {
    expect(unverifiedFiguresAtSigning([section('The response rate was 52%.', '2.7.3')], [{ sectionCode: '2.5.4', excerpts: [SOURCE] }])).toEqual([]);
  });

  it('a section named by two saved groups is checked once', () => {
    const items = unverifiedFiguresAtSigning([section('The response rate was 52%.')], [
      { sectionCode: '2.5.4', excerpts: [SOURCE] }, { sectionCode: '2.5.4', excerpts: null },
    ]);
    expect(items.map((i) => i.reason)).toEqual(['not_in_cited_source']);
  });
});

describe('figureAcknowledgementVerdict', () => {
  const items = unverifiedFiguresAtSigning(
    [{ id: 's-1', code: '2.5.4', title: 'Overview of efficacy', text: 'The response rate was 52%; HR 0.71.' }],
    [{ sectionCode: '2.5.4', excerpts: [SOURCE] }],
  );
  const keys = items.map((i) => i.key);

  it('nothing to acknowledge is clear', () => {
    expect(figureAcknowledgementVerdict([], undefined)).toBe('clear');
  });

  it('acknowledged only when every listed key is sent back and nothing else', () => {
    expect(keys).toHaveLength(2);
    expect(figureAcknowledgementVerdict(items, [...keys].reverse())).toBe('acknowledged');
    expect(figureAcknowledgementVerdict(items, undefined)).toBe('refused');
    expect(figureAcknowledgementVerdict(items, true)).toBe('refused');
    expect(figureAcknowledgementVerdict(items, keys.slice(0, 1))).toBe('refused');
    expect(figureAcknowledgementVerdict(items, [...keys, 's-1#1:99%'])).toBe('refused');
    expect(figureAcknowledgementVerdict(items, [keys[0], keys[0]])).toBe('refused');
  });

  it('an acknowledgement of an earlier text does not stand for a changed figure', () => {
    const edited = unverifiedFiguresAtSigning(
      [{ id: 's-1', code: '2.5.4', title: 'Overview of efficacy', text: 'The response rate was 53%; HR 0.71.' }],
      [{ sectionCode: '2.5.4', excerpts: [SOURCE] }],
    );
    expect(figureAcknowledgementVerdict(edited, keys)).toBe('refused');
    expect(figureAcknowledgementDigest(edited)).not.toBe(figureAcknowledgementDigest(items));
  });

  it('the digest does not depend on the order the figures were listed in', () => {
    expect(figureAcknowledgementDigest([...items].reverse())).toBe(figureAcknowledgementDigest(items));
    expect(figureAcknowledgementDigest(items)).toMatch(/^[0-9a-f]{64}$/);
  });
});

/**
 * Section-content → export-blocks conversion.
 *
 * The canonical editor stores section content as HTML that can carry
 * ins/del track-changes marks and comment-anchor spans; two earlier canvas
 * generations stored plain text and execCommand innerHTML. The exports must
 * render all three without leaking tags into a filed document and without
 * losing a word — and an unresolved suggestion must survive AS a suggestion
 * (redline), because silently settling it at export time would fabricate a
 * decision nobody made.
 */
import { describe, expect, it } from 'vitest';
import {
  blocksToPlainText,
  contentLooksLikeHtml,
  countPendingSuggestions,
  sectionContentToBlocks,
} from '../authoring-section-content';

describe('sectionContentToBlocks', () => {
  it('plain textarea-era text: one block per line, nothing invented', () => {
    const blocks = sectionContentToBlocks('First line.\nSecond line.\n\nThird paragraph.');
    expect(blocks.map((b) => blocksToPlainText([b]))).toEqual([
      'First line.',
      'Second line.',
      'Third paragraph.',
    ]);
    expect(blocks.every((b) => b.kind === 'paragraph')).toBe(true);
  });

  it('prose with a tag-shaped token stays literal plain text', () => {
    // `<critical>` here is prose, not markup. Any-tag detection used to route
    // this through an HTML parse that swallowed the token.
    const stored = 'Alarm fires above the <critical> threshold & more.';
    expect(contentLooksLikeHtml(stored)).toBe(false);
    expect(blocksToPlainText(sectionContentToBlocks(stored))).toBe(stored);
  });

  it('editor HTML: headings, formatting and lists map to typed runs', () => {
    const blocks = sectionContentToBlocks(
      '<h2>Stability</h2><p>Store at <b>2–8 °C</b> away from <i>light</i>.</p><ul><li>36 months</li></ul>',
    );
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 2 });
    expect(blocks[0].runs[0].text).toBe('Stability');
    const para = blocks[1];
    expect(para.runs.find((r) => r.bold)?.text).toBe('2–8 °C');
    expect(para.runs.find((r) => r.italics)?.text).toBe('light');
    expect(blocks[2]).toMatchObject({ kind: 'list-item' });
    expect(blocks[2].runs[0].text).toBe('36 months');
  });

  it('unresolved suggestions survive as redline runs with a countable census', () => {
    const blocks = sectionContentToBlocks(
      '<p>Shelf life is <del data-author-name="Dana">24</del><ins data-author-name="Dana">36</ins> months.</p>',
    );
    const runs = blocks[0].runs;
    const del = runs.find((r) => r.suggestion === 'deletion');
    const ins = runs.find((r) => r.suggestion === 'insertion');
    expect(del).toMatchObject({ text: '24', strike: true });
    expect(ins).toMatchObject({ text: '36', underline: true });
    expect(countPendingSuggestions(blocks)).toEqual({ insertions: 1, deletions: 1 });
    // BOTH readings are present in the text — nothing was settled silently.
    expect(blocksToPlainText(blocks)).toBe('Shelf life is 2436 months.');
  });

  it('comment-anchor spans keep their words and lose their dressing', () => {
    const blocks = sectionContentToBlocks(
      '<p>The <span data-comment-id="c1" class="rse-comment-anchor">primary endpoint</span> is OS.</p>',
    );
    expect(blocksToPlainText(blocks)).toBe('The primary endpoint is OS.');
    expect(countPendingSuggestions(blocks)).toEqual({ insertions: 0, deletions: 0 });
  });

  it('execCommand-era markup (div soup, provenance strip) loses no words', () => {
    const blocks = sectionContentToBlocks(
      '<h2>Device</h2><p>Uses <b>BX-204</b>.</p><div class="dc-prov"><span class="dc-prov-src">CSR 2.7.3</span><span class="dc-prov-conf" data-c="hi">HI</span></div>',
    );
    const text = blocksToPlainText(blocks);
    for (const phrase of ['Device', 'BX-204', 'CSR 2.7.3', 'HI']) {
      expect(text).toContain(phrase);
    }
  });

  it('empty and null content yield no blocks (honest empty, nothing fabricated)', () => {
    expect(sectionContentToBlocks(null)).toEqual([]);
    expect(sectionContentToBlocks('')).toEqual([]);
    expect(sectionContentToBlocks('   ')).toEqual([]);
  });
});

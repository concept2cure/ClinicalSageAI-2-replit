/**
 * AnA is credited with a clause only when every reader of the saved content
 * shows the words of AnA's turn record for it. Where readers can disagree, the
 * clause is not compared and stays the saver's.
 *
 * Periodic review 2026-09-28, editor family, the batch-draft accept, round 4:
 * the refute-review of round 3 (its probes are in this round's evidence,
 * review-probes/). The readers:
 *   - the section editor's canvas: a browser's parser, then the TipTap schema;
 *   - the editor's source mode, which shows every character. It opens for
 *     content holding figure/svg/video/embed/object (opensInSourceMode) and for
 *     content its fidelity gate calls lossy, which the server cannot compute;
 *   - the eCTD leaf and the authoring export: node-html-parser, through
 *     parseSectionHtml;
 *   - the plain-text reading (no known tag): every character.
 *
 * `credited` below is the authoring AI-draft accept's lineage
 * (enforceSourceAndAuthorLineage when no source matches): every clause of the
 * saved content by detectSpans, then the machine pass with the draft as
 * generated as the accepted text. The batch-draft accept runs the same pass
 * over the gate's split (clauseSpans), pinned through the route in
 * server/routes/__tests__/batch-draft-accept-readers.pglite.integration.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { attributeMachineSpans, comparableText, notComparedFrom, tagsMaskedForSplit } from '../machine-attribution';
import { detectSpans } from '../../sentenceTraceabilityService';
import { parseSectionHtml } from '../../../export/section-html-parse';
import { htmlToPlainText } from '../../ectd/leaf-pdf-renderer';
import { sectionContentToBlocks, blockRuns } from '../../../export/authoring-section-content';

const SENTENCE = 'The study drug was well tolerated in all cohorts.';
const RECORD = `<p>${SENTENCE}</p>`;
const SHOWN = '3 patients died';

/** The clauses of `content` the lineage credits to AnA from `accepted`. */
function credited(content: string, accepted = RECORD): string[] {
  return attributeMachineSpans(detectSpans(content, 'clause'), {
    accepted: [{ authorId: 'ana', text: accepted }],
    live: [],
    actor: '501',
    content,
  })
    .filter((s) => s.inAcceptedText)
    .map((s) => s.spanText);
}
const leaf = (content: string) => htmlToPlainText(content);
const exported = (content: string) =>
  sectionContentToBlocks(content)
    .map((b) => blockRuns(b).map((r) => r.text).join(''))
    .join('\n');

describe('D2: a token a browser hides as a tag and node-html-parser prints as text', () => {
  it.each([
    ['a double quote', `<b"${SHOWN}">`],
    ['a slash', `<b/${SHOWN}>`],
    ['a comma', `<b,${SHOWN}>`],
    ['a parenthesis', `<i(${SHOWN})>`],
    ['an equals sign', `<u=${SHOWN}>`],
  ])('%s after the tag name: the leaf and the export print it, so the clause is not AnA\'s', (_, token) => {
    const content = `<p>The study drug was well ${token} tolerated in all cohorts.</p>`;
    expect(leaf(content)).toContain(SHOWN);
    expect(exported(content)).toContain(SHOWN);
    expect(credited(content), 'words the leaf prints were credited to AnA').toEqual([]);
  });

  it('any ASCII punctuation right after the tag name: not AnA\'s', () => {
    for (const c of '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~') {
      const content = `<p>The study drug was well <b${c}${SHOWN}> tolerated in all cohorts.</p>`;
      expect(credited(content), JSON.stringify(c)).toEqual([]);
    }
  });

  it('outside the region it does not compare, node-html-parser and a browser show the same text, and the comparison drops only what neither shows', () => {
    const { window } = new JSDOM('<!doctype html><body><div></div></body>');
    const div = window.document.querySelector('div') as HTMLDivElement;
    const NAMES = ['b', 'i', 'p', 'a', 'B', 'span', 'sup', 'img', 'br', 'td', 'xmp', 'template', 'x'];
    const TAIL = [
      '<', '/', '>', '>', ' ', '\t', '\n', '"', "'", '=', 'b', '1', '-', ',', '(', '.', ':', '@', '!', '?', '_', '\u00a0',
      'é', ';', ' x="1"', " y='a b'", ' z=c', ' style="text-align: left"', ' colspan="2"', ' class="q"', '/>', '>',
    ];
    let seed = 11;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pick = <T,>(list: T[]) => list[Math.floor(next() * list.length)];
    // White space aside: node-html-parser's text writes a <br> as a line
    // break, textContent writes nothing; the comparison collapses white space.
    const squash = (s: string) => s.replace(/\s/g, '');
    let compared = 0;
    let stripped = 0;
    for (let n = 0; n < 6000; n++) {
      // Mostly a tag name and a tail of tag-like pieces; sometimes no name at all.
      let token = next() < 0.8 ? `<${next() < 0.2 ? '/' : ''}${pick(NAMES)}` : '<';
      const len = Math.floor(next() * 6);
      for (let k = 0; k < len; k++) token += pick(TAIL);
      const content = `<p>x${token}y</p>`;
      if (notComparedFrom(content) !== -1) continue;
      compared++;
      div.innerHTML = content;
      const browser = div.textContent ?? '';
      expect(squash(parseSectionHtml(content).text), `the readers disagree on ${JSON.stringify(token)}`).toBe(squash(browser));
      const form = comparableText(content);
      if (form.includes('<')) continue; // kept as written: it can only fail a match
      stripped++;
      expect(squash(form), `the comparison dropped what a reader shows: ${JSON.stringify(token)}`).toBe(squash(browser.toLowerCase()));
    }
    expect(compared, 'tokens compared').toBeGreaterThan(1000);
    expect(stripped, 'tokens the comparison removed').toBeGreaterThan(300);
  });
});

describe('D3: what the leaf or the export drops opens the not-compared region', () => {
  const NEGATED = '<p>The study drug was not effective in reducing mortality.</p>';

  it.each([
    ['template', '<p>The study drug was <template>not </template>effective in reducing mortality.</p>'],
    ['head', '<p>The study drug was <head>not </head>effective in reducing mortality.</p>'],
    ['a template opened in an earlier clause', '<p>Reviewer note <template>draft, The study drug was not effective in reducing mortality.</template></p>'],
  ])('%s: not AnA\'s', (_, content) => {
    expect(leaf(content)).not.toContain('not effective');
    expect(credited(content, NEGATED), 'a clause whose words the leaf drops was credited to AnA').toEqual([]);
  });

  it('a comment opened in an earlier clause hides a later one from every reader: not AnA\'s', () => {
    const record = '<p>The study drug was not effective in reducing mortality; enrolment stopped early.</p>';
    const content = '<p>Reviewer note <!-- draft; The study drug was not effective in reducing mortality; -->enrolment stopped early.</p>';
    expect(leaf(content)).toBe('Reviewer note enrolment stopped early.');
    expect(credited(content, record)).toEqual([]);
  });

  it.each([
    ['<template>', '<p>a</p><template>b'],
    ['<head>', '<p>a</p><HEAD>b'],
    ['a comment', '<p>a</p><!-- b -->'],
    ['<svg>', '<p>a</p><svg><text>b</text></svg>'],
    ['<math>', '<p>a</p><math>b</math>'],
    ['a raw-text element', '<p>a</p><xmp class="q">b'],
    ['a `<` a browser may read as markup and node-html-parser as text', '<p>a</p><b"c">'],
    ['a `<` the leaf reads as a mark and a browser as text', '<p>a</p>< sup>6< /sup>'],
  ])('notComparedFrom finds %s in HTML content', (_, content) => {
    expect(notComparedFrom(content)).toBe(8);
  });

  it('notComparedFrom finds nothing in plain text, where every reader shows every character', () => {
    expect(notComparedFrom('a <xmp>b <template>c <!-- d')).toBe(-1);
  });
});

describe('D4: the editor may open any content in source mode', () => {
  it.each([
    ['a figure later in the content', `<p>The study drug was well <b ${SHOWN}>tolerated</b> in all cohorts.</p><figure></figure>`],
    ['no figure (the fidelity gate may still call it lossy)', `<p>The study drug was well <b ${SHOWN}>tolerated</b> in all cohorts.</p>`],
    ['a data attribute', `<p>The study drug was well <span data-x="${SHOWN}">tolerated</span> in all cohorts.</p>`],
    ['a class', `<p>The study drug was well <b class="${SHOWN}">tolerated</b> in all cohorts.</p>`],
  ])('attribute text that could read as prose is not removed (%s): not AnA\'s', (_, content) => {
    expect(credited(content)).toEqual([]);
  });

  it('the attributes the canonical producers write are removed: TipTap\'s table cells and comment anchors', () => {
    const cell = `<table><tbody><tr><td colspan="1" rowspan="1"><p>${SENTENCE}</p></td></tr></tbody></table>`;
    expect(credited(cell)).toEqual([cell]);
    const anchored = `<p>The study drug was <span data-comment-id="c-17" class="rse-comment-anchor">well tolerated</span> in all cohorts.</p>`;
    expect(credited(anchored)).toEqual([anchored]);
  });

  it('content that opens in source mode is read as plain text: a clause holding a tag the comparison removes is not AnA\'s', () => {
    expect(credited(`<figure></figure>\n\n<p>${SENTENCE}</p>`)).toEqual([]);
  });

  it('in content that opens in source mode, a clause holding no tag is still AnA\'s (guard)', () => {
    expect(credited(`<figure></figure>\n\n${SENTENCE}`)).toEqual([SENTENCE]);
  });
});

describe('D5: an image prints its alt, or a label, in the leaf', () => {
  it.each([
    ['an inline figure with an alt', `<p>The study drug was well <img src="data:image/png;base64,iVBORw0KGgo=" alt="${SHOWN}"> tolerated in all cohorts.</p>`],
    ['an uploaded figure with no alt', '<p>The study drug was well <img src="/api/authoring/images/file_1727500000000_abc123"> tolerated in all cohorts.</p>'],
  ])('%s: not AnA\'s', (_, content) => {
    expect(leaf(content)).toContain('[Figure:');
    expect(credited(content)).toEqual([]);
  });

  it.each([
    ['with an alt', `<p>The study drug was well <img src="data:image/png;base64,iVBORw0KGgo=" alt="${SHOWN}"> tolerated in all cohorts.</p>`],
    ['with no alt: the leaf prints a label for its kind', '<p>The study drug was well <img src="/api/authoring/images/file_1727500000000_abc123"> tolerated in all cohorts.</p>'],
  ])('not even when AnA\'s record holds the same image, %s', (_, content) => {
    expect(credited(content, content)).toEqual([]);
  });
});

describe('D6: what the export or the editor prints from an attribute, over the words its element holds', () => {
  it.each([
    ['a footnote', `<p>The study drug was well <sup data-note="${SHOWN}">tolerated</sup> in all cohorts.</p>`],
    ['a citation locator', `<p>The study drug was well tolerated<a data-cite="src-1" data-cite-locator="${SHOWN}"></a> in all cohorts.</p>`],
    ['a cross-reference', '<p>The study drug was well tolerated<a data-xref="sec-2" data-xref-display="code"></a> in all cohorts.</p>'],
    ['a title', `<p>The study drug was well <span title="${SHOWN}">tolerated</span> in all cohorts.</p>`],
    ['a suggestion\'s author', `<p>The study drug was well <ins data-author-name="${SHOWN}">tolerated</ins> in all cohorts.</p>`],
    ['a list\'s start number', `<ol start="3"><li>${SENTENCE}</li></ol>`],
  ])('%s: not AnA\'s', (_, content) => {
    expect(credited(content)).toEqual([]);
  });

  it.each([
    ['a cross-reference', `<p>Reviewer note <a data-xref="sec-2">see, ${SENTENCE}</a></p>`],
    ['a footnote', `<p><sup data-note="${SHOWN}">Note, the study drug was well tolerated in all cohorts.</sup></p>`],
    ['a citation', `<p><a data-cite="src-1">Smith, ${SENTENCE}</a></p>`],
  ])('%s whose words run into a later clause: the export prints something else over them, so no clause of it is AnA\'s', (_, content) => {
    expect(detectSpans(content, 'clause').length, 'the element spans two clauses').toBeGreaterThan(1);
    expect(credited(content)).toEqual([]);
  });

  it('a clause after the element has closed is compared again (guard)', () => {
    const content = `<p>See <sup data-note="${SHOWN}">1</sup>.</p>\n\n<p>${SENTENCE}</p>`;
    expect(credited(content)).toEqual([`<p>${SENTENCE}</p>`]);
  });
});

describe('D7: an inline tag joins tokens and a block tag separates them, on both sides', () => {
  it('"At Week 2<b>4</b> patients" is not AnA\'s "At Week 2 4 patients"', () => {
    const content = '<p>At Week 2<b>4</b> patients reported headache.</p>';
    expect(leaf(content)).toBe('At Week 24 patients reported headache.');
    expect(credited(content, 'At Week 2 4 patients reported headache.')).toEqual([]);
  });

  it('the comparison form', () => {
    expect(comparableText('At Week 2<b>4</b> patients')).toBe('at week 24 patients');
    expect(comparableText('<p>Week 2</p><p>4 patients</p>')).toBe('week 2 4 patients');
    expect(comparableText('Week 2<br>4 patients')).toBe('week 2 4 patients');
  });

  it('markup AnA\'s record also has is AnA\'s (guard)', () => {
    const content = '<p>At Week 2<b>4</b> patients reported headache.</p>';
    expect(credited(content, content)).toEqual([content]);
  });
});

describe('D8: the turn record read as markdown drops only what markdown hides', () => {
  it('a lone asterisk stays: "5*10" is not "510"', () => {
    expect(comparableText('The starting dose was 5*10 mg/kg.', { markdown: true })).toBe('the starting dose was 5*10 mg/kg.');
  });

  it('paired emphasis, list markers, a thematic break and escapes read as markdown shows them', () => {
    expect(comparableText('The **primary** endpoint and *key* secondary', { markdown: true })).toBe('the primary endpoint and key secondary');
    expect(comparableText('* First item\n* Second item', { markdown: true })).toBe('first item second item');
    expect(comparableText('Above\n\n***\n\nBelow', { markdown: true })).toBe('above below');
    expect(comparableText('A \\* B \\| C', { markdown: true })).toBe('a * b | c');
  });
});

describe('C2(b): in plain text every character is shown, so there is no region', () => {
  const M = 'The sponsor will submit the cover letter in Module 1.';

  it('a "<style guide>" before AnA\'s clause leaves it AnA\'s', () => {
    const content = `Per the <style guide> each section stays short.\n\n${M}`;
    expect(credited(content, M)).toEqual([M]);
  });

  it('a markdown draft with an XML example is AnA\'s, every clause of it', () => {
    const draft = `The eCTD backbone lists each leaf with a title element.\n\n\`\`\`xml\n<leaf ID="l1"><title>Cover Letter</title></leaf>\n\`\`\`\n\n${M}`;
    expect(credited(draft, draft)).toHaveLength(detectSpans(draft, 'clause').length);
  });

  it('"<LLOQ" and a later ">3×ULN" (the weaker case) are AnA\'s', () => {
    const draft = 'Plasma concentrations were <LLOQ at 72 hours in all subjects. ALT >3×ULN was reported in two subjects.';
    expect(credited(draft, draft)).toHaveLength(2);
  });

  it('a clause accepted earlier is carried forward past a "<style guide>"', () => {
    const content = `Per the <style guide> each section stays short.\n\n${M}`;
    const live = {
      charStart: content.indexOf(M),
      charEnd: content.indexOf(M) + M.length,
      spanTextSha256: createHash('sha256').update(M).digest('hex'),
      provenanceKind: 'accepted_machine_draft' as const,
      machineAuthorId: 'ana',
      assertedBy: 'user-3',
      assertedAt: null,
      signatureId: null,
      createdBy: 'user-3',
    };
    const spans = attributeMachineSpans(detectSpans(content, 'clause'), { accepted: [], live: [live], actor: '501', content });
    expect(spans.map((s) => [s.spanText, s.assertedBy])).toEqual([[M, 'user-3']]);
  });
});

describe('DUP: a clause is credited no more times than the record holds it', () => {
  it('the same claim three times credits one of three repeated clauses', () => {
    const content = `<p>${SENTENCE}</p>\n\n<p>${SENTENCE}</p>\n\n<p>${SENTENCE}</p>`;
    const spans = attributeMachineSpans(detectSpans(content, 'clause'), {
      accepted: [1, 2, 3].map(() => ({ authorId: 'ana', text: RECORD })),
      live: [],
      actor: '501',
      content,
      recordOccurrences: (needle: string) => (comparableText(RECORD).includes(needle) ? 1 : 0),
    });
    expect(spans.filter((s) => s.inAcceptedText)).toHaveLength(1);
  });
});

describe('the authoring AI-draft accept (POST …/ai/draft/accept) reaches the same rules', () => {
  /* Its lineage: enforceSourceAndAuthorLineage, the draft as generated as the
     accepted text (ANA_MACHINE_AUTHOR_ID) and the member's edit as the content.
     With no source quoted, its machine pass runs over detectSpans(content),
     as `credited` does. Each draft is plain prose; each edit is a reviewer's
     case typed into it. */
  const DRAFT = `${SENTENCE} No new safety signal was identified in any prespecified subgroup.`;
  const NEGATED = 'The study drug was not effective in reducing mortality.';
  const WEEK = 'At Week 2 4 patients reported headache.';

  it.each([
    ['D2: a token the leaf prints', DRAFT, `The study drug was well <b"${SHOWN}"> tolerated in all cohorts. No new safety signal was identified in any prespecified subgroup.`],
    ['D3: words the leaf drops', NEGATED, '<p>The study drug was <template>not </template>effective in reducing mortality.</p>'],
    ['D4: attribute words source mode shows', DRAFT, `<p>The study drug was well <b ${SHOWN}>tolerated</b> in all cohorts.</p>`],
    ['D5: an alt the leaf prints', DRAFT, `<p>The study drug was well <img src="data:image/png;base64,iVBORw0KGgo=" alt="${SHOWN}"> tolerated in all cohorts.</p>`],
    ['D6: a footnote the export prints', DRAFT, `<p>The study drug was well <sup data-note="${SHOWN}">tolerated</sup> in all cohorts.</p>`],
    ['D7: two tokens joined', WEEK, '<p>At Week 2<b>4</b> patients reported headache.</p>'],
  ])('%s: that clause is the member\'s', (_, generated, edited) => {
    expect(credited(edited, generated)).not.toContain(detectSpans(edited, 'clause')[0].text);
  });

  it('a draft accepted as generated is AnA\'s, every clause (guard)', () => {
    expect(credited(DRAFT, DRAFT)).toHaveLength(detectSpans(DRAFT, 'clause').length);
  });
});

describe('linear time: the accept takes content up to 400,000 characters', () => {
  it.each([
    ['a `<`, then a long run of white space', `<p>a</p><${' '.repeat(100_000)}x`],
    ['a tag with many attributes and no `>`', `<p${' x'.repeat(100_000)}`],
    ['an attribute, then a long run of white space', `<p x${' '.repeat(200_000)}y`],
    ['many `< ` pairs', `<p>${'< '.repeat(100_000)}`],
    ['a chain of quoted values', `<p${' x="'.repeat(50_000)}`],
  ])('%s', (_, content) => {
    const started = performance.now();
    notComparedFrom(content);
    comparableText(content);
    tagsMaskedForSplit(content);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it.each([
    ['emphasis pairs', '*a'.repeat(100_000)],
    ['an opener with no closer', `*${'a'.repeat(200_000)}`],
    ['list items', '* item\n'.repeat(50_000)],
  ])('the markdown reading: %s', (_, text) => {
    const started = performance.now();
    comparableText(text, { markdown: true });
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

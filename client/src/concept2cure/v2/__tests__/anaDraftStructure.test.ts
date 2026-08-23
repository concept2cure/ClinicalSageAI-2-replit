// @vitest-environment jsdom
/**
 * AnA drafts enter the document as STRUCTURE, not as pipe characters.
 *
 * The product's pitch is that AnA and a regulatory author co-write submission
 * documents: AnA's answer reaches the section through `insertSuggestedContent`
 * as attributed pending <ins> marks the human accepts or rejects. That part was
 * right. The conversion was not — the answer was split on blank lines into
 * PLAIN paragraphs with single newlines collapsed (`p.replace(/\n+/g, ' ')`),
 * so a drafted specification table landed as literal `| Attribute | Method |`
 * inside a run-on paragraph, and headings and lists landed as `##` and `-`.
 *
 * For a Module 3 / CTD tool whose substance IS stability, specification and
 * endpoint tables, that made the headline capability unusable: AnA could not
 * draft the one thing the document is made of.
 *
 * Per the working agreement ("verify by making the check fail"), the first
 * describe block pins the exact failure — the pipes, the `##`, the `-` — as
 * text that must NOT survive into the record, and every structural assertion
 * below it is paired with the flat-paragraph outcome it replaced.
 */

import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import type { Node as PMNode } from '@tiptap/pm/model';

import {
  TrackChanges,
  collectSuggestions,
} from '../editor/suggestions';

const ANA = { id: 'ana', name: 'AnA (AI draft)' };
const HUMAN = { id: 'user-7', name: 'Jordan Medical Writer' };

/** The editor exactly as RichSectionEditor builds it: StarterKit (headings
 *  1–3, lists), TableKit, plus the track-changes extension. */
function makeEditor(content = '<p></p>'): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TableKit.configure({ table: { resizable: false } }),
      TrackChanges.configure({ enabled: true, author: HUMAN }),
    ],
    content,
  });
}

/** Top-level block types, in order. */
function shape(doc: PMNode): string[] {
  const out: string[] = [];
  doc.forEach((n) => out.push(n.type.name));
  return out;
}

function firstOfType(doc: PMNode, name: string): PMNode | null {
  let found: PMNode | null = null;
  doc.descendants((n) => {
    if (found) return false;
    if (n.type.name === name) {
      found = n;
      return false;
    }
    return true;
  });
  return found;
}

/** Cell text of a table node, row by row. */
function tableText(table: PMNode): string[][] {
  const rows: string[][] = [];
  table.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) => cells.push(cell.textContent));
    rows.push(cells);
  });
  return rows;
}

/** Cell node types of a table node, row by row. */
function tableCellTypes(table: PMNode): string[][] {
  const rows: string[][] = [];
  table.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) => cells.push(cell.type.name));
    rows.push(cells);
  });
  return rows;
}

/** Every text node in the doc, with the suggestion mark it carries (if any). */
function textNodeAttribution(doc: PMNode): Array<{ text: string; kind: string | null; authorId: string | null }> {
  const out: Array<{ text: string; kind: string | null; authorId: string | null }> = [];
  doc.descendants((n) => {
    if (!n.isText) return;
    const m = n.marks.find((k) => k.type.name === 'insertion' || k.type.name === 'deletion');
    out.push({
      text: n.text ?? '',
      kind: m ? m.type.name : null,
      authorId: m ? ((m.attrs.authorId as string | null) ?? null) : null,
    });
  });
  return out;
}

function hasMark(doc: PMNode, markName: string, text: string): boolean {
  let hit = false;
  doc.descendants((n) => {
    if (hit) return false;
    if (n.isText && (n.text ?? '').includes(text) && n.marks.some((m) => m.type.name === markName)) {
      hit = true;
    }
    return true;
  });
  return hit;
}

/* A realistic Module 3 answer: heading, prose, a specification table, a
   bulleted list with emphasis, and a numbered list. */
const DRAFT = [
  '## 3.2.P.5.1 Specification',
  '',
  'The drug product specification is presented below. Limits derive from',
  'release and stability data across three registration batches.',
  '',
  '| Attribute | Method | Acceptance criterion |',
  '| --- | --- | --- |',
  '| Appearance | Visual | White to off-white cake |',
  '| Assay | HPLC | 95.0-105.0% of label claim |',
  '',
  'Supporting points:',
  '',
  '- Assay is a **stability-indicating** method.',
  '- Degradation products are controlled per *ICH Q3B(R2)*.',
  '',
  '1. Release testing at batch disposition.',
  '2. Stability testing per ICH Q1A(R2).',
].join('\n');

describe('AnA draft conversion — the failure this exists to end', () => {
  it('the drafted table does NOT arrive as pipe characters in a paragraph', () => {
    const ed = makeEditor();
    ed.commands.insertSuggestedContent(DRAFT, ANA);
    const text = ed.getText();
    const html = ed.getHTML();
    const blocks = shape(ed.state.doc);
    ed.destroy();

    // The old behaviour, stated exactly: markdown syntax as literal record text.
    expect(text).not.toContain('|');
    expect(text).not.toContain('---');
    expect(html).not.toContain('| Attribute |');
    expect(text).not.toContain('## 3.2.P.5.1');
    expect(text).not.toContain('- Assay is a');
    expect(text).not.toContain('**stability-indicating**');

    // …and the document is not a run of flat paragraphs any more.
    expect(blocks).not.toEqual(blocks.filter((b) => b === 'paragraph'));
  });
});

describe('AnA draft conversion — real structure', () => {
  it('produces heading / paragraph / table / list nodes in document order', () => {
    const ed = makeEditor();
    ed.commands.insertSuggestedContent(DRAFT, ANA);
    const blocks = shape(ed.state.doc);
    const trailing = ed.state.doc.lastChild;
    ed.destroy();
    expect(blocks.slice(0, 6)).toEqual([
      'heading',
      'paragraph',
      'table',
      'paragraph',
      'bulletList',
      'orderedList',
    ]);
    // The empty paragraph the section started with survives AFTER the draft:
    // it is where the caret lands, and a section that ends in a table needs
    // somewhere to keep typing. It is empty, not stray content.
    expect(blocks).toHaveLength(7);
    expect(trailing?.type.name).toBe('paragraph');
    expect(trailing?.textContent).toBe('');
  });

  it('a markdown table becomes a real table node with a header row', () => {
    const ed = makeEditor();
    ed.commands.insertSuggestedContent(DRAFT, ANA);
    const table = firstOfType(ed.state.doc, 'table');
    const html = ed.getHTML();
    const rows = table ? tableText(table) : [];
    const types = table ? tableCellTypes(table) : [];
    ed.destroy();

    expect(table).toBeTruthy();
    expect(rows).toEqual([
      ['Attribute', 'Method', 'Acceptance criterion'],
      ['Appearance', 'Visual', 'White to off-white cake'],
      ['Assay', 'HPLC', '95.0-105.0% of label claim'],
    ]);
    // Header row is tableHeader; body rows are tableCell.
    expect(types[0]).toEqual(['tableHeader', 'tableHeader', 'tableHeader']);
    expect(types[1]).toEqual(['tableCell', 'tableCell', 'tableCell']);
    expect(html).toContain('<table');
    expect(html).toContain('<th');
  });

  it('ATX headings become headings, clamped to the schema levels (1–3)', () => {
    const ed = makeEditor();
    ed.commands.insertSuggestedContent(
      '# Top\n\n## Second\n\n### Third\n\n##### Deeper still',
      ANA,
    );
    const levels: number[] = [];
    const texts: string[] = [];
    ed.state.doc.forEach((n) => {
      if (n.type.name === 'heading') {
        levels.push(n.attrs.level as number);
        texts.push(n.textContent);
      }
    });
    ed.destroy();
    expect(levels).toEqual([1, 2, 3, 3]);
    expect(texts).toEqual(['Top', 'Second', 'Third', 'Deeper still']);
  });

  it('bullet and ordered lists become list nodes with one item per line', () => {
    const ed = makeEditor();
    ed.commands.insertSuggestedContent(DRAFT, ANA);
    const bullets = firstOfType(ed.state.doc, 'bulletList');
    const ordered = firstOfType(ed.state.doc, 'orderedList');
    const bulletItems: string[] = [];
    const orderedItems: string[] = [];
    bullets?.forEach((li) => bulletItems.push(li.textContent));
    ordered?.forEach((li) => orderedItems.push(li.textContent));
    const bulletChildTypes: string[] = [];
    bullets?.forEach((li) => bulletChildTypes.push(li.type.name));
    ed.destroy();

    expect(bulletItems).toEqual([
      'Assay is a stability-indicating method.',
      'Degradation products are controlled per ICH Q3B(R2).',
    ]);
    expect(bulletChildTypes).toEqual(['listItem', 'listItem']);
    expect(orderedItems).toEqual([
      'Release testing at batch disposition.',
      'Stability testing per ICH Q1A(R2).',
    ]);
  });

  it('inline **bold** and *italic* become marks, not literal asterisks', () => {
    const ed = makeEditor();
    ed.commands.insertSuggestedContent(DRAFT, ANA);
    const doc = ed.state.doc;
    const bold = hasMark(doc, 'bold', 'stability-indicating');
    const italic = hasMark(doc, 'italic', 'ICH Q3B(R2)');
    ed.destroy();
    expect(bold).toBe(true);
    expect(italic).toBe(true);
  });

  it('plain prose keeps today’s behaviour: blank lines split, single newlines collapse', () => {
    const ed = makeEditor();
    ed.commands.insertSuggestedContent(
      'The shelf life is 24 months\nwhen stored at 25 degrees C.\n\nA second paragraph.',
      ANA,
    );
    const blocks: Array<[string, string]> = [];
    ed.state.doc.forEach((n) => blocks.push([n.type.name, n.textContent]));
    ed.destroy();
    expect(blocks).toEqual([
      ['paragraph', 'The shelf life is 24 months when stored at 25 degrees C.'],
      ['paragraph', 'A second paragraph.'],
    ]);
  });
});

describe('AnA draft conversion — still a reviewable suggestion', () => {
  it('every inserted text node is a pending insertion attributed to AnA', () => {
    const ed = makeEditor();
    ed.commands.insertSuggestedContent(DRAFT, ANA);
    const attribution = textNodeAttribution(ed.state.doc);
    const html = ed.getHTML();
    const sugg = collectSuggestions(ed.state.doc);
    ed.destroy();

    expect(attribution.length).toBeGreaterThan(0);
    // Not one character of the draft is settled record text.
    expect(attribution.every((a) => a.kind === 'insertion')).toBe(true);
    expect(attribution.every((a) => a.authorId === 'ana')).toBe(true);
    // Including the text inside the table cells and the list items.
    expect(sugg.some((s) => s.text.includes('White to off-white cake'))).toBe(true);
    expect(sugg.some((s) => s.text.includes('Release testing'))).toBe(true);
    expect(sugg.every((s) => s.kind === 'insertion')).toBe(true);
    expect(html).toContain('<ins');
    expect(html).toContain('data-author-name="AnA (AI draft)"');
  });

  it('Accept all settles the text and keeps the structure', () => {
    const ed = makeEditor();
    ed.commands.insertSuggestedContent(DRAFT, ANA);
    ed.commands.resolveAllSuggestions('accept');
    const html = ed.getHTML();
    const blocks = shape(ed.state.doc);
    const table = firstOfType(ed.state.doc, 'table');
    const rows = table ? tableText(table) : [];
    const pending = collectSuggestions(ed.state.doc);
    ed.destroy();

    expect(pending).toHaveLength(0);
    expect(html).not.toContain('<ins');
    expect(blocks.slice(0, 6)).toEqual([
      'heading',
      'paragraph',
      'table',
      'paragraph',
      'bulletList',
      'orderedList',
    ]);
    expect(rows[2]).toEqual(['Assay', 'HPLC', '95.0-105.0% of label claim']);
  });

  it('Reject all removes the draft including its structural husks', () => {
    const ed = makeEditor('<p>Existing section text.</p>');
    ed.commands.setTextSelection(ed.state.doc.content.size - 1);
    ed.commands.insertSuggestedContent(DRAFT, ANA);
    expect(firstOfType(ed.state.doc, 'table')).toBeTruthy();

    ed.commands.resolveAllSuggestions('reject');
    const text = ed.getText();
    const html = ed.getHTML();
    const pending = collectSuggestions(ed.state.doc);
    ed.destroy();

    expect(pending).toHaveLength(0);
    // The author's own text is untouched…
    expect(text).toContain('Existing section text.');
    // …and no empty table / list / heading skeleton is left behind.
    expect(html).not.toContain('<table');
    expect(html).not.toContain('<ul');
    expect(html).not.toContain('<ol');
    expect(html).not.toContain('<h2');
    expect(text).not.toContain('Acceptance criterion');
  });

  it('one suggestion can be rejected on its own without disturbing the rest', () => {
    const ed = makeEditor();
    ed.commands.insertSuggestedContent(DRAFT, ANA);
    const target = collectSuggestions(ed.state.doc).find((s) =>
      s.text.includes('White to off-white cake'),
    );
    expect(target).toBeTruthy();
    ed.commands.resolveSuggestion(target!, 'reject');
    const table = firstOfType(ed.state.doc, 'table');
    const rows = table ? tableText(table) : [];
    ed.destroy();

    // The table survives — only that one cell's proposed text is gone.
    expect(rows).toEqual([
      ['Attribute', 'Method', 'Acceptance criterion'],
      ['Appearance', 'Visual', ''],
      ['Assay', 'HPLC', '95.0-105.0% of label claim'],
    ]);
  });

  it('the drafted structure and its attribution survive save + reload as HTML', () => {
    const ed = makeEditor();
    ed.commands.insertSuggestedContent(DRAFT, ANA);
    const saved = ed.getHTML();
    ed.destroy();

    // What the section stores is what a later session opens.
    const reopened = makeEditor(saved);
    const table = firstOfType(reopened.state.doc, 'table');
    const rows = table ? tableText(table) : [];
    const pending = collectSuggestions(reopened.state.doc);
    const shapeAfter = shape(reopened.state.doc).slice(0, 6);
    reopened.destroy();

    expect(shapeAfter).toEqual([
      'heading',
      'paragraph',
      'table',
      'paragraph',
      'bulletList',
      'orderedList',
    ]);
    expect(rows[1]).toEqual(['Appearance', 'Visual', 'White to off-white cake']);
    // Still pending, still AnA's — a reload does not settle an AI draft.
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((s) => s.kind === 'insertion')).toBe(true);
    expect(pending.every((s) => s.authorId === 'ana')).toBe(true);
    expect(pending.every((s) => s.authorName === 'AnA (AI draft)')).toBe(true);
  });
});

describe('AnA draft conversion — conservative fallbacks (never lose text)', () => {
  it('a pipe table with no separator row stays prose, pipes intact', () => {
    const ed = makeEditor();
    ed.commands.insertSuggestedContent('Ratio | value pairs were 3 | 4 and 5 | 6.', ANA);
    const blocks = shape(ed.state.doc);
    const text = ed.getText();
    ed.destroy();
    expect(blocks).toEqual(['paragraph']);
    expect(text).toBe('Ratio | value pairs were 3 | 4 and 5 | 6.');
  });

  it('an unsupported construct is kept verbatim rather than dropped', () => {
    const ed = makeEditor();
    const src = '```\nSELECT * FROM batches;\n```';
    ed.commands.insertSuggestedContent(src, ANA);
    const text = ed.getText();
    ed.destroy();
    expect(text).toContain('SELECT * FROM batches;');
    expect(text).toContain('```');
  });

  it('a ragged table is squared up rather than truncated', () => {
    const ed = makeEditor();
    ed.commands.insertSuggestedContent(
      ['| A | B |', '| --- | --- |', '| 1 | 2 | 3 |', '| 4 |'].join('\n'),
      ANA,
    );
    const table = firstOfType(ed.state.doc, 'table');
    const rows = table ? tableText(table) : [];
    ed.destroy();
    // No cell text is lost, and every row has the same width.
    expect(rows).toEqual([
      ['A', 'B', ''],
      ['1', '2', '3'],
      ['4', '', ''],
    ]);
  });

  it('empty or whitespace-only drafts are refused, as before', () => {
    const ed = makeEditor();
    expect(ed.commands.insertSuggestedContent('   \n  ', ANA)).toBe(false);
    ed.destroy();
  });
});

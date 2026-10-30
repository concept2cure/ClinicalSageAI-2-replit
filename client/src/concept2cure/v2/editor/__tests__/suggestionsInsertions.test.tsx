// @vitest-environment jsdom
/** The existing anchored proposal command also carries additions. The same
 * real Editor + TrackChanges fixture pattern is used by suggestionsPropose. */
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { Citation } from '../citationNode';
import { computeMatches } from '../findReplace';
import { SUGGESTION_ACTION_META, TrackChanges, proposeReplacement, type ReplacementProposal } from '../suggestions';

type Operation = 'replace' | 'insert-before' | 'insert-after' | 'insert-empty';
type Amendment = ReplacementProposal & { operation?: Operation };
const TURN = 'eeeeeeee-0000-4000-8000-000000000001';
const ANA = { id: 'ana', name: 'AnA (proposed fix)', sourceRecord: TURN };
const HUMAN = { id: 'user-7', name: 'Jordan Medical Writer' };
const editors: Editor[] = [];

for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = () => [];
  if (typeof proto.getBoundingClientRect !== 'function') proto.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}

function makeEditor(content: string, editable = true) {
  const editor = new Editor({
    element: document.createElement('div'), content, editable,
    extensions: [StarterKit, TableKit.configure({ table: { resizable: false } }), Citation,
      TrackChanges.configure({ enabled: true, author: HUMAN })],
  });
  editors.push(editor);
  return editor;
}
afterEach(() => { while (editors.length) editors.pop()!.destroy(); });

const request = (operation: Operation, quote: string, replacement: string, context: Pick<Amendment, 'prefix' | 'suffix'> = {}): Amendment => ({ operation, quote, replacement, ...context });
const apply = (editor: Editor, proposal: Amendment) => proposeReplacement(editor, { ...proposal, author: ANA });

function succeeds(editor: Editor, proposal: Amendment) {
  const result = apply(editor, proposal);
  expect(result).toMatchObject({ ok: true, applicationId: expect.stringMatching(/^[0-9a-f-]{36}$/i) });
  const inserted = Array.from(editor.view.dom.querySelectorAll('ins'));
  expect(inserted.length).toBeGreaterThan(0);
  for (const node of inserted) {
    expect(node.getAttribute('data-author-id')).toBe('ana');
    expect(node.getAttribute('data-source-record')).toBe(TURN);
  }
  expect(editor.view.dom.querySelector('del')).toBeNull();
  expect(editor.can().undo()).toBe(false);
}

function refuses(content: string, proposal: Amendment, reason?: string) {
  const editor = makeEditor(content);
  const before = editor.getHTML();
  const result = apply(editor, proposal);
  expect(result).toMatchObject({ ok: false, ...(reason ? { reason } : {}) });
  expect(editor.getHTML()).toBe(before);
}

function roundTrip(content: string, proposal: Amendment, accepted: string) {
  const live = makeEditor(content);
  const original = live.getHTML();
  succeeds(live, proposal);
  const pending = live.getHTML();
  live.commands.resolveAllSuggestions('reject');
  expect(live.getHTML(), 'live rejection must restore exact original HTML').toBe(original);
  const reloaded = makeEditor(pending);
  reloaded.commands.resolveAllSuggestions('reject');
  expect(reloaded.getHTML(), 'reloaded rejection must restore exact original HTML').toBe(original);
  const acceptedReload = makeEditor(pending);
  acceptedReload.commands.resolveAllSuggestions('accept');
  expect(acceptedReload.getHTML()).toBe(accepted);
  const acceptedLive = makeEditor(content);
  succeeds(acceptedLive, proposal);
  acceptedLive.commands.resolveAllSuggestions('accept');
  expect(acceptedLive.getHTML()).toBe(accepted);
}

describe.each(['insert-before', 'insert-after'] as const)('%s exact anchored additions', operation => {
  it('adds inline text at the quote edge without deleting or replacing the anchor', () => {
    const before = operation === 'insert-before';
    roundTrip('<p>Review the evidence now.</p>', request(operation, 'evidence', before ? 'current ' : ' carefully'),
      `<p>Review the ${before ? 'current evidence' : 'evidence carefully'} now.</p>`);
  });

  it('retains the anchor formatting and adds attributed text', () => {
    const editor = makeEditor('<p>Review the <strong>evidence</strong> now.</p>');
    succeeds(editor, request(operation, 'evidence', 'SOURCE '));
    expect(editor.view.dom.querySelector('strong')?.textContent).toContain('evidence');
    expect(editor.view.dom.querySelector('del')).toBeNull();
  });

  it('uses exact context to choose one repeated quote', () => {
    const editor = makeEditor('<p>Primary evidence.</p><p>Secondary evidence.</p>');
    const addition = operation === 'insert-before' ? 'verified ' : ' verified';
    succeeds(editor, request(operation, 'evidence', addition, { prefix: 'Secondary ' }));
    const paragraphs = editor.view.dom.querySelectorAll('p');
    expect(paragraphs[0].querySelector('ins')).toBeNull();
    expect(paragraphs[1].querySelector('ins')?.textContent).toBe(addition);
  });

  it('refuses ambiguous or missing anchors and contradictory context', () => {
    refuses('<p>Evidence.</p><p>Evidence.</p>', request(operation, 'Evidence', 'New '), 'ambiguous');
    refuses('<p>Evidence.</p>', request(operation, 'Absent', 'New '), 'not-found');
    refuses('<p>Evidence.</p>', request(operation, 'Evidence', 'New ', { prefix: 'Wrong ' }), 'not-found');
  });

  it.each(['ins', 'del'])('refuses an anchor intersecting pending %s text', tag => {
    refuses(`<p>Source <${tag} data-author-id="user-7">evidence</${tag}>.</p>`, request(operation, 'evidence', 'New '), 'overlaps-suggestion');
  });

  it.each(['<p>Source <code>evidence</code>.</p>', '<pre><code>evidence</code></pre>', '<p>Source ev<code>iden</code>ce.</p>'])('refuses unmarkable anchor content: %s', content => {
    refuses(content, request(operation, 'evidence', 'New '), 'unsupported-content');
  });

  it('refuses a quote crossing a citation atom or paragraph boundary', () => {
    refuses('<p>Source <a data-cite="17">Protocol</a> evidence.</p>', request(operation, 'Source evidence', 'New '), 'not-found');
    refuses('<p>Source</p><p>evidence.</p>', request(operation, 'Source evidence', 'New '), 'not-found');
  });

  it.each(['First addition.\n\nSecond addition.', '- first control\n- second control', '| A | B |\n| --- | --- |\n| 1 | 2 |'])('refuses structured content at a mid-paragraph anchor edge', replacement => {
    refuses('<p>Source evidence is retained.</p>', request(operation, 'evidence', replacement), 'structural');
  });

  it('keeps a distant selection and never scrolls or focuses it', () => {
    const editor = makeEditor('<p>Introduction retained.</p><p>Evidence retained.</p>');
    editor.commands.setTextSelection({ from: 2, to: 8 });
    const scrolls: boolean[] = [];
    editor.on('transaction', ({ transaction }) => scrolls.push(transaction.scrolledIntoView));
    succeeds(editor, request(operation, 'Evidence', 'New '));
    expect([editor.state.selection.from, editor.state.selection.to]).toEqual([2, 8]);
    expect(scrolls).toEqual([false]);
    expect(editor.isFocused).toBe(false);
  });

  it('maps the person’s caret so the same following words remain under it', () => {
    const editor = makeEditor('<p>Evidence retained. Closing words.</p>');
    const [closing] = computeMatches(editor.state.doc, 'Closing', true);
    editor.commands.setTextSelection(closing.from);
    succeeds(editor, request(operation, 'Evidence', 'New '));
    const position = editor.state.selection.from;
    expect(editor.state.doc.textBetween(position, position + 7)).toBe('Closing');
  });

  it('refuses an empty quote, empty addition, and a read-only editor', () => {
    refuses('<p>Evidence.</p>', request(operation, '', 'New '));
    refuses('<p>Evidence.</p>', request(operation, 'Evidence', ''));
    const editor = makeEditor('<p>Evidence.</p>', false);
    expect(apply(editor, request(operation, 'Evidence', 'New '))).toEqual({ ok: false, reason: 'not-editable' });
    expect(editor.getHTML()).toBe('<p>Evidence.</p>');
  });
});

describe('structured additions at exact textblock boundaries', () => {
  it.each(['insert-before', 'insert-after'] as const)('adds two paragraphs %s while preserving the whole anchor paragraph', operation => {
    const additions = '<p>New first.</p><p>New second.</p>';
    const anchored = '<p>Evidence retained.</p>';
    roundTrip(`<p>Opening.</p>${anchored}<p>Closing.</p>`, request(operation, 'Evidence retained.', 'New first.\n\nNew second.'),
      `<p>Opening.</p>${operation === 'insert-before' ? additions + anchored : anchored + additions}<p>Closing.</p>`);
  });

  it.each(['insert-before', 'insert-after'] as const)('adds an owned list %s with exact reject and accept behavior', operation => {
    const additions = '<ul><li><p>first control</p></li><li><p>second control</p></li></ul>';
    const anchored = '<p>Evidence retained.</p>';
    roundTrip(`${anchored}<p>Closing.</p>`, request(operation, 'Evidence retained.', '- first control\n- second control'),
      `${operation === 'insert-before' ? additions + anchored : anchored + additions}<p>Closing.</p>`);
  });

  it('adds a table after a full anchor paragraph without moving its surrounding paragraphs', () => {
    const content = '<p>Evidence retained.</p><p>Closing.</p>';
    const editor = makeEditor(content);
    succeeds(editor, request('insert-after', 'Evidence retained.', '| A | B |\n| --- | --- |\n| 1 | 2 |'));
    const proposed = editor.getHTML();
    editor.commands.resolveAllSuggestions('reject');
    expect(editor.getHTML()).toBe(content);
    const accepted = makeEditor(proposed);
    accepted.commands.resolveAllSuggestions('accept');
    const serialized = document.createElement('div');
    serialized.innerHTML = accepted.getHTML();
    expect(Array.from(serialized.children).map(node => node.tagName)).toEqual(['P', 'TABLE', 'P']);
    expect(Array.from(serialized.querySelectorAll('td')).map(node => node.textContent)).toEqual(['1', '2']);
    expect(serialized.querySelector('del, ins')).toBeNull();
  });
});

describe('explicit insertion into a genuinely empty section', () => {
  it('uses the same tracked operation and restores an empty paragraph on rejection or reload', () => {
    roundTrip('<p></p>', request('insert-empty', '', 'Evidence is missing and must be supplied.'), '<p>Evidence is missing and must be supplied.</p>');
  });

  it('supports a multiline addition without leaving unowned structure', () => {
    roundTrip('<p></p>', request('insert-empty', '', 'First paragraph.\n\nSecond paragraph.'), '<p>First paragraph.</p><p>Second paragraph.</p>');
  });

  it.each([
    '<p>Existing evidence.</p>', '<p><br></p>', '<p></p><p></p>', '<h2></h2>',
    '<ul><li><p></p></li></ul>', '<blockquote><p></p></blockquote>',
    '<table><tbody><tr><td><p></p></td></tr></tbody></table>',
    '<p><ins data-author-id="user-7">Pending</ins></p>', '<p><del data-author-id="user-7">Removed</del></p>',
    '<p><a data-cite="17">Protocol</a></p>',
  ])('refuses existing text, pending content, atoms or structure: %s', content => {
    refuses(content, request('insert-empty', '', 'New scientific text.'));
  });

  it('refuses a live whitespace text node rather than treating textContent.trim() as structural emptiness', () => {
    const editor = makeEditor('<p></p>');
    editor.view.dispatch(editor.state.tr.insertText(' ', 1).setMeta(SUGGESTION_ACTION_META, true));
    const before = editor.getHTML();
    expect(apply(editor, request('insert-empty', '', 'New text.'))).toMatchObject({ ok: false });
    expect(editor.getHTML()).toBe(before);
  });

  it('does not treat a section with a quote or surrounding context as empty', () => {
    refuses('<p></p>', request('insert-empty', 'Evidence', 'New text.'));
    refuses('<p></p>', request('insert-empty', '', 'New text.', { prefix: 'before' }));
    refuses('<p></p>', request('insert-empty', '', 'New text.', { suffix: 'after' }));
    refuses('<p></p>', request('insert-empty', '', 'New text.', { prefix: '' }));
    refuses('<p></p>', request('insert-empty', '', 'New text.', { suffix: '' }));
    refuses('<p></p>', request('insert-empty', '', ''));
  });
});

describe('operation admission and legacy replacement compatibility', () => {
  it('refuses an unknown operation without falling back to replacement', () => {
    const proposal = request('insert-after', 'Evidence', 'New text.');
    Reflect.set(proposal, 'operation', 'overwrite');
    refuses('<p>Evidence.</p>', proposal);
  });

  it('keeps omission and explicit replace as the original attributed redline', () => {
    for (const operation of [undefined, 'replace'] as const) {
      const editor = makeEditor('<p>Evidence retained.</p>');
      expect(apply(editor, { operation, quote: 'retained', replacement: 'reviewed' })).toMatchObject({ ok: true });
      expect(editor.view.dom.querySelector('del')?.textContent).toBe('retained');
      expect(editor.view.dom.querySelector('ins')?.textContent).toBe('reviewed');
    }
  });
});

describe('independent structural edge and invalid-success review', () => {
  it.each(['## Added heading', '| A | B |\n| --- | --- |\n| 1 | 2 |'])('refuses structured blocks before a list item’s required first paragraph instead of flattening: %s', replacement => {
    refuses('<ul><li><p>Evidence retained.</p></li></ul><p>Closing.</p>',
      request('insert-before', 'Evidence retained.', replacement), 'structural');
  });

  it('keeps a heading as a heading after the first paragraph inside a list item', () => {
    roundTrip('<ul><li><p>Evidence retained.</p></li></ul><p>Closing.</p>',
      request('insert-after', 'Evidence retained.', '## Added heading'),
      '<ul><li><p>Evidence retained.</p><h2>Added heading</h2></li></ul><p>Closing.</p>');
  });

  it.each(['insert-before', 'insert-after'] as const)('adds a heading at the exact %s edge of a table-cell paragraph', operation => {
    const paragraph = '<p>Evidence retained.</p>';
    const heading = '<h2>Added heading</h2>';
    const prefix = '<table><tbody><tr><td>';
    const suffix = '</td><td><p>Other cell.</p></td></tr></tbody></table><p>Closing.</p>';
    const accepted = makeEditor(prefix + (operation === 'insert-before' ? heading + paragraph : paragraph + heading) + suffix).getHTML();
    roundTrip(prefix + paragraph + suffix, request(operation, 'Evidence retained.', '## Added heading'), accepted);
  });

  it.each(['insert-before', 'insert-after', 'insert-empty'] as const)('refuses a syntax-only table with no attributed insertion text: %s', operation => {
    refuses(operation === 'insert-empty' ? '<p></p>' : '<p>Evidence retained.</p>',
      request(operation, operation === 'insert-empty' ? '' : 'Evidence retained.', '| |\n|---|'));
  });

  it.each(['insert-before', 'insert-after', 'insert-empty'] as const)('refuses a markless table even when another added paragraph carries text: %s', operation => {
    refuses(operation === 'insert-empty' ? '<p></p>' : '<p>Evidence retained.</p>',
      request(operation, operation === 'insert-empty' ? '' : 'Evidence retained.', '| |\n|---|\n\nAdded body.'));
  });

  it('refuses whitespace-only additions without a success receipt or transaction', () => {
    const editor = makeEditor('<p>Evidence retained.</p>');
    let transactions = 0;
    editor.on('transaction', () => { transactions += 1; });
    expect(apply(editor, request('insert-after', 'Evidence', '\n\t\n'))).toMatchObject({ ok: false });
    expect(transactions).toBe(0);
    expect(editor.getHTML()).toBe('<p>Evidence retained.</p>');
  });
});

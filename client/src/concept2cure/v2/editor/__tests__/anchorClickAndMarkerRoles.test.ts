// @vitest-environment jsdom
/**
 * Two things the canvas said it did and did not (periodic review 2026-09-28,
 * editor family, accessibility lens):
 *
 * - A-B-2: "A click on annotated text — open the thread in the host's rail"
 *   (RichSectionEditor's comments contract), with `cursor: pointer` on the
 *   anchor. The plugin listened on `handleClickOn` and read the marks of the
 *   node it was handed, but ProseMirror hands that hook the enclosing
 *   paragraph (a mark is not a node in the view tree), and a paragraph carries
 *   no inline marks. So a click on commented text opened nothing, for anyone.
 * - A-B-3: citation and cross-reference markers carry `role="link"`, with no
 *   href, no focus and nothing to activate. Their own code comment says a click
 *   places the caret. A screen reader lists them as links that do nothing.
 *
 * jsdom has no layout, so the click is driven the way ProseMirror dispatches a
 * mouse click on text: `handleClickOn` for each ancestor node, innermost first,
 * with the paragraph as the direct one, then `handleClick` with the position.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import type { EditorView } from '@tiptap/pm/view';
import { CommentAnchor } from '../commentAnchor';
import { CrossReference } from '../crossReferenceNode';
import { Citation } from '../citationNode';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function mount(content: string, onAnchorClick: ((id: string) => void) | null = null): Editor {
  const element = document.createElement('div');
  document.body.appendChild(element);
  editor = new Editor({
    element,
    extensions: [StarterKit, CommentAnchor.configure({ onAnchorClick }), CrossReference, Citation],
    content,
  });
  return editor;
}

/**
 * A click at `pos`, dispatched as prosemirror-view's handleSingleClick does:
 * runHandlerOnContext offers `handleClickOn` the node at `inside` (the
 * innermost node view the click landed in: the paragraph for text, the node
 * itself for an inline atom) as the direct one, then each ancestor; then
 * `handleClick` gets the position.
 */
function clickAt(view: EditorView, pos: number, inside: number): boolean {
  const event = new MouseEvent('click');
  const $pos = view.state.doc.resolve(inside);
  for (let i = $pos.depth + 1; i > 0; i--) {
    const direct = i > $pos.depth;
    const node = direct ? $pos.nodeAfter! : $pos.node(i);
    if (view.someProp('handleClickOn', (f) => f(view, pos, node, $pos.before(i), event, direct))) return true;
  }
  return Boolean(view.someProp('handleClick', (f) => f(view, pos, event)));
}

/** The paragraph a text position sits in, as the view reports it for a click on text. */
function paragraphOf(view: EditorView, pos: number): number {
  return view.state.doc.resolve(pos).before(1);
}

function posInside(ed: Editor, text: string): number {
  let at = -1;
  ed.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text?.includes(text)) at = pos + node.text.indexOf(text) + 1;
  });
  if (at < 0) throw new Error(`"${text}" not in the document`);
  return at;
}

describe('a click on commented text opens its thread (A-B-2)', () => {
  it('opens the thread the words carry', () => {
    const open = vi.fn();
    const ed = mount('<p>The <span data-comment-id="c-1">primary endpoint</span> was met.</p>', open);
    const at = posInside(ed, 'endpoint');
    expect(clickAt(ed.view, at, paragraphOf(ed.view, at))).toBe(true);
    expect(open).toHaveBeenCalledWith('c-1');
  });

  it('a click on a cross-reference inside the commented range opens it too', () => {
    const open = vi.fn();
    const ed = mount('<p><span data-comment-id="c-2"><a data-xref="s1">§2.7.3</a> reports it</span>.</p>', open);
    let atom = -1;
    ed.state.doc.descendants((node, pos) => {
      if (atom < 0 && node.type.name === 'crossReference') atom = pos;
    });
    expect(clickAt(ed.view, atom, atom)).toBe(true);
    expect(open).toHaveBeenCalledWith('c-2');
  });

  it('a click on plain text opens nothing and is not swallowed', () => {
    const open = vi.fn();
    const ed = mount('<p>The <span data-comment-id="c-1">primary endpoint</span> was met.</p>', open);
    const at = posInside(ed, 'was met');
    expect(clickAt(ed.view, at, paragraphOf(ed.view, at))).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('with no host listener, the click is the editor’s own', () => {
    const ed = mount('<p>The <span data-comment-id="c-1">primary endpoint</span> was met.</p>', null);
    const at = posInside(ed, 'endpoint');
    expect(clickAt(ed.view, at, paragraphOf(ed.view, at))).toBe(false);
  });
});

describe('a marker that is not a link does not say it is one (A-B-3)', () => {
  it('a cross-reference and a citation carry no link role', () => {
    mount('<p>See <a data-xref="s1">§2.7.3</a> and <a data-cite="src-1">Smith 2024</a>.</p>');
    const xref = document.querySelector('.rse-xref');
    const cite = document.querySelector('[data-cite]');
    expect(xref).not.toBeNull();
    expect(cite).not.toBeNull();
    expect(xref!.getAttribute('role')).toBeNull();
    expect(cite!.getAttribute('role')).toBeNull();
  });
});

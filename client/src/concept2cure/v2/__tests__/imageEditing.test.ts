// @vitest-environment jsdom
/**
 * The editor's schema can hold a figure.
 *
 * Before AuthoringImage existed, content containing an <img> was forced into
 * raw-source mode by the fidelity gate — a rich-mode parse would have
 * silently rewritten the figure out of the governed record on the next save.
 * These tests pin the two facts that make rich editing of figure-bearing
 * sections safe: the reference round-trips byte-relevant attributes (src,
 * alt) through parse → serialize, and inserting a figure produces exactly
 * the reference markup the store handed back.
 */
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

import { AuthoringImage, isApiImageSrc } from '../editor/imageNode';

const REF = '/api/authoring/images/file_456_def';

function makeEditor(content: string): Editor {
  return new Editor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), AuthoringImage],
    content,
  });
}

describe('figures in the section schema', () => {
  it('a stored <img> reference survives parse → serialize untouched', () => {
    const ed = makeEditor(
      `<p>Before the figure.</p><img src="${REF}" alt="Figure 2 — impurity profile"><p>After it.</p>`,
    );
    const html = ed.getHTML();
    expect(html).toContain(`src="${REF}"`);
    expect(html).toContain('alt="Figure 2 — impurity profile"');
    expect(html).toContain('Before the figure.');
    expect(html).toContain('After it.');
    ed.destroy();
  });

  it('insertAuthoringImage writes the store reference at the caret', () => {
    const ed = makeEditor('<p>Prose.</p>');
    const ok = ed
      .chain()
      .focus()
      .insertAuthoringImage({ src: REF, alt: 'inserted figure' })
      .run();
    expect(ok).toBe(true);
    expect(ed.getHTML()).toContain(`src="${REF}"`);
    let count = 0;
    ed.state.doc.descendants((n) => {
      if (n.type.name === 'image') count++;
      return true;
    });
    expect(count).toBe(1);
    ed.destroy();
  });

  it('only same-app API refs are fetched with auth; externals are not', () => {
    expect(isApiImageSrc(REF)).toBe(true);
    expect(isApiImageSrc('https://example.com/x.png')).toBe(false);
    expect(isApiImageSrc('data:image/png;base64,AAAA')).toBe(false);
  });
});

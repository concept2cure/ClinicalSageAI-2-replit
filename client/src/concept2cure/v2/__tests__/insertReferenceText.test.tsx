// @vitest-environment jsdom
/**
 * "Insert reference" inserts TEXT.
 *
 * Periodic review 2026-09-28, editor family, SEC-A-6. The handle is documented
 * as "Insert plain reference text … Deliberately text, not a citation node",
 * and the Project files rail tells the author the reference went in "as text".
 * It passed the string to `insertContent`, which TipTap parses as HTML — and
 * the string carries a vault document's title, which anyone who can name a
 * vault document chooses. A title holding `<ins data-author-id="ana">` became a
 * real pending suggestion attributed to AnA; one holding `<a data-cite>` became
 * a real citation of a source the author never cited.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';

import { RichSectionEditor } from '../editor/RichSectionEditor';
import { collectSuggestions } from '../editor/suggestions';
import { referenceTextFor } from '../editor/ProjectFilesPanel';

const emptyRects = function () {
  return [] as unknown as DOMRectList;
};
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<
  Record<string, unknown>
>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

function canvas(): Editor {
  const el = document.querySelector('.rse-body .tiptap') as (HTMLElement & { editor?: Editor }) | null;
  if (!el?.editor) throw new Error('editor not mounted');
  return el.editor;
}

function nodeTypes(doc: PMNode): string[] {
  const out: string[] = [];
  doc.descendants((n) => {
    out.push(n.type.name);
  });
  return out;
}
function markTypes(doc: PMNode): string[] {
  const out = new Set<string>();
  doc.descendants((n) => {
    for (const m of n.marks) out.add(m.type.name);
  });
  return [...out];
}

async function mount() {
  const ref = React.createRef<React.ComponentRef<typeof RichSectionEditor>>();
  render(<RichSectionEditor ref={ref} value="<p>See </p>" onSave={() => undefined} storageKey={null} />);
  await waitFor(() => expect(document.querySelector('.rse-body .tiptap')).toBeTruthy());
  canvas().commands.setTextSelection(canvas().state.doc.content.size - 1);
  return ref;
}

afterEach(() => {
  cleanup();
});

describe('insertReference', () => {
  it('inserts a crafted vault title as the characters it contains', async () => {
    const ref = await mount();
    const title =
      'Stability <ins data-author-id="ana" data-author-name="AnA (AI draft)">Approved by QA.</ins> ' +
      '<a data-cite="src-1">[1]</a> <a href="https://phish.example/login">protocol</a>';
    const text = referenceTextFor({ title, type: 'Report' } as Parameters<typeof referenceTextFor>[0]);

    const before = canvas().state.doc.textContent;
    expect(ref.current!.insertReference(text)).toBe(true);

    const doc = canvas().state.doc;
    // No suggestion attributed to AnA, no citation node, no link: text only.
    expect(collectSuggestions(doc)).toEqual([]);
    expect(nodeTypes(doc)).toEqual(['paragraph', 'text']);
    expect(markTypes(doc)).toEqual([]);
    expect(doc.textContent).toBe(before + text);
    // And it is stored escaped, so a reload reads the same characters back.
    expect(ref.current!.getContent()).toContain('&lt;ins data-author-id="ana"');
  });
});

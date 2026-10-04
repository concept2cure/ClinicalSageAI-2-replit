// @vitest-environment jsdom
/**
 * Refute-review probe D4: the co-author canvas (RichSectionEditor, which
 * EctdCoauthor mounts over coauthor_documents.content) opens content holding a
 * <figure>, <svg>, <video>, <embed> or <object> — or any content its fidelity
 * gate calls lossy — in SOURCE MODE, a textarea showing every character of the
 * stored string. So attribute text the lineage strips as a hidden tag is shown
 * to this reader, though looksLikeHtml(content) is true.
 *
 * client/ and shared/ are unmodified in the working tree relative to 283fe08c4.
 */
import React from 'react';
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { RichSectionEditor } from '<repo>/client/src/concept2cure/v2/editor/RichSectionEditor';
import { looksLikeHtml } from './tree/shared/authoring/plain-text-html';

for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = function () { return [] as unknown as DOMRectList; };
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}
afterEach(() => cleanup());

const SHOWN = '3 patients died';

describe('D4: the co-author editor shows a hidden tag\'s attribute words in source mode', () => {
  it.each([
    ['a trailing <figure>', `<p>The study drug was well <b ${SHOWN}>tolerated</b> in all cohorts.</p><figure></figure>`],
    ['a trailing <svg>', `<p>The study drug was well <b ${SHOWN}>tolerated</b> in all cohorts.</p><svg></svg>`],
  ])('%s', async (_, content) => {
    expect(looksLikeHtml(content), 'the claim says this reader reads it as HTML').toBe(true);
    render(<RichSectionEditor value={content} onSave={async () => undefined} storageKey={null} />);
    const ta = await waitFor(() => {
      const t = document.querySelector('textarea.rse-source') as HTMLTextAreaElement | null;
      expect(t, 'opened in source mode').toBeTruthy();
      return t!;
    });
    // eslint-disable-next-line no-console
    console.log(`[D4] source-mode textarea shows: ${JSON.stringify(ta.value)}`);
    expect(ta.value).toContain(SHOWN);
  });

  it('CONTROL: the same sentence without the <figure> opens rich, and the words are not shown', async () => {
    const content = `<p>The study drug was well <b ${SHOWN}>tolerated</b> in all cohorts.</p>`;
    render(<RichSectionEditor value={content} onSave={async () => undefined} storageKey={null} />);
    await waitFor(() => expect(document.querySelector('.rse-body .tiptap')).toBeTruthy());
    expect(document.querySelector('textarea.rse-source')).toBeNull();
    const shown = (document.querySelector('.rse-body .tiptap') as HTMLElement).textContent ?? '';
    // eslint-disable-next-line no-console
    console.log(`[D4 control] rich canvas shows: ${JSON.stringify(shown)}`);
    expect(shown).not.toContain(SHOWN);
  });
});

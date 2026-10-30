import { describe, expect, it } from 'vitest';
import { EditorResponseError, plainEditorResponse } from '../editor-response';

describe('saved editor text at the existing plain response boundary', () => {
  it('retains exact legacy plain text and scientific delimiters', () => {
    const text = 'A ⟦ B ⟧; exposure < 12.5 mg.\n\nRecorded second paragraph.';
    expect(plainEditorResponse(text)).toBe(text);
  });
  it('decodes plain paragraph entities and preserves paragraph and line breaks', () => {
    expect(plainEditorResponse('<p>A &amp; B</p><p>Recorded<br>line</p>')).toBe('A & B\n\nRecorded\nline');
  });
  it.each(['<p><ins data-author-id="ana">Proposed.</ins></p>', '<p><del>Proposed deletion.</del></p>'])(
    'refuses unresolved saved suggestions %s', html => {
      expect(() => plainEditorResponse(html)).toThrow(EditorResponseError);
      expect(() => plainEditorResponse(html)).toThrow(/Accept or reject/);
    });
  it.each(['<h2>Heading</h2>', '<p><strong>Bold decision</strong></p>', '<p><a href="https://example.invalid">Source</a></p>',
    '<table><tr><td>Original result</td></tr></table>', '<p><img src="receipt" alt="Study figure"></p>',
    '<p style="text-align:center">Aligned text</p>', '<p>Text<sup data-note="Footnote">1</sup></p>'])(
    'refuses unsupported structure instead of silently dropping it %s', html => {
      expect(() => plainEditorResponse(html)).toThrow(/nothing was copied/);
    });
});

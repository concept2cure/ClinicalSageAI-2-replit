// @vitest-environment jsdom
/**
 * What a card in the editor's Versions rail shows, and what the save confirmation calls a section
 * (S12's biotech sweep, 2026-11-09, findings 24 and 11). The rail printed the stored HTML as text
 * ("<p>C2C-101 … <span data-comment-id=…>"), and the confirmation named a section by its stored key
 * ("Section saved (qms-purpose)", "(1.20:work:1)").
 */
import { describe, expect, it } from 'vitest';
import { revisionPreviewText } from '../textDiff';
import { savedSectionName } from '../DocumentWorkbench';

describe('a revision card shows the text a reader would see', () => {
  it('shows a stored section as its words, never its markup', () => {
    const stored = '<p>C2C-101 is a <span data-comment-id="5fd7eb25" class="rse-comment-anchor">humanized IgG1</span> antibody.</p><p>It binds IL-23p19.</p>';
    const shown = revisionPreviewText(stored);
    expect(shown).toBe('C2C-101 is a humanized IgG1 antibody. It binds IL-23p19.');
    expect(shown).not.toMatch(/[<>]|data-comment-id|rse-comment-anchor/);
  });

  it('keeps plain text as it is, cuts a long one at 400 characters, and says nothing for an empty one', () => {
    expect(revisionPreviewText('A < B, as measured.')).toBe('A < B, as measured.');
    expect(revisionPreviewText('<p>' + 'word '.repeat(200) + '</p>')).toHaveLength(400);
    expect(revisionPreviewText('<p></p>')).toBe('');
    expect(revisionPreviewText(null)).toBe('');
  });
});

describe('the save confirmation names the section in words', () => {
  it('uses the section’s number and title, and never a stored key', () => {
    expect(savedSectionName({ code: '2.5.1', title: 'Product Development Rationale' })).toBe('2.5.1 Product Development Rationale');
    expect(savedSectionName({ code: 'qms-purpose', title: 'Purpose' })).toBe('Purpose');
    expect(savedSectionName({ code: 'title_page', title: 'Title Page' })).toBe('Title Page');
    expect(savedSectionName({ code: '1.20:work:1', title: 'Drug name' })).toBe('1.20 Drug name');
  });

  it('falls back to the number, then to plain words, when a title is missing', () => {
    expect(savedSectionName({ code: '3.2.S.1', title: '' })).toBe('3.2.S.1');
    expect(savedSectionName({ code: 'qms-purpose', title: null })).toBe('this section');
  });
});

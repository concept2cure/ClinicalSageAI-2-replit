/**
 * Why the editor stopped painting attribution, in words that are true for the
 * section on screen (2026-11-12).
 *
 * Walked in the running app: on a frozen, approved section — which nobody can
 * edit — the editor said "Attribution highlighting is paused while you edit".
 * The painting had stopped because the text shown is not the text the origins
 * were recorded against (a citation shows as "[1]"), not because of an edit.
 */
import { describe, expect, it } from 'vitest';
import { attributionPausedNote } from '../RichSectionEditor';

describe('attributionPausedNote', () => {
  it('on a section that can be edited, it says the highlighting describes the text as last saved', () => {
    expect(attributionPausedNote(false)).toBe('Attribution highlighting is paused while you edit — it describes the text as last saved.');
  });

  it('on a read-only section it does not speak of editing', () => {
    const note = attributionPausedNote(true);
    expect(note).not.toMatch(/while you edit/);
    expect(note).toBe('Attribution highlighting is off here: the section as shown differs from the text its origins were recorded against.');
  });
});

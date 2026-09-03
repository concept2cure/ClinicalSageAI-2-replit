// @vitest-environment jsdom
/**
 * roundTrip — the plain-text fidelity round trip and the short-paste floor.
 *
 * `format: 'text'` used to skip the fidelity gate on the premise that plain
 * text is always representable. The parse collapses runs of spaces and tabs
 * and folds three blank lines into one break, so a space-aligned table in a
 * plain-text section was rewritten on the first save. `docToPlainText` is the
 * exact round trip the gate now compares against.
 *
 * `assessPasteFidelity` reported a one-word loss as none, on every paste. On a
 * short paste one word is not tokeniser noise; in a filing, "not" is a word.
 */
import { describe, expect, it } from 'vitest';
import { generateJSON } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { assessPasteFidelity, docToPlainText, plainTextToHtml } from '../editor/roundTrip';

const roundTrip = (text: string) => docToPlainText(generateJSON(plainTextToHtml(text), [StarterKit]));

describe('docToPlainText — exact plain-text round trip', () => {
  it('returns ordinary prose unchanged', () => {
    const t = 'First paragraph.\nSecond line.\n\nSecond paragraph.';
    expect(roundTrip(t)).toBe(t);
  });

  it('exposes collapsed runs of spaces (a space-aligned column) as a difference', () => {
    const t = 'Dose      Subjects\n10 mg     12\n20 mg     11';
    expect(roundTrip(t)).not.toBe(t);
  });

  it('exposes extra blank lines folded into one break', () => {
    const t = 'Section A\n\n\n\nSection B';
    expect(roundTrip(t)).not.toBe(t);
  });
});

describe('assessPasteFidelity — the one-word floor is for long pastes only', () => {
  it('reports a single dropped word on a short paste', () => {
    const html = '<p>The dose was not exceeded in any subject.</p>';
    const kept = 'The dose was exceeded in any subject.';
    expect(assessPasteFidelity(html, kept).lost).toBe(1);
  });

  it('keeps the noise floor on a long paste', () => {
    const words = Array.from({ length: 120 }, (_, i) => 'w' + i);
    const html = '<p>' + words.join(' ') + '</p>';
    const kept = words.slice(1).join(' ');
    expect(assessPasteFidelity(html, kept).lost).toBe(0);
  });
});

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
import { assessPasteFidelity, docToPlainText, plainTextToHtml, signatureDrift, structuralSignatureFromDoc, structuralSignatureFromDom } from '../editor/roundTrip';

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

describe('structural drift between clipboard HTML and the parsed slice — the paste gate\'s comparison', () => {
  const drift = (html: string) =>
    signatureDrift(
      structuralSignatureFromDom(new DOMParser().parseFromString(html, 'text/html')),
      structuralSignatureFromDoc(generateJSON(html, [StarterKit])),
    );

  it('names a definition list the schema flattened, though every word survived', () => {
    const html = '<dl><dt>AE</dt><dd>Adverse event</dd><dt>SAE</dt><dd>Serious adverse event</dd></dl>';
    const kept = generateJSON(html, [StarterKit]);
    // Words intact — the old word-count gate would have said clean.
    expect(assessPasteFidelity(html, docToPlainText(kept)).lost).toBe(0);
    expect(drift(html)).toContain('defItems');
  });

  it('names a table the schema (without the table extension) flattened into paragraphs', () => {
    const html = '<table><tr><th>Dose</th><th>n</th></tr><tr><td>10 mg</td><td>12</td></tr></table>';
    expect(drift(html)).toContain('tables');
  });

  it('is silent on ordinary paragraphs and headings the schema keeps', () => {
    expect(drift('<h2>Results</h2><p>The primary endpoint was met.</p>')).toEqual([]);
  });
});

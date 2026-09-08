/**
 * Ingestion reads a bounded prefix of a document, and says so.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `classifyDocument` and `extractDocumentStructure` both sent
 * `documentText.slice(0, 60000)` to the model and returned the result with no
 * mention of the cut. A 400-page submission document was classified, and had
 * its structure and claims extracted, from roughly its first fifteen pages —
 * and the answer came back looking exactly like one drawn from the whole file.
 * A section that appears only after the bound is not "absent from the
 * document"; it is absent from what was read, and those are different facts.
 * This is the same silent-truncation class as the AI gateway's, which now
 * refuses rather than letting a provider quietly cut a request.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 *   • a document within the bound is read whole and says so;
 *   • a document over it is cut at the bound and reports charsRead, totalChars
 *     and truncated:true — the numbers, not just a flag;
 *   • the cut prefers a paragraph or sentence boundary near the bound, so the
 *     model is not handed a sentence that stops mid-clause and asked to
 *     classify it — but never returns more than the bound;
 *   • the coverage figure is computed from the text, so it cannot be a model's
 *     claim about its own reading.
 */

import { describe, it, expect } from 'vitest';
import {
  boundDocumentText,
  MAX_INGESTION_DOCUMENT_CHARS,
} from '../ingestion-service';

describe('boundDocumentText', () => {
  it('reads a short document whole and reports no truncation', () => {
    const text = 'A short protocol synopsis. It fits comfortably.';
    const r = boundDocumentText(text);
    expect(r.text).toBe(text);
    expect(r.truncated).toBe(false);
    expect(r.charsRead).toBe(text.length);
    expect(r.totalChars).toBe(text.length);
    expect(r.percentRead).toBe(100);
  });

  it('reads a document exactly at the bound whole', () => {
    const text = 'x'.repeat(MAX_INGESTION_DOCUMENT_CHARS);
    const r = boundDocumentText(text);
    expect(r.truncated).toBe(false);
    expect(r.charsRead).toBe(MAX_INGESTION_DOCUMENT_CHARS);
  });

  it('cuts an over-long document at the bound and reports the numbers', () => {
    const total = MAX_INGESTION_DOCUMENT_CHARS * 3;
    const r = boundDocumentText('y'.repeat(total));
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(MAX_INGESTION_DOCUMENT_CHARS);
    expect(r.totalChars).toBe(total);
    expect(r.charsRead).toBe(r.text.length);
    // A figure a reader can act on, not just a boolean.
    expect(r.percentRead).toBeGreaterThan(0);
    expect(r.percentRead).toBeLessThan(100);
  });

  it('cuts at a paragraph boundary near the bound rather than mid-sentence', () => {
    const para = 'The primary endpoint was met at week twelve.\n\n';
    const doc = para.repeat(Math.ceil((MAX_INGESTION_DOCUMENT_CHARS * 2) / para.length));
    const r = boundDocumentText(doc);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(MAX_INGESTION_DOCUMENT_CHARS);
    // Ends on a completed sentence, not a fragment of one.
    expect(r.text.trimEnd().endsWith('.')).toBe(true);
    // And the boundary search never sacrifices a large share of the budget.
    expect(r.text.length).toBeGreaterThan(MAX_INGESTION_DOCUMENT_CHARS * 0.9);
  });

  it('falls back to the hard bound when there is no boundary to cut on', () => {
    const r = boundDocumentText('z'.repeat(MAX_INGESTION_DOCUMENT_CHARS * 2));
    expect(r.text.length).toBe(MAX_INGESTION_DOCUMENT_CHARS);
    expect(r.truncated).toBe(true);
  });

  it('treats empty and whitespace input as read-whole rather than truncated', () => {
    for (const t of ['', '   ']) {
      const r = boundDocumentText(t);
      expect(r.truncated).toBe(false);
      expect(r.percentRead).toBe(100);
    }
  });
});

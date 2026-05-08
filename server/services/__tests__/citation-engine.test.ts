/**
 * Tests for the pure helpers in citation-engine.ts. The full runCitationEngine
 * pipeline requires a database + retrieval pipeline and is exercised through
 * integration tests; here we lock down the sentence splitter that everything
 * else depends on.
 */

import { describe, it, expect } from 'vitest';
import { splitArtifactIntoSentences } from '../ana/citation-engine';

describe('citation-engine · splitArtifactIntoSentences', () => {
  it('returns empty for empty content', () => {
    expect(splitArtifactIntoSentences('')).toEqual([]);
  });

  it('produces one sentence per period-separated unit', () => {
    const text =
      'The median age was 47 years. The primary endpoint was met at week 12. The drug was generally well tolerated.';
    const sentences = splitArtifactIntoSentences(text);
    expect(sentences.length).toBe(3);
    expect(sentences[0].text).toMatch(/median age/);
    expect(sentences[1].text).toMatch(/primary endpoint/);
    expect(sentences[2].text).toMatch(/well tolerated/);
  });

  it('does not fracture on regulatory abbreviations', () => {
    const text =
      'Per ICH M4Q(R1), the U.S. FDA requires drug substance specifications. The EMA has equivalent expectations.';
    const sentences = splitArtifactIntoSentences(text);
    expect(sentences.length).toBe(2);
    expect(sentences[0].text).toMatch(/U\.S\.|FDA/);
  });

  it('does not fracture on decimal numbers', () => {
    const text =
      'The mean was 12.5 mg/kg with SD 2.3. The median follow-up was 18.4 months.';
    const sentences = splitArtifactIntoSentences(text);
    expect(sentences.length).toBe(2);
    expect(sentences[0].text).toContain('12.5');
    expect(sentences[1].text).toContain('18.4');
  });

  it('tracks paragraph indices across blank-line-separated paragraphs', () => {
    const text =
      'First paragraph sentence one. First paragraph sentence two.\n\nSecond paragraph sentence one.';
    const sentences = splitArtifactIntoSentences(text);
    expect(sentences.length).toBe(3);
    expect(sentences[0].paragraphIndex).toBe(0);
    expect(sentences[1].paragraphIndex).toBe(0);
    expect(sentences[2].paragraphIndex).toBe(1);
  });

  it('produces a unique sentenceIndex starting at 0', () => {
    const text =
      'Sentence one is here. Sentence two is here.\n\nSentence three is here.';
    const sentences = splitArtifactIntoSentences(text);
    expect(sentences.map(s => s.sentenceIndex)).toEqual([0, 1, 2]);
  });

  it('produces non-overlapping char offsets in increasing order', () => {
    const text =
      'The median age was 47 years. The primary endpoint was met at week 12.';
    const sentences = splitArtifactIntoSentences(text);
    expect(sentences[0].charStart).toBeGreaterThanOrEqual(0);
    expect(sentences[0].charEnd).toBeGreaterThan(sentences[0].charStart);
    expect(sentences[1].charStart).toBeGreaterThanOrEqual(sentences[0].charEnd);
  });

  it('drops sentences shorter than the min-char threshold', () => {
    const text =
      'Hi.\nThis is a sufficiently long sentence to be retained by the splitter.';
    const sentences = splitArtifactIntoSentences(text);
    expect(sentences.length).toBe(1);
    expect(sentences[0].text).toMatch(/sufficiently long/);
  });

  it('handles mixed regulatory citations without losing sentences', () => {
    const text =
      'Per 21 CFR 312.23(a)(7), the IND must include CMC information. ICH Q1A(R2) provides stability guidance for new substances.';
    const sentences = splitArtifactIntoSentences(text);
    expect(sentences.length).toBe(2);
    expect(sentences[0].text).toMatch(/21 CFR/);
    expect(sentences[1].text).toMatch(/Q1A/);
  });
});

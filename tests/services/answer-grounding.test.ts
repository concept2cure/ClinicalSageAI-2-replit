/**
 * Tests for AnA answer grounding (server/services/ana/answer-grounding.ts).
 */

import { describe, it, expect } from 'vitest';
import { verifyAnswerGrounding } from '../../server/services/ana/answer-grounding';

describe('verifyAnswerGrounding', () => {
  it('is a no-op when there is no evidence to check against', () => {
    const r = verifyAnswerGrounding('The trial NCT01234567 showed benefit.', '');
    expect(r).toEqual({ checked: 0, grounded: 0, unsupported: [], ratio: 1 });
  });

  it('grounds an NCT id that appears in the evidence', () => {
    const evidence = JSON.stringify({ results: [{ nctId: 'NCT01234567', title: 'A study' }] });
    const r = verifyAnswerGrounding('See NCT01234567 for details.', evidence);
    expect(r.checked).toBe(1);
    expect(r.grounded).toBe(1);
    expect(r.unsupported).toEqual([]);
    expect(r.ratio).toBe(1);
  });

  it('flags a fabricated NCT id not present in the evidence', () => {
    const evidence = JSON.stringify({ results: [{ nctId: 'NCT01234567' }] });
    const r = verifyAnswerGrounding('Compare NCT01234567 and NCT09999999.', evidence);
    expect(r.checked).toBe(2);
    expect(r.grounded).toBe(1);
    expect(r.unsupported).toEqual([{ kind: 'nct', text: 'NCT09999999' }]);
    expect(r.ratio).toBe(0.5);
  });

  it('grounds a quote that appears in the evidence, tolerant of punctuation', () => {
    const evidence = 'Section 3.2: the primary endpoint is overall survival at 12 months.';
    const answer = 'The protocol states "the primary endpoint is overall survival" clearly.';
    const r = verifyAnswerGrounding(answer, evidence);
    expect(r.checked).toBe(1);
    expect(r.grounded).toBe(1);
  });

  it('flags a fabricated quote not found in the evidence', () => {
    const evidence = 'The document discusses safety monitoring and adverse events.';
    const answer = 'It says "the drug eliminates all cardiovascular risk entirely".';
    const r = verifyAnswerGrounding(answer, evidence);
    expect(r.checked).toBe(1);
    expect(r.grounded).toBe(0);
    expect(r.unsupported[0].kind).toBe('quote');
    expect(r.ratio).toBe(0);
  });

  it('ignores short or label-like quotes to avoid false positives', () => {
    const evidence = 'Risk level assessment for the device.';
    const answer = 'The risk is "high" and the status is "open".';
    const r = verifyAnswerGrounding(answer, evidence);
    expect(r.checked).toBe(0);
    expect(r.ratio).toBe(1);
  });

  it('deduplicates repeated claims', () => {
    const evidence = 'nothing relevant here';
    const answer = 'Both NCT09999999 and again NCT09999999 are referenced.';
    const r = verifyAnswerGrounding(answer, evidence);
    expect(r.checked).toBe(1);
    expect(r.unsupported).toHaveLength(1);
  });

  it('truncates long unsupported quotes in the report', () => {
    const evidence = 'unrelated content';
    const longQuote = 'this is a fabricated sentence that goes on well beyond eighty characters to test truncation behavior';
    const r = verifyAnswerGrounding(`It claims "${longQuote}".`, evidence);
    expect(r.unsupported[0].text.length).toBeLessThanOrEqual(80);
    expect(r.unsupported[0].text.endsWith('…')).toBe(true);
  });
});

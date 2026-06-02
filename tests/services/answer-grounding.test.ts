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

  // Trial-registry coverage beyond US NCT ids — EU and UK/international trials
  // are just as fabricatable and must equally come from the tool evidence.
  it('grounds an ISRCTN id present in the evidence', () => {
    const evidence = 'The UK registry lists ISRCTN12345678 for this indication.';
    const r = verifyAnswerGrounding('See ISRCTN12345678 for the UK arm.', evidence);
    expect(r.checked).toBe(1);
    expect(r.grounded).toBe(1);
  });

  it('flags a fabricated ISRCTN id not in the evidence', () => {
    const r = verifyAnswerGrounding('The UK study was ISRCTN87654321.', 'unrelated evidence');
    expect(r.checked).toBe(1);
    expect(r.grounded).toBe(0);
    expect(r.unsupported).toEqual([{ kind: 'isrctn', text: 'ISRCTN87654321' }]);
  });

  it('grounds a EudraCT number present in the evidence', () => {
    const evidence = 'EU CTR record: 2019-001234-12 enrolled across five member states.';
    const r = verifyAnswerGrounding('The EU trial is EudraCT 2019-001234-12.', evidence);
    expect(r.checked).toBe(1);
    expect(r.grounded).toBe(1);
  });

  it('flags a fabricated EudraCT number not in the evidence', () => {
    const r = verifyAnswerGrounding('Registered as 2020-009999-88 in the EU.', 'no EU trial here');
    expect(r.checked).toBe(1);
    expect(r.grounded).toBe(0);
    expect(r.unsupported).toEqual([{ kind: 'eudract', text: '2020-009999-88' }]);
  });

  it('counts NCT, ISRCTN and EudraCT ids together across registries', () => {
    const evidence = 'Evidence mentions NCT01234567 only.';
    const answer = 'See NCT01234567, ISRCTN87654321, and EudraCT 2020-009999-88.';
    const r = verifyAnswerGrounding(answer, evidence);
    expect(r.checked).toBe(3);
    expect(r.grounded).toBe(1); // only the NCT is in evidence
    expect(r.unsupported.map(u => u.kind).sort()).toEqual(['eudract', 'isrctn']);
  });

  // Literature citations — the canonical LLM fabrication. A PMID or DOI must come
  // from a literature tool result, never recall.
  it('grounds a PMID that appears in the evidence', () => {
    const evidence = JSON.stringify({ results: [{ pmid: '31536100', title: 'A study' }] });
    const r = verifyAnswerGrounding('As shown in PMID 31536100, the effect held.', evidence);
    expect(r.checked).toBe(1);
    expect(r.grounded).toBe(1);
  });

  it('flags a fabricated PMID and reports the bare number', () => {
    const r = verifyAnswerGrounding('See PMID: 99999999 for the meta-analysis.', 'unrelated evidence');
    expect(r.checked).toBe(1);
    expect(r.grounded).toBe(0);
    expect(r.unsupported).toEqual([{ kind: 'pmid', text: '99999999' }]);
  });

  it('grounds a DOI present in the evidence, trimming trailing punctuation', () => {
    const evidence = 'Reference: 10.1056/NEJMoa2034577 reported the primary outcome.';
    // Trailing period after the DOI must not break the verbatim match.
    const r = verifyAnswerGrounding('The pivotal paper is 10.1056/NEJMoa2034577.', evidence);
    expect(r.checked).toBe(1);
    expect(r.grounded).toBe(1);
  });

  it('flags a fabricated DOI not in the evidence', () => {
    const r = verifyAnswerGrounding('Per 10.9999/fake.doi.2024.0001 the claim holds.', 'no such reference');
    expect(r.checked).toBe(1);
    expect(r.grounded).toBe(0);
    expect(r.unsupported[0].kind).toBe('doi');
    expect(r.unsupported[0].text).toBe('10.9999/fake.doi.2024.0001');
  });

  // FDA submission numbers — an invented predicate 510(k) or PMA is the classic
  // medtech fabrication.
  it('grounds a 510(k) predicate number present in the evidence', () => {
    const evidence = 'Predicate search returned K181234 (cleared 2018).';
    const r = verifyAnswerGrounding('The predicate device is K181234.', evidence);
    expect(r.checked).toBe(1);
    expect(r.grounded).toBe(1);
  });

  it('flags fabricated 510(k), PMA and De Novo numbers together', () => {
    const evidence = 'The cleared predicate is K181234.';
    const answer = 'Cite predicate K999999, PMA P209999, and De Novo DEN200099.';
    const r = verifyAnswerGrounding(answer, evidence);
    expect(r.checked).toBe(3);
    expect(r.grounded).toBe(0);
    expect(r.unsupported.map(u => u.kind).sort()).toEqual(['fda_510k', 'fda_denovo', 'fda_pma'].sort());
  });

  it('does not let NCT or ISRCTN ids mis-trigger the FDA number patterns', () => {
    const evidence = 'Tools returned NCT01234567 and ISRCTN87654321.';
    const r = verifyAnswerGrounding('Both NCT01234567 and ISRCTN87654321 are relevant.', evidence);
    expect(r.checked).toBe(2); // exactly two ids, no spurious K/P/DEN matches
    expect(r.grounded).toBe(2);
  });
});

/**
 * Working memory keeps only what a checked answer found (FV-missed, AnA
 * reasoning round 8, 2026-10-05).
 *
 * The write-back's summarizer — a second model call — writes "Key Facts" that
 * every later turn reads as established, and that the nightly job promotes into
 * the project's memory. Nothing checked them. A figure the answer check had
 * reported "not found" (an invented ORR) became a fact the model was told not
 * to contradict. The rule here keeps an item only when one checked answer
 * found every claim in it, and nothing any answer reported not found.
 */
import { describe, it, expect } from 'vitest';

import { checkAnswer, type EvidenceEntry } from '../answer-grounding';
import { foundBasis, settleItem, settleSummary, storedCheck, type CheckedAnswer } from '../memory-fact-check';

const SEARCH = (content: unknown): EvidenceEntry => ({ source: 'tool:search_clinical_evidence', content: JSON.stringify(content) });
/** An answer, and the check the stream stored for it against its own sources. */
const answered = (text: string, sources: EvidenceEntry[]): CheckedAnswer => ({ text, check: checkAnswer(text, sources) });

const PIVOTAL = answered('In NCT01234567 the objective response rate was 45% across 212 patients.', [
  SEARCH({ studies: [{ nctId: 'NCT01234567', orr: '31%', enrolled: 212 }] }),
]);

describe('the stored check, as the server reads it', () => {
  it('is this engine\'s check, from the stored metadata', () => {
    expect(storedCheck({ verification: { check: PIVOTAL.check, labels: {} } })?.found).toBe(2);
  });

  it('is nothing when it is another engine\'s, malformed or absent', () => {
    expect(storedCheck({ verification: { check: { ...PIVOTAL.check, engine: 'answer-check/1' } } })).toBeNull();
    expect(storedCheck({ verification: { check: { ...PIVOTAL.check, notFound: 'x' } } })).toBeNull();
    expect(storedCheck({})).toBeNull();
    expect(storedCheck(null)).toBeNull();
  });
});

describe('an item is kept only when one checked answer found all it claims', () => {
  const basis = foundBasis([PIVOTAL]);

  it('withholds the figure the check did not find, wherever the summarizer put it', () => {
    expect(settleItem('The ORR in NCT01234567 was 45%', basis)).toBe(false);
    expect(settleItem('Decided to cite the 45% ORR in 2.7.3', basis)).toBe(false);
  });

  it('keeps what the check found, and words that claim nothing', () => {
    expect(settleItem('212 patients were enrolled in NCT01234567', basis)).toBe(true);
    expect(settleItem('The team prefers a rolling submission', basis)).toBe(true);
  });

  it('withholds a stated verdict', () => {
    expect(settleItem('The dossier is ready to file', basis)).toBe(false);
  });

  it('withholds what is not a sentence', () => {
    for (const v of [{ fact: 'x' }, 42, null, '', '   ']) expect(settleItem(v, basis)).toBe(false);
  });

  it("never recombines two answers' findings into a claim neither made", () => {
    const a = answered('NCT01111111 reported an ORR of 45%.', [SEARCH({ studies: [{ nctId: 'NCT01111111', orr: '45%' }] })]);
    const b = answered('NCT02222222 reported an ORR of 31%.', [SEARCH({ studies: [{ nctId: 'NCT02222222', orr: '31%' }] })]);
    const both = foundBasis([a, b]);
    expect(settleItem('NCT02222222 reported an ORR of 45%', both)).toBe(false);
    expect(settleItem('NCT01111111 reported an ORR of 45%', both)).toBe(true);
  });

  it('a value one answer found never vouches for the same value another answer could not find', () => {
    const dropout = answered('The dropout rate was 45%.', [SEARCH({ dropoutRate: '45%' })]);
    const orr = answered('The ORR was 45%.', [SEARCH({ orr: '31%' })]);
    expect(orr.check.notFound).toEqual([{ kind: 'figure', text: '45%' }]);
    expect(settleItem('The ORR was 45%', foundBasis([dropout, orr]))).toBe(false);
    expect(settleItem('The ORR was 45%', foundBasis([dropout]))).toBe(true);
  });

  it("credits a figure's own number, never another number written beside it", () => {
    const hr = answered('The HR was 0.62 (95% CI 0.48-0.80).', [SEARCH({ hr: 0.62, ci: '0.48-0.80' })]);
    const b = foundBasis([hr]);
    expect(settleItem('95% of patients responded', b)).toBe(false);
    expect(settleItem('The hazard ratio was 0.62', b)).toBe(true);
  });

  it('a check that does not describe its text vouches for nothing', () => {
    // The stored text is the text the check ran on (post-processing saves both
    // together) and the engine is pinned by version; a text whose claims no
    // longer add up to the check's is not that text.
    const extra: CheckedAnswer = { text: 'In NCT01234567 the ORR was 45% across 300 patients over 24 weeks.', check: PIVOTAL.check };
    const fewer: CheckedAnswer = { text: 'In NCT01234567 there were 300 patients.', check: PIVOTAL.check };
    for (const drifted of [extra, fewer]) expect(settleItem('300 patients were enrolled', foundBasis([drifted]))).toBe(false);
  });

  it("withholds a value only the person stated (the person's, not a finding)", () => {
    const told = answered('Your batch size of 200 kg is noted.', [SEARCH({ note: 'no records' }), { source: 'person', content: 'Our commercial batch size is 200 kg.' }]);
    expect(told.check.fromPerson).toHaveLength(1);
    expect(settleItem('The commercial batch size is 200 kg', foundBasis([told]))).toBe(false);
  });
});

describe('the summary, settled field by field', () => {
  it('keeps every field the reader renders only as far as it was found, and records what it withheld', () => {
    const { structured, withheld } = settleSummary(
      {
        objective: 'Summarise the 45% ORR for NCT01234567',
        lockedFacts: ['212 patients were enrolled', 'The ORR was 45%', { not: 'a sentence' }],
        decisions: ['Cite the 45% ORR'],
        openQuestions: ['Which cut-off?'],
        nextActions: ['Confirm the 45% ORR with the CSR'],
        createdArtifacts: ['Draft 2.7.3'],
        exclusions: 'not a list',
      },
      foundBasis([PIVOTAL]),
    );
    expect(structured).toEqual({
      objective: '',
      lockedFacts: ['212 patients were enrolled'],
      decisions: [],
      openQuestions: ['Which cut-off?'],
      nextActions: [],
      createdArtifacts: ['Draft 2.7.3'],
      exclusions: [],
    });
    expect(withheld.objective).toBe('Summarise the 45% ORR for NCT01234567');
    expect(withheld.lockedFacts).toEqual(['The ORR was 45%', '[not a sentence]']);
    expect(withheld.decisions).toEqual(['Cite the 45% ORR']);
    expect(withheld.nextActions).toEqual(['Confirm the 45% ORR with the CSR']);
  });

  it('with no checked answer to stand on, keeps only what claims nothing', () => {
    const { structured } = settleSummary({ objective: 'Plan the IND', lockedFacts: ['212 patients were enrolled', 'The sponsor prefers Q3'] }, foundBasis([]));
    expect(structured.objective).toBe('Plan the IND');
    expect(structured.lockedFacts).toEqual(['The sponsor prefers Q3']);
  });
});

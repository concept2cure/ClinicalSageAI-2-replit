/**
 * G3's splitter: an agency letter's numbered questions, verbatim and at their
 * positions, with no model. Fails first on the drug-IND letter shape the
 * parity plan names: three numbered questions, an address line, a date and a
 * closing that are not questions.
 */
import { describe, expect, it } from 'vitest';
import { splitLetterQuestions } from '../letter-questions';

const IND_LETTER = `DEPARTMENT OF HEALTH AND HUMAN SERVICES
Food and Drug Administration
10903 New Hampshire Avenue
Silver Spring, MD 20993

IND 123456
October 12, 2026

Dear Dr. Rivera:

Please refer to your Investigational New Drug Application (IND) for CX-101 Tablets.

We are reviewing your submission and have the following requests for information:

1. Provide the batch analysis data for the drug substance lots used in the toxicology studies,
   including the impurity profile for each lot.

2. Clarify the starting dose rationale. Specifically:
   a. state the NOAEL in the most sensitive species, and
   b. describe the safety factor applied.

3. Submit the updated Investigator's Brochure reflecting the hepatotoxicity findings in the 28-day rat study.

Please submit your response as an amendment to this IND within 14 days.

If you have any questions, please contact Jane Doe, Regulatory Project Manager, at 301-796-0000.

Sincerely,
{See appended electronic signature page}
`;

describe('splitLetterQuestions', () => {
  it('finds the three numbered questions of a drug IND letter, verbatim and at their positions', () => {
    const questions = splitLetterQuestions(IND_LETTER);
    expect(questions.map((q) => q.ref)).toEqual(['1', '2', '3']);
    for (const q of questions) expect(IND_LETTER.slice(q.start, q.end)).toBe(q.text);
    expect(questions[0].text).toBe('Provide the batch analysis data for the drug substance lots used in the toxicology studies,\n   including the impurity profile for each lot.');
    expect(questions[1].text).toContain('b. describe the safety factor applied.');
    expect(questions[2].text).toBe("Submit the updated Investigator's Brochure reflecting the hepatotoxicity findings in the 28-day rat study.");
  });

  it('reads "Question N:" and sub-numbered refs, and ends a question at the closing', () => {
    const letter = 'Question 1: Describe the assay.\n\n1.2) Confirm the lot.\nSincerely,\nA. Reviewer';
    expect(splitLetterQuestions(letter).map(({ ref, text }) => [ref, text])).toEqual([
      ['1', 'Describe the assay.'], ['1.2', 'Confirm the lot.'],
    ]);
  });

  it('finds nothing in a letter with no numbered questions, and never takes a street number for one', () => {
    expect(splitLetterQuestions('10903 New Hampshire Avenue\nSilver Spring, MD 20993\n\nWe acknowledge receipt of your IND.')).toEqual([]);
    expect(splitLetterQuestions('')).toEqual([]);
  });
});

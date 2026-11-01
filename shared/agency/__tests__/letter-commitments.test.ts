/**
 * The commitments an approval letter imposes are found verbatim, with their
 * kind, basis, schedule and due date, and nothing else is (P-81, P-84).
 * The letter below is fictional, set out as FDA sets an approval letter.
 */
import { describe, expect, it } from 'vitest';
import { milestoneDate, splitLetterCommitments } from '../letter-commitments';

const LETTER = `Food and Drug Administration
Silver Spring MD 20993

NDA 214321
APPROVAL

Lumen Therapeutics, Inc.
10903 New Hampshire Avenue
Attention: Regulatory Affairs, (301) 796-1234

We have completed our review of this application. It is approved. We remind you of your
obligations under section 505(o) of the FDCA, described below.

POSTMARKETING REQUIREMENTS UNDER 505(o)

4321-1    Conduct a randomized, double-blind, placebo-controlled trial to evaluate the
          long-term hepatic safety of LMN-201 in adults with the approved indication.

The timetable you submitted on May 1, 2026, states that you will conduct this trial
according to the following schedule:

          Draft Protocol Submission:    06/2026
          Final Protocol Submission:    09/2026
          Trial Completion:             12/2028
          Final Report Submission:      06/2029

PEDIATRIC REQUIREMENTS

4321-2    Conduct a pharmacokinetic and safety study in pediatric patients 6 to less than
          17 years of age.

          Final Protocol Submission:    March 2027
          Study Completion:             December 2029
          Final Report Submission:      June 30, 2030

POSTMARKETING COMMITMENTS SUBJECT TO REPORTING REQUIREMENTS UNDER SECTION 506B

4321-3    Complete the in vitro study of LMN-201 as a substrate of OATP1B1.

          Final Report Submission:      12/2026

POSTMARKETING COMMITMENTS NOT SUBJECT TO THE REPORTING REQUIREMENTS OF SECTION 506B

4321-4    Provide updated drug product stability data through 36 months.

          Final Report Submission:      11/15/2027

If you have any questions, call the Regulatory Project Manager at (301) 796-1234.

Sincerely,
{See appended electronic signature page}`;

describe('splitLetterCommitments', () => {
  const found = splitLetterCommitments(LETTER);

  it('finds each numbered commitment under its section, with its kind and basis', () => {
    expect(found.map((c) => [c.ref, c.commitmentType, c.basis])).toEqual([
      ['4321-1', 'pmr', 'FDCA 505(o)(3)'],
      ['4321-2', 'pmr', 'PREA (FDCA 505B)'],
      ['4321-3', 'pmc', 'FDCA 506B'],
      ['4321-4', 'pmc', 'Postmarketing commitment, not subject to FDCA 506B reporting'],
    ]);
  });

  it('returns each one verbatim, at its offsets, without the schedule', () => {
    for (const c of found) expect(LETTER.slice(c.start, c.end)).toBe(c.text);
    expect(found[0].text).toBe('Conduct a randomized, double-blind, placebo-controlled trial to evaluate the\n          long-term hepatic safety of LMN-201 in adults with the approved indication.');
    expect(found[0].text).not.toMatch(/timetable|Submission/);
  });

  it('reads the schedule, and dates the commitment by its final report', () => {
    expect(found[0].milestones.map((m) => [m.label, m.when, m.date])).toEqual([
      ['Draft Protocol Submission', '06/2026', '2026-06-30'],
      ['Final Protocol Submission', '09/2026', '2026-09-30'],
      ['Trial Completion', '12/2028', '2028-12-31'],
      ['Final Report Submission', '06/2029', '2029-06-30'],
    ]);
    expect(found.map((c) => c.dueDate)).toEqual(['2029-06-30', '2030-06-30', '2026-12-31', '2027-11-15']);
  });

  it('takes no address, telephone number or sentence for a commitment', () => {
    expect(found.some((c) => /New Hampshire|796|obligations/.test(c.text))).toBe(false);
  });

  it('finds none in a letter that imposes none', () => {
    expect(splitLetterCommitments('Dear Sponsor,\n\n1. Please provide the stability data.\n\nSincerely,')).toEqual([]);
  });

  it('reads only dates the letter states', () => {
    expect(milestoneDate('02/2028')).toBe('2028-02-29');
    expect(milestoneDate('13/2028')).toBeNull();
    expect(milestoneDate('Q3 2027')).toBeNull();
    expect(milestoneDate('February 30, 2027')).toBeNull();
  });
});

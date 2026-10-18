/**
 * Module 2.6.1 (Introduction) is not reported written because a template could
 * render it.
 *
 * What assembleNonclinicalSummary used to do: `intro: true, // 2.6.1 is always
 * renderable boilerplate`, so GET /api/nonclinical-summary reported §2.6.1
 * Introduction 'complete' for every organization — including one with no
 * studies and no introduction — and the Nonclinical surface (and AnA, through
 * its published context) read that as a written section. The registry this
 * view projects holds study records only; it does not record whether the
 * introduction (product, pharmacologic class, mechanism, indication) has been
 * written, so the honest state is "not assessed", saying what was not assessed.
 */
import { describe, it, expect } from 'vitest';
import { assembleNonclinicalSummary, type GovernedStudyRow } from '../m26-m4-view';

const TOX: GovernedStudyRow = {
  studyNumber: 'TX-701', studyType: 'repeat_dose_tox', species: 'Rat', glpCompliant: true,
  noael: '100 mg/kg/day', durationLabel: '26-week', keyFinding: null, status: 'finalized', send: null,
};

describe('assembleNonclinicalSummary — §2.6.1 Introduction', () => {
  it.each([
    ['an empty registry', [] as GovernedStudyRow[]],
    ['a registry with studies', [TOX]],
  ])('is not reported complete for %s: nothing records it as written', (_label, studies) => {
    const intro = assembleNonclinicalSummary(studies).m26.find((s) => s.n === '2.6.1');
    expect(intro?.st, '§2.6.1 Introduction was reported complete with nothing recording it').toBe('not_assessed');
    expect(intro?.note).toMatch(/not assessed/i);
    expect(intro?.note).toMatch(/introduction/i);
  });

  it('does not report it missing either — absence was not checked', () => {
    const intro = assembleNonclinicalSummary([TOX]).m26.find((s) => s.n === '2.6.1');
    expect(intro?.st).not.toBe('missing');
  });
});

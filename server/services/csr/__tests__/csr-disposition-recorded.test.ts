/**
 * §10.1 disposition: a status the source never recorded is "not recorded",
 * never a 0 (slice 1 found "Death 0" for PUNCH CD3, where FDA reports two
 * fatal TEAE discontinuations the transcription counted under "discontinued").
 * A recorded zero stays 0, and a source that records every status renders the
 * same bytes as before, so its retained-table digests still verify.
 */
import { describe, expect, it } from 'vitest';
import { CsrSourceEnvelopeSchema } from '../../../../shared/csr-source-input';
import { buildCSRTables, buildDispositionTable, type StudyData } from '../../csr-tabulation-builders';
import { sourceFixture } from './source-input-fixture';

const NR = 'not recorded';
const row = (study: StudyData, label: string) => buildDispositionTable(study).rows.find(r => r[0] === label);

describe('§10.1 disposition distinguishes an unrecorded status from a recorded zero', () => {
  it('renders statuses no record uses, and the source did not declare, as "not recorded"', () => {
    const study = sourceFixture().studyData; // records only completed and discontinued
    expect(row(study, 'Death')).toEqual(['Death', NR, NR, NR]);
    expect(row(study, 'Lost to follow-up')).toEqual(['Lost to follow-up', NR, NR, NR]);
    expect(row(study, 'Screen failure')).toEqual(['Screen failure', NR, NR, NR]);
    expect(row(study, 'Other')).toEqual(['Other', NR, NR, NR]);
    // What the source did record is unchanged.
    expect(row(study, 'Discontinued (any reason)')).toEqual(['Discontinued (any reason)', '1', '0', '1']);
  });

  it('keeps a recorded zero as 0: a status used in one arm is a recorded classification in every arm', () => {
    const study = sourceFixture().studyData;
    study.disposition[1] = { ...study.disposition[1], status: 'death' };
    expect(row(study, 'Death')).toEqual(['Death', '1', '0', '1']);
  });

  it('keeps a declared category with no subject as a recorded 0', () => {
    const study: StudyData = { ...sourceFixture().studyData, dispositionCategories: ['completed', 'discontinued', 'death'] };
    expect(row(study, 'Death')).toEqual(['Death', '0', '0', '0']);
    expect(row(study, 'Other')).toEqual(['Other', NR, NR, NR]);
  });

  it('renders a source that records every status byte-identically to the previous builder', () => {
    const study = sourceFixture().studyData;
    const statuses = ['completed', 'discontinued', 'screen-failed', 'lost-to-followup', 'death', 'other'] as const;
    study.treatmentArms = [{ ...study.treatmentArms[0], randomized: 6 }, study.treatmentArms[1]];
    study.disposition = [...statuses.map((status, i) => ({ subjectId: `s${i}`, armId: 'A', status })),
      { subjectId: 'c', armId: 'B', status: 'completed' as const }];
    expect(buildDispositionTable(study)).toEqual({
      title: '§10.1 — Patient Disposition',
      headers: ['Status', 'Synthetic treatment (n=6)', 'Synthetic comparator (n=1)', 'Total'],
      rows: [['Randomized', '6', '1', '7'], ['Completed treatment', '1', '1', '2'], ['Discontinued (any reason)', '1', '0', '1'],
        ['Screen failure', '1', '0', '1'], ['Lost to follow-up', '1', '0', '1'], ['Death', '1', '0', '1'], ['Other', '1', '0', '1']],
    });
  });

  it('labels completion by the basis the source declares, and keeps the previous label when it declares none', () => {
    const study = sourceFixture().studyData;
    expect(row(study, 'Completed treatment')).toEqual(['Completed treatment', '1', '1', '2']);
    expect(row({ ...study, dispositionBasis: 'end-of-study' }, 'Completed study')).toEqual(['Completed study', '1', '1', '2']);
    expect(row({ ...study, dispositionBasis: 'end-of-treatment' }, 'Completed treatment')).toEqual(['Completed treatment', '1', '1', '2']);
  });

  it('leaves every other table unchanged by the declarations', () => {
    const study = sourceFixture().studyData;
    const declared = { ...study, dispositionCategories: ['completed', 'discontinued'] as StudyData['dispositionCategories'], dispositionBasis: 'end-of-study' as const };
    const withoutDisposition = (s: StudyData) => Object.entries(buildCSRTables(s)).filter(([key]) => key !== 'disposition');
    expect(withoutDisposition(declared)).toEqual(withoutDisposition(study));
  });
});

describe('the csr-source.v1 contract carries the disposition declarations', () => {
  it('accepts declared categories and a basis', () => {
    const source = sourceFixture();
    source.studyData.dispositionCategories = ['completed', 'discontinued', 'death'];
    source.studyData.dispositionBasis = 'end-of-study';
    expect(CsrSourceEnvelopeSchema.safeParse(source).success).toBe(true);
  });

  it('refuses a disposition record whose status the declared categories omit, and a repeated category', () => {
    const omitted = sourceFixture();
    omitted.studyData.dispositionCategories = ['completed'];
    const parsed = CsrSourceEnvelopeSchema.safeParse(omitted);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toMatch(/declared disposition categories/);
    const repeated = sourceFixture();
    repeated.studyData.dispositionCategories = ['completed', 'discontinued', 'completed'];
    expect(CsrSourceEnvelopeSchema.safeParse(repeated).success).toBe(false);
  });
});

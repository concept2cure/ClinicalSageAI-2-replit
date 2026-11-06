/**
 * The data room's grade (S2, 2026-11-06): a deterministic function of recorded facts,
 * each criterion shown with the fact it read (RULE 2: the engine computes, never a model).
 */
import { describe, expect, it } from 'vitest';
import { gradeCapture, gradeFactsFingerprint, type DataRoomGradeFacts } from '../data-room-grade';

const SHA = 'a'.repeat(64);
const facts = (over: Partial<DataRoomGradeFacts> = {}): DataRoomGradeFacts => ({
  checksum: SHA, capturedBy: 7, origin: 'chat_upload', originalFileAvailable: true, isCurrent: true, dataEligible: true,
  disposition: null, extractionStatus: 'extracted', textAvailable: true, extractionPartial: false,
  filed: true, fixity: 'verified', catalogState: 'confirmed', datasetTables: null, ...over,
});

describe('gradeCapture', () => {
  it('grades a fully evidenced, confirmed, current document A, conformance not applying', () => {
    const g = gradeCapture(facts());
    expect(g).toMatchObject({ grade: 'A', score: 100, cap: null, engine: 'data-room-grade v1' });
    expect(g.basis.find(b => b.criterion === 'conformance')).toMatchObject({ points: null });
  });

  it('earns nothing for a fact the system does not hold, and says so', () => {
    const g = gradeCapture(facts({ filed: false, fixity: null, catalogState: null, capturedBy: null }));
    expect(g.basis.find(b => b.criterion === 'verification')).toMatchObject({ points: 0 });
    expect(g.basis.find(b => b.criterion === 'integrity')?.detail).toMatch(/not filed in Vault; fixity not checked/);
    expect(g.basis.find(b => b.criterion === 'provenance')?.detail).toMatch(/who captured it is not recorded/);
    expect(g.grade).toBe('C');
  });

  it('caps a superseded capture at C and a withdrawn one at D', () => {
    expect(gradeCapture(facts({ isCurrent: false }))).toMatchObject({ grade: 'C', cap: expect.stringMatching(/Superseded/) });
    expect(gradeCapture(facts({ dataEligible: false }))).toMatchObject({ grade: 'D', cap: expect.stringMatching(/Withdrawn/) });
  });

  it('grades D when the Vault copy failed fixity', () => {
    expect(gradeCapture(facts({ fixity: 'altered' }))).toMatchObject({ grade: 'D', cap: expect.stringMatching(/fixity check \(altered\)/) });
  });

  it('runs the CDISC validator over a dataset and names its errors per table', () => {
    const adsl = { name: 'adsl.csv', columns: ['STUDYID', 'USUBJID'].map(name => ({ name, type: 'text' })), cdisc: { standard: 'ADaM' as const, domain: 'ADSL' } };
    const g = gradeCapture(facts({ datasetTables: [adsl] }));
    const conformance = g.basis.find(b => b.criterion === 'conformance')!;
    expect(conformance.points).toBe(0);
    expect(conformance.detail).toMatch(/0 of 1 table pass the ADaM validator.*ADSL: \d+ errors?/);
  });

  it('gives no conformance to a dataset with no CDISC standard recognized', () => {
    const t = { name: 'listing.csv', columns: [{ name: 'X', type: 'text' }], cdisc: { standard: null, domain: null } };
    expect(gradeCapture(facts({ datasetTables: [t] })).basis.find(b => b.criterion === 'conformance')).toMatchObject({ points: 0 });
  });

  it('is deterministic: the same facts give the same grade and fingerprint; a changed fact changes the fingerprint', () => {
    expect(gradeCapture(facts())).toEqual(gradeCapture(facts()));
    expect(gradeFactsFingerprint(facts())).not.toBe(gradeFactsFingerprint(facts({ catalogState: 'suggested' })));
  });
});

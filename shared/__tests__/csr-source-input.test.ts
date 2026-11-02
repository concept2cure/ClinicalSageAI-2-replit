import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { CsrSourceEnvelopeSchema, type CsrSourceEnvelope } from '../csr-source-input.js';
import { csrSourceContract } from '../csr-source-contract.js';
import { sourceFixture } from '../../server/services/csr/__tests__/source-input-fixture.js';

describe('explicit CSR supporting source input', () => {
  it('accepts exact recorded values without deriving efficacy or changing source observations', () => {
    const source = sourceFixture();
    expect(CsrSourceEnvelopeSchema.parse(source)).toEqual(source);
  });
  it.each([
    ['duplicate participant', (s: ReturnType<typeof sourceFixture>) => s.participants.push({ ...s.participants[0] })],
    ['unknown arm', s => { s.participants[0].armId = 'absent'; }],
    ['wrong protocol', s => { s.studyInfo.protocolNumber = 'OTHER'; }],
    ['wrong randomized count', s => { s.studyData.treatmentArms[0].randomized = 3; }],
    ['wrong safety population', s => { s.participants[0].safety = false; }],
    ['wrong sample size', s => { s.studyInfo.sampleSize = 30; }],
    ['missing disposition', s => { s.studyData.disposition.pop(); }],
    ['duplicate demographics', s => { s.studyData.demographics.push({ ...s.studyData.demographics[0] }); }],
    ['missing demographics', s => { s.studyData.demographics.pop(); }],
    ['wrong completion flag', s => { s.participants[0].completed = false; }],
    ['foreign AE subject', s => { s.studyData.adverseEvents[0].subjectId = 'not-in-source'; }],
    ['wrong AE arm', s => { s.studyData.adverseEvents[0].armId = 'B'; }],
    ['unrecorded primary endpoint', s => { s.studyInfo.primaryEndpoint = 'Different endpoint'; }],
    ['duplicate efficacy result', s => { s.studyData.efficacy.push({ ...s.studyData.efficacy[0] }); }],
    ['reversed confidence interval', s => { s.studyData.efficacy[0].ci = { lower: 4, upper: 3, level: '95%' }; }],
    ['invalid p value', s => { s.studyData.efficacy[0].pValue = 1.2; }],
    ['nonfinite observed result', s => { s.studyData.efficacy[0].value = Infinity; }],
    ['invalid date', s => { s.dataCutDate = '2026-02-30'; }],
    ['missing domain declaration', s => { (s.completeDomains as Record<string, unknown>).adverseEvents = false; }],
    ['lab counts above denominator', s => { s.studyData.labShifts = [{ armId: 'A', parameter: 'ALT', shiftFromNormal: 2, shiftToHigh: 2, shiftToLow: 2, totalAssessed: 2 }]; }],
    ['duplicate exposure', s => { s.studyData.exposure = [{ armId: 'A', meanExposureDays: 10 }, { armId: 'A', meanExposureDays: 20 }]; }],
  ] as Array<[string, (source: ReturnType<typeof sourceFixture>) => void]>)('refuses %s', (_name, change) => {
    const source = sourceFixture(); change(source); expect(CsrSourceEnvelopeSchema.safeParse(source).success).toBe(false);
  });
  it('requires optional population flags and counts together, retaining unknown when neither is recorded', () => {
    const source = sourceFixture();
    source.studyData.treatmentArms[0].populations.mitt = 1;
    expect(CsrSourceEnvelopeSchema.safeParse(source).success).toBe(false);
    source.participants[0].mitt = true; source.participants[1].mitt = false;
    expect(CsrSourceEnvelopeSchema.safeParse(source).success).toBe(true);
    delete source.studyData.treatmentArms[0].populations.mitt;
    expect(CsrSourceEnvelopeSchema.safeParse(source).success).toBe(false);
  });
  it('requires complete-domain declaration even for an explicitly empty adverse-event listing', () => {
    const source = sourceFixture(); source.studyData.adverseEvents = [];
    expect(CsrSourceEnvelopeSchema.safeParse(source).success).toBe(true);
    delete (source.completeDomains as Partial<typeof source.completeDomains>).adverseEvents;
    expect(CsrSourceEnvelopeSchema.safeParse(source).success).toBe(false);
  });
  it('generates field documentation from the actual schema and states semantic and qualification limits', () => {
    const contract = csrSourceContract();
    expect(contract.format).toBe('concept2cure.csr-source.v1');
    const schema = contract.sourceSchema as Record<string, unknown>;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(expect.arrayContaining(['studyInfo', 'participants', 'completeDomains', 'studyData', 'dataCutDate']));
    expect(contract.description).toContain('do not establish clinical verification');
    expect(contract.validationRules.join(' ')).toContain('crossover');
    expect(JSON.stringify(contract)).not.toContain('synthetic-a');
  });
});

/** Compressed only for source control; the Vault receives the decompressed JSON.
 * No live document IDs, approvals, model outputs or trial registration are fabricated. */
const fauxBiotech = (): CsrSourceEnvelope => JSON.parse(gunzipSync(readFileSync(path.resolve(__dirname,
  '../../docs/demo/faux-biotech-csr/FBT201_CSR_SOURCE_SYNTHETIC_v2.json.gz'))).toString('utf8'));
const completeWithdrawnSubject = (source: CsrSourceEnvelope) => {
  const subject = source.participants.find(p => p.subjectId === 'FBT201-A003')!;
  subject.completed = true;
  source.studyData.treatmentArms.find(a => a.armId === subject.armId)!.populations.completed++;
  source.studyData.disposition.find(d => d.subjectId === subject.subjectId)!.status = 'completed';
};

describe('Faux Biotech revision 2 and treatment disposition', () => {
  it('parses the complete synthetic source through the real schema without rewriting it', () => {
    const source = fauxBiotech();
    expect(CsrSourceEnvelopeSchema.parse(source)).toEqual(source);
    expect(source.studyData.treatmentArms.map(a => a.populations.completed)).toEqual([74, 76]);
  });
  it.each(['event', 'subject'] as const)('refuses contradictory %s-level treatment withdrawal', basis => {
    const source = fauxBiotech();
    if (basis === 'subject') {
      const withdrawn = new Set(source.studyData.adverseEvents.filter(e => e.ledToDiscontinuation).map(e => e.subjectId));
      source.studyData.aeDiscontinuationBasis = 'subject';
      source.studyData.disposition.forEach(d => { d.discontinuedForAdverseEvent = withdrawn.has(d.subjectId); });
      source.studyData.adverseEvents.forEach(e => { delete e.ledToDiscontinuation; });
    }
    completeWithdrawnSubject(source);
    const result = CsrSourceEnvelopeSchema.safeParse(source);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(i => i.message.includes('cannot also be recorded as completing treatment'))).toBe(true);
  });
  it.each(['end-of-study', undefined] as const)('does not infer treatment completion from %s disposition', basis => {
    const source = fauxBiotech(); completeWithdrawnSubject(source);
    if (basis) source.studyData.dispositionBasis = basis; else delete source.studyData.dispositionBasis;
    expect(CsrSourceEnvelopeSchema.safeParse(source).success).toBe(true);
  });
  it('still refuses unknown fields, invalid dates and extra clinical-verification claims', () => {
    const source = fauxBiotech();
    expect(CsrSourceEnvelopeSchema.safeParse({ ...source, sourceApproval: 'approved' }).success).toBe(false);
    expect(CsrSourceEnvelopeSchema.safeParse({ ...source, dataCutDate: '2026-02-30' }).success).toBe(false);
  });
});

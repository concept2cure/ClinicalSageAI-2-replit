/**
 * CDISC pilot defects D1–D9 (docs/evidence/D2-CSR/2026-10-30-cdisc-pilot-e2e):
 * an ADaM 2.1-era study that records disposition in DCDECOD, AE withdrawal in
 * an ADSL flag, causality as REMOTE, labs as ADLBC + ADLBH coded N/H/L, the
 * last on-treatment value as AVISIT "End of Treatment", vital signs per
 * position and exposure in ADSL. The manifest declares each convention; the
 * engine reads it, and refuses as before when nothing is declared. SYNTHETIC
 * fixture (support/adam-legacy-synthetic.ts): every row invented.
 */
import { describe, expect, it } from 'vitest';
import { CSR_EFFICACY_RESULTS_FORMAT, CsrAdamBundleSchema, type CsrEfficacyResults } from '../../../../shared/csr-adam-bundle';
import { CsrSourceEnvelopeSchema } from '../../../../shared/csr-source-input';
import { buildCSRTables } from '../../csr-tabulation-builders';
import type { AdamDataset } from '../adam-dataset-reader';
import { deriveCsrSourceFromAdam, type AdamDatasets } from '../adam-source-derivation';
import { buildNarrativeIndex, subjectNarrativeFacts } from '../narrative-subject-facts';
import { selectNarrativeSubjects } from '../narrative-subject-selection';
import { PRIMARY } from './support/adam-lmn201-synthetic';
import {
  LEGACY_AE_ROWS, LEGACY_CONVENTIONS, legacyAdae, legacyAdlbc, legacyAdlbh, legacyAdsl, legacyAdvs, legacyBundle, legacyId,
} from './support/adam-legacy-synthetic';

const efficacy: CsrEfficacyResults = { format: CSR_EFFICACY_RESULTS_FORMAT, protocolNumber: 'SYN-LMN201-PROTOCOL', results: [
  { endpointName: PRIMARY, endpointType: 'primary', armId: 'DRUG', value: 1, display: 'synthetic' },
  { endpointName: PRIMARY, endpointType: 'primary', armId: 'PBO', value: 2, display: 'synthetic' }] };
const all = (): AdamDatasets => ({ ADSL: legacyAdsl(), ADAE: legacyAdae(), ADLBC: legacyAdlbc(), ADLBH: legacyAdlbh(), ADVS: legacyAdvs() } as AdamDatasets);
const conventions = (over: Record<string, unknown> = {}) => ({ ...LEGACY_CONVENTIONS, ...over });
const derive = (datasets: AdamDatasets = all(), declared: Record<string, unknown> | null = LEGACY_CONVENTIONS) =>
  deriveCsrSourceFromAdam(legacyBundle(declared), datasets, efficacy);
const without = (key: string) => { const c: Record<string, unknown> = { ...LEGACY_CONVENTIONS }; delete c[key]; return c; };
const refusal = (fn: () => unknown) => {
  try { fn(); } catch (error) { return error as { code: string; issues?: Array<{ path: string }> }; }
  throw new Error('expected a refusal');
};
const rowOf = (rows: string[][], label: RegExp) => rows.find(r => label.test(r[0]));
const ids = (...n: number[]) => n.map(legacyId);

describe('the manifest declares the study’s ADaM conventions', () => {
  it('accepts the conventions block and refuses an unknown convention', () => {
    expect(CsrAdamBundleSchema.safeParse(legacyBundle()).success).toBe(true);
    expect(CsrAdamBundleSchema.safeParse(legacyBundle(conventions({ guessMissingValues: true }))).success).toBe(false);
    expect(CsrAdamBundleSchema.safeParse(legacyBundle(conventions({ causality: { REMOTE: 'maybe' } }))).success).toBe(false);
  });
});

describe('D1: disposition from DCDECOD when declared', () => {
  it('reads COMPLETED, ADVERSE EVENT, DEATH and LOST TO FOLLOW-UP from DCDECOD', () => {
    const source = derive();
    expect(source.studyData.disposition.map(d => [d.subjectId, d.status, d.reason ?? null])).toEqual([
      [ids(0)[0], 'completed', null], [ids(1)[0], 'discontinued', 'ADVERSE EVENT'], [ids(2)[0], 'completed', null],
      [ids(3)[0], 'death', 'DEATH'], [ids(4)[0], 'completed', null], [ids(5)[0], 'discontinued', 'ADVERSE EVENT'],
      [ids(6)[0], 'lost-to-followup', 'LOST TO FOLLOW-UP'], [ids(7)[0], 'completed', null]]);
  });
  it('still requires EOSSTT when nothing is declared, and refuses a blank DCDECOD', () => {
    expect(refusal(() => derive(all(), without('disposition')))).toMatchObject({ code: 'CSR_ADAM_VARIABLE_MISSING', issues: [{ path: 'ADSL.EOSSTT' }] });
    const blank = { ...all(), ADSL: legacyAdsl((r, i) => (i === 2 ? r.map((v, c) => (c === 6 ? null : v)) : r)) };
    expect(refusal(() => derive(blank))).toMatchObject({ code: 'CSR_ADAM_VALUE_MISSING', issues: [{ path: 'ADSL[3].DCDECOD' }] });
  });
});

describe('D2: subject-level AE discontinuation when AEACN was not collected', () => {
  it('counts AE withdrawals from the declared ADSL flag, labelled as subject-level, never as 0', () => {
    const source = derive();
    expect(source.studyData.aeDiscontinuationBasis).toBe('subject');
    expect(source.studyData.adverseEvents.every(e => e.ledToDiscontinuation === undefined)).toBe(true);
    const tables = buildCSRTables(source.studyData);
    expect(rowOf(tables.aeOverallSummary.rows, /discontinu/i)).toEqual(['Discontinued for an AE (subject-level), n (%)', '1 (25.0%)', '1 (25.0%)']);
    expect(rowOf(tables.deathsSAEsDiscontinuations.rows, /discontinu/i)).toEqual(['Discontinuations Due to AE (subject-level), n', '1', '1']);
  });
  it('still refuses a blank AEACN when no subject-level flag is declared', () => {
    expect(refusal(() => derive(all(), without('aeDiscontinuationFlag')))).toMatchObject({ code: 'CSR_ADAM_VALUE_MISSING', issues: [{ path: 'ADAE[1].AEACN' }] });
  });
  it('refuses a declared flag that ADSL lacks or that is not Y/N/blank', () => {
    expect(refusal(() => derive(all(), conventions({ aeDiscontinuationFlag: 'DCAEFL' })))).toMatchObject({ code: 'CSR_ADAM_VARIABLE_MISSING', issues: [{ path: 'ADSL.DCAEFL' }] });
    const odd = { ...all(), ADSL: legacyAdsl((r, i) => (i === 0 ? r.map((v, c) => (c === 7 ? 'MAYBE' : v)) : r)) };
    expect(refusal(() => derive(odd)).code).toBe('CSR_ADAM_VALUE_UNMAPPED');
  });
  it('the contract refuses a subject-level basis mixed with event-level flags, or a flagged subject outside safety', () => {
    const source = derive();
    const mixed = { ...source, studyData: { ...source.studyData, adverseEvents: source.studyData.adverseEvents.map(e => ({ ...e, ledToDiscontinuation: false })) } };
    expect(CsrSourceEnvelopeSchema.safeParse(mixed).success).toBe(false);
    const unflagged = { ...source, studyData: { ...source.studyData, disposition: source.studyData.disposition.map(({ discontinuedForAdverseEvent: _x, ...d }) => d) } };
    expect(CsrSourceEnvelopeSchema.safeParse(unflagged).success).toBe(false);
  });
});

describe('D3: the SAP’s causality classes', () => {
  it('refuses REMOTE when undeclared, and counts it as declared', () => {
    expect(refusal(() => derive(all(), without('causality')))).toMatchObject({ code: 'CSR_ADAM_VALUE_UNMAPPED', issues: [{ path: 'ADAE[1].AEREL' }] });
    expect(derive().studyData.adverseEvents.map(e => e.related)).toEqual(['unrelated', 'related', 'unrelated', 'related', 'unrelated']);
    const remoteRelated = derive(all(), conventions({ causality: { REMOTE: 'related' } }));
    expect(remoteRelated.studyData.adverseEvents[0].related).toBe('related');
  });
});

describe('D4: laboratory data split into ADLBC and ADLBH', () => {
  it('derives shifts from both, and refuses a parameter that appears in both', () => {
    expect(derive().studyData.labShifts?.map(s => [s.parameter, s.armId, s.totalAssessed, s.shiftFromNormal, s.shiftToHigh, s.shiftToLow])).toEqual([
      ['Alanine Aminotransferase (U/L)', 'DRUG', 4, 4, 1, 0], ['Alanine Aminotransferase (U/L)', 'PBO', 4, 3, 0, 0],
      ['Hemoglobin (g/dL)', 'DRUG', 4, 4, 0, 0], ['Hemoglobin (g/dL)', 'PBO', 4, 4, 0, 1]]);
    const twice = { ...all(), ADLBH: { ...legacyAdlbc(), name: 'ADLBH' } as AdamDataset };
    expect(refusal(() => derive(twice)).code).toBe('CSR_ADAM_LAB_PARAMETER_DUPLICATED');
  });
});

describe('D5: the last on-treatment record named by AVISIT', () => {
  it('requires ONTRTFL when undeclared, and reads the declared End of Treatment record', () => {
    expect(refusal(() => derive(all(), without('lastOnTreatment')))).toMatchObject({ code: 'CSR_ADAM_VARIABLE_MISSING' });
    const weight = derive().studyData.vitalSigns?.filter(v => v.parameter === 'Weight (kg)');
    expect(weight?.map(v => v.lastOnTreatment)).toEqual([69, 70, 71, 72, 73, 74, 75, 76]);
  });
  it('refuses two different End of Treatment values for one series', () => {
    const lb = legacyAdlbc();
    const extra = { ...lb.rows.find(r => r.AVISIT === 'End of Treatment')!, ANRIND: 'L' };
    expect(refusal(() => derive({ ...all(), ADLBC: { ...lb, rows: [...lb.rows, extra] } })).code).toBe('CSR_ADAM_LAST_VALUE_AMBIGUOUS');
  });
});

describe('D6: ANRIND decoded by the declared codelist', () => {
  it('refuses N/H/L when undeclared', () => {
    expect(refusal(() => derive(all(), without('rangeIndicator'))).code).toBe('CSR_ADAM_VALUE_UNMAPPED');
  });
});

describe('D7: a parameter whose baselines differ by position is summarised per position', () => {
  it('derives one series per subject, parameter and ATPT instead of refusing BASELINE_AMBIGUOUS', () => {
    const params = [...new Set(derive().studyData.vitalSigns?.map(v => v.parameter))];
    expect(params).toEqual(['Systolic Blood Pressure (mmHg), AFTER LYING DOWN FOR 5 MINUTES', 'Systolic Blood Pressure (mmHg), AFTER STANDING FOR 1 MINUTE', 'Weight (kg)']);
    const lying = buildCSRTables(derive().studyData).vitalSigns!.rows.find(r => r[0].includes('LYING') && r[1] === 'Drug X');
    expect(lying?.slice(2)).toEqual(['4', '131.5 (1.3)', '121.5 (1.3)', '-10.0 (0.0)']);
  });
  it('still refuses two baselines at the same position', () => {
    const vs = legacyAdvs();
    expect(refusal(() => derive({ ...all(), ADVS: { ...vs, rows: [...vs.rows, { ...vs.rows[0] }] } })).code).toBe('CSR_ADAM_BASELINE_AMBIGUOUS');
  });
});

describe('D9: exposure from ADSL when there is no ADEX', () => {
  it('summarises the declared duration and average daily dose for every safety subject', () => {
    const tables = buildCSRTables(derive().studyData);
    expect(tables.exposure?.rows).toEqual([['Drug X', '4', '54.0 mg', '54.5', '0.60'], ['Placebo', '4', '0.0 mg', '55.0', '0.60']]);
  });
  it('refuses a safety subject without a duration, and a declaration beside ADEX', () => {
    const gap = { ...all(), ADSL: legacyAdsl((r, i) => (i === 6 ? r.map((v, c) => (c === 11 ? null : v)) : r)) };
    expect(refusal(() => derive(gap)).code).toBe('CSR_ADAM_EXPOSURE_INCOMPLETE');
    const adex = { name: 'ADEX', format: 'dataset-json', columns: ['USUBJID', 'PARAMCD', 'AVAL'], rows: [] } as AdamDataset;
    expect(refusal(() => derive({ ...all(), ADEX: adex })).code).toBe('CSR_ADAM_CONVENTION_CONFLICT');
  });
});

describe('D8: narrative selection never narrows AE withdrawal silently', () => {
  it('reads DCDECOD ADVERSE EVENT even when AEACN is fully recorded and nothing is declared', () => {
    const recorded = LEGACY_AE_ROWS.map(r => [...r.slice(0, 11), 'DOSE NOT CHANGED']);
    const selection = selectNarrativeSubjects(legacyBundle(null), { ADSL: legacyAdsl(), ADAE: legacyAdae(recorded) });
    expect(selection.subjects.map(s => [s.subjectId, s.categories])).toEqual([
      [ids(1)[0], ['discontinuation']], [ids(3)[0], ['death', 'serious']], [ids(5)[0], ['discontinuation']]]);
  });
  it('selects from the declared ADSL flag when AEACN was not collected, and names the reason’s source', () => {
    const datasets = { ADSL: legacyAdsl(), ADAE: legacyAdae() };
    const selection = selectNarrativeSubjects(legacyBundle(), datasets);
    expect(selection.counts).toEqual({ death: 1, serious: 1, discontinuation: 2, aesi: 0 });
    const facts = subjectNarrativeFacts(datasets, buildNarrativeIndex(datasets), selection.subjects[0]);
    expect(facts.discontinuationReason).toBe('ADVERSE EVENT');
    expect(facts.facts).toContainEqual({ field: 'discontinuationReason', value: 'ADVERSE EVENT', source: 'ADSL[2].DCDECOD' });
  });
  it('still refuses a blank AEACN when no flag is declared', () => {
    expect(refusal(() => selectNarrativeSubjects(legacyBundle(null), { ADSL: legacyAdsl(), ADAE: legacyAdae() }))).toMatchObject({ issues: [{ path: 'ADAE[1].AEACN' }] });
  });
});

describe('D16: two pairwise comparisons of one arm (found on the pilot re-run)', () => {
  it('accepts high vs placebo and high vs low as two results, and still refuses a true duplicate', () => {
    const pairwise = { ...efficacy, results: [...efficacy.results,
      { endpointName: PRIMARY, endpointType: 'primary' as const, armId: 'DRUG', comparatorArmId: 'PBO', value: -1, display: 'synthetic difference' }] };
    const three = { ...efficacy, results: [...pairwise.results, { ...pairwise.results[2], comparatorArmId: undefined, display: 'second' }] };
    expect(deriveCsrSourceFromAdam(legacyBundle(), all(), pairwise).studyData.efficacy).toHaveLength(3);
    expect(refusal(() => deriveCsrSourceFromAdam(legacyBundle(), all(), three)).code).toBe('CSR_ADAM_SOURCE_INVALID');
  });
});

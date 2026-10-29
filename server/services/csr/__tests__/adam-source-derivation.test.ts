/**
 * CSR slice 6: the engine derives the csr-source.v1 envelope from ADaM and the
 * approved SAP efficacy output, then tabulates it. The fixture is SYNTHETIC
 * (support/adam-lmn201-synthetic.ts): shaped like LMN-201 Part B, every row
 * invented. Cross-dataset inconsistencies are typed refusals, never repairs.
 */
import { describe, expect, it } from 'vitest';
import { buildCSRTables, NOT_RECORDED } from '../../csr-tabulation-builders';
import { readAdamDataset, type AdamDataset } from '../adam-dataset-reader';
import { deriveCsrSourceFromAdam, type AdamDatasets } from '../adam-source-derivation';
import { buildCsrAuthoringEvidence, csrSectionTableKeys, reconcileCsrTableClaims } from '../cortex-authoring-context';
import { adae, adcm, adex, adlb, adsl, advs, AE_ROWS, bundle, efficacyResults, STUDY_ID } from './support/adam-lmn201-synthetic';
import { xptWithRows } from './support/adam-xpt';

const read = (doc: unknown, file = 'x.json'): AdamDataset => {
  const out = readAdamDataset(Buffer.from(JSON.stringify(doc)), file);
  if (!out.ok) throw new Error(out.reason);
  return out.dataset;
};
const full = (): AdamDatasets => ({ ADSL: read(adsl()), ADAE: read(adae()), ADEX: read(adex()), ADLB: read(adlb()), ADVS: read(advs()), ADCM: read(adcm()) });
const derive = (datasets: AdamDatasets = full()) => deriveCsrSourceFromAdam(bundle(), datasets, efficacyResults());
const refusal = (fn: () => unknown) => {
  try { fn(); } catch (error) { return error as { code: string; status: number; issues?: Array<{ path: string }> }; }
  throw new Error('expected a refusal');
};
const rowOf = (rows: string[][], label: string) => rows.find(r => r[0] === label);

describe('cross-dataset consistency is refused, typed', () => {
  it('refuses a treatment-emergent ADAE row whose subject is outside the ADSL safety population', () => {
    const datasets = full();
    datasets.ADSL = read(adsl((row, i) => (i === 1 ? row.map((v, c) => (c === 5 ? 'N' : v)) : row))); // S02 SAFFL = N
    const error = refusal(() => derive(datasets));
    expect(error).toMatchObject({ code: 'CSR_ADAM_SUBJECT_NOT_IN_SAFETY_POPULATION', status: 422 });
    expect(error.issues?.[0].path).toBe('ADAE[2].USUBJID');
  });

  it('refuses an ADAE subject that ADSL does not list, and never adds it as a participant', () => {
    const datasets = full();
    datasets.ADAE = read(adae([...AE_ROWS, [STUDY_ID, `${STUDY_ID}-S99`, 'Placebo', 'Y', 'Nausea', 'Gastrointestinal disorders', 'MILD', 'N', 'NOT RELATED', null, 'N', null]]));
    expect(refusal(() => derive(datasets)).code).toBe('CSR_ADAM_SUBJECT_NOT_IN_ADSL');
  });

  it.each([
    ['an unmapped planned treatment', () => ({ ADSL: read(adsl((r, i) => (i === 0 ? r.map((v, c) => (c === 2 ? 'LMN-201 high dose' : v)) : r))) }), 'CSR_ADAM_ARM_UNMAPPED'],
    ['a reassigned actual treatment', () => ({ ADSL: read(adsl((r, i) => (i === 0 ? r.map((v, c) => (c === 3 ? 'Placebo' : v)) : r))) }), 'CSR_ADAM_TREATMENT_REASSIGNED'],
    ['a subject still ongoing at the data cut', () => ({ ADSL: read(adsl((r, i) => (i === 3 ? r.map((v, c) => (c === 8 ? 'ONGOING' : v)) : r))) }), 'CSR_ADAM_DISPOSITION_NOT_FINAL'],
    ['an unknown sex', () => ({ ADSL: read(adsl((r, i) => (i === 3 ? r.map((v, c) => (c === 12 ? 'U' : v)) : r))) }), 'CSR_ADAM_VALUE_UNMAPPED'],
    ['a severity outside MILD/MODERATE/SEVERE', () => ({ ADAE: read(adae(AE_ROWS.map((r, i) => (i === 0 ? r.map((v, c) => (c === 6 ? 'GRADE 2' : v)) : r)))) }), 'CSR_ADAM_VALUE_UNMAPPED'],
    ['an uncoded treatment-emergent event', () => ({ ADAE: read(adae(AE_ROWS.map((r, i) => (i === 0 ? r.map((v, c) => (c === 4 ? null : v)) : r)))) }), 'CSR_ADAM_VALUE_MISSING'],
    ['a dataset in the wrong slot', () => ({ ADAE: read(adsl()) }), 'CSR_ADAM_DATASET_MISMATCH'],
    ['a different STUDYID', () => ({ ADAE: read(adae(AE_ROWS.map((r, i) => (i === 0 ? ['OTHER', ...r.slice(1)] : r)))) }), 'CSR_ADAM_STUDY_MISMATCH'],
    ['a safety subject without exposure', () => ({ ADEX: { ...read(adex()), rows: read(adex()).rows.slice(1) } }), 'CSR_ADAM_EXPOSURE_INCOMPLETE'],
  ])('refuses %s', (_name, change, code) => {
    expect(refusal(() => derive({ ...full(), ...change() })).code).toBe(code);
  });

  it('refuses a missing variable by name, and an efficacy file for another protocol', () => {
    const datasets = full();
    datasets.ADAE = { ...datasets.ADAE, columns: datasets.ADAE.columns.filter(c => c !== 'TRTEMFL') };
    expect(refusal(() => derive(datasets))).toMatchObject({ code: 'CSR_ADAM_VARIABLE_MISSING', issues: [{ path: 'ADAE.TRTEMFL' }] });
    const other = { ...efficacyResults(), protocolNumber: 'OTHER' };
    expect(refusal(() => deriveCsrSourceFromAdam(bundle(), full(), other)).code).toBe('CSR_ADAM_EFFICACY_PROTOCOL_MISMATCH');
  });

  it('refuses an ADAE that cannot establish fatal outcomes or AE discontinuations, rather than counting them 0', () => {
    for (const missing of [['AEOUT', 'AESDTH'], ['AEACN']]) {
      const ae = read(adae());
      const datasets = { ...full(), ADAE: { ...ae, columns: ae.columns.filter(c => !missing.includes(c)) } };
      expect(refusal(() => derive(datasets))).toMatchObject({ code: 'CSR_ADAM_VARIABLE_MISSING' });
    }
  });

  // Adversarial review 2026-10-29: requiring the AEOUT/AESDTH and AEACN columns is
  // not enough. A blank or UNKNOWN cell on a treatment-emergent row left the event
  // non-fatal and not discontinued, so §12.2/§12.3 counted an unrecorded value as 0.
  it.each([
    ['AESDTH and AEOUT both blank', { 9: null, 10: null }, 'CSR_ADAM_VALUE_MISSING', 'ADAE[1].AESDTH'],
    ['AESDTH blank and AEOUT UNKNOWN', { 9: 'UNKNOWN', 10: null }, 'CSR_ADAM_VALUE_MISSING', 'ADAE[1].AESDTH'],
    ['AEACN blank', { 11: null }, 'CSR_ADAM_VALUE_MISSING', 'ADAE[1].AEACN'],
    ['AEACN UNKNOWN', { 11: 'UNKNOWN' }, 'CSR_ADAM_VALUE_MISSING', 'ADAE[1].AEACN'],
  ])('refuses a treatment-emergent row with %s rather than counting it 0', (_name, cells, code, path) => {
    const rows = AE_ROWS.map((r, i) => (i === 0 ? r.map((v, c) => (c in cells ? (cells as Record<number, string | null>)[c] : v)) : r));
    expect(refusal(() => derive({ ...full(), ADAE: read(adae(rows)) }))).toMatchObject({ code, issues: [{ path }] });
  });

  it('accepts AESDTH = N with no AEOUT: the event is recorded as not fatal', () => {
    const rows = AE_ROWS.map((r, i) => (i === 0 ? r.map((v, c) => (c === 9 ? null : v)) : r));
    expect(derive({ ...full(), ADAE: read(adae(rows)) }).studyData.adverseEvents[0].outcome).toBeUndefined();
  });

  it('refuses a last on-treatment value it cannot order, and two baselines', () => {
    const lb = read(adlb());
    const noOrder = { ...lb, columns: lb.columns.filter(c => c !== 'ADT') };
    expect(refusal(() => derive({ ...full(), ADLB: noOrder })).code).toBe('CSR_ADAM_ORDER_UNRECORDED');
    const twoBaselines = { ...lb, rows: [...lb.rows, { ...lb.rows[0] }] };
    expect(refusal(() => derive({ ...full(), ADLB: twoBaselines })).code).toBe('CSR_ADAM_BASELINE_AMBIGUOUS');
  });
});

describe('the derived source is exactly what the datasets record', () => {
  it('lists every ADSL subject once and no other, with populations from the flags', () => {
    const source = derive();
    expect(source.participants.map(p => p.subjectId)).toEqual(read(adsl()).rows.map(r => r.USUBJID));
    expect(source.studyData.treatmentArms).toEqual([
      { armId: 'LMN201', armName: 'LMN-201', randomized: 12, populations: { safety: 12, itt: 12, completed: 11, perProtocol: 11 } },
      { armId: 'PBO', armName: 'Placebo', randomized: 11, populations: { safety: 11, itt: 11, completed: 9, perProtocol: 9 } },
    ]);
    expect(source.studyData.adverseEvents).toHaveLength(6); // the pre-treatment headache is not treatment-emergent
    expect(source.studyData.efficacy[0].posteriorProbability).toEqual({ value: 0.987, hypothesis: 'OR > 1 (synthetic placeholder)' });
  });

  it('derives the same source from SAS transport as from Dataset-JSON', () => {
    const json = read(adsl());
    const vars = json.columns.map(name => (['AGE'].includes(name) ? { name, label: name, type: 'num' as const, length: 8 }
      : { name, label: name, type: 'char' as const, length: 32 }));
    const out = readAdamDataset(xptWithRows('ADSL', vars, json.rows.map(r => json.columns.map(c => r[c] as string | number | null))), 'adsl.xpt');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(derive({ ...full(), ADSL: out.dataset })).toEqual(derive());
  });
});

describe('end to end: synthetic LMN-201-shaped ADaM → engine tables', () => {
  const tables = buildCSRTables(derive().studyData);

  it('§10.1 reports the death and the loss to follow-up, and "not recorded" for what ADSL cannot establish', () => {
    expect(tables.disposition.rows).toEqual([
      // Adversarial review 2026-10-29: three subjects discontinued, so the row that
      // holds the one withdrawal cannot be labelled "any reason".
      ['Randomized', '12', '11', '23'], ['Completed study', '11', '9', '20'], ['Discontinued (other reasons)', '1', '0', '1'],
      ['Screen failure', NOT_RECORDED, NOT_RECORDED, NOT_RECORDED], ['Lost to follow-up', '0', '1', '1'], ['Death', '0', '1', '1'],
      ['Other', NOT_RECORDED, NOT_RECORDED, NOT_RECORDED]]);
  });

  it('§12.2 / §12.3 count TEAE subjects, the SAE and the fatal event against the safety population', () => {
    expect(rowOf(tables.aeOverallSummary.rows, 'Any AE, n (%)')).toEqual(['Any AE, n (%)', '3 (25.0%)', '3 (27.3%)']);
    expect(rowOf(tables.aeOverallSummary.rows, 'Serious AE, n (%)')).toEqual(['Serious AE, n (%)', '1 (8.3%)', '1 (9.1%)']);
    expect(rowOf(tables.aeOverallSummary.rows, 'Fatal AE, n (%)')).toEqual(['Fatal AE, n (%)', '0 (0.0%)', '1 (9.1%)']);
    expect(rowOf(tables.aeBySOC.rows, 'Gastrointestinal disorders')).toEqual(['Gastrointestinal disorders', '2 (16.7%)', '2 (18.2%)']);
    expect(tables.deathsSAEsDiscontinuations.rows).toEqual([
      ['Subjects with fatal AEs, n', '0', '1'], ['SAEs (any), n', '1', '1'],
      ['Treatment-Related SAEs, n', '0', '0'], ['Discontinuations Due to AE, n', '0', '1']]);
  });

  it('§12.1 exposure, §12.4 lab shifts and the Bayesian primary result come through', () => {
    expect(tables.exposure!.rows).toEqual([['LMN-201', '12', '—', '13.3', '0.44'], ['Placebo', '11', '—', '13.0', '0.39']]);
    expect(tables.labShifts!.rows).toEqual([
      ['Alanine Aminotransferase (U/L)', 'LMN-201', '12', '12', '1 (8.3%)', '0 (0.0%)', '11 (91.7%)'],
      ['Alanine Aminotransferase (U/L)', 'Placebo', '11', '10', '0 (0.0%)', '1 (10.0%)', '9 (90.0%)']]);
    expect(tables.primaryEfficacy.headers).toContain('Posterior probability');
    expect(tables.primaryEfficacy.rows[0].slice(0, 3)).toEqual(['Global cure at Week 8 (SYNTHETIC)', 'LMN-201', '10/12 (83.3%) synthetic']);
  });

  it('§12.5 finally has evidence: change from baseline to the last on-treatment value', () => {
    expect(tables.vitalSigns!.rows).toEqual([
      ['Systolic Blood Pressure (mmHg)', 'LMN-201', '12', '125.5 (3.6)', '124.5 (3.9)', '-1.0 (0.9)'],
      ['Systolic Blood Pressure (mmHg)', 'Placebo', '11', '137.0 (3.3)', '138.9 (3.5)', '1.9 (0.8)']]);
    expect(csrSectionTableKeys('12.5')).toEqual(['vitalSigns']);
  });

  it('§11.2 concomitant medications count subjects, and say when a class was not coded', () => {
    expect(tables.concomitantMedications!.rows).toEqual([
      ['Any concomitant medication', '', '1 (8.3%)', '2 (18.2%)'],
      ['ANTIINFECTIVES FOR SYSTEMIC USE', 'VANCOMYCIN', '1 (8.3%)', '1 (9.1%)'],
      ['ATC class not coded', 'PARACETAMOL', '0 (0.0%)', '1 (9.1%)']]);
  });
});

describe('end to end: §12.2 and §12.5 evidence packs reconcile every drafted figure', () => {
  const RUN = '11111111-2222-4333-8444-0000000000aa';
  const PROGRAM = '11111111-2222-4333-8444-0000000000bb';
  const retained = { runId: RUN, programId: PROGRAM, historical: true as const, releaseEligibilityVerified: false,
    studies: [{ source: { documentId: '11111111-2222-4333-8444-0000000000cc', version: '1.0', sha256: 'a'.repeat(64),
      dataCutDate: '2026-03-31', studyId: STUDY_ID, protocolNumber: 'SYN-LMN201-PROTOCOL', clinicalVerification: 'not-established' as const },
    tables: buildCSRTables(derive().studyData) }] };
  const pack = (sectionNumber: string) => buildCsrAuthoringEvidence(retained, { programId: PROGRAM, runId: RUN, studyId: STUDY_ID, sectionNumber });

  it('§12.5 is available from the vital-sign table, and its figures reconcile to their cells', () => {
    const evidence = pack('12.5');
    expect(evidence.status).toBe('available');
    expect(evidence.tables.map(t => t.key)).toEqual(['vitalSigns']);
    // "Mean change in systolic blood pressure was -1.0 mmHg (SD 0.9) with LMN-201 and 1.9 mmHg (SD 0.8) with placebo."
    const claims = [{ table: 'vitalSigns', row: 0, column: 5, value: '-1.0 (0.9)' }, { table: 'vitalSigns', row: 1, column: 5, value: '1.9 (0.8)' }];
    expect(reconcileCsrTableClaims(evidence, claims).status).toBe('matches');
    expect(reconcileCsrTableClaims(evidence, [{ ...claims[0], value: '-2.0 (0.9)' }]).status).toBe('needs_review');
  });

  it('§12.2 reconciles the TEAE, SAE and fatal-event figures', () => {
    const evidence = pack('12.2');
    const overall = evidence.tables.find(t => t.key === 'aeOverallSummary')!;
    const at = (label: string) => overall.rows.findIndex(r => r[0] === label);
    const claims = [
      { table: 'aeOverallSummary', row: at('Any AE, n (%)'), column: 1, value: '3 (25.0%)' },
      { table: 'aeOverallSummary', row: at('Serious AE, n (%)'), column: 2, value: '1 (9.1%)' },
      { table: 'aeOverallSummary', row: at('Fatal AE, n (%)'), column: 2, value: '1 (9.1%)' },
    ];
    expect(reconcileCsrTableClaims(evidence, claims)).toMatchObject({ status: 'matches', findings: claims.map(() => ({ status: 'matches' })) });
  });
});

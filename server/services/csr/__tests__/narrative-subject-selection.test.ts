/**
 * CSR slice 7: the E3 §12.3.2 rule selects every death, every other SAE (also
 * one that is not treatment-emergent), every withdrawal for an AE and every
 * protocol-defined AESI, from SYNTHETIC ADSL/ADAE (support/adam-narrative-synthetic.ts).
 * The expected set is computed from the fixture's planted residues, not from
 * the engine, so a subject the rule misses fails the test.
 */
import { describe, expect, it } from 'vitest';
import { selectNarrativeSubjects } from '../narrative-subject-selection';
import {
  adaeRows, isAesi, isDeath, isDiscontinuation, isPreTreatmentSae, isSae, narrativeBundle, narrativeDatasets, qualifies, subjectId,
} from './support/adam-narrative-synthetic';

const N = 200;
const refusal = (fn: () => unknown) => {
  try { fn(); } catch (error) { return error as { code: string; issues?: Array<{ path: string }> }; }
  throw new Error('expected a refusal');
};

describe('E3 §12.3.2 narrative selection (SYNTHETIC data)', () => {
  it('selects exactly the subjects who died, had an SAE, withdrew for an AE or had a declared AESI', () => {
    const selection = selectNarrativeSubjects(narrativeBundle(), narrativeDatasets(N));
    const expected = Array.from({ length: N }, (_, i) => i).filter(qualifies).map(subjectId);
    expect(selection.subjects.map(s => s.subjectId).sort()).toEqual(expected.sort());
    const ids = (pred: (i: number) => boolean) => Array.from({ length: N }, (_, i) => i).filter(pred).length;
    expect(selection.counts).toEqual({ death: ids(isDeath), serious: ids(i => isSae(i) || isDeath(i)), discontinuation: ids(i => isDiscontinuation(i) || isDeath(i)), aesi: ids(isAesi) });
  });

  it('never misses an SAE subject: every AESER = Y row’s subject is selected, pre-treatment ones included', () => {
    const datasets = narrativeDatasets(N);
    const selected = new Set(selectNarrativeSubjects(narrativeBundle(), datasets).subjects.map(s => s.subjectId));
    const saeSubjects = new Set(datasets.ADAE.rows.filter(r => r.AESER === 'Y').map(r => String(r.USUBJID)));
    const preTreatment = Array.from({ length: N }, (_, i) => i).filter(i => isSae(i) && isPreTreatmentSae(i)).map(subjectId);
    expect(preTreatment.length).toBeGreaterThan(0);
    for (const id of saeSubjects) expect(selected.has(id), `SAE subject ${id} was not selected`).toBe(true);
  });

  it('orders by treatment group (manifest order) then subject', () => {
    const subjects = selectNarrativeSubjects(narrativeBundle(), narrativeDatasets(N)).subjects;
    const arms = subjects.map(s => s.armName);
    expect(arms.indexOf('Placebo')).toBeGreaterThan(arms.lastIndexOf('LMN-201'));
    const lmn = subjects.filter(s => s.armName === 'LMN-201').map(s => s.subjectId);
    expect(lmn).toEqual([...lmn].sort());
  });

  it('selects no AESI subject when the protocol declares none, and refuses a declared flag that ADAE lacks', () => {
    const none = selectNarrativeSubjects(narrativeBundle(null), narrativeDatasets(N));
    expect(none.aesiDeclared).toBe(false);
    expect(none.counts.aesi).toBe(0);
    expect(refusal(() => selectNarrativeSubjects(narrativeBundle({ flagVariable: 'CQ01FL' }), narrativeDatasets(N))).code).toBe('CSR_ADAM_VARIABLE_MISSING');
    const byTerm = selectNarrativeSubjects(narrativeBundle({ preferredTerms: ['alanine aminotransferase increased'] }), narrativeDatasets(N));
    expect(byTerm.counts.aesi).toBe(Array.from({ length: N }, (_, i) => i).filter(isAesi).length);
  });

  it('refuses a blank AESER rather than reading it as not serious', () => {
    const rows = adaeRows(20, (row, i) => (i === 3 && row[3] === 'Pneumonia' ? row.map((v, c) => (c === 8 ? null : v)) : row));
    const error = refusal(() => selectNarrativeSubjects(narrativeBundle(), narrativeDatasets(20, { adae: rows })));
    expect(error.code).toBe('CSR_ADAM_VALUE_MISSING');
    expect(error.issues?.[0].path).toMatch(/^ADAE\[\d+\]\.AESER$/);
  });

  it('refuses an ADAE subject that ADSL does not list', () => {
    const rows = adaeRows(10);
    rows.push(['SYN-NARR', 'SYN-NARR-9999', 'Y', 'Nausea', 'GI', '2026-01-06', 2, 'MILD', 'Y', 'Y', 'N', 'NOT RELATED', 'RECOVERED/RESOLVED', 'DOSE NOT CHANGED', 'N']);
    expect(refusal(() => selectNarrativeSubjects(narrativeBundle(), narrativeDatasets(10, { adae: rows }))).code).toBe('CSR_ADAM_SUBJECT_NOT_IN_ADSL');
  });
});

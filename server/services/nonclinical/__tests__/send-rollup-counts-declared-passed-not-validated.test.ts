/**
 * The SEND rollup names the count it computes: studies whose readiness verdict
 * rests on a validation status the user DECLARED as passed.
 *
 * What it used to do (until 2026-10-15): the field was `validated`, and the
 * board printed "N/M package(s) validation-ready" and AnA "N of M in-scope
 * dataset(s) validated". No validator runs on the platform: the count is of
 * low-risk verdicts built on the status PUT to /studies/:id/send.
 */
import { describe, expect, it } from 'vitest';
import { assembleNonclinicalSummary, type GovernedStudyRow } from '../m26-m4-view';

const declaredPassed: GovernedStudyRow = {
  studyNumber: 'RD-1', studyType: 'repeat_dose_tox', species: 'Rat', glpCompliant: true, noael: null,
  durationLabel: '26-week', keyFinding: null, status: 'in_reporting',
  send: {
    domainsPresent: ['TS', 'DM', 'EX', 'BW', 'CL', 'LB', 'OM', 'MA', 'MI', 'FW'],
    defineXmlPresent: true, nsdrcPresent: true, validationStatus: 'passed', validatorErrorCount: 0,
  },
};

describe('assembleNonclinicalSummary — SEND rollup', () => {
  it('reports declaredPassed, and no field called validated', () => {
    const { send } = assembleNonclinicalSummary([declaredPassed]);
    expect(send).toMatchObject({ inScope: 1, declaredPassed: 1 });
    expect(send).not.toHaveProperty('validated');
  });
});

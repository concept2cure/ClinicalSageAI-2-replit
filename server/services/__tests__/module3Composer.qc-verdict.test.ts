/**
 * The batch-analyses verdict reads a flat criterion too (V-L1-04, 2026-11-12).
 *
 * `qcResultVerdict` now delegates to batch release's `recordedResultVerdict`
 * (GA-DEMO-02), passing the stored `specifications` object first and then the
 * flat `acceptanceCriteria` and `specificationLimit` keys a record may carry
 * instead. Nothing pinned the flat keys: dropping them made a contradicted
 * pass over a flat criterion read as an uncompared "pass" in §3.2.P.5.4.
 */
import { describe, expect, it } from 'vitest';

import { composeModule3FromCanonicalSources, type CanonicalSource } from '../module3Composer';

function batchAnalysesDisposition(payload: Record<string, unknown>): string {
  const sources: CanonicalSource[] = [{
    id: 'qc-flat',
    sourceType: 'qc_result',
    sourcePayload: {
      sampleId: 'FLAT-1', sampleType: 'finished-product', testMethod: 'HPLC-UV assay',
      testResults: { value: '97.4', unit: '%' }, passFailStatus: 'pass', reviewed: true,
      ...payload,
    },
  }];
  const p5 = composeModule3FromCanonicalSources(sources).find((s) => s.sectionKey === '3.2.P.5');
  const table = p5?.tables?.find((t) => /Batch Analyses/.test(t.title));
  if (!table) throw new Error('§3.2.P.5 composed no batch-analyses table');
  const row = table.rows.find((r) => r[0] === 'FLAT-1');
  if (!row) throw new Error('FLAT-1 is not in the batch-analyses table');
  return String(row[table.headers.indexOf('Disposition')]);
}

describe('§3.2.P.5.4 compares a recorded pass with a flat criterion', () => {
  it.each([
    ['acceptanceCriteria', { acceptanceCriteria: '98.0 - 102.0 %' }],
    ['specificationLimit', { specificationLimit: '98.0 - 102.0 %' }],
  ])('a pass outside its flat %s is stated as contradicted', (_key, flat) => {
    expect(batchAnalysesDisposition(flat)).toBe(
      'declared pass — the recorded result is OUTSIDE its recorded acceptance criterion',
    );
  });

  it('a pass within its flat criterion stays a pass', () => {
    expect(batchAnalysesDisposition({ acceptanceCriteria: '95.0 - 105.0 %' })).toBe('pass');
  });

  it('with no criterion at all the recorded word stands, uncompared', () => {
    expect(batchAnalysesDisposition({})).toBe('pass');
  });
});

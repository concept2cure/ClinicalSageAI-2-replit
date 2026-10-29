/**
 * ADaM rows from Dataset-JSON and SAS transport v5. The XPT files are built
 * byte for byte to the v5 layout with the Data Room reader's own fixture
 * (clinical-regulatory-evidence/__tests__/support/xpt-fixture.ts), and the IBM
 * floating-point decoder is checked against published constants, not itself.
 */
import { describe, expect, it } from 'vitest';
import { ibmFloatToNumber, readAdamDataset } from '../adam-dataset-reader';
import { REC, type Var } from '../../clinical-regulatory-evidence/__tests__/support/xpt-fixture';
import { adsl, datasetJson } from './support/adam-lmn201-synthetic';
import { toIbm, xptWithRows } from './support/adam-xpt';

const json = (doc: unknown) => Buffer.from(JSON.stringify(doc));

describe('IBM floating point', () => {
  it('decodes the published constants 1.0, 0.1 and -118.625, and SAS missing values', () => {
    expect(ibmFloatToNumber(Buffer.from('4110000000000000', 'hex'), 0, 8)).toBe(1);
    expect(ibmFloatToNumber(Buffer.from('401999999999999A', 'hex'), 0, 8)).toBeCloseTo(0.1, 15);
    expect(ibmFloatToNumber(Buffer.from('C276A00000000000', 'hex'), 0, 8)).toBe(-118.625);
    expect(ibmFloatToNumber(Buffer.from('0000000000000000', 'hex'), 0, 8)).toBe(0);
    expect(ibmFloatToNumber(Buffer.from('2E00000000000000', 'hex'), 0, 8)).toBeNull();
    expect(ibmFloatToNumber(Buffer.from('4100000000000000', 'hex'), 0, 8)).toBeNull(); // .A
    expect(toIbm(1).toString('hex')).toBe('4110000000000000');
    expect(toIbm(-118.625).toString('hex')).toBe('c276a00000000000');
  });
});

describe('readAdamDataset', () => {
  it('reads Dataset-JSON v1.1 rows by column name, numeric strings left for the derivation', () => {
    const out = readAdamDataset(json(adsl()), 'adsl.json');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.dataset).toMatchObject({ name: 'ADSL', format: 'dataset-json' });
    expect(out.dataset.rows).toHaveLength(23);
    expect(out.dataset.rows[19]).toMatchObject({ USUBJID: 'SYN-LMN201-B-S20', EOSSTT: 'DISCONTINUED', DCSREAS: 'DEATH', AGE: 68, WEIGHTBL: '87.5' });
  });

  it('reads NDJSON and v1.0 item-group files', () => {
    const doc = datasetJson('ADAE', [['USUBJID', 'string'], ['AESEQ', 'integer']], [['a', 1], ['b', 2]]);
    const { rows, ...meta } = doc;
    const nd = Buffer.from([JSON.stringify(meta), ...rows.map(r => JSON.stringify(r))].join('\n'));
    const v10 = { clinicalData: { itemGroupData: { 'IG.ADAE': { name: 'ADAE', records: 2,
      items: [{ name: 'USUBJID', dataType: 'string' }, { name: 'AESEQ', dataType: 'integer' }], itemData: rows } } } };
    for (const [bytes, file] of [[nd, 'adae.ndjson'], [json(v10), 'adae.json']] as const) {
      const out = readAdamDataset(bytes, file);
      expect(out.ok && out.dataset.rows).toEqual([{ USUBJID: 'a', AESEQ: 1 }, { USUBJID: 'b', AESEQ: 2 }]);
    }
  });

  it('refuses a row whose length differs from the columns, a non-dataset JSON, and a two-dataset file', () => {
    const doc = datasetJson('ADAE', [['USUBJID', 'string'], ['AESEQ', 'integer']], [['a']]);
    expect(readAdamDataset(json(doc), 'x.json')).toEqual({ ok: false, reason: 'ROW_SHAPE_INVALID' });
    expect(readAdamDataset(json({ format: 'concept2cure.csr-source.v1' }), 'x.json')).toEqual({ ok: false, reason: 'NOT_A_DATASET' });
    const group = { name: 'A', items: [{ name: 'X' }], itemData: [] };
    expect(readAdamDataset(json({ clinicalData: { itemGroupData: { A: group, B: { ...group, name: 'B' } } } }), 'x.json'))
      .toEqual({ ok: false, reason: 'ONE_DATASET_PER_FILE' });
    expect(readAdamDataset(Buffer.from('not a dataset'), 'x.csv')).toEqual({ ok: false, reason: 'NOT_A_DATASET' });
  });

  it('decodes SAS transport v5 observations: text, IBM numerics and missing values', () => {
    const vars: Var[] = [{ name: 'USUBJID', label: 'Subject', type: 'char', length: 16 },
      { name: 'AGE', label: 'Age', type: 'num', length: 8 }, { name: 'WEIGHTBL', label: 'Weight', type: 'num', length: 8 }];
    const out = readAdamDataset(xptWithRows('ADSL', vars, [['SYN-S01', 41, 72.5], ['SYN-S02', 63, null]]), 'adsl.xpt');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.dataset).toMatchObject({ name: 'ADSL', format: 'xpt', columns: ['USUBJID', 'AGE', 'WEIGHTBL'] });
    expect(out.dataset.rows).toEqual([{ USUBJID: 'SYN-S01', AGE: 41, WEIGHTBL: 72.5 }, { USUBJID: 'SYN-S02', AGE: 63, WEIGHTBL: null }]);
  });

  it('refuses a malformed transport file instead of reading past it', () => {
    const vars: Var[] = [{ name: 'USUBJID', label: 'Subject', type: 'char', length: 16 }];
    const whole = xptWithRows('ADSL', vars, [['SYN-S01']]);
    expect(readAdamDataset(whole.subarray(0, REC * 2), 'adsl.xpt').ok).toBe(false);
  });
});

/**
 * CDISC Dataset-JSON structure (v1.1 JSON and NDJSON, v1.0): columns and
 * record counts, never a row's values; a JSON that is not a dataset is
 * declined.
 */
import { describe, expect, it } from 'vitest';
import { readDatasetJsonStructure } from '../dataset-json-structure';

const COLUMNS = [
  { itemOID: 'IT.AE.STUDYID', name: 'STUDYID', label: 'Study Identifier', dataType: 'string', length: 12 },
  { itemOID: 'IT.AE.USUBJID', name: 'USUBJID', label: 'Unique Subject Identifier', dataType: 'string', length: 20 },
  { itemOID: 'IT.AE.AESEQ', name: 'AESEQ', label: 'Sequence Number', dataType: 'integer' },
  { itemOID: 'IT.AE.AESTDTC', name: 'AESTDTC', label: 'Start Date/Time', dataType: 'datetime' },
];
const V11 = {
  datasetJSONCreationDateTime: '2025-01-01T00:00:00', datasetJSONVersion: '1.1.0', itemGroupOID: 'IG.AE',
  records: 2, name: 'AE', label: 'Adverse Events', columns: COLUMNS,
  rows: [['X', 'X-0012', 1, '2024-05-02'], ['X', 'X-0031', 1, '2024-05-09']],
};
const buf = (v: unknown) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v));

describe('readDatasetJsonStructure', () => {
  it('reads a v1.1 dataset: name, label, columns with their types, records', () => {
    const out = readDatasetJsonStructure(buf(V11), 'ae.json');
    expect(out).toMatchObject({ ok: true, version: '1.1.0', tables: [{ name: 'AE', label: 'Adverse Events', rowCount: 2 }] });
    if (out.ok) expect(out.tables[0].columns.map((c) => [c.name, c.dataType])).toEqual([['STUDYID', 'string'], ['USUBJID', 'string'], ['AESEQ', 'integer'], ['AESTDTC', 'datetime']]);
    expect(JSON.stringify(out)).not.toContain('X-0031');
  });

  it('reads the NDJSON form: metadata first, one row per line', () => {
    const { rows, records, ...meta } = V11;
    void records;
    const nd = [JSON.stringify(meta), ...rows.map((r) => JSON.stringify(r))].join('\n');
    expect(readDatasetJsonStructure(buf(nd), 'ae.ndjson')).toMatchObject({ ok: true, tables: [{ name: 'AE', rowCount: 2 }] });
  });

  it('reads every item group of a v1.0 file', () => {
    const v10 = { clinicalData: { itemGroupData: {
      'IG.AE': { records: 3, name: 'AE', label: 'Adverse Events', items: [{ OID: 'ITEMGROUPDATASEQ', name: 'ITEMGROUPDATASEQ', label: 'Record', type: 'integer' }], itemData: [] },
      'IG.DM': { name: 'DM', label: 'Demographics', items: [{ OID: 'IT.DM.USUBJID', name: 'USUBJID', label: 'Subject', type: 'string' }], itemData: [[1, 'A'], [2, 'B']] },
    } } };
    const out = readDatasetJsonStructure(buf(v10), 'datasets.json');
    expect(out.ok && out.tables.map((t) => [t.name, t.rowCount])).toEqual([['AE', 3], ['DM', 2]]);
  });

  it('declines a JSON that is not a dataset, and a malformed one, by name', () => {
    expect(readDatasetJsonStructure(buf({ hello: 'world' }), 'notes.json')).toEqual({ ok: false, reason: 'NOT_DATASET_JSON' });
    expect(readDatasetJsonStructure(buf('{not json'), 'x.json')).toEqual({ ok: false, reason: 'NOT_DATASET_JSON' });
    expect(readDatasetJsonStructure(buf({ ...V11, columns: [{ label: 'no name' }] }), 'x.json')).toEqual({ ok: false, reason: 'MALFORMED' });
  });
});

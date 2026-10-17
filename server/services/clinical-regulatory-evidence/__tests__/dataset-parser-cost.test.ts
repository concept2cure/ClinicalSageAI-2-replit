/**
 * The dataset readers run on the request thread, so a crafted file within the
 * 50 MB upload cap must not hold the event loop (security review 2026-10-15,
 * F1). Each input is one the review measured: 6.6 s for the .xpt, 16 s and
 * 2 GB for the NDJSON, 15 s for the .json, at 50 MB. Here at 20 MB, each is
 * bounded at one second, far above what a linear read costs and far below
 * what the quadratic-in-practice reads cost.
 */
import { describe, expect, it } from 'vitest';
import { readXptStructure } from '../xpt-structure';
import { readDatasetJsonStructure } from '../dataset-json-structure';
import { library, member } from './support/xpt-fixture';

const MB = 1024 * 1024;
function timed<T>(f: () => T): { out: T; ms: number } {
  const t = performance.now();
  const out = f();
  return { out, ms: performance.now() - t };
}

describe('the dataset readers stay linear on crafted input', () => {
  it('an .xpt of one-byte blank observations', () => {
    const head = library(member('AE', 'Adverse Events', [{ name: 'X', label: 'x', type: 'num', length: 1 }], 0));
    const file = Buffer.concat([head, Buffer.alloc(20 * MB, 0x20)]);
    const { out, ms } = timed(() => readXptStructure(file));
    // Only the last record's padding (80 one-byte observations here) is not counted; blanks before it are data.
    expect(out.ok && out.members[0].rowCount).toBe(20 * MB - 80);
    expect(ms).toBeLessThan(1000);
  });

  it('an NDJSON of blank lines after its metadata', () => {
    const meta = JSON.stringify({ datasetJSONVersion: '1.1.0', name: 'AE', columns: [{ name: 'AETERM', dataType: 'string' }] });
    const file = Buffer.concat([Buffer.from(`${meta}\n`), Buffer.alloc(20 * MB, 0x0a)]);
    const { out, ms } = timed(() => readDatasetJsonStructure(file, 'ae.ndjson'));
    expect(out).toMatchObject({ ok: true, tables: [{ name: 'AE', rowCount: 0 }] });
    expect(ms).toBeLessThan(1000);
  });

  it('counts NDJSON rows without building them', () => {
    const meta = JSON.stringify({ datasetJSONVersion: '1.1.0', name: 'AE', columns: [{ name: 'AETERM', dataType: 'string' }] });
    const out = readDatasetJsonStructure(Buffer.from(`\n${meta}\n["a"]\r\n\n  \n["b"]`), 'ae.ndjson');
    expect(out).toMatchObject({ ok: true, tables: [{ rowCount: 2 }] });
  });

  it('a .json that is not a dataset is declined without being parsed', () => {
    const file = Buffer.alloc(20 * MB, 0x5b); // '['
    const { out, ms } = timed(() => readDatasetJsonStructure(file, 'x.json'));
    expect(out).toEqual({ ok: false, reason: 'NOT_DATASET_JSON' });
    expect(ms).toBeLessThan(1000);
  });
});

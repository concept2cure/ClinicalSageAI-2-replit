/**
 * The FDA recognized-consensus-standards path, pinned at the point it would be
 * tempting to fabricate.
 *
 * The dataset is a vendored FDA export that is NOT in this repository, so every
 * test below runs against either a temp-dir fixture the test wrote itself or an
 * empty directory. What is being asserted is not "the lookup finds ISO 14971" —
 * it is that the lookup finds NOTHING, loudly and in a way a surface can
 * distinguish, whenever FDA's list is absent or unusable.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  RECOGNIZED_STANDARDS_DATASET_FILE,
  loadRecognizedStandardsDataset,
  parseRecognizedStandardsDataset,
  resetRecognizedStandardsCache,
  resolveRecognizedStandardsDir,
  resolveRecognizedStandardsPath,
} from '../recognized-standards-dataset';
import { lookupRecognizedStandards } from '../recognized-standards.service';

const PROVENANCE = {
  source: 'FDA CDRH Recognized Consensus Standards Database',
  sourceUrl: 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfStandards/search.cfm',
  recognitionListNumber: 'TEST-FIXTURE-000',
  publishedOn: '2026-01-15',
  retrievedOn: '2026-01-20',
  retrievedBy: 'fixture',
};

/* Deliberately invented designations. These are fixture rows, not a claim
   about anything FDA has recognized — which is exactly why they are shaped
   like nonsense rather than like real standards. */
const STANDARD_A = {
  recognitionNumber: '99-001',
  sdo: 'FIXTURE-SDO',
  designationNumber: 'FIXTURE B-2',
  title: 'Second fixture standard',
  extentOfRecognition: 'The entire fixture is recognized.',
  productCodes: ['abc', 'ABC', 'DEF'],
};

const STANDARD_B = {
  recognitionNumber: '99-002',
  sdo: 'FIXTURE-SDO',
  designationNumber: 'FIXTURE A-1',
  title: 'First fixture standard',
  extentOfRecognition: 'Clauses 1 to 4 only.',
  recognitionStatus: 'transition',
  transitionEndDate: '2027-01-01',
  productCodes: ['ABC'],
};

/** A standard FDA publishes with no product-code association. */
const STANDARD_UNMAPPED = {
  recognitionNumber: '99-003',
  sdo: 'FIXTURE-SDO',
  designationNumber: 'FIXTURE C-3',
  title: 'Unmapped fixture standard',
  extentOfRecognition: 'The entire fixture is recognized.',
  productCodes: [],
};

const dataset = (standards: unknown[]) => ({ datasetVersion: 1, provenance: PROVENANCE, standards });

const tmpDirs: string[] = [];

async function withDataset(body: unknown | null): Promise<NodeJS.ProcessEnv> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fda-standards-'));
  tmpDirs.push(dir);
  if (body !== null) {
    await fs.writeFile(
      path.join(dir, RECOGNIZED_STANDARDS_DATASET_FILE),
      typeof body === 'string' ? body : JSON.stringify(body),
      'utf8',
    );
  }
  return { FDA_RECOGNIZED_STANDARDS_DIR: dir } as NodeJS.ProcessEnv;
}

beforeEach(() => resetRecognizedStandardsCache());

afterAll(async () => {
  for (const dir of tmpDirs) await fs.rm(dir, { recursive: true, force: true });
});

describe('recognized-standards dataset — drop-point resolution', () => {
  it('defaults to the assets drop-point and honours the env override', () => {
    expect(resolveRecognizedStandardsDir({} as NodeJS.ProcessEnv)).toContain(
      path.join('assets', 'fda-recognized-standards'),
    );
    expect(
      resolveRecognizedStandardsPath({ FDA_RECOGNIZED_STANDARDS_DIR: '/vendored' } as NodeJS.ProcessEnv),
    ).toBe(path.join('/vendored', RECOGNIZED_STANDARDS_DATASET_FILE));
  });
});

describe('recognized-standards dataset — validation is whole-file', () => {
  it('indexes by normalized product code and de-duplicates the codes', () => {
    const outcome = parseRecognizedStandardsDataset(dataset([STANDARD_A, STANDARD_B]));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.dataset.productCodeCount).toBe(2);
    expect(outcome.dataset.byProductCode.get('ABC')).toHaveLength(2);
    expect(outcome.dataset.byProductCode.get('DEF')).toHaveLength(1);
    // 'abc' and 'ABC' on the same record are one code, not two.
    expect(outcome.dataset.standards[0].productCodes).toEqual(['ABC', 'DEF']);
  });

  it('orders each product code deterministically by designation', () => {
    const outcome = parseRecognizedStandardsDataset(dataset([STANDARD_A, STANDARD_B]));
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(outcome.dataset.byProductCode.get('ABC')!.map((s) => s.designationNumber)).toEqual([
      'FIXTURE A-1',
      'FIXTURE B-2',
    ]);
  });

  it('keeps a standard FDA maps to no product code, unmatched rather than guessed at', () => {
    const outcome = parseRecognizedStandardsDataset(dataset([STANDARD_A, STANDARD_UNMAPPED]));
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(outcome.dataset.standards).toHaveLength(2);
    // It is in the dataset and reachable by nothing. That is the honest state.
    for (const bucket of outcome.dataset.byProductCode.values()) {
      expect(bucket.map((s) => s.recognitionNumber)).not.toContain('99-003');
    }
  });

  it('rejects an unprovenanced list — a recognition list with no source is notes', () => {
    const outcome = parseRecognizedStandardsDataset({ standards: [STANDARD_A] });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toMatch(/provenance/);
  });

  it('rejects a partial provenance block rather than accept the rest', () => {
    const { recognitionListNumber, ...rest } = PROVENANCE;
    expect(recognitionListNumber).toBeTruthy();
    const outcome = parseRecognizedStandardsDataset({ provenance: rest, standards: [STANDARD_A] });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain('provenance.recognitionListNumber');
  });

  it.each([
    ['recognitionNumber', 'standards[1].recognitionNumber'],
    ['title', 'standards[1].title'],
    ['extentOfRecognition', 'standards[1].extentOfRecognition'],
  ])('rejects the WHOLE file when a record is missing %s', (field, expected) => {
    const broken: Record<string, unknown> = { ...STANDARD_B };
    delete broken[field];
    const outcome = parseRecognizedStandardsDataset(dataset([STANDARD_A, broken]));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain(expected);
  });

  it('rejects a record with no productCodes key — [] must be written explicitly', () => {
    const { productCodes, ...noCodes } = STANDARD_A;
    expect(productCodes).toBeTruthy();
    const outcome = parseRecognizedStandardsDataset(dataset([noCodes]));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toMatch(/never infer one/);
  });

  it('rejects an empty standards array and a non-object root', () => {
    expect(parseRecognizedStandardsDataset(dataset([])).ok).toBe(false);
    expect(parseRecognizedStandardsDataset([STANDARD_A]).ok).toBe(false);
    expect(parseRecognizedStandardsDataset(null).ok).toBe(false);
  });
});

describe('recognized-standards dataset — loading never throws', () => {
  it('reports an absent dataset with the path it looked at, and names the runbook item', async () => {
    const env = await withDataset(null);
    const result = await loadRecognizedStandardsDataset({ env });
    expect(result.available).toBe(false);
    expect(result.dataset).toBeUndefined();
    expect(result.unavailableReason).toContain(RECOGNIZED_STANDARDS_DATASET_FILE);
    expect(result.unavailableReason).toContain('B21');
  });

  it('reports invalid JSON as absent rather than throwing', async () => {
    const env = await withDataset('{ not json');
    const result = await loadRecognizedStandardsDataset({ env });
    expect(result.available).toBe(false);
    expect(result.unavailableReason).toContain('not valid JSON');
  });

  it('treats a schema-invalid dataset as ABSENT, never partially loaded', async () => {
    const env = await withDataset(dataset([STANDARD_A, { ...STANDARD_B, title: '   ' }]));
    const result = await loadRecognizedStandardsDataset({ env });
    expect(result.available).toBe(false);
    expect(result.dataset).toBeUndefined();
    expect(result.unavailableReason).toContain('standards[1].title');
  });

  it('loads a well-formed dataset', async () => {
    const env = await withDataset(dataset([STANDARD_A, STANDARD_B]));
    const result = await loadRecognizedStandardsDataset({ env });
    expect(result.available).toBe(true);
    expect(result.dataset?.provenance.recognitionListNumber).toBe('TEST-FIXTURE-000');
    expect(result.dataset?.standards).toHaveLength(2);
  });
});

describe('lookupRecognizedStandards — three distinguishable outcomes', () => {
  it('1. dataset not vendored: available:false, datasetLoaded:false, nothing invented', async () => {
    const env = await withDataset(null);
    const result = await lookupRecognizedStandards('ABC', { env });
    expect(result.available).toBe(false);
    expect(result.datasetLoaded).toBe(false);
    expect(result.standards).toEqual([]);
    expect(result.matched).toBe(0);
    expect(result.provenance).toBeUndefined();
    expect(result.unavailableReason).toContain('has not been vendored');
    expect(result.source).toBe('fda-recognized-consensus-standards');
  });

  it('2. dataset loaded, code has no listed standards: available:true with an empty list', async () => {
    const env = await withDataset(dataset([STANDARD_A]));
    const result = await lookupRecognizedStandards('ZZZ', { env });
    // The distinguishing pair: this IS an answer, and it is empty.
    expect(result.available).toBe(true);
    expect(result.datasetLoaded).toBe(true);
    expect(result.matched).toBe(0);
    expect(result.unavailableReason).toBeUndefined();
    expect(result.provenance?.recognitionListNumber).toBe('TEST-FIXTURE-000');
  });

  it('3. dataset loaded with hits: FDA fields verbatim, in dataset order', async () => {
    const env = await withDataset(dataset([STANDARD_A, STANDARD_B, STANDARD_UNMAPPED]));
    const result = await lookupRecognizedStandards('abc', { env });
    expect(result.available).toBe(true);
    expect(result.productCode).toBe('ABC');
    expect(result.matched).toBe(2);
    expect(result.standards.map((s) => s.recognitionNumber)).toEqual(['99-002', '99-001']);
    expect(result.standards[0]).toMatchObject({
      designationNumber: 'FIXTURE A-1',
      title: 'First fixture standard',
      extentOfRecognition: 'Clauses 1 to 4 only.',
      recognitionStatus: 'transition',
      transitionEndDate: '2027-01-01',
    });
    // The unmapped record is never swept in as a "probably also applies".
    expect(result.standards.map((s) => s.recognitionNumber)).not.toContain('99-003');
  });

  it('says which is missing when no product code was resolvable', async () => {
    const env = await withDataset(dataset([STANDARD_A]));
    for (const code of [null, undefined, '   ']) {
      const result = await lookupRecognizedStandards(code, { env });
      expect(result.available).toBe(false);
      expect(result.datasetLoaded).toBe(false);
      expect(result.productCode).toBeNull();
      expect(result.unavailableReason).toContain('No FDA product code');
    }
  });

  it('picks up a dataset dropped in after a failed lookup, without a restart', async () => {
    const env = await withDataset(null);
    expect((await lookupRecognizedStandards('ABC', { env })).available).toBe(false);

    await fs.writeFile(
      path.join(env.FDA_RECOGNIZED_STANDARDS_DIR!, RECOGNIZED_STANDARDS_DATASET_FILE),
      JSON.stringify(dataset([STANDARD_A])),
      'utf8',
    );

    const after = await lookupRecognizedStandards('ABC', { env });
    expect(after.available).toBe(true);
    expect(after.matched).toBe(1);
  });
});

/**
 * The assumption registry records what its caller stated, and refuses what
 * nobody stated.
 *
 * createAssumption / create filled a missing category with 'regulatory_pathway',
 * a missing source with 'expert_opinion', a missing confidence with 'moderate',
 * a missing rationale with 'No rationale provided', a missing actor with
 * 'system' and a missing code with `ASM-${Date.now()}`; a stated value of 0 was
 * recorded as '' (`0 || ''`); supersedeAssumption performed as 'system'. A value
 * outside the column's CHECK reached the INSERT and failed there, inside
 * whatever catch block the caller had. The refusals are LedgerInputRefusal,
 * which the routes answer with 400.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query: H.query } }));
vi.mock('../../db', () => ({ pool: { query: H.query } }));
vi.mock('../contradiction-engine-service', () => ({
  contradictionEngineService: { detectAssumptionDrift: async () => [] },
}));
vi.mock('../reactive-dependency-service', () => ({
  reactiveDependencyService: { propagateChange: async () => undefined },
}));

import fs from 'node:fs';
import path from 'node:path';
import {
  assumptionRegistryService,
  ASSUMPTION_CATEGORIES,
  ASSUMPTION_SOURCE_TYPES,
  LedgerInputRefusal,
} from '../assumption-registry-service';
import { DEPLOYED_CONFIDENCE_LEVELS } from '../../../shared/constants/operating-system-vocab';

/** The value list of `column`'s CHECK inside assumption_records' CREATE TABLE. */
function checkList(column: string): string[] {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'db/migrations/20260323_assumption_decision_contradiction.sql'),
    'utf8',
  );
  const table = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS assumption_records'));
  const m = [...table.matchAll(/^\s*(\w+) TEXT(?: NOT NULL)? CHECK \((\w+) IN \(([^)]*)\)/gm)]
    .find(check => check[1] === column && check[2] === column);
  expect(m, `assumption_records.${column} CHECK not found`).toBeDefined();
  return m![3].split(',').map((v) => v.trim().replace(/^'|'$/g, ''));
}

describe('the registry vocabulary is the CHECK that enforces it', () => {
  it('category, source type and confidence match the DDL exactly', () => {
    expect([...ASSUMPTION_CATEGORIES]).toEqual(checkList('category'));
    expect([...ASSUMPTION_SOURCE_TYPES]).toEqual(checkList('source_type'));
    expect([...DEPLOYED_CONFIDENCE_LEVELS]).toEqual(checkList('confidence_level'));
  });

  it('a refusal is a 400 naming its field', async () => {
    const err = await assumptionRegistryService.createAssumption({ category: 'x' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LedgerInputRefusal);
    expect((err as LedgerInputRefusal).status).toBe(400);
  });
});

/** The bound parameters of each assumption_records INSERT, by column. */
const inserted = () =>
  H.query.mock.calls
    .filter(([sql]) => /INSERT INTO assumption_records/.test(String(sql)))
    .map(([, p]) => {
      const v = p as unknown[];
      return {
        assumptionCode: v[2],
        title: v[3],
        category: v[5],
        assumedValue: v[6],
        rationale: v[8],
        sourceType: v[9],
        confidence: v[11],
        createdBy: v[16],
      };
    });
const updates = () => H.query.mock.calls.filter(([sql]) => /UPDATE assumption_records/.test(String(sql)));

beforeEach(() => {
  H.query.mockReset();
  H.query.mockImplementation(async (sql: string) =>
    /INSERT INTO assumption_records|UPDATE assumption_records/.test(sql)
      ? { rows: [{ id: '00000000-0000-0000-0000-0000000000a1', status: 'active' }], rowCount: 1 }
      : { rows: [], rowCount: 0 },
  );
});

/** Everything a caller has to state, through the legacy createAssumption shape. */
const STATED = {
  organizationId: 3,
  projectId: 12,
  name: 'ASM-ENR-001',
  description: 'Planned enrollment',
  category: 'enrollment',
  value: '450',
  rationale: 'Protocol v2, section 9.2',
  sourceType: 'protocol',
  createdById: 41,
  domainTrack: 'biostatistics',
};

/** The same, through create(). */
const CREATE = {
  organizationId: 3,
  projectId: 12,
  assumptionCode: 'ASM-ENR-001',
  title: 'Planned enrollment',
  domainTrack: 'biostatistics' as const,
  category: 'enrollment' as const,
  assumedValue: '450',
  rationale: 'Protocol v2, section 9.2',
  sourceType: 'protocol' as const,
  createdBy: '41',
};

describe('createAssumption', () => {
  it.each([
    ['category', { category: undefined }],
    ['sourceType', { sourceType: undefined }],
    ['rationale', { rationale: undefined }],
    ['rationale', { rationale: '   ' }],
    ['createdBy', { createdById: undefined }],
    ['assumedValue', { value: undefined }],
    ['assumptionCode', { name: undefined }],
  ])('refuses a missing %s rather than inventing one', async (field, missing) => {
    const err = await assumptionRegistryService.createAssumption({ ...STATED, ...missing }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err, 'createAssumption resolved, so something was written in place of the missing input').not.toBeNull();
    expect((err as { field?: string }).field).toBe(field);
    expect(inserted()).toEqual([]);
  });

  it.each([
    ['category', { category: 'analysis_population' }],
    ['sourceType', { sourceType: 'ana_generated' }],
    ['confidence', { confidence: 'provisional' }],
  ])('refuses an out-of-vocabulary %s at the boundary, naming the allowed values', async (field, bad) => {
    const err = await assumptionRegistryService.createAssumption({ ...STATED, ...bad }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err, 'the value reached the INSERT').not.toBeNull();
    expect((err as { field?: string }).field).toBe(field);
    expect(String((err as Error).message)).toMatch(/Allowed: /);
    expect(inserted()).toEqual([]);
  });

  it('records no confidence when none was stated', async () => {
    await assumptionRegistryService.createAssumption(STATED);
    expect(inserted()).toEqual([
      {
        assumptionCode: 'ASM-ENR-001',
        title: 'Planned enrollment',
        category: 'enrollment',
        assumedValue: '450',
        rationale: 'Protocol v2, section 9.2',
        sourceType: 'protocol',
        confidence: null,
        createdBy: '41',
      },
    ]);
  });

  it('records the confidence that was stated', async () => {
    await assumptionRegistryService.createAssumption({ ...STATED, confidence: 'low' });
    expect(inserted()[0].confidence).toBe('low');
  });

  it('records a stated zero as zero, not as an empty value', async () => {
    await assumptionRegistryService.createAssumption({ ...STATED, category: 'dropout', value: undefined, numericValue: 0 });
    expect(inserted()[0].assumedValue).toBe('0');
  });
});

describe('create', () => {
  it('records no confidence nobody stated', async () => {
    await assumptionRegistryService.create(CREATE);
    expect(inserted()[0].confidence).toBeNull();
  });

  it.each([
    ['category', { category: 'attrition' }],
    ['sourceType', { sourceType: 'manual' }],
    ['confidenceLevel', { confidenceLevel: 'uncertain' }],
    ['rationale', { rationale: '' }],
    ['createdBy', { createdBy: '' }],
  ])('refuses %s it cannot record', async (field, bad) => {
    const err = await assumptionRegistryService.create({ ...CREATE, ...(bad as object) } as typeof CREATE).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err, 'create() resolved').not.toBeNull();
    expect((err as { field?: string }).field).toBe(field);
    expect(inserted()).toEqual([]);
  });
});

describe('updateAssumption', () => {
  it('refuses an out-of-vocabulary confidence rather than handing it to the CHECK', async () => {
    const err = await assumptionRegistryService
      .updateAssumption('00000000-0000-0000-0000-0000000000a1', 3, { confidenceLevel: 'strong' })
      .then(() => null, (e: unknown) => e);
    expect(err, 'the value reached the UPDATE').not.toBeNull();
    expect((err as { field?: string }).field).toBe('confidenceLevel');
    expect(updates()).toEqual([]);
  });
});

describe('supersedeAssumption', () => {
  it('refuses to supersede without an actor rather than performing as "system"', async () => {
    const err = await assumptionRegistryService
      .supersedeAssumption('00000000-0000-0000-0000-0000000000a0', 3, { ...STATED, createdById: undefined }, 'Revised enrollment')
      .then(() => null, (e: unknown) => e);
    expect(err, 'supersedeAssumption resolved').not.toBeNull();
    expect((err as { field?: string }).field).toBe('createdBy');
    expect(inserted()).toEqual([]);
    expect(updates()).toEqual([]);
  });
});

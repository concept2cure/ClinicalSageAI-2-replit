import { describe, expect, it } from 'vitest';

import {
  assessRecordedPoolability,
  assessRecordedTrending,
  estimateRecordedShelfLife,
  type PoolabilityOutcome,
  type RecordedStabilityStudy,
  type StabilityPointRecord,
} from '../recorded-stability';
import { composeModule3FromCanonicalSources, type CanonicalSource } from '../../module3Composer';

const CONDITION = '25°C/60%RH';
const OTHER_CONDITION = '40°C/75%RH';
const points = (parameter = 'Assay'): StabilityPointRecord[] =>
  [0, 3, 6, 9, 12, 18, 24].map((timePoint, index) => ({
    timePoint,
    parameter,
    result: 100 - timePoint * 0.1 + [0.03, -0.02, 0.01, -0.03, 0.02, -0.01, 0.02][index],
    specification: '>= 95%',
  }));
const study = (id: number, stabilityData: unknown = points()): RecordedStabilityStudy => ({
  id,
  studyTitle: `Study ${id}`,
  productName: 'Recorded Product',
  batchNumber: `B${id}`,
  storageConditions: [CONDITION],
  duration: 24,
  stabilityData,
});
const assessments = (outcome: PoolabilityOutcome) =>
  outcome.data.assessments as Array<Record<string, unknown>>;
const pooled = async (studies: RecordedStabilityStudy[]) => {
  const outcome = await assessRecordedPoolability(studies);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome;
};

describe('recorded poolability preserves the selected evidence scope', () => {
  it('names unreadable selected evidence even when no labelled series can be fitted', async () => {
    const outcome = await assessRecordedPoolability([study(1, []), study(2, '{unreadable')]);
    expect(outcome).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(/could not be read/i) });
  });

  it('names an unreadable selected payload while retaining the valid contributor assessment', async () => {
    const data = [study(1), study(2), study(3, '{unreadable')];
    const before = globalThis.structuredClone(data);
    const outcome = await pooled(data);
    expect.soft(assessments(outcome)[0]).toMatchObject({
      assessable: true,
      contributingBatches: ['B1', 'B2'],
      excludedBatches: [{ batchId: 'B3', reason: expect.stringMatching(/could not be read/i) }],
    });
    expect.soft(outcome.data.supportedShelfLife).toBeNull();
    expect.soft(outcome.data.limitingParameter).toBeNull();
    expect.soft(outcome.data.claimWithheldReasons).toEqual(expect.arrayContaining([expect.stringMatching(/B3.*could not be read/i)]));
    expect.soft(data).toEqual(before);
  });

  it.each([
    { title: 'no results', data: [] },
    { title: 'two numeric results', data: points().slice(0, 2) },
    { title: 'no usable criterion', data: points().map(point => ({ ...point, specification: undefined })) },
  ])('withholds the full selection claim for a selected batch with $title', async ({ data }) => {
    const outcome = await pooled([study(1), study(2), study(3, data)]);
    expect.soft(assessments(outcome)[0]).toMatchObject({
      assessable: true,
      contributingBatches: ['B1', 'B2'],
      excludedBatches: [expect.objectContaining({ batchId: 'B3' })],
    });
    expect.soft(outcome.data.supportedShelfLife).toBeNull();
    expect.soft(outcome.data.claimWithheldReasons).toEqual(expect.arrayContaining([expect.stringMatching(/Assay.*B3/i)]));
  });

  it('withholds the programme claim if one independent attribute lacks full selected-batch coverage', async () => {
    const complete = [...points(), ...points('Water').map(point => ({ ...point, result: 0.3, specification: '<= 2%' }))];
    const outcome = await pooled([study(1, complete), study(2, complete), study(3)]);
    expect.soft(assessments(outcome)).toEqual([
      expect.objectContaining({ parameter: 'Assay', assessable: true, contributingBatches: ['B1', 'B2', 'B3'] }),
      expect.objectContaining({ parameter: 'Water', assessable: true, contributingBatches: ['B1', 'B2'], excludedBatches: [{ batchId: 'B3', reason: 'Did not record Water.' }] }),
    ]);
    expect.soft(outcome.data.supportedShelfLife).toBeNull();
    expect.soft(outcome.data.claimWithheldReasons).toEqual(expect.arrayContaining([expect.stringMatching(/Water.*B3/)]));
  });

  it('retains a fully covered valid attribute if another recorded attribute cannot be assessed', async () => {
    const withWater = [...points(), ...points('Water')];
    const outcome = await pooled([study(1, withWater), study(2), study(3)]);
    expect.soft(assessments(outcome)).toEqual([
      expect.objectContaining({ parameter: 'Assay', assessable: true }),
      expect.objectContaining({ parameter: 'Water', assessable: false }),
    ]);
    expect.soft(outcome.data.supportedShelfLife).toBeNull();
    expect.soft(outcome.data.claimWithheldReasons).toEqual(expect.arrayContaining([expect.stringMatching(/Water/)]));
  });

  it('preserves a complete valid three-batch claim and its actual contributor IDs', async () => {
    const outcome = await pooled([study(1), study(2), study(3)]);
    expect(assessments(outcome)[0]).toMatchObject({ assessable: true, contributingBatches: ['B1', 'B2', 'B3'], excludedBatches: [] });
    expect(outcome.data.supportedShelfLife).toBe(assessments(outcome)[0].shelfLife);
    expect(outcome.data.supportedShelfLife).toBeGreaterThan(0);
  });
});

describe('recorded poolability respects explicit pull-point conditions', () => {
  it.each([
    { title: 'mixed conditions', data: points().map((point, index) => ({ ...point, condition: index < 3 ? CONDITION : OTHER_CONDITION })) },
    { title: 'a different explicit condition', data: points().map(point => ({ ...point, condition: OTHER_CONDITION })) },
    { title: 'conflicting condition aliases', data: points().map(point => ({ ...point, condition: CONDITION, storageCondition: OTHER_CONDITION })) },
  ])('refuses an affected parameter with $title instead of pooling it', async ({ data }) => {
    const selected = [study(1, data), study(2), study(3)];
    const before = globalThis.structuredClone(selected);
    const outcome = await pooled(selected);
    expect.soft(assessments(outcome)[0]).toMatchObject({
      assessable: false,
      excludedBatches: expect.arrayContaining([{ batchId: 'B1', reason: expect.stringMatching(/condition.*row|row.*condition/i) }]),
    });
    expect.soft(outcome.data.supportedShelfLife).toBeNull();
    expect.soft(selected).toEqual(before);
  });

  it('retains the valid independent parameter when another has mixed conditions', async () => {
    const bad = points().map((point, index) => ({ ...point, condition: index < 3 ? CONDITION : OTHER_CONDITION }));
    const good = points('Potency').map(point => ({ ...point, condition: CONDITION }));
    const outcome = await pooled([study(1, [...bad, ...good]), study(2, [...points(), ...good]), study(3, [...points(), ...good])]);
    expect.soft(assessments(outcome)).toEqual([
      expect.objectContaining({ parameter: 'Assay', assessable: false }),
      expect.objectContaining({ parameter: 'Potency', assessable: true }),
    ]);
    expect.soft(outcome.data.supportedShelfLife).toBeNull();
  });

  it('allows matching explicit and inherited conditions in the same selected batch', async () => {
    const data = points().map((point, index) => index % 2 ? { ...point, condition: CONDITION } : point);
    const outcome = await pooled([study(1, data), study(2, data)]);
    expect(assessments(outcome)[0].assessable).toBe(true);
    expect(outcome.data.supportedShelfLife).toBeGreaterThan(0);
  });

  it('keeps LT plus a physical label conservatively unassessed without inventing equivalence', async () => {
    const outcome = await assessRecordedPoolability([1, 2].map(id => ({ ...study(id), storageConditions: ['LT', CONDITION] })));
    expect(outcome).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(/more than one storage condition/) });
  });
});

describe('one fitted recorded series has one consistent recorded criterion', () => {
  it.each([
    { title: 'a different ordinary lower bound', changed: '>= 99%' },
    { title: 'a different criterion direction', changed: '<= 105%' },
    { title: 'an uninterpretable later criterion', changed: 'report result' },
  ])('refuses $title in shelf life, trending and pooling', async ({ changed }) => {
    const data = points();
    data[3].specification = changed;
    const before = globalThis.structuredClone(data);
    const shelf = await estimateRecordedShelfLife(study(1, data));
    if (!shelf.ok) throw new Error(shelf.error);
    expect.soft(shelf.data.estimates[0]).toMatchObject({ estimable: false, reason: expect.stringMatching(/criterion|criteria/i) });
    expect.soft(shelf.data.supportedShelfLife).toBeNull();
    const trend = assessRecordedTrending(study(1, data));
    if (!trend.ok) throw new Error(trend.error);
    expect.soft(trend.data.series[0].outcome).toMatchObject({ ok: false, detail: expect.stringMatching(/criterion|criteria/i) });
    const pool = await pooled([study(1, data), study(2), study(3)]);
    expect.soft(assessments(pool)[0]).toMatchObject({ assessable: false, excludedBatches: expect.arrayContaining([{ batchId: 'B1', reason: expect.stringMatching(/criterion|criteria/i) }]) });
    expect.soft(pool.data.supportedShelfLife).toBeNull();
    expect.soft(data).toEqual(before);
  });

  it('checks the upper bound of every two-sided criterion within a recorded series', async () => {
    const data = points().map((point, index) => ({ ...point, specification: index === 3 ? '95.0-103.0%' : '95.0-105.0%' }));
    const shelf = await estimateRecordedShelfLife(study(1, data));
    if (!shelf.ok) throw new Error(shelf.error);
    expect.soft(shelf.data.estimates[0]).toMatchObject({ estimable: false, reason: expect.stringMatching(/different|conflict/i) });
    const pool = await pooled([study(1, data), study(2, data)]);
    expect.soft(assessments(pool)[0].assessable).toBe(false);
    expect.soft(pool.data.supportedShelfLife).toBeNull();
  });

  it('preserves equivalent supported criterion spellings and blanks that inherit the series criterion', async () => {
    const spellings = ['>= 95%', 'NLT 95.0%', undefined, 'not less than 95%', '>=95.00%', '≥ 95%', '>= 95%'];
    const equivalent = points().map((point, index) => ({ ...point, specification: spellings[index] }));
    const shelf = await estimateRecordedShelfLife(study(1, equivalent));
    if (!shelf.ok) throw new Error(shelf.error);
    expect(shelf.data.estimates[0].estimable).toBe(true);
    const trend = assessRecordedTrending(study(1, equivalent));
    if (!trend.ok) throw new Error(trend.error);
    expect(trend.data.series[0].outcome.ok).toBe(true);
    const pool = await pooled([study(1, equivalent), study(2, equivalent), study(3, equivalent)]);
    expect(assessments(pool)[0].assessable).toBe(true);
    expect(pool.data.supportedShelfLife).toBeGreaterThan(0);
  });

  it('keeps valid independent attribute estimates while withholding the incomplete programme claim', async () => {
    const invalid = points().map((point, index) => ({ ...point, specification: index === 3 ? '>= 99%' : '>= 95%' }));
    const data = [...invalid, ...points('Potency')];
    const shelf = await estimateRecordedShelfLife(study(1, data));
    if (!shelf.ok) throw new Error(shelf.error);
    expect.soft(shelf.data.estimates).toEqual([
      expect.objectContaining({ parameter: 'Assay', estimable: false }),
      expect.objectContaining({ parameter: 'Potency', estimable: true }),
    ]);
    expect.soft(shelf.data.supportedShelfLife).toBeNull();
  });

  it('withholds the aggregate for cross-batch criterion conflict while retaining another assessed parameter', async () => {
    const potency = points('Potency');
    const outcome = await pooled([
      study(1, [...points(), ...potency]),
      study(2, [...points().map(point => ({ ...point, specification: '>= 99%' })), ...potency]),
    ]);
    expect.soft(assessments(outcome)).toEqual([
      expect.objectContaining({ parameter: 'Assay', assessable: false }),
      expect.objectContaining({ parameter: 'Potency', assessable: true }),
    ]);
    expect.soft(outcome.data.supportedShelfLife).toBeNull();
  });
});

describe('Module 3 propagates recorded-series criterion refusals', () => {
  it('preserves the existing raw table and names the series refusal', () => {
    const data = points();
    data[3].specification = '>= 99%';
    const source: CanonicalSource = { id: 'source-1', sourceType: 'stability', sourceHash: 'fixture-hash', sourcePayload: { studyName: 'LT', results: data, storageConditions: [CONDITION] } };
    const section = composeModule3FromCanonicalSources([source]).find(item => item.sectionKey === '3.2.S.7')!;
    const table = section.tables.find(item => /Stability Results/.test(item.title))!;
    expect.soft(table.rows).toHaveLength(7);
    expect.soft(table.rows[3]).toContain('>= 99%');
    expect.soft(section.narrativeDraft).toMatch(/trend not assessed:.*(?:different|conflict).*criteria/i);
    expect.soft(section.narrativeDraft).not.toMatch(/trend toward the limit projected/);
  });

  it.each(['one results field', 'split existing results fields'])('withholds Module 3 stability support for conflicting criteria in %s while retaining passing point comparisons', (shape) => {
    const data = points().map((point, index) => ({ ...point, specification: index < 3 ? '>= 95%' : '>= 90%' }));
    const source: CanonicalSource = {
      id: 'source-1', sourceType: 'stability', sourceHash: 'fixture-hash',
      sourcePayload: {
        studyName: 'LT', storageConditions: [CONDITION],
        ...(shape === 'one results field' ? { results: data } : { results: data.slice(0, 3), stabilityData: { results: data.slice(3) } }),
      },
    };
    const section = composeModule3FromCanonicalSources([source]).find(item => item.sectionKey === '3.2.S.7')!;
    const table = section.tables.find(item => /Stability Results/.test(item.title))!;
    expect.soft(table.rows).toHaveLength(7);
    expect.soft(table.rows.every(row => row.includes('within'))).toBe(true);
    expect.soft(section.narrativeDraft).toMatch(/All 7 recorded result\(s\).*within their recorded acceptance criteria/);
    expect.soft(section.narrativeDraft).toMatch(/stability conclusion and proposed storage period are NOT established/);
    expect.soft(section.narrativeDraft).toMatch(/trend not assessed:.*different acceptance criteria/);
    expect.soft(section.narrativeDraft).not.toMatch(/supporting stability of/);
  });

  it('keeps different valid criteria at separate conditions assessable in Module 3', () => {
    const data = [
      ...points().map(point => ({ ...point, condition: CONDITION })),
      ...points().map(point => ({ ...point, condition: OTHER_CONDITION, specification: '>= 90%' })),
    ];
    const source: CanonicalSource = { id: 'source-1', sourceType: 'stability', sourceHash: 'fixture-hash', sourcePayload: { results: data, storageConditions: [CONDITION, OTHER_CONDITION] } };
    const section = composeModule3FromCanonicalSources([source]).find(item => item.sectionKey === '3.2.S.7')!;
    expect(section.narrativeDraft).toMatch(/All 14 recorded result\(s\).*within their recorded acceptance criteria/);
    expect(section.narrativeDraft).toMatch(/supporting stability of/);
    expect(section.narrativeDraft).not.toMatch(/trend not assessed/);
  });

});

describe('present measured observations need an assigned parameter before an aggregate claim', () => {
  it.each(['', '   ', undefined])('retains the valid labelled series and names the unassigned point %j', async (parameter) => {
    const data = [...points(), { parameter, timePoint: 24, result: 88, specification: '>= 95%' }];
    const before = globalThis.structuredClone(data);
    const shelf = await estimateRecordedShelfLife(study(1, data));
    if (!shelf.ok) throw new Error(shelf.error);
    expect.soft(shelf.data.estimates[0].estimable).toBe(true);
    expect.soft(shelf.data.supportedShelfLife).toBeNull();
    expect.soft(shelf.data).toMatchObject({ unassignedObservations: [{ row: 8, reason: expect.stringMatching(/parameter/i) }] });
    const pool = await pooled([study(1, data), study(2)]);
    expect.soft(assessments(pool)[0].assessable).toBe(true);
    expect.soft(pool.data.supportedShelfLife).toBeNull();
    expect.soft(pool.data.claimWithheldReasons).toEqual(expect.arrayContaining([expect.stringMatching(/B1.*row 8.*parameter/i)]));
    expect.soft(data).toEqual(before);
  });

  it.each([null, undefined, '', ' '])('does not create an unassigned measured-point hold for missing result %j', async (result) => {
    const data = [...points(), { parameter: '', timePoint: 24, result }];
    const shelf = await estimateRecordedShelfLife(study(1, data));
    if (!shelf.ok) throw new Error(shelf.error);
    expect(shelf.data.supportedShelfLife).toBeGreaterThan(0);
    const pool = await pooled([study(1, data), study(2)]);
    expect(pool.data.supportedShelfLife).toBeGreaterThan(0);
  });
});

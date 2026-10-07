import { describe, expect, it } from 'vitest';

import { composeModule3FromCanonicalSources, type CanonicalSource } from '../../module3Composer';
import { estimateRecordedShelfLife, type StabilityPointRecord } from '../recorded-stability';

const CONDITION = '25°C/60%RH';
const points = (parameter = 'Assay'): StabilityPointRecord[] =>
  [0, 3, 6, 9, 12, 18, 24].map((timePoint, index) => ({
    timePoint,
    parameter,
    result: 100 - timePoint * 0.1 + [0.03, -0.02, 0.01, -0.03, 0.02, -0.01, 0.02][index],
    specification: '>= 95%',
  }));

const estimate = (stabilityData: StabilityPointRecord[], storageConditions = [CONDITION]) =>
  estimateRecordedShelfLife({ id: 41, studyTitle: 'Recorded LT', duration: 24, storageConditions, stabilityData });

function stabilitySection(
  data: StabilityPointRecord[],
  material: 'drug_substance' | 'drug_product',
  splitFields = false,
) {
  const source: CanonicalSource = {
    id: 'recorded-study-41', sourceType: 'stability', sourceHash: 'fixture-source-hash',
    sourcePayload: {
      studyName: 'Recorded LT', stabilityScope: material, storageConditions: [CONDITION],
      ...(splitFields ? { results: data.slice(0, 3), stabilityData: { results: data.slice(3) } } : { results: data }),
    },
  };
  const key = material === 'drug_substance' ? '3.2.S.7' : '3.2.P.8';
  const section = composeModule3FromCanonicalSources([source]).find(item => item.sectionKey === key);
  if (!section) throw new Error(`Expected composed stability section ${key}`);
  return section;
}

describe('single-study aggregate requires every recorded attribute to be estimable', () => {
  it.each([
    { title: 'too few numeric results', data: points('Water').slice(0, 2), reason: /at least 3 numeric/i },
    { title: 'no recorded criterion', data: points('Water').map(point => ({ ...point, specification: undefined })), reason: /no numeric specification limit/i },
    { title: 'no varying times', data: points('Water').map(point => ({ ...point, timePoint: 0 })), reason: /time points must vary/i },
  ])('withholds the programme claim for $title and retains the exact valid Assay estimate', async ({ data, reason }) => {
    const validOnly = await estimate(points());
    const recorded = [...points(), ...data];
    const before = globalThis.structuredClone(recorded);
    const outcome = await estimate(recorded);
    if (!outcome.ok || !validOnly.ok) throw new Error('Expected a recorded-study assessment');
    expect.soft(outcome.data.estimates[0]).toEqual(validOnly.data.estimates[0]);
    expect.soft(outcome.data.estimates[1]).toMatchObject({ parameter: 'Water', estimable: false, reason: expect.stringMatching(reason) });
    expect.soft(outcome.data.supportedShelfLife).toBeNull();
    expect.soft(outcome.data.limitingParameter).toBeNull();
    expect.soft(outcome.data).toMatchObject({ claimWithheldReasons: [expect.stringMatching(/Study 41.*Water.*25°C\/60%RH/)] });
    expect.soft(recorded).toEqual(before);
  });

  it('keeps the most constraining actual estimate when all recorded attributes qualify', async () => {
    const outcome = await estimate([...points(), ...points('Potency')]);
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.data.estimates.every(item => item.estimable)).toBe(true);
    expect(outcome.data.supportedShelfLife).toBe(Math.min(...outcome.data.estimates.map(item => Number(item.shelfLife))));
    expect(outcome.data.supportedShelfLife).toBeGreaterThan(0);
  });

  it('keeps separately recorded valid conditions without merging their estimates', async () => {
    const other = '40°C/75%RH';
    const outcome = await estimate([
      ...points().map(point => ({ ...point, condition: CONDITION })),
      ...points().map(point => ({ ...point, condition: other })),
    ], [CONDITION, other]);
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.data.estimates).toEqual([
      expect.objectContaining({ parameter: 'Assay', condition: CONDITION, estimable: true }),
      expect.objectContaining({ parameter: 'Assay', condition: other, estimable: true }),
    ]);
    expect(outcome.data.supportedShelfLife).toBeGreaterThan(0);
  });
});

describe('Module 3 propagates an unassigned measured point without losing valid outputs', () => {
  const cases = (['drug_substance', 'drug_product'] as const).flatMap(material =>
    ['', '   ', undefined].map(parameter => ({ material, parameter })),
  );
  it.each(cases)('holds $material support for a passing point with parameter "$parameter"', ({ material, parameter }) => {
    const recorded = [...points(), { parameter, timePoint: 24, result: 99, specification: '>= 95%' }];
    const before = globalThis.structuredClone(recorded);
    const section = stabilitySection(recorded, material, true);
    const table = section.tables.find(item => /Stability Results/.test(item.title));
    const validSection = stabilitySection(points(), material);
    const validTrend = validSection.narrativeDraft.slice(validSection.narrativeDraft.indexOf('Assay ('));
    expect.soft(table?.rows).toHaveLength(8);
    expect.soft(table?.rows.every(row => row.includes('within'))).toBe(true);
    expect.soft(table?.rows.find(row => row[2] === '—')).toEqual(['Recorded LT', '—', '—', '24', '99', '>= 95%', 'within']);
    expect.soft(section.narrativeDraft).toMatch(/All 8 recorded result\(s\).*within their recorded acceptance criteria/);
    expect.soft(section.narrativeDraft).toMatch(/stability conclusion and proposed storage period are NOT established/);
    expect.soft(section.narrativeDraft).toMatch(/recorded-study-41.*row 8.*no assigned parameter/i);
    expect.soft(section.narrativeDraft).toMatch(/trend not assessed:.*no assigned parameter/i);
    expect.soft(section.narrativeDraft).toContain(validTrend);
    expect.soft(section.narrativeDraft).not.toMatch(/supporting stability of/);
    expect.soft(recorded).toEqual(before);
  });

  it.each(['drug_substance', 'drug_product'] as const)('names the source and row when %s has only an unassigned measurement', material => {
    const section = stabilitySection([{ timePoint: 0, result: 99, specification: '>= 95%' }], material);
    expect.soft(section.tables.find(item => /Stability Results/.test(item.title))?.rows).toHaveLength(1);
    expect.soft(section.narrativeDraft).toMatch(/recorded-study-41.*row 1.*no assigned parameter/i);
    expect.soft(section.narrativeDraft).toMatch(/trend not assessed:.*no assigned parameter/i);
    expect.soft(section.narrativeDraft).not.toMatch(/supporting stability of|no recorded pull-point results/i);
  });
});

describe('absence is distinct from an unassigned measurement', () => {
  it.each([null, undefined, '', ' '])('adds no measured-point refusal for absent result %j', async result => {
    const recorded = [...points(), { parameter: '', timePoint: 24, result }];
    const outcome = await estimate(recorded);
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.data.supportedShelfLife).toBeGreaterThan(0);
    expect(outcome.data.unassignedObservations).toEqual([]);
    const section = stabilitySection(recorded, 'drug_substance');
    expect(section.narrativeDraft).not.toMatch(/no assigned parameter/i);
    expect(section.narrativeDraft).toMatch(/Assay .*no out-of-trend points/);
  });
});

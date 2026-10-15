import { describe, expect, it } from 'vitest';
import {
  assessRecordedPoolability,
  assessRecordedTrending,
  estimateRecordedShelfLife,
  numericSeries,
  parseAcceptanceCriterion,
  parseNumeric,
  type StabilityPointRecord,
} from '../recorded-stability';
import { composeModule3FromCanonicalSources, type CanonicalSource, type CmcSourceType } from '../../module3Composer';

const points = (): StabilityPointRecord[] => [0, 3, 6, 9, 12, 18, 24].map((timePoint, i) => ({
  timePoint,
  parameter: 'Assay',
  result: 100 - timePoint * 0.1 + [0.03, -0.02, 0.01, -0.03, 0.02, -0.01, 0.02][i],
  specification: '>= 95%',
}));
const study = (id = 1, data = points()) => ({
  id, studyTitle: `Study ${id}`, productName: 'Product', batchNumber: `B${id}`,
  storageConditions: ['25°C/60%RH'], duration: 24, stabilityData: data,
});
const source = (sourceType: CmcSourceType, sourcePayload: Record<string, unknown>): CanonicalSource =>
  ({ id: 's1', sourceType, sourcePayload, sourceHash: 'h1' });

describe('recorded numeric lexemes', () => {
  it.each([
    [0, 0], [-0.5, -0.5], [' +98.4 % ', 98.4], ['-.5', -0.5], ['.5', 0.5],
    ['12.', 12], ['1e-05', 0.00001], ['-1.25E+2', -125], ['1e-05 %', 0.00001],
    ['0e-999', 0], ['5e-324', Number.MIN_VALUE],
  ])('reads the complete finite value %j', (input, expected) => {
    expect(parseNumeric(input)).toBe(expected);
  });

  const unsupportedValues: unknown[] = [
    '<0.1%', '≤0.1%', '>95', 'NMT 0.1%', 'BLQ', 'ND', '1,000', '1 000', '1_000',
    '12abc', '1.2.3', '12 mg', '1e', '1e+', '1e309', '1e-999', 'NaN', 'Infinity',
    '', ' ', null, undefined, true, false, [12], { value: 12 }, { toString: () => '12' },
    NaN, Infinity, '0x10', '12%%', '12 months',
  ];
  it.each(unsupportedValues.map(input => ({ input })))('refuses an inexact or unsupported value $input', ({ input }) => {
    expect(parseNumeric(input)).toBeNull();
  });

  it.each([6, '6', '+6.0', '6e0', '6M', '6 mo', '6 mos', '6 month', '6 months', 'Month 6', 'Month6', 'MONTHS 6'])('reads a complete month time %j', (timePoint) => {
    expect(numericSeries([{ timePoint, result: '99.5%' }])).toMatchObject({
      ok: true, points: [{ time: 6, value: 99.5 }], pointsUsable: 1,
    });
  });

  it.each([-1, '-1 months', '6 days', 'Week 6', '1 year', '6%', '6 months 2 days', '6abc', '<6', null, undefined, ''])('refuses a present result whose time is %j', (timePoint) => {
    expect(numericSeries([{ timePoint, result: '99.5%' }])).toMatchObject({
      ok: false, issues: [{ row: 1, field: 'timePoint' }], pointsUsable: 0,
    });
  });

  it('keeps genuine missing results separate and leaves every raw record unchanged', () => {
    const data = [...points(), ...[null, undefined, '', ' '].map(result => ({ timePoint: 30, result }))];
    const original = globalThis.structuredClone(data);
    expect(numericSeries(data)).toMatchObject({ ok: true, pointsUsable: 7 });
    expect(data).toEqual(original);
  });
});

describe('unsupported criterion numeric notation is refused before choosing a candidate', () => {
  const numericBoundaryMatrix = ['1e-4', '1,000', '1_000', '1 000', '1.2.3', '1..2', '1...2', '.5', '-.5'].flatMap(value =>
    ['NMT', 'NLT', 'max', 'min', '>=', '<='].flatMap(operator =>
      ['', ' '].flatMap(separator =>
        ['', '%', 'mg', 'EU/mL'].map(unit => `${operator}${separator}${value}${unit}`),
      ),
    ),
  );

  it.each(numericBoundaryMatrix)('refuses unsupported numeric prefixes through operator and unit boundaries: %s', criterion => {
    expect(parseAcceptanceCriterion([criterion])).toBeNull();
    expect(parseAcceptanceCriterion(['<= 2.0%', criterion])).toBeNull();
    expect(parseAcceptanceCriterion([criterion, '<= 2.0%'])).toBeNull();
  });

  it.each(['<= 1e-4', '<= 1E+4', '<= 1e', '<= 1e+', '<= 1,000', '<= 1_000', '<= 1 000', '<= 1.2.3', '<= .5', 'NMT1e-4%', 'NLT1e+4%', 'max1e+', 'maximum1e-4', 'minimum1e-4', 'not more than1e-4', 'not less than1e-4', 'NMT-1e-4', 'NMT1,000', 'NMT.5%', '95.0-1e2%', '0-1e-4', '0--1e-4', '95.0-1.2.3', '0-.5', 'NMT1...2mg'])('never extracts another limit from %s', (criterion) => {
    expect(parseAcceptanceCriterion([criterion])).toBeNull();
    expect(parseAcceptanceCriterion(['<= 2.0%', criterion])).toBeNull();
    expect(parseAcceptanceCriterion([criterion, '<= 2.0%'])).toBeNull();
  });

  it.each(['NLT -5.0 °C', '<= 2mg', 'NMT 2.0%', '95.0-105.0%', '95.0 to 105.0%', 'maximum 2.0 EU/mL', 'NMT 2.0% (per ICH Q1E)', 'NMT 2.0% (see 3.2.S.4)', 'NMT2.0%', 'maximum2.0 EU/mL', 'not more than2.0%', '-5.0--1.0', 'NMT1000mg', 'NMT2.0mg (see 3.2.S.4)', 'NMT2EU/mL'])('retains established ordinary criterion %s', (criterion) => {
    expect(parseAcceptanceCriterion([criterion])).not.toBeNull();
  });
});

describe('an invalid measured observation cannot be omitted before fitting', () => {
  it.each(['<0.1%', '1,000', '12abc', 'BLQ'])('refuses all recorded fitting paths for %s despite sufficient other points', async (result) => {
    const data = points();
    data[3].result = result;
    const before = globalThis.structuredClone(data);
    const shelf = await estimateRecordedShelfLife(study(1, data));
    if (!shelf.ok) throw new Error(shelf.error);
    expect(shelf.data.estimates[0]).toMatchObject({ estimable: false, pointsRecorded: 7, pointsUsable: 6, reason: expect.stringMatching(/row 4.*result.*clarif/i) });
    expect(shelf.data.supportedShelfLife).toBeNull();
    const trend = assessRecordedTrending(study(1, data));
    if (!trend.ok) throw new Error(trend.error);
    expect(trend.data.series[0].outcome).toMatchObject({ ok: false, reason: 'INVALID_RECORDED_OBSERVATION', pointsUsable: 6 });
    const pooled = await assessRecordedPoolability([study(1, data), study(2), study(3)]);
    if (!pooled.ok) throw new Error(pooled.error);
    expect(pooled.data.assessments).toEqual([expect.objectContaining({ assessable: false, reason: expect.stringMatching(/clarif/i), excludedBatches: expect.arrayContaining([expect.objectContaining({ batchId: 'B1', reason: expect.stringMatching(/row 4.*result/) })]) })]);
    expect(pooled.data.supportedShelfLife).toBeNull();
    expect(data).toEqual(before);
  });

  it('retains an independent valid series but withholds an incomplete programme shelf life', async () => {
    const data = points();
    data[3].result = '<99%';
    data.push(...points().map(p => ({ ...p, parameter: 'Potency' })));
    const shelf = await estimateRecordedShelfLife(study(1, data));
    if (!shelf.ok) throw new Error(shelf.error);
    expect(shelf.data.estimates.map(e => e.estimable)).toEqual([false, true]);
    expect(shelf.data.supportedShelfLife).toBeNull();
    expect(shelf.data.limitingParameter).toBeNull();
    const trend = assessRecordedTrending(study(1, data));
    if (!trend.ok) throw new Error(trend.error);
    expect(trend.data.series.map(s => s.outcome.ok)).toEqual([false, true]);
    const pooled = await assessRecordedPoolability([study(1, data), study(2, [...points(), ...points().map(p => ({ ...p, parameter: 'Potency' }))]), study(3, [...points(), ...points().map(p => ({ ...p, parameter: 'Potency' }))])]);
    if (!pooled.ok) throw new Error(pooled.error);
    expect((pooled.data.assessments as Array<{ assessable: boolean }>).map(a => a.assessable)).toEqual([false, true]);
    expect(pooled.data.supportedShelfLife).toBeNull();
  });

  it('uses exponent results and month labels identically to the equivalent numeric observations', async () => {
    const plain = points();
    const labelled = plain.map(p => ({ ...p, timePoint: `Month ${p.timePoint}`, result: `${Number(p.result).toExponential()}%` }));
    const a = await estimateRecordedShelfLife(study(1, plain));
    const b = await estimateRecordedShelfLife(study(1, labelled));
    expect(b).toEqual(a);
    expect(assessRecordedTrending(study(1, labelled))).toEqual(assessRecordedTrending(study(1, plain)));
  });

  it('does not discard a present result with an absent time while fitting the other six', async () => {
    const data = points();
    delete data[3].timePoint;
    const shelf = await estimateRecordedShelfLife(study(1, data));
    if (!shelf.ok) throw new Error(shelf.error);
    expect(shelf.data.estimates[0]).toMatchObject({ estimable: false, reason: expect.stringMatching(/timePoint/) });
    const trend = assessRecordedTrending(study(1, data));
    if (!trend.ok) throw new Error(trend.error);
    expect(trend.data.series[0].outcome.ok).toBe(false);
  });

  it('refuses unsupported criterion notation even after valid criteria in every fitted path', async () => {
    const data = points();
    data[3].specification = '>= 9.5e1%';
    const shelf = await estimateRecordedShelfLife(study(1, data));
    if (!shelf.ok) throw new Error(shelf.error);
    expect(shelf.data.estimates[0]).toMatchObject({ estimable: false, reason: expect.stringMatching(/criterion.*clarif/i) });
    expect(shelf.data.supportedShelfLife).toBeNull();
    const trend = assessRecordedTrending(study(1, data));
    if (!trend.ok) throw new Error(trend.error);
    expect(trend.data.series[0].outcome).toMatchObject({ ok: false, reason: 'CRITERION_UNPARSEABLE', detail: expect.stringMatching(/clarif/i) });
    const pooled = await assessRecordedPoolability([study(1, data), study(2), study(3)]);
    if (!pooled.ok) throw new Error(pooled.error);
    expect(pooled.data.assessments).toEqual([expect.objectContaining({ assessable: false, reason: expect.stringMatching(/clarif/i) })]);
    expect(pooled.data.supportedShelfLife).toBeNull();
  });

  it('retains genuine missing results in recorded counts while allowing the complete observations to fit', async () => {
    const data = [...points(), { timePoint: 30, parameter: 'Assay', result: null, specification: '>= 95%' }];
    const shelf = await estimateRecordedShelfLife(study(1, data));
    if (!shelf.ok) throw new Error(shelf.error);
    expect(shelf.data.estimates[0]).toMatchObject({ estimable: true, pointsRecorded: 8, pointsUsable: 7, pointsUsed: 7 });
    const pooled = await assessRecordedPoolability([study(1, data), study(2)]);
    if (!pooled.ok) throw new Error(pooled.error);
    expect(pooled.data.assessments).toEqual([expect.objectContaining({ assessable: true, batchPointCounts: [{ batchId: 'B1', pointsRecorded: 8, pointsUsable: 7 }, { batchId: 'B2', pointsRecorded: 7, pointsUsable: 7 }] })]);
  });
});

describe('Module 3 stability and QC use the same complete numeric evidence', () => {
  it.each(['<0.1%', '1,000', '12abc'])('retains %s raw, without presenting an exact conformance or trend', (result) => {
    const data = points();
    data[3].result = result;
    const section = composeModule3FromCanonicalSources([source('stability', { studyName: 'LT', results: data })]).find(s => s.sectionKey === '3.2.S.7')!;
    const rows = section.tables.find(t => /Stability Results/.test(t.title))!.rows;
    expect(rows.find(row => row.includes(result))).toContain('not compared');
    expect(section.narrativeDraft).toMatch(/trend not assessed:.*clarif/i);
    expect(section.narrativeDraft).not.toMatch(/no out-of-trend points across/);
    expect(section.narrativeDraft).toMatch(/1 recorded result\(s\).*usable.*not compared/i);
    expect(section.narrativeDraft).not.toMatch(/supporting stability of/);
    const qc = composeModule3FromCanonicalSources([source('qc_result', { sampleId: 'QC1', sampleType: 'finished-product', testResults: { value: result, unit: '%' }, specifications: { acceptanceCriteria: '<= 2.0%' }, passFailStatus: 'pass', reviewed: true })]).find(s => s.sectionKey === '3.2.P.5')!;
    expect(qc.narrativeDraft).toMatch(/were NOT compared/);
    expect(qc.narrativeDraft).not.toContain('1 within criterion');
    expect(qc.narrativeDraft).not.toMatch(/record no numeric result or no acceptance criterion/);
  });

  it('compares an exact exponent result at its real magnitude', () => {
    const section = composeModule3FromCanonicalSources([source('stability', { results: [{ timePoint: '6M', parameter: 'Impurity', result: '1e-05%', specification: '<= 0.1%' }] })]).find(s => s.sectionKey === '3.2.S.7')!;
    expect(section.tables.find(t => /Stability Results/.test(t.title))!.rows[0]).toContain('within');
    const qc = composeModule3FromCanonicalSources([source('qc_result', { sampleId: 'QC1', sampleType: 'finished-product', testResults: { value: '1e-05', unit: '%' }, specifications: { acceptanceCriteria: '<= 0.1%' }, passFailStatus: 'pass', reviewed: true })]).find(s => s.sectionKey === '3.2.P.5')!;
    expect(qc.narrativeDraft).toContain('1 within criterion, 0 out of specification');
  });

  it('does not compare a supported result against an unsupported exponent criterion', () => {
    const section = composeModule3FromCanonicalSources([source('stability', { results: [{ timePoint: 6, parameter: 'Impurity', result: '0.01%', specification: '<= 1e-4%' }] })]).find(s => s.sectionKey === '3.2.S.7')!;
    expect(section.tables.find(t => /Stability Results/.test(t.title))!.rows[0]).toContain('not compared — no usable criterion');
    expect(section.tables.find(t => /Stability Results/.test(t.title))!.rows[0]).toContain('<= 1e-4%');
    expect(section.narrativeDraft).not.toMatch(/carry no recorded acceptance criterion/);
    const qc = composeModule3FromCanonicalSources([source('qc_result', { sampleId: 'QC1', sampleType: 'finished-product', result: '0.01%', acceptanceCriteria: '<= 1e-4%', passFailStatus: 'pass', reviewed: true })]).find(s => s.sectionKey === '3.2.P.5')!;
    expect(qc.narrativeDraft).toMatch(/were NOT compared/);
  });

  it('reports readable comparisons but withholds stability support when another recorded payload is unreadable', () => {
    const section = composeModule3FromCanonicalSources([source('stability', { results: points(), stabilityData: '{ unreadable' })]).find(s => s.sectionKey === '3.2.S.7')!;
    expect(section.narrativeDraft).toMatch(/within their recorded acceptance criteria/);
    expect(section.narrativeDraft).toMatch(/could not be read/);
    expect(section.narrativeDraft).not.toMatch(/supporting stability of/);
  });

  it('preserves value comparisons but withholds stability support for an unresolved measured observation time', () => {
    const data = points();
    data[3].timePoint = '9 days';
    const section = composeModule3FromCanonicalSources([source('stability', { results: data })]).find(s => s.sectionKey === '3.2.S.7')!;
    expect(section.tables.find(t => /Stability Results/.test(t.title))!.rows.find(row => row.includes('9 days'))).toContain('within');
    expect(section.narrativeDraft).toMatch(/within their recorded acceptance criteria/);
    expect(section.narrativeDraft).toMatch(/timePoint.*clarif/i);
    expect(section.narrativeDraft).not.toMatch(/supporting stability of/);
  });
});

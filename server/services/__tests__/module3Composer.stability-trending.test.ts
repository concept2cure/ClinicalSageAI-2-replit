/**
 * §3.2.S.7 / §3.2.P.8 state the out-of-trend assessment of the recorded
 * series — per attribute, from the numbers — and say when it was NOT
 * assessed and why. A stability section silent on trend is a section a
 * reviewer cannot tell "no trend" from "not looked".
 */
import { describe, it, expect } from 'vitest';
import { composeModule3FromCanonicalSources } from '../module3Composer';

const src = (sourceType: string, sourcePayload: Record<string, unknown>) =>
  ({ id: 's', sourceType, sourcePayload, sourceHash: 'h' }) as never;

const noise = [0.05, -0.04, 0.02, -0.03, 0.04, -0.02, 0.03];
const assay = (spec: string | null, tweak?: (t: number, v: number) => number) =>
  [0, 3, 6, 9, 12, 18, 24].map((t, i) => {
    const v = 100 - 0.2 * t + noise[i];
    return {
      timePoint: `${t}`,
      parameter: 'Assay',
      result: `${(tweak ? tweak(t, v) : v).toFixed(2)} %`,
      ...(spec === null ? {} : { specification: spec }),
    };
  });

const s7 = (payload: Record<string, unknown>) =>
  composeModule3FromCanonicalSources([src('stability', payload)]).find(c => c.sectionKey === '3.2.S.7')!.narrativeDraft;

describe('the stability narrative states the trend assessment', () => {
  it('reports no out-of-trend points and the projected crossing on a clean, trending series', () => {
    const text = s7({ studyName: 'LT', storageCondition: '25°C/60%RH', results: assay('>= 95.0 %') });
    expect(text).toContain('Assay');
    expect(text).toMatch(/no out-of-trend points across 7 time points/);
    expect(text).toMatch(/trend toward the limit projected at 2\d(?:\.\d{1,2})? months/);
  });

  it('names the out-of-trend time point', () => {
    const text = s7({ studyName: 'LT', results: assay('>= 95.0 %', (t, v) => (t === 18 ? v - 1.0 : v)) });
    expect(text).toMatch(/out-of-trend at 18 months/);
    expect(text).not.toMatch(/no out-of-trend points/);
  });

  it('says the trend was not assessed, and why, on too short a series', () => {
    const text = s7({ studyName: 'LT', results: assay('>= 95.0 %').slice(0, 3) });
    expect(text).toMatch(/trend not assessed: .*4 prior/i);
  });

  it('says the trend was not assessed when no criterion is recorded', () => {
    const text = s7({ studyName: 'LT', results: assay(null) });
    expect(text).toMatch(/trend not assessed: .*criterion/i);
  });

  it('is never silent — a study with no recorded results says trend was not assessed', () => {
    const text = s7({ studyName: 'LT', conclusion: 'Stable.' });
    expect(text).toMatch(/trend not assessed: no recorded pull-point results/i);
  });

  it('§3.2.P.8 carries the same assessment for the drug product', () => {
    const composed = composeModule3FromCanonicalSources([
      src('stability', { studyName: 'LT', shelfLifeClaim: '24 months', results: assay('>= 95.0 %') }),
    ]);
    const p8 = composed.find(c => c.sectionKey === '3.2.P.8')!.narrativeDraft;
    expect(p8).toMatch(/no out-of-trend points across 7 time points/);
  });
});

describe('review: a study placed at two conditions is refused, not fitted as one line', () => {
  it('refuses through the composer when the mapper carried the condition array, and when only the legacy joined string is stored', async () => {
    const { composeModule3FromCanonicalSources } = await import('../module3Composer');
    const results = [
      ...[0, 3, 6, 9, 12, 18, 24].map((t) => ({ timePoint: String(t), parameter: 'Assay', result: String(100 - 0.1 * t), specification: 'NLT 95.0%' })),
      ...[0, 3, 6, 9, 12, 18, 24].map((t) => ({ timePoint: String(t), parameter: 'Assay', result: String(100 - 0.6 * t), specification: 'NLT 95.0%' })),
    ];
    for (const payload of [
      { storageCondition: '25°C/60%RH, 40°C/75%RH', storageConditions: ['25°C/60%RH', '40°C/75%RH'], stabilityData: results, studyTitle: 'S1' },
      { storageCondition: '25°C/60%RH, 40°C/75%RH', stabilityData: results, studyTitle: 'S1' },
    ]) {
      const composed = composeModule3FromCanonicalSources([
        { id: 'st-1', sourceType: 'stability', sourcePayload: payload, sourceHash: 'h' } as never,
      ]);
      const s7 = composed.find((c) => c.sectionKey === '3.2.S.7')!;
      expect(s7.narrativeDraft).toMatch(/Trend not assessed|not assessed: .*CONDITION_NOT_SEPARABLE|conditions its results do not separate/i);
      expect(s7.narrativeDraft).not.toMatch(/projected at/);
    }
  });
});

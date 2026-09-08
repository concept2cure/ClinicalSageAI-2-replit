/**
 * Out-of-trend assessment over a RECORDED stability study — the series the
 * stability surface appends to `stability_data.results`, grouped by attribute
 * and storage condition and handed to the trending engine. Refusals carry
 * their reason; nothing is inferred to make a series assessable.
 */
import { describe, it, expect } from 'vitest';
import { assessRecordedTrending } from '../recorded-stability';

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

describe('assessRecordedTrending', () => {
  it('assesses each recorded attribute at its condition and finds the clean series clean', () => {
    const r = assessRecordedTrending({
      id: 7,
      storageConditions: ['25°C/60%RH'],
      stabilityData: { results: assay('>= 95.0 %') },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.series).toHaveLength(1);
    const s = r.data.series[0];
    expect(s.parameter).toBe('Assay');
    expect(s.condition).toBe('25°C/60%RH');
    expect(s.pointsUsable).toBe(7);
    expect(s.outcome.ok).toBe(true);
    if (s.outcome.ok) {
      expect(s.outcome.outOfTrend).toEqual([]);
      expect(s.outcome.projection?.bound).toBe('lower');
    }
  });

  it('names an out-of-trend pull point', () => {
    const r = assessRecordedTrending({
      id: 7,
      storageConditions: ['25°C/60%RH'],
      stabilityData: assay('>= 95.0 %', (t, v) => (t === 18 ? v - 1.0 : v)),
    });
    if (!r.ok) throw new Error(r.error);
    const out = r.data.series[0].outcome;
    if (!out.ok) throw new Error(out.reason);
    expect(out.outOfTrend.map(p => p.time)).toEqual([18]);
  });

  it('separates attributes recorded against different conditions into their own series', () => {
    const lt = assay('>= 95.0 %').map(p => ({ ...p, condition: '25°C/60%RH' }));
    const acc = assay('>= 95.0 %').map(p => ({ ...p, condition: '40°C/75%RH' }));
    const r = assessRecordedTrending({ id: 1, storageConditions: ['25°C/60%RH', '40°C/75%RH'], stabilityData: [...lt, ...acc] });
    if (!r.ok) throw new Error(r.error);
    expect(r.data.series.map(s => `${s.parameter} @ ${s.condition}`).sort()).toEqual([
      'Assay @ 25°C/60%RH',
      'Assay @ 40°C/75%RH',
    ]);
  });

  it('refuses a study spanning conditions whose results carry none', () => {
    const r = assessRecordedTrending({ id: 1, storageConditions: ['25°C/60%RH', '40°C/75%RH'], stabilityData: assay('>= 95.0 %') });
    if (!r.ok) throw new Error(r.error);
    const out = r.data.series[0].outcome;
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('CONDITION_NOT_SEPARABLE');
  });

  it('refuses a series with no recorded criterion, and one whose criterion cannot be read, with different reasons', () => {
    const none = assessRecordedTrending({ id: 1, storageConditions: ['25°C'], stabilityData: assay(null) });
    if (!none.ok) throw new Error(none.error);
    const a = none.data.series[0].outcome;
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('CRITERION_NOT_RECORDED');

    const garbled = assessRecordedTrending({ id: 1, storageConditions: ['25°C'], stabilityData: assay('report result') });
    if (!garbled.ok) throw new Error(garbled.error);
    const b = garbled.data.series[0].outcome;
    expect(b.ok).toBe(false);
    if (!b.ok) {
      expect(b.reason).toBe('CRITERION_UNPARSEABLE');
      expect(b.detail).toContain('report result');
    }
  });

  it('refuses a short series with the point count it has', () => {
    const r = assessRecordedTrending({ id: 1, storageConditions: ['25°C'], stabilityData: assay('>= 95.0 %').slice(0, 3) });
    if (!r.ok) throw new Error(r.error);
    const out = r.data.series[0].outcome;
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe('INSUFFICIENT_POINTS');
      expect(out.pointsUsable).toBe(3);
    }
  });

  it('refuses at the study level when nothing is recorded, and when the record is unreadable', () => {
    expect(assessRecordedTrending({ id: 1, stabilityData: [] })).toEqual({ ok: false, error: expect.stringMatching(/no recorded pull-point results/) });
    expect(assessRecordedTrending({ id: 1, stabilityData: '{not json' })).toEqual({ ok: false, error: expect.stringMatching(/could not be read/) });
  });
});

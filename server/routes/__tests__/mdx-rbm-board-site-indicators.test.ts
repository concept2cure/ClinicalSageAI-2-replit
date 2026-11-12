/**
 * The board sends each site's indicator readings, not only their counts.
 *
 * site-risk-engine.ts stores, on every site scored from the study's own indicators, the readings behind the
 * composite and the band it gave each (`metadata.indicators`). The board sent "1 red · 1 amber" and dropped the
 * rest, so no screen could show a site against its indicators, or an indicator across its sites, without a second
 * computation in the browser. `siteIndicatorReadings` passes what is stored and computes nothing.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/requestDb', async original => ({ ...(await original<Record<string, unknown>>()), requestDb: () => ({ select: vi.fn() }) }));

import { siteIndicatorReadings } from '../mdx-rbm-board';

const reading = (over: Record<string, unknown> = {}) => ({
  siteNumber: '104', kriName: 'AE reporting lag', unit: 'days', value: 21, amber: 7, red: 10,
  direction: 'higher_worse', observedAt: '2026-10-31T00:00:00.000Z', dataCutoff: '2026-10-31', status: 'red', ...over,
});

describe('the board passes each site’s indicator readings as the engine stored them', () => {
  it('carries the indicator, its value, unit, limits, direction, cut-off and the engine’s band', () => {
    const out = siteIndicatorReadings({ source: 'study_indicators', indicators: [reading()] });
    expect(out).toEqual([{
      name: 'AE reporting lag', value: 21, unit: 'days', status: 'red', amber: 7, red: 10,
      dir: 'higher_worse', at: '2026-10-31T00:00:00.000Z', cutoff: '2026-10-31',
    }]);
  });

  it('keeps the engine’s order, worst first, and never re-bands a reading', () => {
    const out = siteIndicatorReadings({ source: 'study_indicators', indicators: [
      reading(),
      // Stored as amber: the board does not look at 3 against a red limit of 10 and decide for itself.
      reading({ kriName: 'Open query aging', value: 3, status: 'amber' }),
      reading({ kriName: 'Protocol deviation rate', value: '0.4', unit: null, amber: null, red: null, status: 'not_evaluated', direction: 'lower_worse' }),
    ] });
    expect(out.map((r) => [r.name, r.value, r.status])).toEqual([
      ['AE reporting lag', 21, 'red'], ['Open query aging', 3, 'amber'], ['Protocol deviation rate', 0.4, 'not_evaluated'],
    ]);
    expect(out[2]).toMatchObject({ unit: null, amber: null, red: null, dir: 'lower_worse' });
  });

  it('drops a malformed entry and keeps the others, and guesses no band', () => {
    const out = siteIndicatorReadings({ source: 'study_indicators', indicators: [
      null, 'x', reading({ value: 'not a number' }), reading({ kriName: '' }), reading({ status: 'purple' }),
      reading({ kriName: 'Enrolment rate', status: 'green' }),
    ] });
    expect(out.map((r) => r.name)).toEqual(['Enrolment rate']);
  });

  it('sends none for a Site Intelligence row, or a row stored before the source was recorded', () => {
    expect(siteIndicatorReadings({ source: 'site_intelligence', indicators: [reading()] })).toEqual([]);
    expect(siteIndicatorReadings({ indicators: [reading()] })).toEqual([]);
    expect(siteIndicatorReadings(null)).toEqual([]);
    expect(siteIndicatorReadings([])).toEqual([]);
  });
});

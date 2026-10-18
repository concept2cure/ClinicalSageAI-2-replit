/**
 * ICH E2A expedited reportability is tri-state: a criterion nobody stated is
 * "not assessed", never "failed".
 *
 * Until 2026-10-15 classifySafetyReport read serious / unexpected /
 * suspectedCausality with `=== true`, so {region:'FDA'} (a case nobody had
 * assessed) came back reportable:false with the rationale "Does not meet the
 * ICH E2A expedited criteria …: not serious, not unexpected, no suspected causal
 * relationship", and the 7/15-day expedited clock was reported as not applying.
 * An unstated fatalOrLifeThreatening likewise picked the 15-day clock for a case
 * that may be on the 7-day one. Served via POST
 * /api/global-ri/safety-reporting/classify and the AnA tool
 * global_ri_safety_reporting, which relays the result as deterministic.
 */

import { describe, it, expect } from 'vitest';
import { classifySafetyReport } from '../clinical-safety-reporting';
import { dispatchGlobalRiTool } from '../ana-tools-dispatch';

describe('classifySafetyReport — an unstated criterion is not assessed, not failed', () => {
  it('no criterion stated: not_assessed, all three named as missing, no criterion claimed as failed', () => {
    const r = classifySafetyReport({ region: 'FDA' });
    expect(r.reportable).toBe('not_assessed');
    expect(r.missing).toEqual(['serious', 'unexpected', 'suspectedCausality']);
    expect(r.timelineDays).toBeNull();
    expect(r.reportType).not.toBe('Not individually expedited-reportable');
    expect(r.rationale).not.toMatch(/Does not meet|not serious|not unexpected|no suspected causal relationship/);
  });

  it('partly stated: not_assessed, and only the unstated criterion is missing', () => {
    const r = classifySafetyReport({ region: 'EU', serious: true, unexpected: true });
    expect(r.reportable).toBe('not_assessed');
    expect(r.missing).toEqual(['suspectedCausality']);
    expect(r.rationale).not.toMatch(/no suspected causal relationship/);
  });

  it('a value that is not a boolean is not read as an answer', () => {
    const r = classifySafetyReport({
      region: 'FDA',
      serious: 'yes' as unknown as boolean,
      unexpected: true,
      suspectedCausality: true,
    });
    expect(r.reportable).toBe('not_assessed');
    expect(r.missing).toEqual(['serious']);
  });

  it('a criterion stated false fails the triad, and only stated-false criteria are named as failed', () => {
    const r = classifySafetyReport({ region: 'FDA', serious: false });
    expect(r.reportable).toBe(false);
    expect(r.timelineDays).toBeNull();
    expect(r.rationale).toContain('not serious');
    expect(r.rationale).not.toMatch(/not unexpected|no suspected causal relationship/);
    expect(r.missing).toEqual(['unexpected', 'suspectedCausality']);
  });

  it('triad stated true but fatal/life-threatening unstated: reportable, clock not chosen between 7 and 15 days', () => {
    const r = classifySafetyReport({ region: 'FDA', serious: true, unexpected: true, suspectedCausality: true });
    expect(r.reportable).toBe(true);
    expect(r.reportType).toBe('IND safety report');
    expect(r.timelineDays).toBeNull();
    expect(r.missing).toEqual(['fatalOrLifeThreatening']);
    expect(r.rationale).toMatch(/\b7\b/);
    expect(r.rationale).toMatch(/\b15\b/);
  });

  it('a fully stated case carries no missing facts and its clock', () => {
    const r = classifySafetyReport({
      region: 'EU',
      serious: true,
      unexpected: true,
      suspectedCausality: true,
      fatalOrLifeThreatening: false,
    });
    expect(r.reportable).toBe(true);
    expect(r.timelineDays).toBe(15);
    expect(r.missing).toEqual([]);
  });

  it('the AnA tool relays not_assessed and the missing criteria for an unassessed case', () => {
    const r = dispatchGlobalRiTool('global_ri_safety_reporting', { region: 'FDA' }) as {
      reportable: unknown;
      missing: unknown;
      rationale: string;
    };
    expect(r.reportable).toBe('not_assessed');
    expect(r.missing).toEqual(['serious', 'unexpected', 'suspectedCausality']);
    expect(r.rationale).not.toMatch(/not serious/);
  });
});

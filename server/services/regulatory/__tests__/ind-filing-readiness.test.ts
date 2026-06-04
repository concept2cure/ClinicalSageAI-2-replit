/**
 * Unit tests for the IND filing-readiness engine.
 * Pure module — builds its status maps from the canonical required-section set.
 */

import { describe, it, expect } from 'vitest';

import { assessIndFilingReadiness } from '../ind-filing-readiness';
import { getRequiredSections, type SectionStatus } from '../../../../services/regulatory/ind-ectd-sections';

function allApproved(): Record<string, SectionStatus> {
  return Object.fromEntries(getRequiredSections().map(s => [s.code, 'approved' as SectionStatus]));
}

describe('assessIndFilingReadiness', () => {
  it('is ready_to_file when every required section is approved', () => {
    const r = assessIndFilingReadiness(allApproved());
    expect(r.overallReadiness).toBe('ready_to_file');
    expect(r.readyCount).toBe(r.requiredCount);
    expect(r.percentage).toBe(100);
    expect(r.blockers).toHaveLength(0);
  });

  it('covers all five modules', () => {
    const r = assessIndFilingReadiness(allApproved());
    expect(r.modules.map(m => m.module)).toEqual(['M1', 'M2', 'M3', 'M4', 'M5']);
  });

  it('flags gaps and surfaces not-started sections as blockers', () => {
    const status = allApproved();
    const firstCode = getRequiredSections()[0].code;
    status[firstCode] = 'not_started';
    const r = assessIndFilingReadiness(status);
    expect(r.overallReadiness).toBe('gaps');
    expect(r.blockers.some(b => b.code === firstCode)).toBe(true);
  });

  it('counts in-progress sections separately from blockers', () => {
    const status = allApproved();
    const code = getRequiredSections()[0].code;
    status[code] = 'drafting';
    const r = assessIndFilingReadiness(status);
    expect(r.overallReadiness).toBe('gaps');
    // A drafting section is in-progress, not a hard blocker.
    expect(r.blockers.some(b => b.code === code)).toBe(false);
    const mod = r.modules.find(m => m.module === getRequiredSections()[0].module)!;
    expect(mod.inProgressCount).toBeGreaterThanOrEqual(1);
  });

  it('treats an empty status map as all-not-started (every required section blocks)', () => {
    const r = assessIndFilingReadiness({});
    expect(r.overallReadiness).toBe('gaps');
    expect(r.readyCount).toBe(0);
    expect(r.blockers.length).toBe(r.requiredCount);
  });
});

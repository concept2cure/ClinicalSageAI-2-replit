/**
 * Study-design & sample-size advisor — unit tests. Deterministic; verifies
 * design resolution and normal-approximation sample-size estimates against
 * known textbook values (within rounding).
 */
import { describe, it, expect } from 'vitest';
import { adviseStudyDesign, estimateSampleSize, listStudyDesigns } from '../study-design';

describe('adviseStudyDesign', () => {
  it('explains the non-inferiority design and its margin requirement', () => {
    const r = adviseStudyDesign({ goal: 'non_inferiority' });
    expect(r.resolved.goal).toBe('non_inferiority');
    expect(r.brief.toLowerCase()).toContain('margin');
    expect(r.brief).toContain('one-sided');
  });

  it('resolves a design alias (noninferiority)', () => {
    const r = adviseStudyDesign({ goal: 'noninferiority' });
    expect(r.resolved.goal).toBe('non_inferiority');
  });

  it('lists the three comparative designs', () => {
    expect(listStudyDesigns().map(d => d.id)).toEqual(['superiority', 'non_inferiority', 'equivalence']);
  });
});

describe('estimateSampleSize', () => {
  it('continuous: ~64/arm for d=0.5 (SD=1, diff=0.5) at 80% power, two-sided 0.05', () => {
    const r = estimateSampleSize({ endpointFamily: 'continuous', sd: 1, meanDifference: 0.5, power: 0.8, alpha: 0.05 });
    // Classic result is 63-64 per arm.
    expect(r.perArm).toBeGreaterThanOrEqual(62);
    expect(r.perArm).toBeLessThanOrEqual(65);
    expect(r.total).toBe((r.perArm ?? 0) * 2);
  });

  it('binary: powers a 0.60 vs 0.40 comparison into a sensible per-arm n', () => {
    const r = estimateSampleSize({ endpointFamily: 'binary', p1: 0.6, p2: 0.4, power: 0.8, alpha: 0.05 });
    // Textbook ~ 97 per arm.
    expect(r.perArm).toBeGreaterThanOrEqual(90);
    expect(r.perArm).toBeLessThanOrEqual(105);
  });

  it('time-to-event: ~331 events for HR=0.7 at 90% power, two-sided 0.05 (Schoenfeld)', () => {
    const r = estimateSampleSize({ endpointFamily: 'time_to_event', hazardRatio: 0.7, power: 0.9, alpha: 0.05 });
    // Schoenfeld: 4*(z_a+z_b)^2/(ln HR)^2 ≈ 331 for HR=0.7 (≈508 for HR=0.75).
    expect(r.events).toBeGreaterThanOrEqual(325);
    expect(r.events).toBeLessThanOrEqual(338);
  });

  it('time-to-event: converts events to patients when an event probability is given', () => {
    const r = estimateSampleSize({ endpointFamily: 'time_to_event', hazardRatio: 0.7, power: 0.9, probEvent: 0.5 });
    expect(r.events).toBeGreaterThan(0);
    expect(r.perArm).toBeGreaterThan(0);
    expect(r.total).toBeGreaterThan(r.events ?? 0);
  });

  it('returns caveats and null estimate when inputs are insufficient', () => {
    const r = estimateSampleSize({ endpointFamily: 'continuous' });
    expect(r.perArm).toBeNull();
    expect(r.caveats.join(' ')).toContain('sd');
  });
});

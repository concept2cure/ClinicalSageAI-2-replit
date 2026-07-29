/**
 * Process validation + lot release tests.
 */

import { describe, it, expect } from 'vitest';
import {
  assessProcessValidation,
  computeProcessCapability,
  evaluateLotRelease,
} from '../process-validation';

describe('assessProcessValidation', () => {
  const ok = { protocolApproved: true, executed: true, passed: true, deviationsOpen: 0 };

  it('fully validated when IQ/OQ/PQ all pass', () => {
    const r = assessProcessValidation([
      { stage: 'iq', ...ok },
      { stage: 'oq', ...ok },
      { stage: 'pq', ...ok },
    ]);
    expect(r.fullyValidated).toBe(true);
    expect(r.furthestCompletedStage).toBe('pq');
  });

  it('blocks at OQ when OQ has an open deviation', () => {
    const r = assessProcessValidation([
      { stage: 'iq', ...ok },
      { stage: 'oq', ...ok, deviationsOpen: 1 },
      { stage: 'pq', ...ok },
    ]);
    expect(r.fullyValidated).toBe(false);
    expect(r.blockingStage).toBe('oq');
  });
});

describe('computeProcessCapability', () => {
  it('flags incapable process below target Cpk', () => {
    const r = computeProcessCapability({
      measurements: [9, 11, 8, 12, 10, 13, 7],
      lowerSpecLimit: 9,
      upperSpecLimit: 11,
    });
    expect(r.cpk).not.toBeNull();
    expect(r.capable).toBe(false);
  });

  it('capable process exceeds 1.33', () => {
    const r = computeProcessCapability({
      measurements: [10.0, 10.01, 9.99, 10.0, 10.02, 9.98],
      lowerSpecLimit: 9,
      upperSpecLimit: 11,
    });
    expect(r.capable).toBe(true);
  });
});

describe('evaluateLotRelease', () => {
  it('releases when all tests pass and DHR complete', () => {
    const r = evaluateLotRelease({
      lotId: 'L1',
      tests: [{ parameter: 'potency', result: 98, lowerLimit: 90, upperLimit: 110 }],
      deviceHistoryRecordComplete: true,
    });
    expect(r.disposition).toBe('released');
  });

  it('holds when DHR incomplete', () => {
    const r = evaluateLotRelease({
      lotId: 'L2',
      tests: [{ parameter: 'potency', result: 98, lowerLimit: 90 }],
      deviceHistoryRecordComplete: false,
    });
    expect(r.disposition).toBe('hold');
  });

  it('rejects on out-of-spec result', () => {
    const r = evaluateLotRelease({
      lotId: 'L3',
      tests: [{ parameter: 'potency', result: 50, lowerLimit: 90 }],
      deviceHistoryRecordComplete: true,
    });
    expect(r.disposition).toBe('rejected');
    expect(r.failures.length).toBeGreaterThan(0);
  });
});

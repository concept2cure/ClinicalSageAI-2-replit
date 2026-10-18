/**
 * The RIM feedback adjustment compares percentages with percentages
 * (finding 12, 2026-10-15).
 *
 * What the code used to do: getFeedbackSummary reports acceptanceRate and
 * resolutionRate as whole percentages (Math.round(x * 100)), and
 * computeRIMScore compared them with 0.7 and 0.5. The thresholds meant to be
 * 70 % and 50 % were 0.7 % and 0.5 %: with five or more feedback items and a
 * single acceptance or resolution, every RIM score gained +8 — enough to cross
 * a verdict boundary.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../db', () => ({ db: {}, pool: {}, getPool: () => ({}) }));
vi.mock('../../data-lineage-service', () => ({ persistEvidenceChain: vi.fn(async () => undefined) }));

import { computeRIMScore } from '../rim';
import type { JudgmentReport } from '../judgment-framework';
import type { FeedbackSummary } from '../learning-loop-service';

const JUDGMENT: JudgmentReport = {
  frameworkVersion: 'test',
  context: { organizationId: 1, projectId: 1 },
  scores: [],
  overallRisk: 80,
  overallVerdict: 'acceptable',
  topFindings: [],
  generatedAt: '2026-10-15T00:00:00.000Z',
};

function feedback(acceptanceRate: number, resolutionRate: number): FeedbackSummary {
  return {
    totalFeedback: 10,
    accepted: 1,
    dismissed: 8,
    resolved: 1,
    overridden: 0,
    acceptanceRate,
    resolutionRate,
    averageTimeToAction: null,
    topDismissedTypes: [],
    signalReliability: {
      validated: 0,
      partiallyValidated: 0,
      disputed: 0,
      totalValidations: 0,
      reliabilityIndex: null,
    },
  };
}

describe('computeRIMScore — feedback rates', () => {
  it('a 1 % acceptance and 1 % resolution rate earn no bonus', () => {
    expect(computeRIMScore(JUDGMENT, [], feedback(1, 1))).toBe(80);
  });

  it('70 % and 50 % are the thresholds; above them the bonus applies', () => {
    expect(computeRIMScore(JUDGMENT, [], feedback(70, 50))).toBe(80);
    expect(computeRIMScore(JUDGMENT, [], feedback(71, 51))).toBe(88);
  });

  it('no judgment score, no RIM score — feedback does not make one', () => {
    expect(computeRIMScore({ ...JUDGMENT, overallRisk: null }, [], feedback(90, 90))).toBeNull();
  });
});

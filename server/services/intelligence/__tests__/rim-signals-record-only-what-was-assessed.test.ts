/**
 * RIM signals record only what something assessed (finding 6, 2026-10-15).
 *
 * What the code used to do:
 *   - interceptArtifactChange recorded every artifact create or update as a
 *     signal with verdict 'pass', score 80 and confidence 95. Nothing had
 *     assessed the edit.
 *   - interceptFeedback mapped accept / edit / reject / regenerate to scores
 *     90 / 60 / 20 / 10 at confidence 90, with the action "Output accepted —
 *     intelligence validated".
 *   - interceptChatResponse stamped confidence 60 on the claim-support signal,
 *     and turned a non-finite claim rate into 0.5 (a score of 50).
 *   - getSignalSummary averaged those figures, reported 0 for an empty store,
 *     called the trend 'stable' when it had too few signals to tell, and gave
 *     an empty store a period of "now".
 *   - persistSignals stamped the stored summary with confidenceScore 0.95.
 * AnA's chat prompt then cited the invented averages as signal evidence.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ inserted: [] as Array<Record<string, unknown>> }));

// Side effects of the feedback interceptor that are not under test here.
vi.mock('../../ana-capability-registry', () => ({ logOutcome: vi.fn(async () => {}) }));
vi.mock('../rim-pattern-store', () => ({ recordPattern: vi.fn(async () => null) }));

// persistSignals reads the project's profile and inserts one memory row.
vi.mock('../../../db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 5 }] }) }) }),
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        h.inserted.push(v);
      },
    }),
  },
}));

import {
  interceptArtifactChange,
  interceptChatResponse,
  interceptFeedback,
} from '../rim-interceptors';
import { captureSignal, getSignalSummary, persistSignals, querySignals } from '../signal-capture';
import { JUDGMENT_FRAMEWORK_VERSION } from '../judgment-framework';

const ORG = 4242;
let nextProject = 100;
const project = () => ++nextProject;

const provenance = (runId: string) => ({
  judgmentFrameworkVersion: JUDGMENT_FRAMEWORK_VERSION,
  patternRegistryVersion: 'test',
  runId,
  runType: 'full_assessment' as const,
});

function judgmentSignal(projectId: number, score: number, runId: string) {
  return captureSignal({
    type: 'judgment',
    provenance: provenance(runId),
    organizationId: ORG,
    projectId,
    riskLevel: 'medium',
    reviewerSensitivity: 'possible_question',
    defensibilityVerdict: 'needs_attention',
    score,
    confidence: null,
    action: 'Review the section',
    patternIds: [],
    metadata: {},
  });
}

beforeEach(() => {
  h.inserted.length = 0;
});

describe('interceptors record no verdict, score or confidence nothing computed', () => {
  it('an artifact edit is an event, not a passing judgment', () => {
    const projectId = project();
    interceptArtifactChange({
      organizationId: ORG,
      projectId,
      artifactId: 'art-1',
      changeType: 'update',
      title: 'Clinical overview',
      contentLength: 12,
      source: 'manual',
    });
    const recorded = querySignals({ organizationId: ORG, projectId });
    expect(recorded.map(s => [s.type, s.defensibilityVerdict, s.score, s.confidence])).toEqual([]);
  });

  it('user feedback is not turned into a score, a confidence or "intelligence validated"', () => {
    const projectId = project();
    interceptFeedback({ organizationId: ORG, projectId, userId: 7, feedbackType: 'accepted' });
    interceptFeedback({ organizationId: ORG, projectId, userId: 7, feedbackType: 'regenerated' });
    const recorded = querySignals({ organizationId: ORG, projectId });
    expect(recorded.map(s => [s.type, s.score, s.confidence, s.action])).toEqual([]);
  });

  it('the chat claim-support signal carries the measured rate and no invented confidence', () => {
    const projectId = project();
    interceptChatResponse({
      organizationId: ORG,
      projectId,
      assistantMessage: 'The pharmacokinetic parameters were derived with validated methods.',
      claimCount: 4,
      supportedClaimRate: 0.75,
      model: 'm',
      provider: 'p',
    });
    // A check result, not a judgment (2026-10-15: this read type 'judgment').
    const [signal] = querySignals({ organizationId: ORG, projectId, type: 'claim_check' });
    expect(signal.score).toBe(75);
    expect(signal.confidence).toBeNull();
  });

  it('a non-finite claim rate records nothing, not a 50', () => {
    const projectId = project();
    interceptChatResponse({
      organizationId: ORG,
      projectId,
      assistantMessage: 'The pharmacokinetic parameters were derived with validated methods.',
      claimCount: 3,
      supportedClaimRate: Number.NaN,
      model: 'm',
      provider: 'p',
    });
    const recorded = querySignals({ organizationId: ORG, projectId, type: 'claim_check' });
    expect(recorded.map(s => s.score)).toEqual([]);
  });
});

describe('the signal summary reports what it does not know', () => {
  it('an empty store has no average, no trend and no period', () => {
    const summary = getSignalSummary(ORG, project());
    expect(summary.averageScore).toBeNull();
    expect(summary.averageConfidence).toBeNull();
    expect(summary.overallTrend).toBeNull();
    expect(summary.periodStart).toBeNull();
    expect(summary.periodEnd).toBeNull();
  });

  it('three judgment signals are too few for a trend: none is stated', () => {
    const projectId = project();
    judgmentSignal(projectId, 40, 'r1');
    judgmentSignal(projectId, 50, 'r2');
    judgmentSignal(projectId, 60, 'r3');
    const summary = getSignalSummary(ORG, projectId);
    expect(summary.trendConfidence).toBe('insufficient');
    expect(summary.overallTrend).toBeNull();
    expect(summary.averageScore).toBe(50);
    // No signal carries a computed confidence, so there is no average of one.
    expect(summary.averageConfidence).toBeNull();
  });

  it('the persisted summary carries no confidence nobody computed', async () => {
    const projectId = project();
    judgmentSignal(projectId, 30, 'r4');
    const result = await persistSignals(ORG, projectId, 'run-persist');
    expect(result.success).toBe(true);
    expect(h.inserted).toHaveLength(1);
    expect(h.inserted[0].confidenceScore).toBeNull();
  });
});

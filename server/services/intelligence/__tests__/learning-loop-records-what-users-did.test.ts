/**
 * The learning loop stores what the user did, fails loudly when it cannot
 * read, and does not dress its own inferences up as user verification
 * (finding 13, 2026-10-15).
 *
 * What the code used to do:
 *   - recordFeedback returned without storing anything when the project had
 *     no intelligence profile; the route still answered {success: true}.
 *   - getFeedbackSummary and getSignalReliability turned any read failure
 *     into a zeroed summary ("0 feedback, 0 % acceptance", no validations).
 *   - linkFeedbackToRecentSignals wrote its inference — "the user accepted the
 *     output, so the earlier signals were validated" — with isVerifiedByUser
 *     true and confidenceScore 1.0. That feeds the reliability index shown
 *     with every chat answer.
 *   - a dismissal comment was stored as a learned insight at confidence 0.95.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  selectRows: [] as unknown[][],
  selectError: null as Error | null,
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../../db', () => {
  const chain = () => {
    const c: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy']) c[m] = () => c;
    c.limit = async () => {
      if (h.selectError) throw h.selectError;
      return h.selectRows.shift() ?? [];
    };
    return c;
  };
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          h.inserts.push(values);
          return Object.assign(Promise.resolve(undefined), { returning: async () => [{ id: 9 }] });
        },
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            h.updates.push(values);
          },
        }),
      }),
    },
  };
});

import {
  getFeedbackSummary,
  getSignalReliability,
  linkFeedbackToRecentSignals,
  recordFeedback,
} from '../learning-loop-service';
import { captureSignal } from '../signal-capture';

const ORG = 61;
const PROJECT = 62;

const FEEDBACK = {
  recommendationId: 'rec-1',
  recommendationType: 'evidence_gap',
  userId: 7,
  projectId: PROJECT,
  organizationId: ORG,
};

beforeEach(() => {
  h.selectRows = [];
  h.selectError = null;
  h.inserts.length = 0;
  h.updates.length = 0;
});

describe('recordFeedback', () => {
  it('stores the feedback when the project has no profile yet (it used to be dropped)', async () => {
    h.selectRows = [[]]; // no profile row
    await recordFeedback({ ...FEEDBACK, action: 'accepted' });
    const stored = h.inserts.filter(v => v.category === 'recommendation_feedback');
    expect(stored.map(v => v.projectProfileId)).toEqual([9]);
  });

  it('a dismissal comment is kept as the user said it, with no invented confidence', async () => {
    h.selectRows = [[{ id: 4 }], [{ learnedInsights: [] }]];
    await recordFeedback({ ...FEEDBACK, action: 'dismissed', userComment: 'Not relevant to this IND' });
    const insights = h.updates[0]?.learnedInsights as Array<Record<string, unknown>>;
    expect(insights.map(i => [i.source, i.confidence])).toEqual([['user_feedback', null]]);
  });
});

describe('a failed read is an error, not an empty summary', () => {
  it('getFeedbackSummary rejects instead of answering "0 feedback, 0 % acceptance"', async () => {
    h.selectError = new Error('connection terminated unexpectedly');
    await expect(getFeedbackSummary(PROJECT, ORG)).rejects.toThrow('connection terminated');
  });

  it('getSignalReliability rejects instead of answering "no validations"', async () => {
    h.selectError = new Error('connection terminated unexpectedly');
    await expect(getSignalReliability(PROJECT, ORG)).rejects.toThrow('connection terminated');
  });

  it('the reliability figure says it is inferred from user feedback (the chat badge carries it)', async () => {
    h.selectRows = [[{ subcategory: 'accepted', content: JSON.stringify({ verdict: 'validated', signalIds: ['s1'] }) }]];
    const reliability = await getSignalReliability(PROJECT, ORG);
    expect(reliability.reliabilityIndex).toBe(1);
    expect(reliability.basis).toBe('inferred_from_user_feedback');
  });
});

describe('linkFeedbackToRecentSignals', () => {
  it('records its inference as an inference: not user-verified, no confidence', async () => {
    captureSignal({
      type: 'pattern_match',
      provenance: { judgmentFrameworkVersion: 't', patternRegistryVersion: 't', runId: 'r1', runType: 'pattern_scan' },
      organizationId: ORG,
      projectId: PROJECT,
      artifactId: 'art-9',
      riskLevel: 'high',
      reviewerSensitivity: 'likely_question',
      defensibilityVerdict: 'at_risk',
      score: 40,
      confidence: null,
      action: 'Quantify the claim',
      patternIds: ['RT-001'],
      metadata: {},
    });
    h.selectRows = [[{ id: 5 }]];
    await linkFeedbackToRecentSignals({
      organizationId: ORG,
      projectId: PROJECT,
      artifactId: 'art-9',
      feedbackType: 'accepted',
      userId: 7,
    });
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0].category).toBe('intelligence_signal_validation');
    expect(h.inserts[0].isVerifiedByUser).toBe(false);
    expect(h.inserts[0].confidenceScore).toBeNull();
  });
});

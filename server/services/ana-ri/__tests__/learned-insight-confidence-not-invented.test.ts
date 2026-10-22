/**
 * A learned insight is shown to AnA with a confidence only when one was
 * computed (finding 13 consumer, 2026-10-15).
 *
 * What the code used to do: every learned insight was printed with
 * "confidence: N%", where N was a constant stamped by its writer — 0.95 for a
 * user's dismissal comment (learning-loop-service), 0.7 for any sentence
 * extracted from a conversation. Those writers now store null, and the prompt
 * printed a null as "confidence: 0%".
 */
import { describe, expect, it } from 'vitest';

import { orchestrate } from '../orchestrator.js';

type Profile = NonNullable<Parameters<typeof orchestrate>[0]['_projectIntelligenceProfile']>;

const PROFILE: Profile = {
  profileId: 1,
  projectId: 1,
  organizationId: 1,
  regulatoryStrategy: null,
  targetIndication: null,
  targetPopulation: null,
  riskFactors: [],
  openQuestions: [],
  keyDecisions: [],
  learnedInsights: [
    {
      insight: 'User dismissed evidence_gap recommendation: "Not relevant to this IND"',
      source: 'user_feedback',
      confidence: null,
      extractedAt: '2026-10-15T00:00:00.000Z',
    },
  ],
  documentStats: { totalIngested: 0, totalTokens: 0, lastIngestedAt: null },
  memoryEntryCount: 0,
  profileStatus: 'active',
  lastEnrichedAt: null,
};

describe('learned insights in the project intelligence block', () => {
  it('prints no confidence for an insight that has none', () => {
    const prompt = orchestrate({ message: 'What did we learn?', _projectIntelligenceProfile: PROFILE }).systemPrompt;
    expect(prompt).toContain(
      '- User dismissed evidence_gap recommendation: "Not relevant to this IND" (source: user_feedback)',
    );
    expect(prompt).not.toContain('confidence: 0%');
  });
});

/**
 * The recommendation engine says which generators failed and which types it
 * checked, and scores nothing it did not score (finding 11, 2026-10-15).
 *
 * What the code used to do:
 *   - every profile risk was stamped confidence 75 and every open question 65
 *     (sourceType 'ai_inferred'); nothing computed either figure.
 *   - a failed generator read was only logged: with every read failing the set
 *     was totalGenerated 0 with no failure marker, indistinguishable from
 *     "nothing to recommend" (the profile generator even swallowed its own error).
 *   - a milestone with no recorded progress read "(0% complete)".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  profileRows: [] as unknown[],
  profileError: null as Error | null,
  execute: vi.fn(),
}));

vi.mock('../../../db', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where']) chain[m] = () => chain;
  chain.limit = async () => {
    if (h.profileError) throw h.profileError;
    return h.profileRows;
  };
  return { db: { select: () => chain, execute: h.execute } };
});

import { generateRecommendations } from '../recommendation-engine';

const CTX = { organizationId: 3, projectId: 4, triggeredBy: 'test' };

const ENRICHED_PROFILE = {
  id: 11,
  lastEnrichedAt: new Date('2026-10-01T00:00:00Z'),
  riskFactors: [{ risk: 'Hepatotoxicity signal', likelihood: 'medium', impact: 'high' }],
  openQuestions: [{ question: 'Is the comparator adequate?', priority: 'high' }],
};

beforeEach(() => {
  h.profileRows = [];
  h.profileError = null;
  h.execute.mockReset();
  h.execute.mockResolvedValue({ rows: [] });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('generateRecommendations', () => {
  it('stamps no confidence on profile risks and questions nobody scored', async () => {
    h.profileRows = [ENRICHED_PROFILE];
    const set = await generateRecommendations(CTX);
    expect(set.recommendations.map(r => [r.type, r.sourceType, r.confidence])).toEqual([
      ['risk_mitigation', 'ai_inferred', null],
      ['evidence_gap', 'ai_inferred', null],
    ]);
  });

  it('names every generator whose read failed', async () => {
    h.profileError = new Error('connection terminated');
    h.execute.mockRejectedValue(new Error('connection terminated'));
    const set = await generateRecommendations(CTX);
    expect(set.totalGenerated).toBe(0);
    expect(set.failedGenerators).toEqual(['project_profile', 'stale_drafts', 'program_milestones']);
    expect(set.assessedTypes).toEqual([]);
  });

  it('lists the types it checked; a never-filled profile checks none of its types', async () => {
    h.profileRows = [{ id: 12, lastEnrichedAt: null, riskFactors: [], openQuestions: [] }];
    const set = await generateRecommendations(CTX);
    expect([...set.assessedTypes].sort()).toEqual(['incomplete_section', 'readiness_blocker']);
    expect(set.failedGenerators).toEqual([]);
  });

  it('a milestone with no recorded progress says so, not "0% complete"', async () => {
    h.execute.mockImplementation(async (query: unknown) =>
      /program_milestones/.test(JSON.stringify(query))
        ? { rows: [{ id: 'm1', name: 'Pre-IND package', target_date: '2026-01-01', status: 'pending', progress: null }] }
        : { rows: [] },
    );
    const set = await generateRecommendations(CTX);
    const milestone = set.recommendations.find(r => r.targetObjectType === 'milestone');
    expect(milestone?.reason).toBe('Milestone "Pre-IND package" is overdue (progress not recorded)');
  });
});

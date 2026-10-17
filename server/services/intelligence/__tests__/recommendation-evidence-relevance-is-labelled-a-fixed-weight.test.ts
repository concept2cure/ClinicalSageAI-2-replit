/**
 * A recommendation's evidence relevance says what it is: a fixed weight per
 * kind of evidence, not a measurement.
 *
 * Each generator stamped its evidence with a constant — 0.85 for a profile
 * risk, 0.7 for an open question, 0.9 for a stale draft, 1.0 for a milestone —
 * and the output carried it as the evidence's relevance (0-1) with nothing to
 * say no one measured it. Nothing computes a relevance for these sources
 * (evidence-confidence-model.ts takes one as input; it derives none). Every
 * evidence reference now carries relevanceBasis 'fixed_weight'.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ profileRows: [] as unknown[], execute: vi.fn() }));

vi.mock('../../../db', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where']) chain[m] = () => chain;
  chain.limit = async () => h.profileRows;
  return { db: { select: () => chain, execute: h.execute } };
});

import { generateRecommendations } from '../recommendation-engine';

beforeEach(() => {
  h.profileRows = [{
    id: 11,
    lastEnrichedAt: new Date('2026-10-01T00:00:00Z'),
    riskFactors: [{ risk: 'Hepatotoxicity signal', likelihood: 'medium', impact: 'high' }],
    openQuestions: [{ question: 'Is the comparator adequate?', priority: 'high' }],
  }];
  h.execute.mockReset().mockImplementation(async (query: unknown) => {
    const text = JSON.stringify(query);
    if (/program_milestones/.test(text)) {
      return { rows: [{ id: 'm1', name: 'Pre-IND package', target_date: '2026-01-01', status: 'pending', progress: 40 }] };
    }
    if (/FROM documents/.test(text)) {
      return { rows: [{ id: 'd1', title: 'Clinical overview', status: 'draft', updated_at: '2026-09-01', document_type: 'm2' }] };
    }
    return { rows: [] };
  });
});

describe('generateRecommendations — evidence relevance', () => {
  it('labels every evidence relevance a fixed weight, from each of the four generators', async () => {
    const set = await generateRecommendations({ organizationId: 3, projectId: 4, triggeredBy: 'test' });

    expect(set.recommendations.map(r => r.type).sort()).toEqual(
      ['evidence_gap', 'incomplete_section', 'readiness_blocker', 'risk_mitigation'],
    );
    for (const rec of set.recommendations) {
      for (const evidence of rec.evidence) {
        expect(evidence, `${rec.type}: relevance ${evidence.relevance} presented as a measurement`).toHaveProperty('relevanceBasis', 'fixed_weight');
      }
    }
  });
});

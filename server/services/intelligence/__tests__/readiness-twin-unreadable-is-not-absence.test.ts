/**
 * A readiness assessment that could not be read is not "no assessment on
 * record", and a module's gap count is one somebody listed.
 *
 * gatherTwinAssessment caught every failure of the twin read and returned null,
 * and a failed ownership check rejected inside Promise.allSettled and was
 * dropped the same way. Either one came out as scoreBasis / predictions basis
 * 'no_assessment_on_record' — a statement about the record that nobody had
 * read. And moduleBreakdown[].gapCount was invented from the module score:
 * 3 gaps below 50, 1 below 75, 0 otherwise, with no gap list behind any of it.
 *
 * Now a failed read is 'twin_unreadable' (its dimensions stay null), and
 * gapCount is null. A program that is not this organization's, or a twin table
 * that does not exist, still has no assessment on record.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ owns: vi.fn(), twin: vi.fn() }));

/** The text of a drizzle sql`` object: its string chunks. */
function textOf(q: unknown): string {
  const chunks = (q as { queryChunks?: Array<{ value?: unknown }> }).queryChunks ?? [];
  return chunks.map((c) => (Array.isArray(c.value) ? c.value.join('') : ' ? ')).join('');
}

vi.mock('../../../db.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    execute: async (q: unknown) => {
      const text = textOf(q);
      if (/readiness_twin_assessments/.test(text)) return h.twin();
      if (/COUNT\(\*\)/.test(text)) return { rows: [{ total: '4', approved: '2', in_review: '1', draft: '1' }] };
      return { rows: [] };
    },
  },
  getPool: () => ({ query: vi.fn() }),
}));
vi.mock('../../c2c/program-access.js', () => ({ programInOrganization: h.owns }));

const { computeReadinessScore, describeReadiness } = await import('../readiness-scoring-engine');

const CTX = { organizationId: 1, projectId: 10, programId: '33333333-3333-4333-8333-333333333333' };

beforeEach(() => {
  h.owns.mockReset().mockResolvedValue(true);
  h.twin.mockReset().mockResolvedValue({ rows: [] });
});

describe('computeReadinessScore — the twin read', () => {
  it('a failed ownership check is twin_unreadable, not no_assessment_on_record', async () => {
    h.owns.mockRejectedValue(new Error('connection terminated'));
    const score = await computeReadinessScore(CTX);
    expect(score.scoreBasis.source).toBe('twin_unreadable');
    expect(score.predictions.basis).toBe('twin_unreadable');
    expect(score.dimensions).toEqual({ completeness: 75, quality: null, consistency: null, compliance: null });
    expect(describeReadiness(score)).toMatch(/could not be read/);
  });

  it('a failed assessment query is twin_unreadable', async () => {
    h.twin.mockRejectedValue(Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }));
    const score = await computeReadinessScore(CTX);
    expect(score.scoreBasis.source).toBe('twin_unreadable');
  });

  it('a program that is not this organization’s has no assessment on record here', async () => {
    h.owns.mockResolvedValue(false);
    const score = await computeReadinessScore(CTX);
    expect(score.scoreBasis.source).toBe('no_assessment_on_record');
  });

  it('a twin table that does not exist holds no assessment', async () => {
    h.twin.mockRejectedValue(Object.assign(new Error('relation does not exist'), { code: '42P01' }));
    const score = await computeReadinessScore(CTX);
    expect(score.scoreBasis.source).toBe('no_assessment_on_record');
  });
});

describe('computeReadinessScore — module breakdown', () => {
  it('gapCount is null: the assessment lists no gaps per module, so none is invented from the score', async () => {
    h.twin.mockResolvedValue({
      rows: [{ overall_readiness_score: 60, quality_score: 70, consistency_score: 65, compliance_score: 80, module_scores: { module_1: 95, module_2: 70, module_3: 40 } }],
    });
    const score = await computeReadinessScore(CTX);
    expect(score.scoreBasis.source).toBe('twin_assessment');
    expect(score.moduleBreakdown.map((m) => [m.modulePath, m.score, m.gapCount])).toEqual([
      ['module_1', 95, null],
      ['module_2', 70, null],
      ['module_3', 40, null],
    ]);
  });
});

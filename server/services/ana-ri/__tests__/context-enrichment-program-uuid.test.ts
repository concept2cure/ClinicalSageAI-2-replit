/**
 * The per-turn project-profile read takes the program's anchored project, not NaN.
 *
 * QA 2026-10-08 (j5, "AnA's relational overlay fails silently on every project
 * turn"): in the same turn as the relational overlay, a second query failed —
 * `select … from project_intelligence_profiles where project_id = $1 …` with
 * params `NaN,1,1`. Its caller is enrichWithProjectSummary, the always-on
 * 'project-profile' read of enrichContextForChat, which did
 * getProjectIntelligence(Number(projectId)) on the composer's program UUID.
 * The failure then marked project context unavailable on every turn.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ summary: vi.fn(), query: vi.fn(), ref: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));
vi.mock('../../../db', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));
vi.mock('../../intelligence/project-intelligence-service.js', () => ({ getProjectIntelligence: h.summary }));
vi.mock('../../c2c/project-ref.js', () => ({ integerProjectForRef: h.ref }));
import { enrichContextForChat } from '../context-enrichment';

const PROGRAM = '099991d1-dac8-43c5-b88a-8baab26194ee';
const PROFILE = {
  regulatoryStrategy: 'Bridge to the adult dose', riskFactors: [], openQuestions: [], keyDecisions: [],
  learnedInsights: [], documentStats: { totalIngested: 0 }, memoryEntryCount: 0,
};

beforeEach(() => {
  h.summary.mockReset().mockResolvedValue(PROFILE);
  h.query.mockReset().mockResolvedValue({ rows: [] });
  h.ref.mockReset();
});

describe('enrichContextForChat — project profile for a program UUID', () => {
  it('reads the profile of the project the program is anchored to', async () => {
    h.ref.mockResolvedValue(11);
    const result = await enrichContextForChat({ message: 'What is left before filing?', projectId: PROGRAM, organizationId: 1 });
    expect(h.ref).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ref: PROGRAM, orgId: 1 }));
    expect(h.summary).toHaveBeenCalledWith(11, 1);
    expect(result.block).toContain('Bridge to the adult dose');
    expect(result.enrichmentMeta?.unavailableSources ?? []).not.toContain('project-profile');
  });

  it('an unanchored program has no profile — nothing read with NaN, nothing reported missing', async () => {
    h.ref.mockResolvedValue(null);
    const result = await enrichContextForChat({ message: 'What is left before filing?', projectId: PROGRAM, organizationId: 1 });
    expect(h.summary).not.toHaveBeenCalled();
    expect(result.enrichmentMeta?.unavailableSources ?? []).not.toContain('project-profile');
  });
});

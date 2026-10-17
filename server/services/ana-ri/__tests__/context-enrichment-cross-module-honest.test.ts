/**
 * The cross-module block tells the model what each line rests on, and a
 * failed analysis is reported, not dropped (2026-10-15, finding 18 at its
 * consumer).
 *
 * What the code used to do: a failed analysis was caught and returned '', a
 * healthy empty, so the enrichment budget never marked 'consistency'
 * unavailable; and a report was handed over with the instruction "Highlight
 * stale references, status gaps, and orphaned documents" — the names the
 * detectors gave pairs of documents no link between which was checked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn(), cross: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));
vi.mock('../../../db', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));
vi.mock('../../intelligence/project-intelligence-service.js', () => ({ getProjectIntelligence: async () => null }));
vi.mock('../workflow-orchestration.js', () => ({ buildWorkflowContext: async () => '' }));
vi.mock('../../intelligence/cross-module-intelligence.js', () => ({ analyzeCrossModuleRelationships: h.cross }));

import { enrichContextForChat } from '../context-enrichment';

const INPUT = { message: '/consistency', projectId: 42, organizationId: 7, submissionType: 'IND' };

beforeEach(() => {
  h.query.mockReset().mockResolvedValue({ rows: [] });
  h.cross.mockReset();
});

describe('the cross-module enrichment', () => {
  it('reports a failed analysis as unavailable instead of saying nothing', async () => {
    h.cross.mockRejectedValue(new Error('column el.source_id does not exist'));
    const result = await enrichContextForChat(INPUT);
    expect(result.enrichmentMeta?.unavailableSources).toContain('consistency');
  });

  it('labels a co-occurrence observation as one', async () => {
    h.cross.mockResolvedValue({
      projectId: 42,
      insights: [
        {
          insightId: 'status-co-occurrence-1-2',
          type: 'status_co_occurrence',
          severity: 'low',
          basis: 'co_occurrence_heuristic',
          sourceDocumentId: '1',
          sourceDocumentTitle: 'Protocol',
          targetDocumentId: '2',
          targetDocumentTitle: 'Cover letter',
          description: '"Protocol" is approved while "Cover letter" in the same project is a draft.',
          suggestedResolution: '',
          detectedAt: '2026-10-15T00:00:00.000Z',
        },
      ],
      totalInsights: 1,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 1 },
      documentsCovered: 2,
      documentsExamined: 4,
      analyzedAt: '2026-10-15T00:00:00.000Z',
    });
    const result = await enrichContextForChat(INPUT);
    expect(result.block).toContain('co-occurrence observation');
    expect(result.block).toContain('from 4 documents examined');
    expect(result.block).not.toMatch(/Highlight stale references, status gaps/);
  });
});

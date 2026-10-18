/**
 * A module with no required-section list is not assessed, and not scored.
 *
 * computeModuleBreakdown used to score every module against EXPECTED_DOCS
 * (3/5/4/3/4), minimums nothing sourced: ten unvalidated documents in a module
 * whose completeness nobody measured read score 100, status 'ready',
 * expectedDocumentCount 3 (VSR finding #12, 2026-10-15).
 */
import { describe, expect, it } from 'vitest';
import { computeReadinessAssessment } from '../readiness-engine';
import type { CrossObjectReasoningPayload, ModulePlacementSnapshot } from '../../../../shared/types/orchestration';

function payload(moduleMap: ModulePlacementSnapshot[]): CrossObjectReasoningPayload {
  return {
    project: {
      id: 7, name: 'BX-114 IND', status: 'active', progress: 0,
      totalDocuments: 0, totalTasks: 0, doneTasks: 0, blockedTasks: 0, overdueTasks: 0, taskCountsPartial: false,
    },
    documents: [], artifacts: [], validations: [], tasks: [],
    moduleMap, recentActions: [], evidence: [],
    cmcSignals: {
      sourceObjectCount: 0, sourceTypeBreakdown: {}, sectionCount: 0, staleSectionCount: 0,
      contradictions: [],
      contradictionCounts: { critical: 0, high: 0, medium: 0, low: 0, open: 0, resolved: 0 },
    },
    assembledAt: '2026-10-15T00:00:00.000Z',
    lastSignalAt: null,
    scope: { organizationId: 3, projectId: 7 },
  };
}

describe('module breakdown', () => {
  it('reports a module with no required-section list as not assessed, by its counts only', () => {
    const [m4] = computeReadinessAssessment(payload([{
      module: 'Module 4', documentCount: 10, artifactCount: 10, completenessPercent: null,
      hasValidation: false, missingItems: ['Completeness not assessed — no required-section list for Module 4'],
    }])).moduleBreakdown;
    expect(m4).toMatchObject({ module: 'Module 4', documentCount: 10, score: null, status: 'not_assessed', assessedAgainst: null });
    expect(m4).not.toHaveProperty('expectedDocumentCount');
  });

  it('scores a measured module on its completeness and validation coverage', () => {
    const [m3] = computeReadinessAssessment(payload([{
      module: 'Module 3', documentCount: 0, artifactCount: 0, completenessPercent: 50,
      assessedAgainst: '8 of 16 composed Module 3 sections approved', hasValidation: true, missingItems: [],
    }])).moduleBreakdown;
    expect(m3).toMatchObject({ score: 20, status: 'in_progress', assessedAgainst: '8 of 16 composed Module 3 sections approved' });
  });
});

/**
 * A module is a readiness gap only against a denominator something measured.
 *
 * What the engine used to do (VSR finding #12, 2026-10-15): analyzeModuleGaps
 * compared each module's document count with MIN_DOCS_PER_MODULE — 3/5/4/3/4,
 * minimums nothing sourced — and reported "Module 4 has 2/3 expected documents."
 * with "Expected minimum: 3", at severity high (critical at zero), while the same
 * card's evidence said "Completeness: not assessed — no required-section list
 * for this module". lumen-context-builder prints the top five reasons into
 * every AnA system prompt.
 *
 * Now: Module 3 is measured against the composed section set (the denominator
 * the export gate enforces, cross-object-resolver.ts); every other module has no
 * required-section list, so it is reported by its document count, with
 * completeness not assessed, and no expected count is claimed for it.
 */
import { describe, expect, it } from 'vitest';
import { generateRecommendations } from '../recommendation-engine';
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

function unassessed(module: string, documentCount: number): ModulePlacementSnapshot {
  return {
    module, documentCount, artifactCount: documentCount, completenessPercent: null, hasValidation: false,
    missingItems: documentCount === 0
      ? [`No documents assigned to ${module}`]
      : [`Completeness not assessed — no required-section list for ${module}`],
  };
}

function module3(completenessPercent: number, documentCount: number, approved: number, total: number): ModulePlacementSnapshot {
  return {
    module: 'Module 3', documentCount, artifactCount: documentCount, completenessPercent,
    assessedAgainst: `${approved} of ${total} composed Module 3 sections approved`,
    hasValidation: true,
    missingItems: approved < total ? ['3.2.S.4 — not approved (draft)'] : [],
  };
}

const MIXED = payload([
  unassessed('Module 1', 2),
  unassessed('Module 2', 6),
  module3(25, 2, 4, 16),
  unassessed('Module 4', 0),
]);

const gapFor = (set: ReturnType<typeof generateRecommendations>, module: string) =>
  set.recommendations.find((r) => r.recommendationType === 'readiness_gap' && r.targetObjectId === module);

describe('module gaps are measured, never counted against an invented minimum', () => {
  it('claims no expected document count anywhere', () => {
    const set = generateRecommendations(MIXED);
    const claims = set.recommendations
      .flatMap((r) => [r.reason, ...r.evidence])
      .filter((line) => /expected/i.test(line));
    expect(claims).toEqual([]);
  });

  it('raises no gap for a module that holds documents and whose completeness was not assessed', () => {
    const set = generateRecommendations(MIXED);
    expect(gapFor(set, 'Module 1')).toBeUndefined();
    expect(gapFor(set, 'Module 2')).toBeUndefined();
  });

  it('measures Module 3 against its composed section set', () => {
    const gap = gapFor(generateRecommendations(MIXED), 'Module 3');
    expect(gap?.reason).toContain('4 of 16 composed Module 3 sections approved');
    expect(gap?.severity).toBe('high');
    expect(gap?.evidence).toContain('3.2.S.4 — not approved (draft)');
  });

  it('raises no gap for a module measured complete, however few documents it holds', () => {
    const set = generateRecommendations(payload([module3(100, 1, 16, 16)]));
    expect(gapFor(set, 'Module 3')).toBeUndefined();
  });

  it('reports an empty module as empty, with its completeness not assessed', () => {
    const gap = gapFor(generateRecommendations(MIXED), 'Module 4');
    expect(gap?.reason).toMatch(/Module 4 has no documents/);
    expect(gap?.evidence.join(' ')).toMatch(/not assessed/);
  });

  it('does not call a project clean without saying which modules were never measured', () => {
    const set = generateRecommendations(payload([
      unassessed('Module 1', 3),
      unassessed('Module 2', 5),
      module3(100, 4, 16, 16),
      unassessed('Module 4', 3),
      unassessed('Module 5', 4),
    ]));
    expect(set.recommendations).toHaveLength(1);
    const [card] = set.recommendations;
    expect(card.recommendationType).toBe('next_best_action');
    expect(card.evidence.join(' ')).toMatch(/not assessed for Module 1, Module 2, Module 4, Module 5/);
  });
});

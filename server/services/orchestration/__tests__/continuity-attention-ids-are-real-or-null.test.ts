/**
 * "Needs attention" carries a blocker's id only when it has a numeric one.
 *
 * identifyNeedsAttention used to write `id: 0` for every blocker whose target
 * id is not a number — an empty CTD module ('Module 4') or a CMC contradiction
 * (a uuid) — so the briefing pointed at object 0, which does not exist
 * (VSR finding #36, 2026-10-15). The id is now null there: no link is built.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../db', () => {
  function chain(): any {
    const builder: any = new Proxy(function () {}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve);
        }
        return () => builder;
      },
    });
    return builder;
  }
  return { db: { select: () => chain(), execute: async () => ({ rows: [] }) } };
});
vi.mock('../cross-object-resolver', () => ({
  assembleCrossObjectPayload: async ({ projectId }: { projectId: number }) => ({
    project: { id: projectId, name: 'BX-114 IND', totalTasks: 0, doneTasks: 0, blockedTasks: 0, taskCountsPartial: false },
    documents: [],
    validations: [],
  }),
}));
vi.mock('../readiness-engine', () => ({
  computeReadinessAssessment: () => ({
    overallScore: 40,
    status: 'needs_attention',
    blockers: [
      {
        severity: 'major', category: 'missing_document', message: 'Module 4 has no documents assigned',
        targetType: 'module', targetId: 'Module 4', targetTitle: 'Module 4',
        suggestedResolution: 'Draft or route content to Module 4',
      },
      {
        severity: 'critical', category: 'validation_failure', message: 'CMC spec conflict: assay limits disagree',
        targetType: 'cmc_contradiction', targetId: '5f0c2a1e-1111-4222-8333-944455556666',
        suggestedResolution: 'Resolve the underlying CMC source data',
      },
      {
        severity: 'critical', category: 'validation_failure', message: 'CMC Overview has 2 critical validation finding(s)',
        targetType: 'document', targetId: 104, targetTitle: 'CMC Overview',
        suggestedResolution: 'Run AI-assisted refinement to address critical findings',
      },
    ],
  }),
}));
vi.mock('../recommendation-engine', () => ({ generateRecommendations: () => ({ recommendations: [] }) }));

import { generateContinuitySnapshot } from '../continuity-service';

describe('continuity briefing — needs attention', () => {
  it('gives a blocker with no numeric target id no id, rather than 0', async () => {
    const briefing = await generateContinuitySnapshot(3, 7);
    expect(briefing.needsAttention.map((i) => [i.type, i.id])).toEqual([
      ['module', null],
      ['cmc_contradiction', null],
      ['document', 104],
    ]);
  });
});

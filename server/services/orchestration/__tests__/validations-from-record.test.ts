/**
 * The readiness engine reads each document's validation state from the
 * validation record, and does not score what was not analysed.
 *
 * resolveValidations read run_validation's audit rows, which carry no result:
 * every run came back valid (a missing isValid read as true), with no findings
 * and a score of 0. The engine then scored compliance 100 off runs that may
 * have found critical issues, and lumen-context-builder gave AnA that figure.
 * It also took the organisation's 50 latest runs before keeping the project's,
 * and every run rather than each document's latest.
 */
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ history: [] as Array<Record<string, unknown>> }));

vi.mock('../../../db', async () => {
  const { getTableName } = await import('drizzle-orm');
  function chain(table?: string): any {
    const builder: any = new Proxy(function () {}, {
      get(_target, prop) {
        if (prop === 'then') {
          const rows =
            table === 'projects' ? [{ id: 12, name: 'Lead program', status: 'active', progress: 10 }]
            : table === 'coauthor_validation_history' ? h.history
            : [];
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(rows).then(resolve, reject);
        }
        if (prop === 'from') return (t: Parameters<typeof getTableName>[0]) => chain(getTableName(t));
        return () => builder;
      },
    });
    return builder;
  }
  return { db: { select: () => chain(), execute: async () => ({ rows: [] }) } };
});

import { assembleCrossObjectPayload } from '../cross-object-resolver';
import { computeReadinessAssessment } from '../readiness-engine';
import { generateRecommendations } from '../recommendation-engine';
import type { CrossObjectReasoningPayload, ValidationSnapshot } from '../../../../shared/types/orchestration';

const run = (o: {
  target: number | null; at: string; score: number | null; isValid: boolean; critical?: number; major?: number; title?: string;
}) => ({
  module: 'regulatory_submission',
  complianceScore: o.score,
  criticalIssues: o.critical ?? 0,
  majorIssues: o.major ?? 0,
  minorIssues: 0,
  performedAt: new Date(o.at),
  validationResults: { isValid: o.isValid, findings: [] },
  metadata: { projectId: 12, target: o.target === null ? null : { type: 'artifact', id: o.target }, title: o.title ?? null },
});

describe('the validation read', () => {
  it("takes each document's latest recorded run, as recorded", async () => {
    h.history = [ // newest first, as the query orders them
      run({ target: 41, at: '2026-10-15T10:00:00Z', score: null, isValid: false, major: 1, title: 'Cover letter' }),
      run({ target: 42, at: '2026-10-14T10:00:00Z', score: 88, isValid: true, title: 'Form 1571' }),
      run({ target: null, at: '2026-10-13T10:00:00Z', score: 100, isValid: true }),
      run({ target: 41, at: '2026-10-12T10:00:00Z', score: 40, isValid: false, critical: 2 }),
    ];
    const payload = await assembleCrossObjectPayload({ organizationId: 3, projectId: 12 });
    const byDoc = Object.fromEntries(payload.validations.map((v) => [v.documentId, v]));

    expect(Object.keys(byDoc).sort()).toEqual(['41', '42']); // inline content validated no document
    expect(byDoc[41]).toMatchObject({ documentTitle: 'Cover letter', isValid: false, complianceScore: null, criticalCount: 0, majorCount: 1 });
    expect(byDoc[42]).toMatchObject({ isValid: true, complianceScore: 88 });
  });
});

describe('readiness over a run that computed no score', () => {
  const NOW = new Date().toISOString();
  const payload = (validations: ValidationSnapshot[]): CrossObjectReasoningPayload => ({
    project: {
      id: 12, name: 'Lead program', status: 'active', progress: 0, totalDocuments: 1, totalTasks: 0,
      blockedTasks: 0, overdueTasks: 0, doneTasks: 0, taskCountsPartial: false,
    },
    documents: [{ id: 41, title: 'Cover letter', type: 'cover_letter', status: 'approved', module: 'Module 1', hasValidation: true, isRouted: true, lastModified: NOW }],
    artifacts: [],
    validations,
    tasks: [],
    moduleMap: [],
    recentActions: [],
    evidence: [],
    cmcSignals: {
      sourceObjectCount: 0, sourceTypeBreakdown: {}, sectionCount: 0, staleSectionCount: 0, contradictions: [],
      contradictionCounts: { critical: 0, high: 0, medium: 0, low: 0, open: 0, resolved: 0 },
    },
    assembledAt: NOW,
    lastSignalAt: null,
    scope: { organizationId: 3, projectId: 12 },
  } as CrossObjectReasoningPayload);
  const unscored: ValidationSnapshot = {
    documentId: 41, documentTitle: 'Cover letter', isValid: false, complianceScore: null,
    criticalCount: 0, majorCount: 1, minorCount: 0, validatedAt: NOW, findings: [],
  };

  it('earns no quality credit and is not a clean validation of its document', () => {
    const a = computeReadinessAssessment(payload([unscored]));
    expect(a.scores.quality).toBe(0);
    expect(a.documentInventory[0]).toMatchObject({ isValidated: false, validationScore: null });
  });

  it('a scored run still counts', () => {
    const a = computeReadinessAssessment(payload([{ ...unscored, isValid: true, complianceScore: 90, majorCount: 0 }]));
    expect(a.scores.quality).toBeGreaterThan(0);
    expect(a.documentInventory[0]).toMatchObject({ isValidated: true, validationScore: 90 });
  });

  it('says the score was not computed rather than printing one', () => {
    const recs = generateRecommendations(payload([unscored]), { projectId: 12, limit: 15 }).recommendations;
    const failure = recs.find((r) => r.recommendationType === 'validation_failure');
    expect(failure?.evidence?.join(' ')).toMatch(/Compliance score: not computed/);
    expect(JSON.stringify(recs)).not.toMatch(/null%/);
  });
});

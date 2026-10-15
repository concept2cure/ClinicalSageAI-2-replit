/**
 * Project readiness says, for the consistency and guidance components, that
 * scan history is not recorded and that no alerts is not a clean result
 * (2026-10-15).
 *
 * What the code used to do: a project with no alert on record was "Not
 * assessed: no … scan result is on record for this project." — which a project
 * that had just been scanned clean also read, with nothing saying why. A scored
 * component's detail gave the newest alert's creation time as "the last scan on
 * record".
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../citation-section-coverage.js', () => ({ getProjectSectionCoverage: vi.fn() }));
vi.mock('../citation-readiness-bridge.js', () => ({ getCitationReadinessImpact: vi.fn() }));
vi.mock('../../intelligence/cross-artifact-consistency-scanner.js', () => ({ getConsistencyAlertsSummary: vi.fn() }));
vi.mock('../../intelligence/guidance-impact-scanner.js', () => ({ getGuidanceAlertsSummary: vi.fn() }));
vi.mock('../therapeutic-area-context.js', () => ({ getProjectTherapeuticContext: vi.fn() }));

import { deriveProjectReadinessAggregate, type ProjectReadinessAggregate } from '../project-readiness-aggregator';

const ZERO = { critical: 0, major: 0, minor: 0, info: 0 };
const NOTE = 'Scan history is not recorded: a scan that finds nothing leaves no record, so no alerts is not a clean result.';

function summary(over: Record<string, unknown> = {}) {
  return {
    organizationId: 7,
    projectId: 12,
    asOf: '2026-10-15T00:00:00.000Z',
    assessed: false,
    scanHistory: { recorded: false, note: NOTE },
    lastAlertAt: null,
    bySeverity: { ...ZERO },
    openBySeverity: { ...ZERO },
    byStatus: { open: 0, acknowledged: 0, resolved: 0 },
    totalOpen: 0,
    openCritical: 0,
    topProjects: [],
    topArtifacts: [],
    topGuidanceCodes: [],
    topAffectedArtifacts: [],
    recent: { lastAlertAt: null, lastResolvedAt: null },
    ...over,
  };
}

function derive(consistency: Record<string, unknown>, guidance: Record<string, unknown>) {
  return deriveProjectReadinessAggregate(
    {
      sectionCoverage: {
        rollup: { completionPercent: 50, requiredCompleted: 5, requiredSections: 10, requiredMissing: 5, filingBlocking: false },
        sections: [],
      },
      citationImpact: {
        citationCoverage: 60, citationGapPenalty: 10, rawReadinessDelta: -10, staleArtifactCount: 0,
        citedArtifactCount: 5, totalArtifactCount: 5, artifactImpacts: [],
      },
      consistencySummary: summary(consistency),
      guidanceSummary: summary(guidance),
      therapeuticContext: { profile: null, therapeuticArea: null },
    } as unknown as ProjectReadinessAggregate['inputs'],
    { projectId: 12, organizationId: 7, now: new Date('2026-10-15T00:00:00Z') },
  );
}

describe('the alert components of project readiness', () => {
  it('say that scan history is not recorded when no alert is on record', () => {
    const agg = derive({}, {});
    for (const key of ['consistency', 'guidance'] as const) {
      const entry = agg.notAssessed.find(n => n.component === key);
      expect(entry?.detail, `${key}: no alerts read as "no scan result", with no reason`).toMatch(
        /scan history is not recorded.*no alerts is not a clean result/i,
      );
      expect(agg.components[key].score).toBeNull();
    }
  });

  it("give the newest alert's time as an alert time, not as the last scan", () => {
    const agg = derive(
      {
        assessed: true,
        lastAlertAt: '2026-10-10T00:00:00.000Z',
        bySeverity: { ...ZERO, major: 1 },
        openBySeverity: { ...ZERO, major: 1 },
        byStatus: { open: 1, acknowledged: 0, resolved: 0 },
        totalOpen: 1,
      },
      {},
    );
    const detail = agg.components.consistency.detail;
    expect(detail).toContain('newest alert raised 2026-10-10T00:00:00.000Z');
    expect(detail).not.toMatch(/last scan/i);
    expect(detail).toMatch(/scan history is not recorded/i);
  });
});

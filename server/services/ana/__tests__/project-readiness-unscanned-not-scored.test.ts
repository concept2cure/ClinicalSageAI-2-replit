/**
 * Project readiness scores only what was measured (2026-10-15, finding 7).
 *
 * What the code used to do: the consistency and guidance components were
 * `100 − penalty` over the organisation's alert summaries. A project nobody had
 * scanned, and an organisation whose alert tables did not exist, both arrived
 * as zeroed summaries, so both components scored 100: a free 20 points on every
 * project's readiness percentage, with the detail "0 open consistency alerts
 * (0 critical)" and filingBlocking false from both sources. The summaries were
 * organisation-wide, so another project's critical alert charged this project
 * and blocked its filing, and the penalty counted resolved alerts.
 *
 * Now an unassessed component has no score, is named in notAssessed, and the
 * score is renormalised over the components that were measured. A store that
 * cannot be read is named unavailable, never scored.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchers = vi.hoisted(() => ({
  coverage: vi.fn(),
  citation: vi.fn(),
  consistency: vi.fn(),
  guidance: vi.fn(),
  therapeutic: vi.fn(),
}));

vi.mock('../citation-section-coverage.js', () => ({ getProjectSectionCoverage: fetchers.coverage }));
vi.mock('../citation-readiness-bridge.js', () => ({ getCitationReadinessImpact: fetchers.citation }));
vi.mock('../../intelligence/cross-artifact-consistency-scanner.js', () => ({
  getConsistencyAlertsSummary: fetchers.consistency,
}));
vi.mock('../../intelligence/guidance-impact-scanner.js', () => ({ getGuidanceAlertsSummary: fetchers.guidance }));
vi.mock('../therapeutic-area-context.js', () => ({ getProjectTherapeuticContext: fetchers.therapeutic }));

import {
  deriveProjectReadinessAggregate,
  getProjectReadinessAggregate,
  type ProjectReadinessAggregate,
} from '../project-readiness-aggregator';

const ORG = 7;
const PROJECT = 12;
const ZERO = { critical: 0, major: 0, minor: 0, info: 0 };

const coverage = {
  projectId: PROJECT,
  organizationId: ORG,
  submissionType: 'IND',
  asOf: '2026-10-15T00:00:00.000Z',
  rollup: {
    registrySections: 10,
    requiredSections: 10,
    artifactsConsidered: 5,
    coveredCount: 5,
    draftedCount: 0,
    missingCount: 5,
    extraCount: 0,
    requiredCovered: 5,
    requiredCompleted: 5,
    requiredMissing: 0,
    completionPercent: 50,
    filingBlocking: false,
  },
  sections: [],
};

const citation = {
  projectId: PROJECT,
  organizationId: ORG,
  asOf: '2026-10-15T00:00:00.000Z',
  citationCoverage: 60,
  citationGapPenalty: 10,
  rawReadinessDelta: -10,
  filingBlocked: false,
  staleArtifactCount: 0,
  citedArtifactCount: 5,
  totalArtifactCount: 5,
  complianceDelta: 0,
  completenessDelta: 0,
  artifactImpacts: [],
};

const therapeutic = {
  projectId: PROJECT,
  organizationId: ORG,
  therapeuticArea: 'oncology',
  profile: { id: 'oncology', displayName: 'Oncology' },
  contextBlock: '',
  retrievalBoost: '',
};

function consistencySummary(over: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    projectId: PROJECT,
    asOf: '2026-10-15T00:00:00.000Z',
    assessed: false,
    scanHistory: { recorded: false, note: 'Scan history is not recorded; no alerts is not a clean result.' },
    lastAlertAt: null,
    bySeverity: { ...ZERO },
    openBySeverity: { ...ZERO },
    byStatus: { open: 0, acknowledged: 0, resolved: 0 },
    totalOpen: 0,
    openCritical: 0,
    topProjects: [],
    topArtifacts: [],
    ...over,
  };
}

function guidanceSummary(over: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    projectId: PROJECT,
    asOf: '2026-10-15T00:00:00.000Z',
    assessed: false,
    scanHistory: { recorded: false, note: 'Scan history is not recorded; no alerts is not a clean result.' },
    lastAlertAt: null,
    bySeverity: { ...ZERO },
    openBySeverity: { ...ZERO },
    byStatus: { open: 0, acknowledged: 0, resolved: 0 },
    openCritical: 0,
    totalOpen: 0,
    topGuidanceCodes: [],
    topAffectedArtifacts: [],
    recent: { lastAlertAt: null, lastResolvedAt: null },
    ...over,
  };
}

function derive(inputs: Record<string, unknown>) {
  return deriveProjectReadinessAggregate(
    {
      sectionCoverage: coverage,
      citationImpact: citation,
      consistencySummary: consistencySummary(),
      guidanceSummary: guidanceSummary(),
      therapeuticContext: therapeutic,
      ...inputs,
    } as unknown as ProjectReadinessAggregate['inputs'],
    { projectId: PROJECT, organizationId: ORG, now: new Date('2026-10-15T00:00:00Z') },
  );
}

beforeEach(() => {
  fetchers.coverage.mockResolvedValue(coverage);
  fetchers.citation.mockResolvedValue(citation);
  fetchers.consistency.mockResolvedValue(consistencySummary());
  fetchers.guidance.mockResolvedValue(guidanceSummary());
  fetchers.therapeutic.mockResolvedValue(therapeutic);
});

describe('an unscanned project', () => {
  it('has no consistency or guidance score, and they are named as not assessed', () => {
    const agg = derive({});
    expect(agg.components.consistency.score).toBeNull();
    expect(agg.components.consistency.assessed).toBe(false);
    expect(agg.components.guidance.score).toBeNull();
    expect(agg.components.consistency.detail).toMatch(/^Not assessed/);
    expect(agg.components.guidance.detail).toMatch(/^Not assessed/);
    expect(agg.notAssessed.map(n => n.component)).toEqual(['consistency', 'guidance']);
  });

  it('is scored over the components that were measured, not handed 20 points', () => {
    const agg = derive({});
    // Coverage 50 × 0.4 + citation (60 − 10) × 0.3 + therapeutic 100 × 0.1 over a
    // measured weight of 0.8 = 45 / 0.8 = 56.25. The old sum was 65.
    expect(agg.measuredWeight).toBe(0.8);
    expect(agg.score).toBe(56);
    const weighted = Object.values(agg.components).reduce((s, c) => s + (c.weighted ?? 0), 0);
    expect(Math.round(weighted)).toBe(agg.score);
  });
});

describe('a scanned project', () => {
  it('a resolved critical alert costs nothing; an open one costs and blocks filing', () => {
    const resolvedOnly = derive({
      consistencySummary: consistencySummary({
        assessed: true,
        lastAlertAt: '2026-10-10T00:00:00.000Z',
        bySeverity: { ...ZERO, critical: 1 },
        byStatus: { open: 0, acknowledged: 0, resolved: 1 },
      }),
    });
    expect(resolvedOnly.components.consistency.score).toBe(100);
    expect(resolvedOnly.filingBlocking).toBe(false);
    expect(resolvedOnly.components.consistency.detail).toContain('2026-10-10');

    const openCritical = derive({
      consistencySummary: consistencySummary({
        assessed: true,
        lastAlertAt: '2026-10-10T00:00:00.000Z',
        bySeverity: { ...ZERO, critical: 1 },
        openBySeverity: { ...ZERO, critical: 1 },
        byStatus: { open: 1, acknowledged: 0, resolved: 0 },
        totalOpen: 1,
        openCritical: 1,
      }),
    });
    expect(openCritical.components.consistency.score).toBe(80);
    expect(openCritical.filingBlocking).toBe(true);
    expect(openCritical.notAssessed.map(n => n.component)).toEqual(['guidance']);
  });
});

describe('the live entry', () => {
  it("reads this project's alert summaries, not the organisation's", async () => {
    await getProjectReadinessAggregate(PROJECT, ORG);
    expect(fetchers.consistency).toHaveBeenCalledWith(ORG, { projectId: PROJECT });
    expect(fetchers.guidance).toHaveBeenCalledWith(ORG, { projectId: PROJECT });
  });

  it('names an alert store it could not read as unavailable and does not score it', async () => {
    fetchers.consistency.mockRejectedValue(
      Object.assign(new Error('relation "cross_artifact_consistency_alerts" does not exist'), { code: '42P01' }),
    );
    const agg = await getProjectReadinessAggregate(PROJECT, ORG);
    expect(agg.components.consistency.score).toBeNull();
    expect(agg.inputs.consistencySummary).toBeNull();
    const entry = agg.notAssessed.find(n => n.component === 'consistency');
    expect(entry?.reason).toBe('unavailable');
    expect(entry?.detail).toContain('does not exist');
  });
});

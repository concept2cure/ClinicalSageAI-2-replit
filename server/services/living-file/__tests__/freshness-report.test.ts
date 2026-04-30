/**
 * Tests for the per-program freshness report.
 *
 * Mocks db.select chain to return fixture rows for each artifact table; checks
 * that state mapping (RENDERED/STALE → fresh/stale, conformanceStatus →
 * needs_evidence, status==superseded → superseded, expired reportingPeriod →
 * expired, etc.) is applied correctly and counts roll up per-artifact.
 */

import { describe, expect, test, vi, beforeEach } from 'vitest';

interface State {
  perTable: Map<unknown, unknown[]>;
}
const state: State = { perTable: new Map() };

function setRows(t: unknown, rows: unknown[]) {
  state.perTable.set(t, rows);
}

function makeChain() {
  let activeTable: unknown = null;
  const chain: any = {
    from(t: unknown) {
      activeTable = t;
      return chain;
    },
    where() {
      return chain;
    },
    orderBy() {
      return chain;
    },
    limit() {
      return Promise.resolve(state.perTable.get(activeTable) ?? []);
    },
    then(resolve: (rows: unknown[]) => void) {
      resolve(state.perTable.get(activeTable) ?? []);
    },
  };
  return chain;
}

vi.mock('../../../db', () => ({
  db: { select: () => makeChain() },
}));

import { programFreshnessReport } from '../freshness-report.service';
import { defensePackets } from '../../../../shared/schema/defense-packets';
import {
  standardsApplicability,
} from '../../../../shared/schema/regulatory-graph';
import {
  gsprProgramMappings,
  postMarketDocuments,
} from '../../../../shared/schema/gspr-postmarket';
import { aiMlPccpPlans } from '../../../../shared/schema/ai-ml-pccp';
import { evidenceSufficiencyAssessments } from '../../../../shared/schema/evidence-sufficiency';
import { reviewerSimulationRuns } from '../../../../shared/schema/reviewer-simulation';

const ORG = 7;
const PROGRAM = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

beforeEach(() => {
  state.perTable.clear();
});

describe('programFreshnessReport — defense packets', () => {
  test('RENDERED → fresh; STALE → stale', async () => {
    setRows(defensePackets, [
      { id: 'pkt-1', status: 'RENDERED', stalenessReason: null, updatedAt: new Date() },
      { id: 'pkt-2', status: 'STALE', stalenessReason: 'evidence_changed', updatedAt: new Date() },
    ]);
    const r = await programFreshnessReport(ORG, PROGRAM);
    const dp = r.artifacts.filter(a => a.artifact === 'defense_packet');
    expect(dp).toHaveLength(2);
    expect(dp.find(a => a.artifactId === 'pkt-1')!.state).toBe('fresh');
    expect(dp.find(a => a.artifactId === 'pkt-2')!.state).toBe('stale');
    expect(r.counts.defense_packet.fresh).toBe(1);
    expect(r.counts.defense_packet.stale).toBe(1);
  });
});

describe('programFreshnessReport — GSPR + standards applicability', () => {
  test('conformanceStatus rules apply correctly', async () => {
    setRows(gsprProgramMappings, [
      { id: 'g1', conformanceStatus: 'conformant', gapDescription: null, updatedAt: new Date() },
      { id: 'g2', conformanceStatus: 'needs_evidence', gapDescription: 'pri ev superseded', updatedAt: new Date() },
      { id: 'g3', conformanceStatus: 'non_conformant', gapDescription: null, updatedAt: new Date() },
    ]);
    setRows(standardsApplicability, [
      { id: 's1', conformanceStatus: 'conformant', gapDescription: null, updatedAt: new Date() },
      { id: 's2', conformanceStatus: 'needs_evidence', gapDescription: 'std withdrawn', updatedAt: new Date() },
    ]);
    const r = await programFreshnessReport(ORG, PROGRAM);
    expect(r.counts.gspr_program_mapping.fresh).toBe(1);
    expect(r.counts.gspr_program_mapping.needs_evidence).toBe(1);
    expect(r.counts.gspr_program_mapping.stale).toBe(1);
    expect(r.counts.standards_applicability.fresh).toBe(1);
    expect(r.counts.standards_applicability.needs_evidence).toBe(1);
  });
});

describe('programFreshnessReport — post-market', () => {
  test('superseded vs expired vs draft mapping', async () => {
    const past = new Date('2020-01-01');
    const future = new Date(Date.now() + 86400_000);
    setRows(postMarketDocuments, [
      { id: 'p1', status: 'approved', reportingPeriodEnd: future, updatedAt: new Date() },
      { id: 'p2', status: 'approved', reportingPeriodEnd: past, updatedAt: new Date() },
      { id: 'p3', status: 'superseded', reportingPeriodEnd: null, updatedAt: new Date() },
      { id: 'p4', status: 'draft', reportingPeriodEnd: null, updatedAt: new Date() },
      { id: 'p5', status: 'withdrawn', reportingPeriodEnd: null, updatedAt: new Date() },
    ]);
    const r = await programFreshnessReport(ORG, PROGRAM);
    const map = new Map(r.artifacts.filter(a => a.artifact === 'post_market_document').map(a => [a.artifactId, a]));
    expect(map.get('p1')!.state).toBe('fresh');
    expect(map.get('p2')!.state).toBe('expired');
    expect(map.get('p3')!.state).toBe('superseded');
    expect(map.get('p4')!.state).toBe('no_data');
    expect(map.get('p5')!.state).toBe('stale');
  });
});

describe('programFreshnessReport — pccp + sims + sufficiency', () => {
  test('approved pccp plan is fresh', async () => {
    setRows(aiMlPccpPlans, [
      { id: 'pl1', status: 'approved', updatedAt: new Date() },
      { id: 'pl2', status: 'superseded', updatedAt: new Date() },
    ]);
    const r = await programFreshnessReport(ORG, PROGRAM);
    expect(r.counts.ai_ml_pccp_plan.fresh).toBe(1);
    expect(r.counts.ai_ml_pccp_plan.superseded).toBe(1);
  });

  test('reviewer sim with critical findings is stale', async () => {
    setRows(reviewerSimulationRuns, [
      { id: 'sim-1', criticalCount: 3, createdAt: new Date() },
    ]);
    const r = await programFreshnessReport(ORG, PROGRAM);
    expect(r.artifacts.find(a => a.artifact === 'reviewer_simulation_run')?.state).toBe('stale');
  });

  test('sufficiency assessment with insufficient verdict is stale', async () => {
    setRows(evidenceSufficiencyAssessments, [
      {
        id: 'a1',
        verdict: 'insufficient',
        blocksApproval: true,
        createdAt: new Date(),
      },
    ]);
    const r = await programFreshnessReport(ORG, PROGRAM);
    const sa = r.artifacts.find(a => a.artifact === 'evidence_sufficiency_assessment');
    expect(sa?.state).toBe('stale');
  });

  test('sufficient verdict is fresh', async () => {
    setRows(evidenceSufficiencyAssessments, [
      { id: 'a2', verdict: 'sufficient', blocksApproval: false, createdAt: new Date() },
    ]);
    const r = await programFreshnessReport(ORG, PROGRAM);
    const sa = r.artifacts.find(a => a.artifact === 'evidence_sufficiency_assessment');
    expect(sa?.state).toBe('fresh');
  });
});

describe('programFreshnessReport — aggregate flags', () => {
  test('hasStaleArtifacts is true if any artifact is stale / needs_evidence / expired', async () => {
    setRows(gsprProgramMappings, [
      { id: 'g1', conformanceStatus: 'needs_evidence', gapDescription: null, updatedAt: new Date() },
    ]);
    const r = await programFreshnessReport(ORG, PROGRAM);
    expect(r.hasStaleArtifacts).toBe(true);
  });

  test('hasStaleArtifacts is false when only fresh / superseded / no_data', async () => {
    setRows(defensePackets, [
      { id: 'pkt-1', status: 'RENDERED', stalenessReason: null, updatedAt: new Date() },
    ]);
    setRows(aiMlPccpPlans, [
      { id: 'pl1', status: 'superseded', updatedAt: new Date() },
    ]);
    const r = await programFreshnessReport(ORG, PROGRAM);
    expect(r.hasStaleArtifacts).toBe(false);
  });
});

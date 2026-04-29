/**
 * Living-File Freshness Report
 *
 * Read-only aggregation across every artifact table built in the prior six
 * commits. Per program, returns the freshness state of:
 *
 *   - defense_packets               (status==RENDERED → fresh; STALE → not)
 *   - gspr_program_mappings         (conformanceStatus / primary evidence)
 *   - standards_applicability       (conformanceStatus / primary evidence)
 *   - post_market_documents         (status / supersession / period)
 *   - ai_ml_pccp_plans              (status / supersession)
 *   - reviewer_simulation_runs      (latest run only — informational)
 *   - evidence_sufficiency_assessments (latest only — informational)
 *
 * No mutations. The change router is what flips state; this service only
 * reads. Used by /api/regulatory-graph/programs/:programId/freshness.
 */

import { and, desc, eq } from 'drizzle-orm';

import { db } from '../../db';
import { defensePackets } from '../../../shared/schema/defense-packets';
import {
  standardsApplicability,
} from '../../../shared/schema/regulatory-graph';
import {
  gsprProgramMappings,
  postMarketDocuments,
} from '../../../shared/schema/gspr-postmarket';
import { aiMlPccpPlans } from '../../../shared/schema/ai-ml-pccp';
import { evidenceSufficiencyAssessments } from '../../../shared/schema/evidence-sufficiency';
import { reviewerSimulationRuns } from '../../../shared/schema/reviewer-simulation';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type FreshnessState = 'fresh' | 'stale' | 'needs_evidence' | 'superseded' | 'expired' | 'no_data';

export interface ArtifactFreshness {
  artifact:
    | 'defense_packet'
    | 'gspr_program_mapping'
    | 'standards_applicability'
    | 'post_market_document'
    | 'ai_ml_pccp_plan'
    | 'reviewer_simulation_run'
    | 'evidence_sufficiency_assessment';
  artifactId: string;
  state: FreshnessState;
  reason?: string;
  updatedAt?: Date | null;
}

export interface ProgramFreshnessReport {
  programId: string;
  organizationId: number;
  generatedAt: string;
  // Per-artifact-type bucket counts
  counts: Record<string, Record<FreshnessState, number>>;
  artifacts: ArtifactFreshness[];
  /** Convenience: any artifact in a non-fresh state. */
  hasStaleArtifacts: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-artifact freshness checks
// ─────────────────────────────────────────────────────────────────────────────

async function defensePacketFreshness(
  organizationId: number,
  programId: string
): Promise<ArtifactFreshness[]> {
  const rows = await db
    .select({
      id: defensePackets.id,
      status: defensePackets.status,
      stalenessReason: defensePackets.stalenessReason,
      updatedAt: defensePackets.updatedAt,
    })
    .from(defensePackets)
    .where(
      and(
        eq(defensePackets.organizationId, organizationId),
        eq(defensePackets.programId, programId)
      )
    );
  return rows.map(r => ({
    artifact: 'defense_packet' as const,
    artifactId: r.id,
    state:
      r.status === 'RENDERED'
        ? 'fresh'
        : r.status === 'STALE'
        ? 'stale'
        : 'no_data',
    reason: r.stalenessReason ?? undefined,
    updatedAt: r.updatedAt,
  }));
}

async function gsprMappingFreshness(
  organizationId: number,
  programId: string
): Promise<ArtifactFreshness[]> {
  const rows = await db
    .select({
      id: gsprProgramMappings.id,
      conformanceStatus: gsprProgramMappings.conformanceStatus,
      gapDescription: gsprProgramMappings.gapDescription,
      updatedAt: gsprProgramMappings.updatedAt,
    })
    .from(gsprProgramMappings)
    .where(
      and(
        eq(gsprProgramMappings.organizationId, organizationId),
        eq(gsprProgramMappings.programId, programId)
      )
    );
  return rows.map(r => ({
    artifact: 'gspr_program_mapping' as const,
    artifactId: r.id,
    state:
      r.conformanceStatus === 'conformant'
        ? 'fresh'
        : r.conformanceStatus === 'needs_evidence'
        ? 'needs_evidence'
        : r.conformanceStatus === 'non_conformant'
        ? 'stale'
        : 'no_data',
    reason: r.gapDescription ?? undefined,
    updatedAt: r.updatedAt,
  }));
}

async function standardsApplicabilityFreshness(
  organizationId: number,
  programId: string
): Promise<ArtifactFreshness[]> {
  const rows = await db
    .select({
      id: standardsApplicability.id,
      conformanceStatus: standardsApplicability.conformanceStatus,
      gapDescription: standardsApplicability.gapDescription,
      updatedAt: standardsApplicability.updatedAt,
    })
    .from(standardsApplicability)
    .where(
      and(
        eq(standardsApplicability.organizationId, organizationId),
        eq(standardsApplicability.programId, programId)
      )
    );
  return rows.map(r => ({
    artifact: 'standards_applicability' as const,
    artifactId: r.id,
    state:
      r.conformanceStatus === 'conformant'
        ? 'fresh'
        : r.conformanceStatus === 'needs_evidence'
        ? 'needs_evidence'
        : r.conformanceStatus === 'non_conformant'
        ? 'stale'
        : 'no_data',
    reason: r.gapDescription ?? undefined,
    updatedAt: r.updatedAt,
  }));
}

async function postMarketFreshness(
  organizationId: number,
  programId: string
): Promise<ArtifactFreshness[]> {
  const rows = await db
    .select({
      id: postMarketDocuments.id,
      status: postMarketDocuments.status,
      reportingPeriodEnd: postMarketDocuments.reportingPeriodEnd,
      updatedAt: postMarketDocuments.updatedAt,
    })
    .from(postMarketDocuments)
    .where(
      and(
        eq(postMarketDocuments.organizationId, organizationId),
        eq(postMarketDocuments.programId, programId)
      )
    );
  const now = Date.now();
  return rows.map(r => {
    let state: FreshnessState = 'no_data';
    let reason: string | undefined;
    if (r.status === 'superseded') {
      state = 'superseded';
    } else if (r.status === 'withdrawn') {
      state = 'stale';
      reason = 'document withdrawn';
    } else if (r.reportingPeriodEnd && r.reportingPeriodEnd.getTime() < now) {
      state = 'expired';
      reason = `reporting period ended ${r.reportingPeriodEnd.toISOString()}`;
    } else if (r.status === 'approved') {
      state = 'fresh';
    } else if (r.status === 'draft' || r.status === 'under_review') {
      state = 'no_data';
      reason = `status ${r.status}`;
    }
    return {
      artifact: 'post_market_document' as const,
      artifactId: r.id,
      state,
      reason,
      updatedAt: r.updatedAt,
    };
  });
}

async function pccpPlanFreshness(
  organizationId: number,
  programId: string
): Promise<ArtifactFreshness[]> {
  const rows = await db
    .select({
      id: aiMlPccpPlans.id,
      status: aiMlPccpPlans.status,
      updatedAt: aiMlPccpPlans.updatedAt,
    })
    .from(aiMlPccpPlans)
    .where(
      and(
        eq(aiMlPccpPlans.organizationId, organizationId),
        eq(aiMlPccpPlans.programId, programId)
      )
    );
  return rows.map(r => ({
    artifact: 'ai_ml_pccp_plan' as const,
    artifactId: r.id,
    state:
      r.status === 'approved'
        ? 'fresh'
        : r.status === 'superseded'
        ? 'superseded'
        : r.status === 'withdrawn'
        ? 'stale'
        : 'no_data',
    updatedAt: r.updatedAt,
  }));
}

async function reviewerSimFreshness(
  organizationId: number,
  programId: string
): Promise<ArtifactFreshness[]> {
  // Latest run only — informational. Older runs are immutable history.
  const [latest] = await db
    .select({
      id: reviewerSimulationRuns.id,
      createdAt: reviewerSimulationRuns.createdAt,
      criticalCount: reviewerSimulationRuns.criticalCount,
    })
    .from(reviewerSimulationRuns)
    .where(
      and(
        eq(reviewerSimulationRuns.organizationId, organizationId),
        eq(reviewerSimulationRuns.programId, programId)
      )
    )
    .orderBy(desc(reviewerSimulationRuns.createdAt))
    .limit(1);
  if (!latest) return [];
  return [
    {
      artifact: 'reviewer_simulation_run',
      artifactId: latest.id,
      state: latest.criticalCount === 0 ? 'fresh' : 'stale',
      reason:
        latest.criticalCount === 0
          ? undefined
          : `${latest.criticalCount} critical reviewer questions outstanding`,
      updatedAt: latest.createdAt,
    },
  ];
}

async function sufficiencyFreshness(
  organizationId: number,
  programId: string
): Promise<ArtifactFreshness[]> {
  const [latest] = await db
    .select({
      id: evidenceSufficiencyAssessments.id,
      verdict: evidenceSufficiencyAssessments.verdict,
      blocksApproval: evidenceSufficiencyAssessments.blocksApproval,
      createdAt: evidenceSufficiencyAssessments.createdAt,
    })
    .from(evidenceSufficiencyAssessments)
    .where(
      and(
        eq(evidenceSufficiencyAssessments.organizationId, organizationId),
        eq(evidenceSufficiencyAssessments.programId, programId)
      )
    )
    .orderBy(desc(evidenceSufficiencyAssessments.createdAt))
    .limit(1);
  if (!latest) return [];
  return [
    {
      artifact: 'evidence_sufficiency_assessment',
      artifactId: latest.id,
      state: latest.verdict === 'sufficient' ? 'fresh' : 'stale',
      reason: `verdict=${latest.verdict}; blocksApproval=${latest.blocksApproval}`,
      updatedAt: latest.createdAt,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────────

export async function programFreshnessReport(
  organizationId: number,
  programId: string
): Promise<ProgramFreshnessReport> {
  const buckets = await Promise.all([
    defensePacketFreshness(organizationId, programId),
    gsprMappingFreshness(organizationId, programId),
    standardsApplicabilityFreshness(organizationId, programId),
    postMarketFreshness(organizationId, programId),
    pccpPlanFreshness(organizationId, programId),
    reviewerSimFreshness(organizationId, programId),
    sufficiencyFreshness(organizationId, programId),
  ]);
  const artifacts = buckets.flat();

  const counts: Record<string, Record<FreshnessState, number>> = {};
  for (const a of artifacts) {
    if (!counts[a.artifact]) {
      counts[a.artifact] = {
        fresh: 0,
        stale: 0,
        needs_evidence: 0,
        superseded: 0,
        expired: 0,
        no_data: 0,
      };
    }
    counts[a.artifact][a.state] += 1;
  }

  const hasStaleArtifacts = artifacts.some(a =>
    ['stale', 'needs_evidence', 'expired'].includes(a.state)
  );

  return {
    programId,
    organizationId,
    generatedAt: new Date().toISOString(),
    counts,
    artifacts,
    hasStaleArtifacts,
  };
}

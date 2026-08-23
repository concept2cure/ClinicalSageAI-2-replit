/**
 * The Module 3 final-export gate, as a service.
 *
 * Extracted verbatim from POST /api/cmc/module3-os/guard/final-export/:projectId
 * so that the placement path (place-module3-into-submission) refuses on exactly
 * the same verdict the guard endpoint reports — one gate, two callers, no
 * drift. The route stays the HTTP face of this function.
 *
 * Fail-closed convergence, unchanged: export (and therefore placement) is
 * refused if the compiler gate refuses, the governed document fabric blocks,
 * governed decisions are unresolved, or any section went stale after approval.
 */
import { getPool } from '../../db';
import { canFinalizeExport } from '../cmc-module3-compiler';
import { buildCanonicalGovernedState } from '../governed-ana-execution.js';

export interface FinalExportGateVerdict {
  allowed: boolean;
  /** Present when refused — the reason, exactly as the guard endpoint words it. */
  error?: string;
  data: {
    totalSections: number;
    approvedSections: number;
    staleSections: number;
    openCriticalContradictions: number;
    canonicalGovernedState: Record<string, unknown> | null;
  };
}

export async function evaluateFinalExportGate(params: {
  orgId: number;
  projectId: string;
  actorId: string;
}): Promise<FinalExportGateVerdict> {
  const { orgId, projectId, actorId } = params;
  const pool = getPool();

  const [sectionsRes, contradictionsRes] = await Promise.all([
    pool.query(
      `SELECT approval_state, stale FROM cmc_module3_sections WHERE organization_id = $1 AND project_id = $2`,
      [orgId, projectId]
    ),
    pool.query(
      `SELECT severity, status FROM cmc_contradictions WHERE organization_id = $1 AND project_id = $2`,
      [orgId, projectId]
    ),
  ]);

  const sections = sectionsRes.rows;
  // A section that went stale AFTER approval (source changed since sign-off) must
  // not ship: its approval no longer matches its content. Mirror the readiness
  // endpoint, which requires staleSections === 0 before export.
  const staleSections = sections.filter((s: any) => Boolean(s.stale)).length;
  const allApproved = sections.length > 0 && sections.every((s: any) => s.approval_state === 'approved');
  const allowed = canFinalizeExport({
    approvalState: allApproved ? 'approved' : 'draft',
    contradictions: contradictionsRes.rows || [],
  });

  // Governed Document Decision Fabric evaluation
  const approvedCount = sections.filter((s: any) => s.approval_state === 'approved').length;
  const openCritical = (contradictionsRes.rows || []).filter(
    (c: any) => c.severity === 'critical' && c.status !== 'resolved'
  ).length;
  const unresolvedCount = (contradictionsRes.rows || []).filter((c: any) => c.status !== 'resolved').length;

  let canonicalGovernedState: Record<string, any> | null = null;
  let fabricBlocks = false;
  try {
    canonicalGovernedState = await buildCanonicalGovernedState({
      context: {
        organizationId: String(orgId),
        projectId: String(projectId),
        actorId,
        intendedAction: 'export',
        documentType: 'cmc_module3',
        ctdSection: '3',
      },
      documentState: {
        hasContent: sections.length > 0,
        hasEvidence: sections.length > 0,
        hasBeenReviewed: approvedCount > 0,
        hasApproval: allApproved,
        hasPlacement: true,
        placementValid: true,
        hasProvenance: true,
        unresolvedContradictionCount: unresolvedCount,
        criticalContradictionCount: openCritical,
        isStale: staleSections > 0,
        completenessScore: sections.length > 0 ? approvedCount / sections.length : 0,
      },
      exportState: {
        humanReviewApproved: allApproved,
        aiGenerated: false,
        provenanceComplete: true,
      },
    });
    fabricBlocks =
      canonicalGovernedState.derivedFlags?.isBlocked === true ||
      canonicalGovernedState.derivedFlags?.hasUnresolvedGovernedDecisions === true;
  } catch (fabricErr) {
    fabricBlocks = true;
    canonicalGovernedState = { error: 'Canonical governed-state evaluation failed', degraded: true, blocked: true };
  }

  const governedDecisionsBlock =
    canonicalGovernedState &&
    typeof canonicalGovernedState === 'object' &&
    (canonicalGovernedState as any).derivedFlags?.hasUnresolvedGovernedDecisions === true;

  const data = {
    totalSections: sections.length,
    approvedSections: approvedCount,
    staleSections,
    openCriticalContradictions: openCritical,
    canonicalGovernedState,
  };

  // Fail-closed convergence: block if the existing check OR the fabric blocks OR
  // governed decisions are unresolved OR any section went stale after approval.
  if (!allowed || fabricBlocks || governedDecisionsBlock || staleSections > 0) {
    const errorMsg =
      staleSections > 0
        ? `${staleSections} section(s) went stale after approval and must be re-approved before final export`
        : governedDecisionsBlock && allowed && !fabricBlocks
          ? `Unresolved governed decisions block final export (${(canonicalGovernedState as any).decisionLifecycle?.unresolvedCount || 0} unresolved, ${(canonicalGovernedState as any).decisionLifecycle?.escalatedCount || 0} escalated)`
          : fabricBlocks && allowed
            ? 'Governed document fabric blocked final export'
            : 'Critical contradictions or missing approvals block final export';
    return { allowed: false, error: errorMsg, data };
  }

  return { allowed: true, data };
}

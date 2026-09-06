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
 * governed decisions are unresolved, any section went stale after approval,
 * the provenance chain has a gap, OR an approved section is not actually
 * complete.
 *
 * That last clause was missing until it was found live: a project with every
 * section's `approval_state` at 'approved' passed this gate while three of
 * those sections had compiled at 0% completeness, every required input
 * missing — the compiler itself stores `completeness` and `missingInputs` in
 * the same row's `deterministic_json` at compile time
 * (module3OperatingSystemRoutes.ts), and this gate never read either. A
 * signer's "approved" is a claim about content they reviewed, not a claim the
 * content exists; the gate must not let the first stand in for the second.
 */
import { getPool } from '../../db';
import { canFinalizeExport } from '../cmc-module3-compiler';
import { buildCanonicalGovernedState } from '../governed-ana-execution.js';

export interface Module3GovernedState {
  totalSections: number;
  approvedSections: number;
  staleSections: number;
  openCriticalContradictions: number;
  /** Sections with no `cmc_section_lineage` row — no traceable source. */
  sectionsWithoutProvenance: number;
  /**
   * Approved sections the compiler did not actually establish, by key:
   * `completeness` under 100 or a required input still named in
   * `missingInputs`, both read from the section's own compiled record.
   */
  incompleteApprovedSections: string[];
  canonicalGovernedState: Record<string, unknown> | null;
  /**
   * Did the governed-decision fabric actually produce a verdict? False when the
   * evaluation threw. A readiness read must not report clearance over `false` —
   * the gate refuses in that state, so a surface that says "export ready" is
   * promising something the gate will decline.
   */
  governedStateEvaluated: boolean;
  /** True when the fabric returned a blocking verdict. */
  fabricBlocks: boolean;
  /** True when the fabric reports unresolved governed decisions. */
  governedDecisionsBlock: boolean;
}

export interface FinalExportGateVerdict {
  allowed: boolean;
  /** Present when refused — the reason, exactly as the guard endpoint words it. */
  error?: string;
  data: Module3GovernedState;
}

/**
 * The compiler's own record of a section, stored in `deterministic_json` at
 * compile time. `deterministic_json` may arrive as a string (raw driver rows)
 * or already parsed (pooled/mocked clients); both are read the same way, and
 * anything unreadable is treated as "nothing established" — never as complete.
 */
function parsedDeterministicJson(row: any): Record<string, unknown> {
  const raw = row.deterministic_json ?? row.deterministicJson;
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * A section's compiled record is complete only when the compiler scored it at
 * exactly 100 AND left no required input named missing. A record with no
 * completeness figure at all was never compiled through the composer and
 * cannot be called complete.
 */
function compiledRecordIsComplete(json: Record<string, unknown>): boolean {
  const completeness = typeof json.completeness === 'number' ? json.completeness : null;
  const missing = Array.isArray(json.missingInputs) ? json.missingInputs : [];
  return completeness === 100 && missing.length === 0;
}

/**
 * Evaluate the Module 3 governed state ONCE, for both the export gate and the
 * readiness read.
 *
 * The two used to build the `documentState` argument separately, and both
 * handed `buildCanonicalGovernedState` the literals `hasProvenance: true` /
 * `provenanceComplete: true`. Provenance completeness is a REQUIRED, blocking
 * export check ("audit trail required for export"), so asserting it disabled
 * the control: a section with no lineage row — no traceable source at all —
 * cleared a check that exists to catch exactly that. It is derived here from
 * `cmc_section_lineage`, which the compile path writes with every section.
 *
 * `hasPlacement` / `placementValid` remain true by construction and say why:
 * this gate runs BEFORE placement and is what authorizes it, so "not yet
 * placed" is the expected state, not a defect to block on. The CTD destination
 * is fixed by the section key, and placement itself re-checks org, submission
 * and lock state on every leaf write.
 */
export async function evaluateModule3GovernedState(params: {
  orgId: number;
  projectId: string;
  actorId: string;
  intendedAction?: 'export' | 'publish';
}): Promise<{ state: Module3GovernedState; contradictions: Array<{ severity: string; status: string }> }> {
  const { orgId, projectId, actorId } = params;
  const pool = getPool();

  const [sectionsRes, contradictionsRes, lineageRes] = await Promise.all([
    pool.query(
      `SELECT section_key, approval_state, stale, deterministic_json FROM cmc_module3_sections WHERE organization_id = $1 AND project_id = $2`,
      [orgId, projectId]
    ),
    pool.query(
      `SELECT severity, status FROM cmc_contradictions WHERE organization_id = $1 AND project_id = $2`,
      [orgId, projectId]
    ),
    // Sections with no lineage row: compiled content whose source cannot be
    // traced. The compile path writes lineage in the same transaction as the
    // section, so a gap here is a real break in the audit trail.
    pool.query(
      `SELECT COUNT(*)::int AS n
         FROM cmc_module3_sections s
        WHERE s.organization_id = $1 AND s.project_id = $2
          AND NOT EXISTS (
            SELECT 1 FROM cmc_section_lineage l
             WHERE l.section_id = s.id AND l.organization_id = s.organization_id
          )`,
      [orgId, projectId]
    ),
  ]);

  const sections = sectionsRes.rows;
  const contradictions = contradictionsRes.rows || [];
  const totalSections = sections.length;
  const approvedSections = sections.filter((s: any) => s.approval_state === 'approved').length;
  const staleSections = sections.filter((s: any) => Boolean(s.stale)).length;
  const allApproved = totalSections > 0 && approvedSections === totalSections;
  const openCritical = contradictions.filter(
    (c: any) => c.severity === 'critical' && c.status !== 'resolved'
  ).length;
  const unresolvedCount = contradictions.filter((c: any) => c.status !== 'resolved').length;
  const sectionsWithoutProvenance = Number(lineageRes.rows[0]?.n ?? 0);
  const incompleteApprovedSections = sections
    .filter((s: any) => s.approval_state === 'approved')
    .filter((s: any) => !compiledRecordIsComplete(parsedDeterministicJson(s)))
    .map((s: any) => String(s.section_key ?? s.sectionKey ?? 'unknown section'));
  // Derived, never asserted: with no sections there is no provenance chain to
  // be complete, and a section with no lineage row breaks it.
  const provenanceComplete = totalSections > 0 && sectionsWithoutProvenance === 0;

  let canonicalGovernedState: Record<string, any> | null;
  let governedStateEvaluated: boolean;
  let fabricBlocks: boolean;
  try {
    canonicalGovernedState = await buildCanonicalGovernedState({
      context: {
        organizationId: String(orgId),
        projectId: String(projectId),
        actorId,
        intendedAction: params.intendedAction ?? 'export',
        documentType: 'cmc_module3',
        ctdSection: '3',
      },
      documentState: {
        hasContent: totalSections > 0,
        hasEvidence: totalSections > 0,
        hasBeenReviewed: approvedSections > 0,
        hasApproval: allApproved,
        // See the docstring: this gate precedes placement and authorizes it.
        hasPlacement: true,
        placementValid: true,
        hasProvenance: provenanceComplete,
        unresolvedContradictionCount: unresolvedCount,
        criticalContradictionCount: openCritical,
        isStale: staleSections > 0,
        completenessScore: totalSections > 0 ? approvedSections / totalSections : 0,
      },
      exportState: {
        humanReviewApproved: allApproved,
        // The sections in cmc_module3_sections come from the deterministic
        // composer; the AI narrative refinement runs in the orchestrator's
        // m3.refine step and does not write this table.
        aiGenerated: false,
        provenanceComplete,
      },
    });
    governedStateEvaluated = true;
    fabricBlocks =
      canonicalGovernedState.derivedFlags?.isBlocked === true ||
      canonicalGovernedState.derivedFlags?.hasUnresolvedGovernedDecisions === true;
  } catch {
    // Fail closed, and SAY the evaluation did not happen — a caller must not
    // read this as a fabric that looked and found nothing.
    governedStateEvaluated = false;
    fabricBlocks = true;
    canonicalGovernedState = { error: 'Canonical governed-state evaluation failed', degraded: true, blocked: true };
  }

  const governedDecisionsBlock =
    (canonicalGovernedState as any)?.derivedFlags?.hasUnresolvedGovernedDecisions === true;

  return {
    state: {
      totalSections,
      approvedSections,
      staleSections,
      openCriticalContradictions: openCritical,
      sectionsWithoutProvenance,
      incompleteApprovedSections,
      canonicalGovernedState,
      governedStateEvaluated,
      fabricBlocks,
      governedDecisionsBlock,
    },
    // The raw rows, so the gate runs the canonical `canFinalizeExport` over the
    // real contradictions rather than a count reconstructed into fake rows.
    contradictions: contradictions as Array<{ severity: string; status: string }>,
  };
}

export async function evaluateFinalExportGate(params: {
  orgId: number;
  projectId: string;
  actorId: string;
}): Promise<FinalExportGateVerdict> {
  const { state: data, contradictions } = await evaluateModule3GovernedState(params);

  const allApproved = data.totalSections > 0 && data.approvedSections === data.totalSections;
  const allowed = canFinalizeExport({
    approvalState: allApproved ? 'approved' : 'draft',
    contradictions,
  });

  // Fail-closed convergence: block if the existing check OR the fabric blocks OR
  // governed decisions are unresolved OR any section went stale after approval
  // OR the provenance chain has a gap OR an approved section is not what the
  // compiler established.
  if (
    !allowed ||
    data.fabricBlocks ||
    data.governedDecisionsBlock ||
    data.staleSections > 0 ||
    data.sectionsWithoutProvenance > 0 ||
    data.incompleteApprovedSections.length > 0
  ) {
    const state = data.canonicalGovernedState as any;
    const incomplete = data.incompleteApprovedSections;
    const errorMsg =
      incomplete.length > 0
        ? `${incomplete.length} approved section(s) are not complete and cannot be exported: ` +
          `${incomplete.join(', ')}. An approval is a claim about content that was reviewed; ` +
          `the compiler records these as missing required inputs. Record the inputs, recompile and re-approve.`
        : data.staleSections > 0
        ? `${data.staleSections} section(s) went stale after approval and must be re-approved before final export`
        : data.sectionsWithoutProvenance > 0
          ? `${data.sectionsWithoutProvenance} section(s) have no recorded source lineage, so the audit trail required for export is incomplete`
          : !data.governedStateEvaluated
            ? 'The governed-decision state could not be evaluated, so final export is refused rather than cleared'
            : data.governedDecisionsBlock && allowed && !data.fabricBlocks
              ? `Unresolved governed decisions block final export (${state?.decisionLifecycle?.unresolvedCount || 0} unresolved, ${state?.decisionLifecycle?.escalatedCount || 0} escalated)`
              : data.fabricBlocks && allowed
                ? 'Governed document fabric blocked final export'
                : 'Critical contradictions or missing approvals block final export';
    return { allowed: false, error: errorMsg, data };
  }

  return { allowed: true, data };
}

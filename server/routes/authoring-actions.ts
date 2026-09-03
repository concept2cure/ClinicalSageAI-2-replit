/**
 * Authoring Actions API — Wave 1 + Wave 2 AnA-first authoring action endpoints.
 *
 * These endpoints serve the section-aware authoring actions that AnA triggers
 * from the frontend. They reuse existing backend services (contradiction engine,
 * readiness engine, promote handler, harmonize engine, etc.).
 *
 * @module server/routes/authoring-actions
 */

import { Router, Request, Response } from 'express';
import {
  resolveGovernedContext,
} from '../services/concept2cure/governedDocumentContractService.js';
import auditService from '../services/auditService';

const router = Router();

function requireTenantId(req: Request, res: Response): number | null {
  const rawTenantId = (req as any).tenantId ?? (req as any).organizationId;
  const tenantId = Number(rawTenantId);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    res.status(401).json({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

async function getScopedArtifact(
  projectId: number,
  artifactId: number,
  organizationId: number
): Promise<any | null> {
  const { db } = await import('../db.js');
  return (
    (await db.query.concept2cureArtifacts?.findFirst?.({
      where: (a: any, { and, eq }: any) =>
        and(
          eq(a.id, artifactId),
          eq(a.projectId, projectId),
          eq(a.organizationId, organizationId)
        ),
    })) || null
  );
}
type GovernedResolutionLike = {
  validation: {
    errors: string[];
    warnings: string[];
  };
  resolved: unknown;
};

type GovernedContractInvalidError = Error & {
  governed?: GovernedResolutionLike;
};

const createGovernedContractInvalidError = (
  governed: GovernedResolutionLike
): GovernedContractInvalidError => {
  const error = new Error(
    `governed contract invalid: ${governed.validation.errors.join('; ')}`
  ) as GovernedContractInvalidError;
  error.name = 'GovernedContractInvalidError';
  error.governed = governed;
  return error;
};

const isGovernedContractInvalidError = (
  error: unknown
): error is GovernedContractInvalidError =>
  error instanceof Error && error.name === 'GovernedContractInvalidError';

const sendGovernedContractInvalid = (
  res: Response,
  governed: GovernedResolutionLike
) =>
  res.status(400).json({
    success: false,
    error: {
      message: 'Governed document contract validation failed',
      code: 'GOVERNED_CONTRACT_INVALID',
      details: {
        errors: governed.validation.errors,
        warnings: governed.validation.warnings,
        resolved: governed.resolved,
      },
    },
  });

// ─── Wave 1 Action 1: Resume Last Section ────────────────────────────────────

/**
 * The per-section preflight verdict, extracted so the rule is testable.
 *
 * THE DEFECT THIS REPLACES. The verdict read
 *
 *     const allUnknown = statuses.every(s => s === 'unknown')
 *     ... else if (allUnknown) overall = 'needs-review'
 *     else overall = 'ready'
 *
 * so anything short of EVERY check being unknown fell through to 'ready'. Two
 * of the five entries — crossSectionConsistency and approvedBaselineCompare —
 * were hardcoded 'unknown' placeholders that have never had an implementation,
 * and `readiness` returns 'unknown' whenever its engine throws. A section where
 * four checks never ran and exactly one passed therefore satisfied
 * `!allUnknown` and was reported 'Ready'.
 *
 * The module rolls those up as "ready — all N section(s) pass preflight", and
 * this router's one live consumer (server/services/ana-ri/mdx-command-handlers.ts,
 * the AnA 510(k) preflight command) writes that verdict into a GxP audit record
 * and reports it to the user. So the fabricated pass did not stop at an unused
 * endpoint — it reached the regulated record.
 *
 * "Not failed" is not "passed". A check that did not run is not evidence of
 * anything: a section is ready only when at least one check ran, every check
 * that ran passed, and none came back unknown. Placeholders are excluded from
 * the verdict entirely rather than counted as inconclusive checks — a TODO does
 * not belong in the denominator.
 */
export interface SectionPreflightVerdict {
  overall: 'blocked' | 'provisional' | 'needs-review' | 'ready';
  summary: string;
  checksRan: number;
  checksDidNotRun: string[];
}

/**
 * The governed-authority verdict for an action, resolved FAIL-CLOSED.
 *
 * All three governed status transitions in this router asked
 * decisionLifecycleService.checkAuthority(...) inside
 *
 *     try { … } catch { (a comment reading "non-blocking") }
 *
 * so a throw from the dynamic import or the check itself left the verdict unset
 * and execution continued into the write. An authorization gate whose failure
 * mode is "proceed" is not a gate. Worse, /promote-to-review never consulted
 * `allowed` at all — it computed the verdict, used `authority.requiresReviewerApproval`
 * as a descriptive field in the response, and promoted the artifact regardless
 * of the caller's role.
 *
 * One resolver for all three. A check that cannot be completed refuses, and
 * says that it is the CHECK that failed rather than implying the caller's role
 * was the problem — those are different facts and only one of them is about the
 * caller.
 *
 * The predicate itself (isActorAuthorized in shared/types/decision-architecture.ts)
 * is already correct: it denies an unknown or missing role. Only the plumbing
 * around it was wrong.
 */
export async function resolveGovernedAuthority(
  action: string,
  actorRole?: string,
): Promise<{
  allowed: boolean;
  /* Structural rather than `unknown`: callers echo the requirement back to the
     client so a refused actor can see WHAT was required of them. */
  authority?: { level?: string; requiresReviewerApproval?: boolean } | undefined;
  reason: string;
  checkFailed: boolean;
}> {
  try {
    const { decisionLifecycleService } = await import('../services/decision-lifecycle-service.js');
    const check = decisionLifecycleService.checkAuthority(action as never, actorRole);
    return {
      allowed: check?.allowed === true,
      authority: check?.authority,
      reason: check?.reason ?? '',
      checkFailed: false,
    };
  } catch {
    return {
      allowed: false,
      authority: undefined,
      reason:
        'The authority check for this action could not be completed, so the action was refused. ' +
        'This is a failure to CHECK, not a decision about your role.',
      checkFailed: true,
    };
  }
}

export function sectionPreflightVerdict(
  checks: Record<string, { status?: string } | null | undefined>,
): SectionPreflightVerdict {
  const assessed = Object.entries(checks || {}).filter(
    ([, c]) => c && c.status && c.status !== 'not-implemented',
  );
  const statuses = assessed.map(([, c]) => (c as { status: string }).status);
  const hasFail = statuses.includes('fail');
  const hasWarn = statuses.includes('warn');
  const checksDidNotRun = assessed
    .filter(([, c]) => (c as { status: string }).status === 'unknown')
    .map(([name]) => name);
  const checksRan = statuses.filter((st) => st !== 'unknown').length;

  let overall: SectionPreflightVerdict['overall'];
  if (hasFail) overall = 'blocked';
  else if (hasWarn) overall = 'provisional';
  else if (checksDidNotRun.length > 0 || checksRan === 0) overall = 'needs-review';
  else overall = 'ready';

  const summary =
    overall === 'blocked'
      ? 'Blocked'
      : overall === 'provisional'
        ? 'Warnings'
        : overall === 'ready'
          ? `Ready — ${checksRan} check(s) ran and passed`
          : checksDidNotRun.length > 0
            ? `Needs review — ${checksDidNotRun.length} check(s) did not run: ${checksDidNotRun.join(', ')}`
            : 'Needs review — no check produced a result';

  return { overall, summary, checksRan, checksDidNotRun };
}

router.get('/resume-last-section/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const orgId = requireTenantId(req, res);
    if (orgId == null) return;

    // Query artifacts sorted by most recent update
    const { db } = await import('../db.js');
    const artifacts = await db.query.concept2cureArtifacts?.findMany?.({
      where: (a: any, { and, eq }: any) =>
        and(eq(a.projectId, Number(projectId)), eq(a.organizationId, Number(orgId))),
      orderBy: (a: any, { desc }: any) => [desc(a.updatedAt)],
      limit: 1,
    }).catch(() => null);

    if (!artifacts || artifacts.length === 0) {
      return res.json({
        found: false,
        message: 'No recent sections found. Start by opening a section from the dossier.',
      });
    }

    const latest = artifacts[0];
    return res.json({
      found: true,
      artifactId: latest.id,
      title: latest.title,
      ctdSection: latest.ctdSection || null,
      status: latest.status || 'draft',
      updatedAt: latest.updatedAt,
    });
  } catch (err: any) {
    console.error('[authoring-actions] resume-last-section error:', err?.message);
    return res.status(500).json({ error: 'Failed to resolve last section' });
  }
});

// ─── Wave 1 Action 3: Explain Promotion Blockers ────────────────────────────

router.get('/promotion-blockers/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { artifactId, sectionCode } = req.query;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }
    const orgId = requireTenantId(req, res);
    if (orgId == null) return;

    const blockers: Array<{ type: string; severity: string; message: string; source: string }> = [];
    /* Which blocker sources actually produced an answer. Both sources below sit
       in their own try, so a failure in one used to be indistinguishable from
       that source finding nothing — and an empty blocker list reads as a clean
       project. */
    const checksRun: string[] = [];
    const checksNotRun: string[] = [];

    // Check contradiction engine
    try {
      const { contradictionEngineService } = await import(
        '../services/contradiction-engine-service.js'
      );
      if (contradictionEngineService?.scanProject) {
        const scanResult = await contradictionEngineService.scanProject(
          orgId,
          Number(projectId)
        );
        const findings = scanResult?.findings ?? [];
        if (findings.length) {
          for (const f of findings as any[]) {
            if (
              f.authorityState === 'blocks_promotion' ||
              f.authorityState === 'requires_approval'
            ) {
              blockers.push({
                type: f.contradictionType || f.type || 'contradiction',
                severity: f.authorityState === 'blocks_promotion' ? 'critical' : 'major',
                message: f.explanation || f.description || 'Unresolved contradiction',
                source: 'contradiction-engine',
              });
            }
          }
        }
        checksRun.push('contradiction-engine');
      } else {
        checksNotRun.push('contradiction-engine');
      }
    } catch (contradictionErr: any) {
      checksNotRun.push('contradiction-engine');
      console.warn(
        '[authoring-actions] promotion-blockers: contradiction scan did not run:',
        contradictionErr?.message,
      );
    }

    /* Check readiness engine.
       The payload used to be built by hand — `{ project: { id }, organizationId }`
       cast through `as any` — and it carried none of the five fields the engine
       reads. computeReadinessAssessment evaluates `completeness` first, whose
       first statement is `payload.moduleMap.filter(...)`, so it threw a
       TypeError on EVERY call. The bare catch below swallowed it and the
       readiness blockers were simply never collected.

       assembleCrossObjectPayload is the canonical builder for this payload —
       continuity-service, lumen-context-builder and workflow-orchestrator all
       use it — so this uses it too rather than hand-rolling a sixth shape. */
    try {
      const { assembleCrossObjectPayload } = await import(
        '../services/orchestration/cross-object-resolver.js'
      );
      const { computeReadinessAssessment } = await import(
        '../services/orchestration/readiness-engine.js'
      );
      const payload = await assembleCrossObjectPayload({
        organizationId: Number(orgId),
        projectId: Number(projectId),
      });
      const assessment = computeReadinessAssessment(payload);
      if (assessment?.blockers?.length) {
        for (const b of assessment.blockers as any[]) {
          blockers.push({
            type: b.type || b.category || 'readiness',
            severity: b.severity || 'major',
            message: b.description || b.message || 'Readiness blocker',
            source: 'readiness-engine',
          });
        }
      }
      checksRun.push('readiness-engine');
    } catch (readinessErr: any) {
      /* Recorded, not swallowed. See the note on the response below. */
      checksNotRun.push('readiness-engine');
      console.warn(
        '[authoring-actions] promotion-blockers: readiness check did not run:',
        readinessErr?.message,
      );
    }

    /* WHY `blocked` CAN BE NULL.
       This answered `blocked: blockers.some(b => b.severity === 'critical')`
       unconditionally. Both blocker sources above sat in bare catches, so when a
       source failed to run its blockers were never collected — and an empty
       list reads exactly like a clean one. With the readiness payload malformed
       on every call, this endpoint reported `blocked: false, blockerCount: 0`
       for a promotion gate that had evaluated nothing.

       A gate that ran zero checks has not cleared anything. When every source
       ran, `blocked` is the real verdict. When any source did not, it is null —
       "cannot say" — and the sources that failed are named, so a caller can see
       what the answer is missing rather than acting on a false all-clear. */
    const checksIncomplete = checksNotRun.length > 0;
    return res.json({
      projectId,
      artifactId: artifactId || null,
      sectionCode: sectionCode || null,
      blocked: checksIncomplete ? null : blockers.some(b => b.severity === 'critical'),
      blockerCount: blockers.length,
      blockers,
      checksRun,
      checksNotRun,
      ...(checksIncomplete
        ? {
            message:
              `${checksNotRun.length} blocker source(s) could not be evaluated ` +
              `(${checksNotRun.join(', ')}), so whether this project is blocked is unknown.`,
          }
        : {}),
    });
  } catch (err: any) {
    console.error('[authoring-actions] promotion-blockers error:', err?.message);
    return res.status(500).json({ error: 'Failed to check promotion blockers' });
  }
});

// ─── Wave 1 Action 4: Compare Against Last Approved Version ──────────────────

router.get('/compare-versions/:projectId/:artifactId', async (req: Request, res: Response) => {
  try {
    const { projectId, artifactId } = req.params;

    if (!projectId || !artifactId) {
      return res.status(400).json({ error: 'projectId and artifactId are required' });
    }

    const orgId = requireTenantId(req, res);
    if (orgId == null) return;

    // Fetch artifact versions — try direct version table, fall back to artifact API.
    // Scope both lookups to the caller's organization so a version id belonging
    // to another tenant can never be read.
    let versions: any[] | null = null;
    try {
      const { db } = await import('../db.js');
      versions = await db.query.concept2cureArtifactVersions?.findMany?.({
        where: (v: any, { and, eq }: any) =>
          and(
            eq(v.artifactId, Number(artifactId)),
            eq(v.organizationId, Number(orgId))
          ),
        orderBy: (v: any, { desc }: any) => [desc(v.version)],
        limit: 10,
      });
    } catch {
      // Version table may not exist — try fetching artifact directly for version info
      try {
        const { db } = await import('../db.js');
        const artifact = await db.query.concept2cureArtifacts?.findFirst?.({
          where: (a: any, { and, eq }: any) =>
            and(
              eq(a.id, Number(artifactId)),
              eq(a.projectId, Number(projectId)),
              eq(a.organizationId, Number(orgId))
            ),
        });
        if (artifact) {
          return res.json({
            available: false,
            message: `Artifact "${artifact.title}" found (v${artifact.version || 1}, status: ${artifact.status || 'draft'}). Detailed version history requires version tracking to be enabled.`,
            artifact: { id: artifact.id, title: artifact.title, version: artifact.version, status: artifact.status },
          });
        }
      } catch { /* non-blocking */ }
    }

    if (!versions || versions.length < 2) {
      return res.json({
        available: false,
        message: versions?.length === 1
          ? 'Only one version exists. No comparison available yet.'
          : 'No versions found for this artifact.',
      });
    }

    const current = versions[0];
    // Find last approved version (or fall back to previous version)
    const approved = versions.find((v: any) => v.status === 'approved') || versions[1];

    return res.json({
      available: true,
      currentVersion: {
        version: current.version,
        status: current.status,
        updatedAt: current.updatedAt || current.createdAt,
        contentLength: current.content?.length || 0,
      },
      approvedVersion: {
        version: approved.version,
        status: approved.status,
        updatedAt: approved.updatedAt || approved.createdAt,
        contentLength: approved.content?.length || 0,
      },
      diffSummary: {
        currentWords: (current.content || '').split(/\s+/).length,
        approvedWords: (approved.content || '').split(/\s+/).length,
      },
    });
  } catch (err: any) {
    console.error('[authoring-actions] compare-versions error:', err?.message);
    return res.status(500).json({ error: 'Failed to compare versions' });
  }
});

// ─── Wave 1 Action 5: Promote to Review (governed) ──────────────────────────

router.post('/promote-to-review', async (req: Request, res: Response) => {
  try {
    const { projectId, artifactId } = req.body;

    if (!projectId || !artifactId) {
      return res.status(400).json({ error: 'projectId and artifactId are required' });
    }

    const orgId = requireTenantId(req, res);
    if (orgId == null) return;

    // Step 1: Governance boundary evaluation (includes contradiction + readiness gates)
    let blocked = false;
    const blockReasons: string[] = [];
    let boundaryTransition: any = null;

    try {
      const { GovernanceBoundaryService } = await import(
        '../services/governance-boundary-service.js'
      );
      const boundaryService = GovernanceBoundaryService.getInstance();
      const transitionResult = await boundaryService.evaluateTransition({
        organizationId: Number(orgId),
        projectId: Number(projectId),
        artifactId: Number(artifactId),
        fromBoundary: 'advisory',
        toBoundary: 'governed_draft',
        actorId: (req as any).userId ? Number((req as any).userId) : undefined,
        actorRole: (req as any).userRole || undefined,
      });

      boundaryTransition = transitionResult.transition;

      if (!transitionResult.allowed) {
        blocked = true;
        blockReasons.push(...transitionResult.blockedReasons);
      }
    } catch {
      // Governance boundary service unavailable — fall back to direct contradiction check
      try {
        const { contradictionEngineService } = await import(
          '../services/contradiction-engine-service.js'
        );
        if (contradictionEngineService?.checkPromotionBlocked) {
          const result = await contradictionEngineService.checkPromotionBlocked(
            orgId,
            Number(projectId),
            Number(artifactId)
          );
          if (result?.blocked) {
            blocked = true;
            blockReasons.push(
              ...((result.blockingFindings || (result as any).findings || []).map(
                (f: any) => f.title || f.explanation || 'Unresolved blocking contradiction'
              ))
            );
          }
        }
      } catch {
        // Fail closed if contradiction checks are unavailable during promotion.
        blocked = true;
        blockReasons.push(
          'Promotion blocked: contradiction checks unavailable. Retry when governance services are healthy.'
        );
      }
    }

    // ── Record blocked promotion as a formal decision ──────────────
    if (blocked) {
      let blockedDecision: any = null;
      try {
        const { decisionLifecycleService } = await import(
          '../services/decision-lifecycle-service.js'
        );
        blockedDecision = decisionLifecycleService.recordGovernedActionDecision({
          projectId: String(projectId),
          organizationId: Number(orgId),
          kind: 'promotion-decision',
          governedAction: 'promote-to-review',
          artifactId: String(artifactId),
          summary: `Promotion blocked: ${blockReasons.length} unresolved issue(s)`,
          rationale: blockReasons.join('; '),
          sourceSignals: blockReasons.map(r => ({
            kind: 'contradiction' as const, summary: r, severity: 'critical' as const,
          })),
          createdByType: 'ana',
          createdById: (req as any).userId || undefined,
        });
        // Receipt for the blocked promotion
        if (blockedDecision) {
          decisionLifecycleService.createReceipt({
            decisionId: blockedDecision.id,
            projectId: String(projectId),
            recommendation: {
              summary: 'Promote artifact to review',
              actionIds: ['promote-to-review'],
              rationale: 'Promotion requested but blocked by unresolved issues',
            },
            confirmation: { accepted: false, rejectionReason: 'Blocked by contradictions' },
            execution: { executed: false, error: 'Blocked by unresolved contradictions' },
            affectedObjects: [{ objectType: 'artifact', objectId: String(artifactId), previousState: 'draft', newState: 'draft', changeDescription: 'Promotion blocked' }],
          });
        }
      } catch { /* non-blocking */ }

      return res.json({
        promoted: false,
        reason: 'blocked',
        blockers: blockReasons,
        message: `Promotion blocked: ${blockReasons.length} unresolved issue(s). Resolve these before promoting.`,
        decisionId: blockedDecision?.id || null,
        authority: blockedDecision?.authority || null,
      });
    }

    // Step 2: Authority check
    /* This verdict used to be computed and then ignored: `allowed` was never
       consulted, and the only read of `authorityCheck` was
       `authority.requiresReviewerApproval` as a descriptive field in the
       response below. The promotion went through whatever the caller's role. */
    const authorityCheck = await resolveGovernedAuthority(
      'promote-to-review',
      (req as any).userRole || undefined
    );
    if (!authorityCheck.allowed) {
      return res.json({
        promoted: false,
        reason: authorityCheck.checkFailed ? 'authority-check-failed' : 'unauthorized',
        message: authorityCheck.reason || 'Reviewer approval required',
        authority: authorityCheck.authority,
      });
    }

    // Step 3: Execute promotion via existing governed path
    try {
      const scopedArtifact = await getScopedArtifact(Number(projectId), Number(artifactId), Number(orgId));
      if (!scopedArtifact) throw new Error('Artifact not found for project/tenant');
      if (scopedArtifact.status === 'locked' || scopedArtifact.status === 'approved') {
        throw new Error(`Cannot promote: artifact is ${scopedArtifact.status}`);
      }
      // Update status
      const { concept2cureArtifacts } = await import('../../shared/schema/index.js');
      const { and, eq } = await import('drizzle-orm');
      const { db } = await import('../db.js');
      const metadata =
        scopedArtifact.metadata && typeof scopedArtifact.metadata === 'object'
          ? (scopedArtifact.metadata as Record<string, unknown>)
          : {};
      const existingHarness =
        metadata.harness && typeof metadata.harness === 'object'
          ? (metadata.harness as Record<string, unknown>)
          : {};
      const governed = resolveGovernedContext({
        req,
        projectId: Number(projectId),
        artifactId: Number(artifactId),
        documentType:
          (typeof existingHarness.documentType === 'string' && existingHarness.documentType) ||
          scopedArtifact.type ||
          'regulatory_document',
        generationMode: 'manual',
        lifecycleStatus: 'in_review',
        originSurface: 'api_route',
        readinessGate: 'internal_review',
        workspaceTarget: 'project',
        title: scopedArtifact.title || 'Artifact',
        content: scopedArtifact.content || '',
        ctdSection: scopedArtifact.ctdSection || null,
        sourceRefs: [`artifact:${scopedArtifact.artifactId || scopedArtifact.id}`],
        eventType: 'artifact.reviewed',
      });
      if (!governed.validation.valid) {
        throw createGovernedContractInvalidError(governed);
      }
      await db
        .update(concept2cureArtifacts)
        .set({
          status: 'review',
          updatedAt: new Date(),
          metadata: {
            ...metadata,
            harness: {
              ...existingHarness,
              clientTrack: governed.contract.clientTrack,
              submissionProgram: governed.contract.submissionProgram,
              persona: governed.contract.persona,
              regulatorScope: governed.contract.regulatorScope,
              documentClass: governed.contract.documentClass,
              readinessGate: governed.contract.readinessGate,
              workspaceTarget: governed.contract.workspaceTarget,
              originSurface: governed.contract.originSurface,
              recommendationSource: governed.contract.recommendationSource,
              regulatorIntent: governed.contract.regulatorIntent,
              gateChecks: governed.contract.exportEligibility.gateChecks,
              blockingReasons: governed.contract.exportEligibility.blockingReasons,
              readinessOutcome: governed.contract.exportEligibility.readinessOutcome,
            },
          },
        })
        .where(
          and(
            eq(concept2cureArtifacts.id, Number(artifactId)),
            eq(concept2cureArtifacts.projectId, Number(projectId)),
            eq(concept2cureArtifacts.organizationId, Number(orgId))
          )
        );

      // ── Record successful promotion decision + receipt ──────────
      let promotionDecision: any = null;
      let promotionReceipt: any = null;
      try {
        const { decisionLifecycleService } = await import(
          '../services/decision-lifecycle-service.js'
        );
        promotionDecision = decisionLifecycleService.recordGovernedActionDecision({
          projectId: String(projectId),
          organizationId: Number(orgId),
          kind: 'promotion-decision',
          governedAction: 'promote-to-review',
          artifactId: String(artifactId),
          summary: 'Artifact promoted to review',
          rationale: 'No blocking contradictions. Preflight passed or skipped.',
          sourceSignals: [{ kind: 'user-request' as const, summary: 'User confirmed promotion' }],
          createdByType: 'human',
          createdById: (req as any).userId || undefined,
        });
        // Transition to confirmed → executed
        if (promotionDecision) {
          decisionLifecycleService.transitionDecision(promotionDecision.id, 'confirmed', {
            actorId: (req as any).userId,
          });
          decisionLifecycleService.transitionDecision(promotionDecision.id, 'executed', {
            actorId: (req as any).userId,
          });
          promotionReceipt = decisionLifecycleService.createReceipt({
            decisionId: promotionDecision.id,
            projectId: String(projectId),
            recommendation: {
              summary: 'Promote artifact to review',
              actionIds: ['promote-to-review'],
              rationale: 'Artifact passed preflight or user overrode warnings',
            },
            confirmation: {
              accepted: true,
              confirmedById: (req as any).userId || undefined,
            },
            execution: {
              executed: true,
              executedById: (req as any).userId || undefined,
              executionMethod: 'status-transition:draft→review',
            },
            affectedObjects: [{
              objectType: 'artifact',
              objectId: String(artifactId),
              previousState: 'draft',
              newState: 'review',
              changeDescription: 'Artifact status changed from draft to review',
            }],
            pendingApprovals: authorityCheck?.authority?.requiresReviewerApproval
              ? [{ requiredRole: 'reviewer', reason: 'Artifact needs reviewer sign-off', status: 'pending' as const }]
              : [],
          });
        }
      } catch { /* non-blocking */ }

      return res.json({
        promoted: true,
        message: 'Artifact promoted to review. Governance workflow initiated.',
        newStatus: 'review',
        decisionId: promotionDecision?.id || null,
        receiptId: promotionReceipt?.id || null,
        authority: promotionDecision?.authority || null,
        pendingApprovals: promotionReceipt?.pendingApprovals || [],
        boundaryTransitionId: boundaryTransition?.id || null,
      });
    } catch (promoteErr: any) {
      if (isGovernedContractInvalidError(promoteErr) && promoteErr.governed) {
        return sendGovernedContractInvalid(res, promoteErr.governed);
      }
      // A governed promotion that threw did NOT happen. Reporting it as HTTP 200
      // with `promoted: false` put a failed state transition on the success side
      // of every caller's error handling and of the request metrics — the
      // artifact's status, its decision record and its receipt are all in doubt,
      // and a 200 says none of that is worth a retry or an alert. The
      // machine-readable reason is preserved in the body; only the status
      // changes, so a caller that already branches on `promoted` still works.
      console.error('[authoring-actions] promote-to-review failed:', promoteErr?.message);
      // `message` carried promoteErr.message — on this path routinely a
      // Postgres error naming a relation or a constraint. The envelope shape is
      // unchanged (`promoted` and `reason` are what callers branch on); only
      // the detail moves to the log.
      console.error('[authoring-actions] promote-to-review failed:', promoteErr?.message);
      return res.status(500).json({
        promoted: false,
        reason: 'error',
        message: 'Failed to promote artifact. The problem has been logged.',
      });
    }
  } catch (err: any) {
    console.error('[authoring-actions] promote-to-review error:', err?.message);
    return res.status(500).json({ error: 'Failed to promote to review' });
  }
});

// ─── Promotion Lifecycle: approve-artifact (review → approved) ──────────────

router.post('/approve-artifact', async (req: Request, res: Response) => {
  try {
    const { projectId, artifactId } = req.body;
    if (!projectId || !artifactId) {
      return res.status(400).json({ error: 'projectId and artifactId are required' });
    }

    const orgId = requireTenantId(req, res);
    if (orgId == null) return;
    const userId = (req as any).userId;
    const userRole = (req as any).userRole;

    // Step 1: Governance boundary check (governed_draft → approved)
    let blocked = false;
    const blockReasons: string[] = [];
    let boundaryTransition: any = null;

    try {
      const { GovernanceBoundaryService } = await import('../services/governance-boundary-service.js');
      const boundaryService = GovernanceBoundaryService.getInstance();
      const result = await boundaryService.evaluateTransition({
        organizationId: Number(orgId),
        projectId: Number(projectId),
        artifactId: Number(artifactId),
        fromBoundary: 'governed_draft',
        toBoundary: 'approved',
        actorId: userId ? Number(userId) : undefined,
        actorRole: userRole || undefined,
      });
      boundaryTransition = result.transition;
      if (!result.allowed) {
        blocked = true;
        blockReasons.push(...result.blockedReasons);
      }
    } catch (err: any) {
      // Boundary service unavailable — fail closed for approval
      blocked = true;
      blockReasons.push('Governance boundary service unavailable — cannot approve without boundary check');
    }

    if (blocked) {
      // Record blocked approval decision
      let blockedDecision: any = null;
      try {
        const { decisionLifecycleService } = await import('../services/decision-lifecycle-service.js');
        blockedDecision = decisionLifecycleService.recordGovernedActionDecision({
          projectId: String(projectId), organizationId: Number(orgId),
          kind: 'promotion-decision',
          governedAction: 'approve-artifact', artifactId: String(artifactId),
          summary: `Approval blocked: ${blockReasons.length} issue(s)`,
          rationale: blockReasons.join('; '),
          sourceSignals: blockReasons.map(r => ({ kind: 'system-rule' as const, summary: r })),
          createdByType: 'ana', createdById: userId || undefined,
        });
      } catch { /* non-blocking */ }

      return res.json({
        approved: false, reason: 'blocked', blockers: blockReasons,
        message: `Approval blocked: ${blockReasons.length} issue(s). Resolve before approving.`,
        decisionId: blockedDecision?.id || null,
      });
    }

    // Step 2: Authority check
    const authorityCheck = await resolveGovernedAuthority(
      'approve-artifact',
      userRole || undefined
    );
    if (!authorityCheck.allowed) {
      return res.json({
        approved: false,
        reason: authorityCheck.checkFailed ? 'authority-check-failed' : 'unauthorized',
        message: authorityCheck.reason || 'Reviewer approval required',
        authority: authorityCheck.authority,
      });
    }

    // Step 3: Execute status transition
    try {
      const { concept2cureArtifacts } = await import('../../shared/schema/index.js');
      const { and, eq } = await import('drizzle-orm');
      const { db } = await import('../db.js');

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.id, Number(artifactId)),
            eq(concept2cureArtifacts.projectId, Number(projectId)),
            eq(concept2cureArtifacts.organizationId, Number(orgId))
          )
        )
        .limit(1);
      if (!artifact) throw new Error('Artifact not found');
      if (artifact.status !== 'review') throw new Error(`Cannot approve: artifact is ${artifact.status}, must be in review`);

      const metadata =
        artifact.metadata && typeof artifact.metadata === 'object'
          ? (artifact.metadata as Record<string, unknown>)
          : {};
      const existingHarness =
        metadata.harness && typeof metadata.harness === 'object'
          ? (metadata.harness as Record<string, unknown>)
          : {};
      const governed = resolveGovernedContext({
        req,
        projectId: Number(projectId),
        artifactId: Number(artifactId),
        documentType:
          (typeof existingHarness.documentType === 'string' && existingHarness.documentType) ||
          artifact.type ||
          'regulatory_document',
        generationMode: 'manual',
        lifecycleStatus: 'approved',
        originSurface: 'api_route',
        readinessGate: 'submission_candidate',
        workspaceTarget: 'project',
        title: artifact.title || 'Artifact',
        content: artifact.content || '',
        ctdSection: artifact.ctdSection || null,
        sourceRefs: [`artifact:${artifact.artifactId || artifact.id}`],
        eventType: 'artifact.updated',
      });
      if (!governed.validation.valid) {
        throw createGovernedContractInvalidError(governed);
      }

      await db
        .update(concept2cureArtifacts)
        .set({
          status: 'approved',
          approvedVersionId: artifact.version,
          updatedAt: new Date(),
          metadata: {
            ...metadata,
            harness: {
              ...existingHarness,
              clientTrack: governed.contract.clientTrack,
              submissionProgram: governed.contract.submissionProgram,
              persona: governed.contract.persona,
              regulatorScope: governed.contract.regulatorScope,
              documentClass: governed.contract.documentClass,
              readinessGate: governed.contract.readinessGate,
              workspaceTarget: governed.contract.workspaceTarget,
              originSurface: governed.contract.originSurface,
              recommendationSource: governed.contract.recommendationSource,
              regulatorIntent: governed.contract.regulatorIntent,
              gateChecks: governed.contract.exportEligibility.gateChecks,
              blockingReasons: governed.contract.exportEligibility.blockingReasons,
              readinessOutcome: governed.contract.exportEligibility.readinessOutcome,
            },
          },
        })
        .where(
          and(
            eq(concept2cureArtifacts.id, Number(artifactId)),
            eq(concept2cureArtifacts.projectId, Number(projectId)),
            eq(concept2cureArtifacts.organizationId, Number(orgId))
          )
        );

      // Record decision + receipt
      let approveDecision: any = null;
      let approveReceipt: any = null;
      try {
        const { decisionLifecycleService } = await import('../services/decision-lifecycle-service.js');
        approveDecision = decisionLifecycleService.recordGovernedActionDecision({
          projectId: String(projectId), organizationId: Number(orgId),
          kind: 'promotion-decision',
          governedAction: 'approve-artifact', artifactId: String(artifactId),
          summary: 'Artifact approved', rationale: 'All governance gates passed. Reviewer approved.',
          sourceSignals: [{ kind: 'user-request' as const, summary: 'Reviewer approved artifact' }],
          createdByType: 'human', createdById: userId || undefined,
        });
        if (approveDecision) {
          decisionLifecycleService.transitionDecision(approveDecision.id, 'confirmed', { actorId: userId });
          decisionLifecycleService.transitionDecision(approveDecision.id, 'executed', { actorId: userId });
          approveReceipt = decisionLifecycleService.createReceipt({
            decisionId: approveDecision.id, projectId: String(projectId),
            recommendation: { summary: 'Approve artifact', actionIds: ['approve-artifact'], rationale: 'All gates passed' },
            confirmation: { accepted: true, confirmedById: userId || undefined },
            execution: { executed: true, executedById: userId || undefined, executionMethod: 'status-transition:review→approved' },
            affectedObjects: [{ objectType: 'artifact', objectId: String(artifactId), previousState: 'review', newState: 'approved', changeDescription: 'Artifact approved by reviewer' }],
          });
        }
      } catch { /* non-blocking */ }

      return res.json({
        approved: true, message: 'Artifact approved.', newStatus: 'approved',
        decisionId: approveDecision?.id || null, receiptId: approveReceipt?.id || null,
        boundaryTransitionId: boundaryTransition?.id || null,
      });
    } catch (err: any) {
      if (isGovernedContractInvalidError(err) && err.governed) {
        return sendGovernedContractInvalid(res, err.governed);
      }
      return res.status(500).json({ approved: false, reason: 'error', message: err?.message || 'Failed to approve' });
    }
  } catch (err: any) {
    console.error('[authoring-actions] approve-artifact error:', err?.message);
    return res.status(500).json({ error: 'Failed to approve artifact' });
  }
});

// ─── Promotion Lifecycle: lock-artifact (approved → locked) ─────────────────

router.post('/lock-artifact', async (req: Request, res: Response) => {
  try {
    const { projectId, artifactId } = req.body;
    if (!projectId || !artifactId) {
      return res.status(400).json({ error: 'projectId and artifactId are required' });
    }

    const orgId = requireTenantId(req, res);
    if (orgId == null) return;
    const userId = (req as any).userId;
    const userRole = (req as any).userRole;

    // Step 1: Governance boundary check (approved → locked)
    let blocked = false;
    const blockReasons: string[] = [];
    let boundaryTransition: any = null;

    try {
      const { GovernanceBoundaryService } = await import('../services/governance-boundary-service.js');
      const boundaryService = GovernanceBoundaryService.getInstance();
      const result = await boundaryService.evaluateTransition({
        organizationId: Number(orgId), projectId: Number(projectId),
        artifactId: Number(artifactId),
        fromBoundary: 'approved', toBoundary: 'locked',
        actorId: userId ? Number(userId) : undefined,
        actorRole: userRole || undefined,
      });
      boundaryTransition = result.transition;
      if (!result.allowed) { blocked = true; blockReasons.push(...result.blockedReasons); }
    } catch (err: any) {
      blocked = true;
      blockReasons.push('Governance boundary service unavailable — cannot lock without boundary check');
    }

    if (blocked) {
      return res.json({
        locked: false, reason: 'blocked', blockers: blockReasons,
        message: `Lock blocked: ${blockReasons.length} issue(s).`,
      });
    }

    // Step 2: Authority check
    const lockAuthority = await resolveGovernedAuthority('lock-artifact', userRole || undefined);
    if (!lockAuthority.allowed) {
      return res.json({
        locked: false,
        reason: lockAuthority.checkFailed ? 'authority-check-failed' : 'unauthorized',
        message: lockAuthority.reason || 'Reviewer approval required',
        authority: lockAuthority.authority,
      });
    }

    // Step 3: Execute lock
    try {
      const { concept2cureArtifacts } = await import('../../shared/schema/index.js');
      const { and, eq } = await import('drizzle-orm');
      const { db } = await import('../db.js');

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.id, Number(artifactId)),
            eq(concept2cureArtifacts.projectId, Number(projectId)),
            eq(concept2cureArtifacts.organizationId, Number(orgId))
          )
        )
        .limit(1);
      if (!artifact) throw new Error('Artifact not found');
      if (artifact.status !== 'approved') throw new Error(`Cannot lock: artifact is ${artifact.status}, must be approved`);

      const metadata =
        artifact.metadata && typeof artifact.metadata === 'object'
          ? (artifact.metadata as Record<string, unknown>)
          : {};
      const existingHarness =
        metadata.harness && typeof metadata.harness === 'object'
          ? (metadata.harness as Record<string, unknown>)
          : {};
      const governed = resolveGovernedContext({
        req,
        projectId: Number(projectId),
        artifactId: Number(artifactId),
        documentType:
          (typeof existingHarness.documentType === 'string' && existingHarness.documentType) ||
          artifact.type ||
          'regulatory_document',
        generationMode: 'manual',
        lifecycleStatus: 'locked',
        originSurface: 'api_route',
        readinessGate: 'submission_candidate',
        workspaceTarget: 'project',
        title: artifact.title || 'Artifact',
        content: artifact.content || '',
        ctdSection: artifact.ctdSection || null,
        sourceRefs: [`artifact:${artifact.artifactId || artifact.id}`],
        eventType: 'artifact.updated',
      });
      if (!governed.validation.valid) {
        throw createGovernedContractInvalidError(governed);
      }

      await db
        .update(concept2cureArtifacts)
        .set({
          status: 'locked',
          publishedVersionId: artifact.version,
          lockedAt: new Date(),
          lockedById: userId ? Number(userId) : undefined,
          updatedAt: new Date(),
          metadata: {
            ...metadata,
            harness: {
              ...existingHarness,
              clientTrack: governed.contract.clientTrack,
              submissionProgram: governed.contract.submissionProgram,
              persona: governed.contract.persona,
              regulatorScope: governed.contract.regulatorScope,
              documentClass: governed.contract.documentClass,
              readinessGate: governed.contract.readinessGate,
              workspaceTarget: governed.contract.workspaceTarget,
              originSurface: governed.contract.originSurface,
              recommendationSource: governed.contract.recommendationSource,
              regulatorIntent: governed.contract.regulatorIntent,
              gateChecks: governed.contract.exportEligibility.gateChecks,
              blockingReasons: governed.contract.exportEligibility.blockingReasons,
              readinessOutcome: governed.contract.exportEligibility.readinessOutcome,
            },
          },
        })
        .where(
          and(
            eq(concept2cureArtifacts.id, Number(artifactId)),
            eq(concept2cureArtifacts.projectId, Number(projectId)),
            eq(concept2cureArtifacts.organizationId, Number(orgId))
          )
        );

      // Record decision + receipt
      let lockDecision: any = null;
      let lockReceipt: any = null;
      try {
        const { decisionLifecycleService } = await import('../services/decision-lifecycle-service.js');
        lockDecision = decisionLifecycleService.recordGovernedActionDecision({
          projectId: String(projectId), organizationId: Number(orgId),
          kind: 'promotion-decision',
          governedAction: 'lock-artifact', artifactId: String(artifactId),
          summary: 'Artifact locked for submission', rationale: 'All decisions resolved. Content locked.',
          sourceSignals: [{ kind: 'user-request' as const, summary: 'Artifact locked by authorized user' }],
          createdByType: 'human', createdById: userId || undefined,
        });
        if (lockDecision) {
          decisionLifecycleService.transitionDecision(lockDecision.id, 'confirmed', { actorId: userId });
          decisionLifecycleService.transitionDecision(lockDecision.id, 'executed', { actorId: userId });
          lockReceipt = decisionLifecycleService.createReceipt({
            decisionId: lockDecision.id, projectId: String(projectId),
            recommendation: { summary: 'Lock artifact', actionIds: ['lock-artifact'], rationale: 'All gates passed' },
            confirmation: { accepted: true, confirmedById: userId || undefined },
            execution: { executed: true, executedById: userId || undefined, executionMethod: 'status-transition:approved→locked' },
            affectedObjects: [{ objectType: 'artifact', objectId: String(artifactId), previousState: 'approved', newState: 'locked', changeDescription: 'Artifact locked for submission' }],
          });
        }
      } catch { /* non-blocking */ }

      return res.json({
        locked: true, message: 'Artifact locked for submission.', newStatus: 'locked',
        decisionId: lockDecision?.id || null, receiptId: lockReceipt?.id || null,
        boundaryTransitionId: boundaryTransition?.id || null,
      });
    } catch (err: any) {
      if (isGovernedContractInvalidError(err) && err.governed) {
        return sendGovernedContractInvalid(res, err.governed);
      }
      return res.status(500).json({ locked: false, reason: 'error', message: err?.message || 'Failed to lock' });
    }
  } catch (err: any) {
    console.error('[authoring-actions] lock-artifact error:', err?.message);
    return res.status(500).json({ error: 'Failed to lock artifact' });
  }
});

// ─── Promotion Lifecycle: mark-submission-ready (locked → submission_ready) ──

router.post('/mark-submission-ready', async (req: Request, res: Response) => {
  try {
    const { projectId, artifactId } = req.body;
    if (!projectId || !artifactId) {
      return res.status(400).json({ error: 'projectId and artifactId are required' });
    }

    const orgId = requireTenantId(req, res);
    if (orgId == null) return;
    const userId = (req as any).userId;
    const userRole = (req as any).userRole;

    // Step 1: Governance boundary check (locked → submission_ready)
    let blocked = false;
    const blockReasons: string[] = [];
    let boundaryTransition: any = null;

    try {
      const { GovernanceBoundaryService } = await import('../services/governance-boundary-service.js');
      const boundaryService = GovernanceBoundaryService.getInstance();
      const result = await boundaryService.evaluateTransition({
        organizationId: Number(orgId), projectId: Number(projectId),
        artifactId: Number(artifactId),
        fromBoundary: 'locked', toBoundary: 'submission_ready',
        actorId: userId ? Number(userId) : undefined,
        actorRole: userRole || undefined,
      });
      boundaryTransition = result.transition;
      if (!result.allowed) { blocked = true; blockReasons.push(...result.blockedReasons); }
    } catch (err: any) {
      blocked = true;
      blockReasons.push('Governance boundary service unavailable — cannot mark submission-ready without boundary check');
    }

    if (blocked) {
      return res.json({
        submissionReady: false, reason: 'blocked', blockers: blockReasons,
        message: `Submission-ready blocked: ${blockReasons.length} issue(s).`,
      });
    }

    // Step 2: Authority check (requires escalation — RA/submission lead)
    try {
      const { decisionLifecycleService } = await import('../services/decision-lifecycle-service.js');
      const authorityCheck = decisionLifecycleService.checkAuthority('judge-dossier-ready', userRole || undefined);
      if (authorityCheck && !authorityCheck.allowed) {
        return res.json({
          submissionReady: false, reason: 'unauthorized',
          message: authorityCheck.reason || 'Escalation required — RA or submission lead must approve',
        });
      }
    } catch { /* non-blocking */ }

    // Step 3: Record governance-level transition (artifact stays 'locked' in DB — submission_ready is a governance boundary)
    let decision: any = null;
    let receipt: any = null;
    try {
      const { decisionLifecycleService } = await import('../services/decision-lifecycle-service.js');
      decision = decisionLifecycleService.recordGovernedActionDecision({
        projectId: String(projectId), organizationId: Number(orgId),
        kind: 'promotion-decision',
        governedAction: 'judge-dossier-ready', artifactId: String(artifactId),
        summary: 'Artifact marked submission-ready',
        rationale: 'All assumptions approved, all decisions resolved, strong confidence. Ready for submission.',
        sourceSignals: [{ kind: 'user-request' as const, summary: 'RA/submission lead confirmed readiness' }],
        createdByType: 'human', createdById: userId || undefined,
      });
      if (decision) {
        decisionLifecycleService.transitionDecision(decision.id, 'confirmed', { actorId: userId });
        decisionLifecycleService.transitionDecision(decision.id, 'executed', { actorId: userId });
        receipt = decisionLifecycleService.createReceipt({
          decisionId: decision.id, projectId: String(projectId),
          recommendation: { summary: 'Mark submission-ready', actionIds: ['judge-dossier-ready'], rationale: 'All gates passed' },
          confirmation: { accepted: true, confirmedById: userId || undefined },
          execution: { executed: true, executedById: userId || undefined, executionMethod: 'governance-transition:locked→submission_ready' },
          affectedObjects: [{ objectType: 'artifact', objectId: String(artifactId), previousState: 'locked', newState: 'submission_ready', changeDescription: 'Artifact marked submission-ready' }],
        });
      }
    } catch { /* non-blocking */ }

    // Update artifact metadata to record submission readiness
    try {
      const { concept2cureArtifacts } = await import('../../shared/schema/index.js');
      const { and, eq } = await import('drizzle-orm');
      const { db } = await import('../db.js');
      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.id, Number(artifactId)),
            eq(concept2cureArtifacts.projectId, Number(projectId)),
            eq(concept2cureArtifacts.organizationId, Number(orgId))
          )
        )
        .limit(1);
      if (!artifact) {
        throw new Error('Artifact not found');
      }
      const metadata =
        artifact.metadata && typeof artifact.metadata === 'object'
          ? (artifact.metadata as Record<string, unknown>)
          : {};
      const existingHarness =
        metadata.harness && typeof metadata.harness === 'object'
          ? (metadata.harness as Record<string, unknown>)
          : {};
      const governed = resolveGovernedContext({
        req,
        projectId: Number(projectId),
        artifactId: Number(artifactId),
        documentType:
          (typeof existingHarness.documentType === 'string' && existingHarness.documentType) ||
          artifact.type ||
          'regulatory_document',
        generationMode: 'manual',
        lifecycleStatus: 'locked',
        originSurface: 'api_route',
        readinessGate: 'submission_candidate',
        workspaceTarget: 'project',
        title: artifact.title || 'Artifact',
        content: artifact.content || '',
        ctdSection: artifact.ctdSection || null,
        sourceRefs: [`artifact:${artifact.artifactId || artifact.id}`],
        eventType: 'artifact.updated',
      });
      if (!governed.validation.valid) {
        throw createGovernedContractInvalidError(governed);
      }
      await db
        .update(concept2cureArtifacts)
        .set({
          publishedAt: new Date(),
          updatedAt: new Date(),
          metadata: {
            ...metadata,
            harness: {
              ...existingHarness,
              clientTrack: governed.contract.clientTrack,
              submissionProgram: governed.contract.submissionProgram,
              persona: governed.contract.persona,
              regulatorScope: governed.contract.regulatorScope,
              documentClass: governed.contract.documentClass,
              readinessGate: governed.contract.readinessGate,
              workspaceTarget: governed.contract.workspaceTarget,
              originSurface: governed.contract.originSurface,
              recommendationSource: governed.contract.recommendationSource,
              regulatorIntent: governed.contract.regulatorIntent,
              gateChecks: governed.contract.exportEligibility.gateChecks,
              blockingReasons: governed.contract.exportEligibility.blockingReasons,
              readinessOutcome: governed.contract.exportEligibility.readinessOutcome,
            },
          },
        })
        .where(
          and(
            eq(concept2cureArtifacts.id, Number(artifactId)),
            eq(concept2cureArtifacts.projectId, Number(projectId)),
            eq(concept2cureArtifacts.organizationId, Number(orgId))
          )
        );
    } catch (metadataErr: unknown) {
      if (isGovernedContractInvalidError(metadataErr) && metadataErr.governed) {
        return sendGovernedContractInvalid(res, metadataErr.governed);
      }
      /* Everything else used to be swallowed here — the catch body ended at the
         `if`, and control fell through to `submissionReady: true, 'Artifact
         marked submission-ready.'` below.

         The block this guards throws `new Error('Artifact not found')` when the
         artifact does not resolve for this project and org, and it is also where
         the governed contract is persisted. So a request naming an artifact that
         does not exist answered that it had been marked submission-ready — and
         the same body carried a freshly minted decisionId and receiptId, a
         governance receipt for a transition that never happened. Any failure of
         the contract write was reported the same way.

         Fail closed. A governed-contract violation still gets its own structured
         refusal; anything else reaches the handler's outer catch and returns 500,
         which is the truth: the state was not changed. */
      throw metadataErr;
    }

    return res.json({
      submissionReady: true, message: 'Artifact marked submission-ready.',
      governanceBoundary: 'submission_ready',
      decisionId: decision?.id || null, receiptId: receipt?.id || null,
      boundaryTransitionId: boundaryTransition?.id || null,
    });
  } catch (err: any) {
    console.error('[authoring-actions] mark-submission-ready error:', err?.message);
    return res.status(500).json({ error: 'Failed to mark submission-ready' });
  }
});

// ─── Wave 2 Actions (real service calls) ─────────────────────────────────────

// ACTION 6: Governed correction draft — uses rewrite-coordinator
router.post('/correction-draft', async (req: Request, res: Response) => {
  try {
    const { projectId, artifactId, sectionCode, triggerDescription } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const orgId = requireTenantId(req, res);
    if (orgId == null) return;
    const targets: any[] = [];

    try {
      const { identifyRewriteTargets } = await import(
        '../services/resolution/rewrite-coordinator.js'
      );
      if (identifyRewriteTargets) {
        const affectedObjects = [{
          objectType: 'artifact',
          objectId: String(artifactId || ''),
          objectTitle: sectionCode ? `Section ${sectionCode}` : 'Current document',
          sectionCode: sectionCode || undefined,
          impactState: 'direct' as const,
        }];
        const result = await identifyRewriteTargets(
          orgId, Number(projectId), affectedObjects,
          'rewrite', triggerDescription || 'Correction requested via AnA'
        );
        targets.push(...(result || []));
      }
    } catch {
      // rewrite-coordinator unavailable
    }

    if (targets.length > 0) {
      // ── Record correction decision (non-blocking) ───────────────
      let correctionDecision: any = null;
      try {
        const { decisionLifecycleService } = await import(
          '../services/decision-lifecycle-service.js'
        );
        correctionDecision = decisionLifecycleService.recordGovernedActionDecision({
          projectId: String(projectId),
          organizationId: Number(orgId),
          kind: 'correction-decision',
          governedAction: 'prepare-correction-draft',
          artifactId: artifactId ? String(artifactId) : undefined,
          sectionCode,
          summary: `${targets.length} correction target(s) identified`,
          rationale: triggerDescription || 'Correction requested via AnA',
          sourceSignals: targets.map((t: any) => ({
            kind: 'user-request' as const,
            summary: t.revisionRationale || 'Correction target identified',
          })),
          createdByType: 'ana',
          createdById: (req as any).userId || undefined,
        });
      } catch { /* non-blocking */ }

      return res.json({
        status: 'data',
        action: 'correction_draft',
        targets: targets.map((t: any) => ({
          objectId: t.objectId,
          objectTitle: t.objectTitle,
          sectionCode: t.sectionCode,
          revisionRationale: t.revisionRationale,
          confidence: t.confidence,
          requiresReview: t.requiresReview,
          hasContent: !!t.currentContent,
        })),
        message: `${targets.length} rewrite target(s) identified. Review rationale before applying corrections.`,
        decisionId: correctionDecision?.id || null,
        authority: correctionDecision?.authority || null,
      });
    }

    return res.json({
      status: 'no_targets',
      action: 'correction_draft',
      message: artifactId
        ? 'No rewrite targets identified for this artifact. The document may already be consistent.'
        : 'No artifact specified. Open a document to prepare a correction draft.',
    });
  } catch (err: any) {
    console.error('[authoring-actions] correction-draft error:', err?.message);
    return res.status(500).json({ error: 'Failed to prepare correction draft' });
  }
});

// ACTION 7: Harmonize with linked sections — uses harmonize-engine
router.post('/harmonize-sections', async (req: Request, res: Response) => {
  try {
    const { projectId, sectionCodes, submissionType, productName } = req.body;
    // Tenant context from verified auth middleware (non-failing here: decision
    // recording below is best-effort and skips DB persistence without it).
    const rawTenantId = Number((req as any).tenantId ?? (req as any).organizationId);
    const orgId = Number.isFinite(rawTenantId) && rawTenantId > 0 ? rawTenantId : undefined;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });
    if (!sectionCodes || !Array.isArray(sectionCodes) || sectionCodes.length === 0) {
      return res.json({
        status: 'no_sections',
        action: 'harmonize_sections',
        message: 'No linked sections provided. Select sections to harmonize or ensure the current section has linked section codes.',
      });
    }

    // Fetch content for each section from artifacts
    const sections: Record<string, string> = {};
    try {
      const { db } = await import('../db.js');
      for (const code of sectionCodes) {
        const artifact = await db.query.concept2cureArtifacts?.findFirst?.({
          where: (a: any, { and, eq }: any) =>
            and(eq(a.projectId, Number(projectId)), eq(a.ctdSection, code)),
          orderBy: (a: any, { desc }: any) => [desc(a.updatedAt)],
        }).catch(() => null);
        if (artifact?.content) {
          sections[code] = typeof artifact.content === 'string'
            ? artifact.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            : '';
        }
      }
    } catch { /* DB unavailable */ }

    if (Object.keys(sections).length < 2) {
      return res.json({
        status: 'insufficient_content',
        action: 'harmonize_sections',
        message: `Only ${Object.keys(sections).length} section(s) have content. Need at least 2 sections with content to harmonize.`,
        sectionsFound: Object.keys(sections),
      });
    }

    // Run harmonize engine
    try {
      const { HarmonizeEngine } = await import('../services/harmonize-engine.js');
      const engine = new HarmonizeEngine();
      const result = await engine.check({
        sections,
        submissionType: submissionType || 'IND',
        productName: productName || undefined,
      });

      // ── Record harmonization decision (non-blocking) ─────────────
      let harmonizeDecision: any = null;
      try {
        const { decisionLifecycleService } = await import(
          '../services/decision-lifecycle-service.js'
        );
        harmonizeDecision = decisionLifecycleService.recordGovernedActionDecision({
          projectId: String(projectId),
          organizationId: orgId,
          kind: 'harmonization-decision',
          governedAction: 'prepare-harmonization-suggestion',
          summary: `Harmonization: ${result.totalIssues} issue(s), score ${result.consistencyScore}%`,
          rationale: `Checked ${Object.keys(sections).length} sections: ${Object.keys(sections).join(', ')}`,
          sourceSignals: result.issues.slice(0, 5).map((i: any) => ({
            kind: 'cross-section-inconsistency' as const,
            summary: i.description || 'Inconsistency detected',
            severity: i.severity === 'critical' ? 'critical' as const : i.severity === 'error' ? 'major' as const : 'minor' as const,
          })),
          createdByType: 'ana',
          createdById: (req as any).userId || undefined,
        });
      } catch { /* non-blocking */ }

      return res.json({
        status: 'data',
        action: 'harmonize_sections',
        consistencyScore: result.consistencyScore,
        totalIssues: result.totalIssues,
        criticalCount: result.criticalCount,
        errorCount: result.errorCount,
        warningCount: result.warningCount,
        issues: result.issues.slice(0, 20).map((i: any) => ({
          id: i.id,
          type: i.type,
          severity: i.severity,
          sectionA: i.sectionA,
          sectionB: i.sectionB,
          description: i.description,
          recommendation: i.recommendation,
          autoFixable: i.autoFixable,
        })),
        checkedDimensions: result.checkedDimensions,
        sectionsCompared: Object.keys(sections),
        decisionId: harmonizeDecision?.id || null,
        authority: harmonizeDecision?.authority || null,
      });
    } catch (harmonizeErr: any) {
      // The consistency check did not run. A 200 here meant "no cross-section
      // inconsistencies were reported" arrived on the same status code as "no
      // cross-section inconsistencies were LOOKED FOR" — and this endpoint's
      // clean result is the evidence an author leans on before promoting a
      // document. 503 says plainly that the check is unavailable; the body keeps
      // the same `status` discriminator for callers already branching on it.
      console.error('[authoring-actions] harmonize engine unavailable:', harmonizeErr?.message);
      return res.status(503).json({
        status: 'service_unavailable',
        action: 'harmonize_sections',
        message: 'Harmonize engine is not available. Sections were found but consistency check could not run.',
        sectionsFound: Object.keys(sections),
      });
    }
  } catch (err: any) {
    console.error('[authoring-actions] harmonize-sections error:', err?.message);
    return res.status(500).json({ error: 'Failed to harmonize sections' });
  }
});

// ACTION 8: Resolution changelog — uses ana-resolution-support + resolution-planner
router.post('/resolution-changelog', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const orgId = requireTenantId(req, res);
    if (orgId == null) return;
    const explanations: any[] = [];

    try {
      const { getProjectResolutionPlans } = await import(
        '../services/resolution/resolution-planner.js'
      );
      const { explainResolutionPlan } = await import(
        '../services/resolution/ana-resolution-support.js'
      );

      if (getProjectResolutionPlans && explainResolutionPlan) {
        const plans = await getProjectResolutionPlans(orgId, Number(projectId));
        // Get most recent resolved plans (up to 5)
        const recentPlans = plans
          .filter((p: any) => p.state !== 'cancelled' && p.state !== 'unresolved')
          .slice(0, 5);

        for (const plan of recentPlans) {
          const explanation = explainResolutionPlan(plan);
          explanations.push({
            planId: explanation.planId,
            summary: explanation.summary,
            triggerExplanation: explanation.triggerExplanation,
            affectedObjectsSummary: explanation.affectedObjectsSummary,
            recommendedPath: explanation.recommendedPathExplanation,
            reviewRequirements: explanation.reviewRequirements,
            confidence: explanation.confidenceExplanation,
            nextSteps: explanation.nextSteps,
          });
        }
      }
    } catch {
      // Resolution services unavailable
    }

    if (explanations.length > 0) {
      return res.json({
        status: 'data',
        action: 'resolution_changelog',
        resolutionCount: explanations.length,
        resolutions: explanations,
        message: `${explanations.length} resolution(s) found for this project.`,
      });
    }

    return res.json({
      status: 'no_resolutions',
      action: 'resolution_changelog',
      message: 'No resolution history found for this project. Resolutions are created when contradictions or assumption changes are detected and addressed.',
    });
  } catch (err: any) {
    console.error('[authoring-actions] resolution-changelog error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch resolution changelog' });
  }
});

/* GET /module-readiness/:projectId/:moduleCode has been DELETED.
 *
 * It never once returned readiness data. The handler built the engine payload
 * by hand — `{ project: { id }, organizationId }` cast through `as any` —
 * carrying none of the five fields computeReadinessAssessment reads. The engine
 * evaluates `completeness` first, whose first statement is
 * `payload.moduleMap.filter(...)`, so it threw a TypeError on EVERY call. A bare
 * catch swallowed the throw without logging, and the handler fell through to
 * HTTP 200 with "Readiness engine is not available. Module readiness data could
 * not be computed."
 *
 * That message was false in the way that matters: the engine IS available and
 * working. The caller passed it garbage and then blamed the service. A reader
 * chasing this would go looking for an outage that never happened. (The same
 * malformed payload at /promotion-blockers was worse — it silently dropped every
 * readiness blocker and answered blocked:false for a gate that had evaluated
 * nothing — and was fixed rather than removed, because that route has no
 * canonical equivalent.)
 *
 * This one does have an equivalent, so it goes rather than being repaired:
 * GET /api/orchestration/projects/:projectId/readiness?module=… (routes/
 * orchestration.ts, mounted at register-inline-routes.ts:1114) resolves the org
 * from the request, validates the project id, builds the payload with
 * assembleCrossObjectPayload — the canonical builder — and calls the engine
 * correctly. It accepts the module as a query parameter, so it covers the
 * per-module breakdown this route existed to provide.
 */

// ACTION 10: Section evidence — uses EvidenceManagementService + gap analysis
router.get('/section-evidence/:projectId/:sectionCode', async (req: Request, res: Response) => {
  try {
    const { projectId, sectionCode } = req.params;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    let evidence: any[] = [];
    let gapAnalysis: any = null;

    // Try EvidenceManagementService
    try {
      const { EvidenceManagementService } = await import(
        '../services/EvidenceManagementService.js'
      );
      if (EvidenceManagementService) {
        const svc = new EvidenceManagementService();

        // Try section-specific evidence
        if (svc.getStageEvidence) {
          // Map section code to stage number (approximate)
          const stageMap: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4 };
          const sectionCodeStr = Array.isArray(sectionCode) ? sectionCode[0] : sectionCode;
          const major = sectionCodeStr?.split('.')[0] || '2';
          const stage = stageMap[major] ?? 1;
          const stageEvidence = await svc.getStageEvidence(String(projectId), stage);
          if (stageEvidence && Array.isArray(stageEvidence)) {
            evidence = stageEvidence.slice(0, 20).map((e: any) => ({
              id: e.id,
              title: e.title || e.name || e.filename,
              type: e.test_type || e.type || 'document',
              fdaRequirement: e.fda_requirement,
              fdaSection: e.fda_section,
              status: e.review_status || e.regulatory_status || 'pending',
            }));
          }
        }

        // Also try gap analysis
        if (svc.performGapAnalysis) {
          gapAnalysis = await svc.performGapAnalysis(String(projectId), 1);
        }
      }
    } catch {
      // Service unavailable
    }

    if (evidence.length > 0) {
      return res.json({
        status: 'data',
        action: 'section_evidence',
        evidenceCount: evidence.length,
        evidence,
        gapAnalysis: gapAnalysis ? {
          completeness: gapAnalysis.completeness,
          gaps: (gapAnalysis.gaps || []).slice(0, 5),
          criticalGaps: gapAnalysis.critical_gaps || [],
        } : null,
        context: { projectId, sectionCode },
      });
    }

    return res.json({
      status: 'no_evidence',
      action: 'section_evidence',
      message: `No evidence found for section ${sectionCode}. Upload relevant studies, test reports, or regulatory documents to build the evidence package.`,
      gapAnalysis: gapAnalysis ? {
        completeness: gapAnalysis.completeness,
        gaps: (gapAnalysis.gaps || []).slice(0, 5),
      } : null,
      context: { projectId, sectionCode },
    });
  } catch (err: any) {
    console.error('[authoring-actions] section-evidence error:', err?.message);
    return res.status(500).json({ error: 'Failed to gather section evidence' });
  }
});

// ─── CTD cross-section link map ──────────────────────────────────────────────

const CTD_LINKS: Record<string, string[]> = {
  '2.2': ['2.3', '2.4', '2.5'],
  '2.3': ['3.2.S', '3.2.P'],
  '2.4': ['4.2.1', '4.2.2', '4.2.3'],
  '2.5': ['2.7.1', '2.7.3', '2.7.4', '5.3'],
  '2.7.1': ['5.2'],
  '2.7.3': ['2.5', '5.3'],
  '2.7.4': ['2.5', '5.3'],
  '3.2.S': ['2.3'],
  '3.2.P': ['2.3'],
  '5.3': ['2.5', '2.7.3', '2.7.4'],
};

function deriveLinkedSections(sectionCode: string): string[] {
  // Direct match
  if (CTD_LINKS[sectionCode]) return CTD_LINKS[sectionCode];
  // Try prefix match (e.g. '3.2.S.1' → '3.2.S')
  for (const key of Object.keys(CTD_LINKS)) {
    if (sectionCode.startsWith(key)) return CTD_LINKS[key];
  }
  return [];
}

// ACTION 11: Cross-section consistency check — combines harmonize + contradiction + linked sections
router.post('/cross-section-consistency', async (req: Request, res: Response) => {
  try {
    const { projectId, sectionCode, linkedSectionCodes, submissionType } = req.body;
    if (!projectId || !sectionCode) {
      return res.status(400).json({ error: 'projectId and sectionCode are required' });
    }

    // 1. If linkedSectionCodes not provided, derive from CTD hierarchy
    const linked: string[] = Array.isArray(linkedSectionCodes) && linkedSectionCodes.length > 0
      ? linkedSectionCodes
      : deriveLinkedSections(sectionCode);

    const allCodes = [sectionCode, ...linked];

    // 2. Fetch content for current + linked sections from artifacts
    const sections: Record<string, string> = {};
    try {
      const { db } = await import('../db.js');
      for (const code of allCodes) {
        const artifact = await db.query.concept2cureArtifacts?.findFirst?.({
          where: (a: any, { and, eq }: any) =>
            and(eq(a.projectId, Number(projectId)), eq(a.ctdSection, code)),
          orderBy: (a: any, { desc }: any) => [desc(a.updatedAt)],
        }).catch(() => null);
        if (artifact?.content) {
          sections[code] = typeof artifact.content === 'string'
            ? artifact.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            : '';
        }
      }
    } catch {
      // DB unavailable — continue with what we have
    }

    // 3. Run harmonize-engine check
    let harmonizeResult: any = null;
    if (Object.keys(sections).length >= 2) {
      try {
        const { HarmonizeEngine } = await import('../services/harmonize-engine.js');
        const engine = new HarmonizeEngine();
        harmonizeResult = await engine.check({
          sections,
          submissionType: submissionType || 'IND',
        });
      } catch {
        // Harmonize engine unavailable
      }
    }

    // 4. Fetch contradictions for the section
    let contradictions: any[] = [];
    // Mirror harmonizeAvailable: a failed contradiction scan must be
    // distinguishable from a genuine zero. Without this flag the summary below
    // reported contradictionCount:0 / criticalIssues clear on a READ failure —
    // "section consistent" indistinguishable from a real clean result.
    let contradictionsAvailable = true;
    try {
      const { contradictionEngineService } = await import(
        '../services/contradiction-engine-service.js'
      );
      if (contradictionEngineService?.scanProject) {
        const scanResult = await contradictionEngineService.scanProject(
          0,
          Number(projectId)
        );
        contradictions = ((scanResult?.findings as any[]) || [])
          .filter(
            (f: any) =>
              f.sectionCode === sectionCode ||
              f.affectedSections?.includes(sectionCode) ||
              allCodes.includes(f.sectionCode)
          )
          .map((f: any) => ({
            id: f.id || `c-${Math.random().toString(36).slice(2)}`,
            type: f.contradictionType || f.type || 'finding',
            severity:
              f.authorityState === 'blocks_promotion'
                ? 'critical'
                : f.severity === 'major'
                  ? 'major'
                  : 'minor',
            explanation: f.explanation || f.description || 'Finding detected',
            relatedSections: f.affectedSections || [],
          }));
      }
    } catch {
      // Contradiction engine unavailable — a failed READ, not a clean scan.
      contradictionsAvailable = false;
    }

    // 5. Return combined consistency report
    return res.json({
      status: 'data',
      action: 'cross_section_consistency',
      sectionCode,
      linkedSections: linked,
      sectionsWithContent: Object.keys(sections),
      harmonize: harmonizeResult
        ? {
            consistencyScore: harmonizeResult.consistencyScore,
            totalIssues: harmonizeResult.totalIssues,
            criticalCount: harmonizeResult.criticalCount,
            errorCount: harmonizeResult.errorCount,
            warningCount: harmonizeResult.warningCount,
            issues: (harmonizeResult.issues || []).slice(0, 20).map((i: any) => ({
              id: i.id,
              type: i.type,
              severity: i.severity,
              sectionA: i.sectionA,
              sectionB: i.sectionB,
              description: i.description,
              recommendation: i.recommendation,
              autoFixable: i.autoFixable,
            })),
            checkedDimensions: harmonizeResult.checkedDimensions,
          }
        : null,
      contradictions,
      summary: {
        harmonizeAvailable: !!harmonizeResult,
        harmonizeIssues: harmonizeResult?.totalIssues ?? 0,
        // When the contradiction scan failed to run, report its counts as null
        // (unknown) — never fold a failed read in as 0. criticalIssues likewise
        // stays null unless BOTH inputs are known, so it is never read as a
        // clean total that silently omits the contradictions side.
        contradictionsAvailable,
        contradictionCount: contradictionsAvailable ? contradictions.length : null,
        criticalIssues:
          contradictionsAvailable
            ? (harmonizeResult?.criticalCount ?? 0) +
              contradictions.filter((c: any) => c.severity === 'critical').length
            : null,
      },
    });
  } catch (err: any) {
    console.error('[authoring-actions] cross-section-consistency error:', err?.message);
    return res.status(500).json({ error: 'Failed to run cross-section consistency check' });
  }
});

// Body-aware section expectations endpoint
router.get('/section-expectations/:regulatorBody/:submissionType/:sectionCode', async (req: Request, res: Response) => {
  try {
    const { regulatorBody, submissionType, sectionCode } = req.params;
    if (!regulatorBody || !submissionType || !sectionCode) {
      return res.status(400).json({ error: 'regulatorBody, submissionType, and sectionCode are required' });
    }

    try {
      const bodyAwareModule: any = await import('../services/body-aware-authoring.js');
      const service = bodyAwareModule.bodyAwareAuthoringService
        || bodyAwareModule.BodyAwareAuthoringService
        || bodyAwareModule.default;

      if (service) {
        const svc = typeof service === 'function' ? new service() : service;
        const expectations = svc.getSectionExpectations
          ? await svc.getSectionExpectations(regulatorBody, submissionType, sectionCode)
          : svc.getExpectations
            ? await svc.getExpectations(regulatorBody, submissionType, sectionCode)
            : null;

        if (expectations) {
          return res.json({
            status: 'data',
            action: 'section_expectations',
            regulatorBody,
            submissionType,
            sectionCode,
            expectations,
          });
        }
      }
    } catch {
      // Body-aware authoring service unavailable
    }

    return res.json({
      status: 'service_unavailable',
      action: 'section_expectations',
      message: `Body-aware authoring service is not available. Section expectations for ${regulatorBody}/${submissionType}/${sectionCode} could not be retrieved.`,
      context: { regulatorBody, submissionType, sectionCode },
    });
  } catch (err: any) {
    console.error('[authoring-actions] section-expectations error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch section expectations' });
  }
});

// Body-aware gap detection
router.post('/body-aware-gaps', async (req: Request, res: Response) => {
  try {
    const { regulatorBody, submissionType, sectionCode, currentContent } = req.body;
    if (!regulatorBody || !submissionType || !sectionCode) {
      return res.status(400).json({ error: 'regulatorBody, submissionType, and sectionCode are required' });
    }

    try {
      /* This looked for the capability under three names it was never published
         under — `bodyAwareAuthoringService`, `BodyAwareAuthoringService` and
         `default` — while server/services/body-aware-authoring.ts exports plain
         NAMED functions. `service` was therefore always undefined, the guard
         below never opened, and every call fell through to the
         'service_unavailable' response at the end of the handler.

         The capability was never missing. detectBodySpecificGaps is exported and
         implemented, and its signature is exactly the four arguments this
         handler already had ready to pass. So the endpoint has spent its whole
         life reporting that body-aware gap detection is unavailable while the
         function sat in the module it had just imported.

         Worth noting how it stayed hidden: the fallback is HONEST — it says the
         analysis could not be run rather than returning an empty gap list — so
         nothing ever looked wrong enough to investigate. An honest degraded
         message is right, and it is also why a permanently-degraded path can go
         unnoticed for a long time. */
      const { detectBodySpecificGaps } = await import('../services/body-aware-authoring.js');

      if (typeof detectBodySpecificGaps === 'function') {
        const gaps = await detectBodySpecificGaps(
          regulatorBody,
          submissionType,
          sectionCode,
          currentContent || ''
        );

        return res.json({
          status: 'data',
          action: 'body_aware_gaps',
          regulatorBody,
          submissionType,
          sectionCode,
          gaps: Array.isArray(gaps) ? gaps : gaps?.gaps || [],
          gapCount: Array.isArray(gaps) ? gaps.length : gaps?.gaps?.length || 0,
        });
      }
    } catch {
      // Body-aware authoring service unavailable
    }

    return res.json({
      status: 'service_unavailable',
      action: 'body_aware_gaps',
      message: `Body-aware gap detection is not available. Gaps for ${regulatorBody}/${submissionType}/${sectionCode} could not be analyzed.`,
      context: { regulatorBody, submissionType, sectionCode },
    });
  } catch (err: any) {
    console.error('[authoring-actions] body-aware-gaps error:', err?.message);
    return res.status(500).json({ error: 'Failed to detect body-aware gaps' });
  }
});

// ─── Module + Dossier Preflight (Pass 6) ─────────────────────────────────────

/**
 * Helper: fetch all artifacts for a project, grouped by CTD module.
 * Returns Map<moduleCode, Array<{ctdSection, id, status}>>
 */
async function fetchProjectArtifactsByModule(projectId: number): Promise<Map<string, Array<{ ctdSection: string; id: string; status: string }>>> {
  const result = new Map<string, Array<{ ctdSection: string; id: string; status: string }>>();
  try {
    const { db } = await import('../db.js');
    const artifacts = await db.query.concept2cureArtifacts?.findMany?.({
      where: (a: any, { eq }: any) => eq(a.projectId, projectId),
    }).catch(() => []) || [];
    for (const art of artifacts) {
      if (!art.ctdSection) continue;
      const major = art.ctdSection.split('.')[0];
      const moduleCode = `m${major}`;
      if (!result.has(moduleCode)) result.set(moduleCode, []);
      result.get(moduleCode)!.push({
        ctdSection: art.ctdSection,
        id: String(art.id),
        status: art.status || 'draft',
      });
    }
  } catch { /* DB unavailable */ }
  return result;
}

/**
 * POST /module-preflight
 * Aggregates section preflights for all sections in a module.
 */
router.post('/module-preflight', async (req: Request, res: Response) => {
  try {
    const { projectId, moduleCode, regulatorBody, submissionType } = req.body;
    if (!projectId || !moduleCode) {
      return res.status(400).json({ error: 'projectId and moduleCode are required' });
    }
    const orgId = requireTenantId(req, res);
    if (orgId == null) return;

    // Find all sections in this module
    const artifactMap = await fetchProjectArtifactsByModule(Number(projectId));
    const moduleSections = artifactMap.get(moduleCode) || [];

    if (moduleSections.length === 0) {
      return res.json({
        status: 'data', action: 'module_preflight', moduleCode,
        regulatorBody, submissionType,
        overall: 'needs-review',
        summary: `No sections found for ${moduleCode}. Add documents to this module first.`,
        sectionResults: [], counts: { total: 0, ready: 0, blocked: 0, provisional: 0, needsReview: 0, needsReapproval: 0 },
        majorBlockers: [{ moduleCode, kind: 'missing-section', severity: 'major', message: `No sections found in ${moduleCode}` }],
        recommendedActions: [],
      });
    }

    /* The readiness assessment is per-PROJECT, so it is computed once here
       rather than once per section inside the map below. The payload used to be
       hand-rolled inside the loop — `{ project: { id }, organizationId }` cast
       through `as any` — carrying none of the five fields the engine reads, so
       computeReadinessAssessment threw a TypeError on every section, the inner
       catch recorded `readiness: { status: 'unknown' }`, and this route could
       never actually assess readiness at all.

       assembleCrossObjectPayload is the canonical builder (continuity-service,
       lumen-context-builder, workflow-orchestrator and the orchestration
       readiness route all use it). Building it once also stops the map from
       issuing the same set of queries per section. A genuine failure here still
       leaves every section's readiness check 'unknown', which the verdict below
       already refuses to treat as a pass. */
    let projectAssessment: { blockers?: unknown[] } | null = null;
    let readinessFailed = false;
    try {
      const { assembleCrossObjectPayload } = await import(
        '../services/orchestration/cross-object-resolver.js'
      );
      const { computeReadinessAssessment } = await import(
        '../services/orchestration/readiness-engine.js'
      );
      const payload = await assembleCrossObjectPayload({
        organizationId: Number(orgId),
        projectId: Number(projectId),
        module: moduleCode,
      });
      projectAssessment = computeReadinessAssessment(payload);
    } catch (readinessErr: any) {
      readinessFailed = true;
      console.warn(
        '[authoring-actions] module-preflight: readiness assessment did not run:',
        readinessErr?.message,
      );
    }

    // Run section preflights in parallel (reuse the internal logic)
    const sectionResults: any[] = [];
    const sectionPreflightPromises = moduleSections.map(async (sec) => {
      try {
        // Internal fetch to our own section-preflight endpoint
        // Inline the section preflight logic instead of HTTP call
        // Use simplified check aggregation
        const checks: Record<string, any> = {};

        // Readiness — from the single project-level assessment computed above.
        if (readinessFailed || !projectAssessment) {
          checks.readiness = { status: 'unknown' };
        } else {
          const major = sec.ctdSection.split('.')[0];
          const blockers = ((projectAssessment.blockers as any[]) || [])
            .filter((b: any) => !b.module || b.module === `m${major}`)
            .slice(0, 5).map((b: any) => ({ code: b.category || 'BLOCK', severity: b.severity, message: b.message || b.description }));
          checks.readiness = { status: blockers.some((b: any) => b.severity === 'critical') ? 'fail' : blockers.length ? 'warn' : 'pass', blockers };
        }

        // Contradictions
        try {
          const { contradictionEngineService } = await import('../services/contradiction-engine-service.js');
          if (contradictionEngineService?.scanProject) {
            const scanResult = await contradictionEngineService.scanProject(orgId, Number(projectId));
            const items = ((scanResult?.findings as any[]) || [])
              .filter((f: any) => f.sectionCode === sec.ctdSection || (f.affectedSections || []).includes(sec.ctdSection))
              .slice(0, 5).map((f: any) => ({
                id: f.id || String(Math.random()), severity: f.authorityState === 'blocks_promotion' ? 'critical' : f.severity || 'minor',
                explanation: f.explanation || f.description || f.title,
              }));
            checks.contradictions = { status: items.some((i: any) => i.severity === 'critical') ? 'fail' : items.length ? 'warn' : 'pass', items };
          }
        } catch { checks.contradictions = { status: 'unknown' }; }

        // Body gaps (lightweight)
        if (regulatorBody || submissionType) {
          try {
            const { detectBodySpecificGaps } = await import('../services/body-aware-authoring.js');
            if (detectBodySpecificGaps) {
              const analysis = await detectBodySpecificGaps(regulatorBody || 'FDA', submissionType || 'IND', sec.ctdSection, '');
              const missing = analysis.gaps.filter((g: any) => g.status === 'missing').map((g: any) => g.requirement);
              checks.bodyExpectations = { status: missing.length ? 'fail' : 'pass', missing };
            }
          } catch { checks.bodyExpectations = { status: 'unknown' }; }
        } else { checks.bodyExpectations = { status: 'unknown' }; }

        /* These two are not checks. They are placeholders that have never had an
           implementation, and they were being written into `checks` with
           status 'unknown' — which put them in the denominator of a verdict
           they can never contribute to. Marked as not-implemented and excluded
           from the verdict below, so the result describes what was actually
           examined rather than counting a TODO as an inconclusive check. */
        checks.crossSectionConsistency = { status: 'not-implemented' };
        checks.approvedBaselineCompare = { status: 'not-implemented' };

        const verdict = sectionPreflightVerdict(checks);

        return {
          sectionCode: sec.ctdSection, artifactId: sec.id,
          overall: verdict.overall,
          summary: verdict.summary,
          /* Named so a reader (and the audit record downstream) can see what the
             verdict rests on rather than taking the word for it. */
          checksRan: verdict.checksRan,
          checksDidNotRun: verdict.checksDidNotRun,
          checks, recommendedActions: [],
        };
      } catch {
        return { sectionCode: sec.ctdSection, artifactId: sec.id, overall: 'needs-review', summary: 'Check unavailable', checks: {}, recommendedActions: [] };
      }
    });

    const results = await Promise.allSettled(sectionPreflightPromises);
    for (const r of results) {
      if (r.status === 'fulfilled') sectionResults.push(r.value);
    }

    // Aggregate
    const counts = { total: sectionResults.length, ready: 0, blocked: 0, provisional: 0, needsReview: 0, needsReapproval: 0 };
    for (const sr of sectionResults) {
      if (sr.overall === 'ready') counts.ready++;
      else if (sr.overall === 'blocked') counts.blocked++;
      else if (sr.overall === 'provisional') counts.provisional++;
      else if (sr.overall === 'needs-reapproval') counts.needsReapproval++;
      else counts.needsReview++;
    }

    const majorBlockers: any[] = [];
    for (const sr of sectionResults) {
      if (sr.overall !== 'blocked') continue;
      for (const [checkName, check] of Object.entries(sr.checks || {})) {
        const c = check as any;
        if (c.status !== 'fail') continue;
        const kindMap: Record<string, string> = {
          bodyExpectations: 'body-gap', contradictions: 'contradiction',
          crossSectionConsistency: 'cross-section-inconsistency',
          readiness: 'readiness-blocker', approvedBaselineCompare: 'approved-baseline-conflict',
        };
        majorBlockers.push({
          sectionCode: sr.sectionCode, kind: kindMap[checkName] || 'readiness-blocker',
          severity: 'critical', message: `${checkName} failed in §${sr.sectionCode}`,
        });
      }
    }

    let overall: string;
    let summary: string;
    if (counts.blocked > 0) {
      overall = 'blocked';
      summary = `Module ${moduleCode} is blocked — ${counts.blocked} of ${counts.total} section(s) blocked.`;
    } else if (counts.provisional > 0) {
      overall = 'provisional';
      summary = `Module ${moduleCode} is provisional — ${counts.provisional} section(s) have warnings.`;
    } else if (counts.ready === counts.total && counts.total > 0) {
      overall = 'ready';
      summary = `Module ${moduleCode} is ready — all ${counts.total} section(s) pass preflight.`;
    } else {
      overall = 'needs-review';
      summary = `Module ${moduleCode} needs review — ${counts.needsReview} section(s) could not be checked.`;
    }

    const recommendedActions: any[] = [];
    if (counts.blocked > 0) {
      const worst = sectionResults.find((s: any) => s.overall === 'blocked');
      if (worst) {
        recommendedActions.push({ id: 'open-blocked-section', label: `Open blocked §${worst.sectionCode}`,
          reason: `Section ${worst.sectionCode} is blocked`, targetSectionCode: worst.sectionCode });
        recommendedActions.push({ id: 'run-section-preflight', label: `Run preflight on §${worst.sectionCode}`,
          reason: 'Get detailed check results', targetSectionCode: worst.sectionCode });
      }
    }
    if (overall === 'ready') {
      recommendedActions.push({ id: 'promote-module-when-clean', label: `All sections ready in ${moduleCode}`,
        reason: 'All preflight checks pass.' });
    }

    // ── Record formal decision (non-blocking) ─────────────────────
    let decisionRecord: any = null;
    try {
      const { decisionLifecycleService } = await import(
        '../services/decision-lifecycle-service.js'
      );
      const signals: Array<{ kind: string; id?: string; summary: string; severity?: string }> = [];
      for (const blocker of majorBlockers) {
        signals.push({ kind: blocker.kind || 'readiness-blocker', summary: blocker.message, severity: blocker.severity });
      }
      decisionRecord = decisionLifecycleService.recordPreflightDecision({
        projectId: String(projectId),
        organizationId: Number(orgId),
        kind: 'module-preflight-judgment',
        moduleCode, regulatorBody, submissionType,
        workflowStage: 'dossier',
        overall, summary,
        sourceSignals: signals as any,
        recommendedActionIds: recommendedActions.map((a: any) => a.id),
        createdById: (req as any).userId || undefined,
      });
    } catch { /* non-blocking */ }

    // ── Decision-aware gating enrichment ─────────────────────────
    let decisionAwareStatus: any = null;
    try {
      const { decisionLifecycleService } = await import(
        '../services/decision-lifecycle-service.js'
      );
      decisionAwareStatus = decisionLifecycleService.computeDecisionAwareStatus(
        String(projectId), { moduleCode, organizationId: orgId }
      );
    } catch { /* non-blocking */ }

    // ── Pass 8: Contradiction context enrichment ─────────────────
    let contradictionContext: any = null;
    try {
      const { contradictionEngineService } = await import(
        '../services/contradiction-engine-service.js'
      );
      contradictionContext = await contradictionEngineService.buildPreflightContradictionContext(
        orgId, Number(projectId),
        { moduleCode, regulatorBody, submissionType }
      );
    } catch { /* non-blocking */ }

    void auditService.logAction({
      tenantId: orgId,
      userId: (req as any).user?.id ?? null,
      action: 'k510_workflow.preflight',
      resourceType: 'k510_module_preflight',
      resourceId: `${projectId}:${moduleCode}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: {
        projectId: Number(projectId),
        moduleCode,
        regulatorBody: regulatorBody ?? null,
        submissionType: submissionType ?? null,
        overall,
        majorBlockerCount: Array.isArray(majorBlockers) ? majorBlockers.length : 0,
        decisionId: decisionRecord?.id ?? null,
      },
    });

    return res.json({
      status: 'data', action: 'module_preflight', moduleCode,
      regulatorBody, submissionType, overall, summary,
      sectionResults, counts, majorBlockers, recommendedActions,
      decisionId: decisionRecord?.id || null,
      decisionStatus: decisionRecord?.status || null,
      authority: decisionRecord?.authority || null,
      decisionAwareStatus: decisionAwareStatus || null,
      contradictionContext: contradictionContext || null,
    });
  } catch (err: any) {
    console.error('[authoring-actions] module-preflight error:', err?.message);
    return res.status(500).json({ error: 'Failed to run module preflight' });
  }
});

/**
 * POST /dossier-preflight
 * Aggregates module preflights across all modules in a project/dossier.
 */
router.post('/dossier-preflight', async (req: Request, res: Response) => {
  try {
    const { projectId, regulatorBody, submissionType } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });
    const orgId = requireTenantId(req, res);
    if (orgId == null) return;

    const artifactMap = await fetchProjectArtifactsByModule(Number(projectId));
    const moduleCodes = Array.from(artifactMap.keys()).sort();

    if (moduleCodes.length === 0) {
      return res.json({
        status: 'data', action: 'dossier_preflight',
        /* Reported so a consumer cannot mistake this for an executed preflight. */
        signalType: 'module_status_rollup',
        regulatorBody, submissionType,
        overall: 'needs-review',
        summary: 'No modules found in this project. Add documents first.',
        moduleResults: [],
        counts: { totalModules: 0, readyModules: 0, blockedModules: 0, provisionalModules: 0, needsReviewModules: 0, needsReapprovalModules: 0 },
        majorBlockers: [{ kind: 'missing-section', severity: 'major', message: 'No modules or sections found' }],
        recommendedActions: [],
      });
    }

    // Run module preflights by making internal calls
    const moduleResults: any[] = [];
    for (const mc of moduleCodes) {
      try {
        // Reuse internal logic — aggregate sections for this module
        const sections = artifactMap.get(mc) || [];
        const counts = { total: sections.length, ready: 0, blocked: 0, provisional: 0, needsReview: 0, needsReapproval: 0 };

        // Simplified per-section check: use artifact status as proxy + readiness
        for (const sec of sections) {
          if (sec.status === 'locked' || sec.status === 'approved') counts.ready++;
          else if (sec.status === 'review') counts.provisional++;
          else counts.needsReview++; // draft = needs-review
        }

        let modOverall: string;
        if (counts.blocked > 0) modOverall = 'blocked';
        else if (counts.provisional > 0) modOverall = 'provisional';
        else if (counts.ready === counts.total && counts.total > 0) modOverall = 'ready';
        else modOverall = 'needs-review';

        moduleResults.push({
          moduleCode: mc, overall: modOverall,
          summary: `${mc}: ${counts.ready}/${counts.total} ready`,
          sectionResults: sections.map(s => ({ sectionCode: s.ctdSection, artifactId: s.id, overall: s.status === 'approved' || s.status === 'locked' ? 'ready' : s.status === 'review' ? 'provisional' : 'needs-review' })),
          counts, majorBlockers: [], recommendedActions: [],
        });
      } catch {
        moduleResults.push({ moduleCode: mc, overall: 'needs-review', summary: `${mc}: check unavailable`, sectionResults: [], counts: { total: 0, ready: 0, blocked: 0, provisional: 0, needsReview: 0, needsReapproval: 0 }, majorBlockers: [], recommendedActions: [] });
      }
    }

    // Run real readiness engine for enrichment
    let readinessBlockers: any[] = [];
    try {
      /* Canonical payload builder — see the note in /module-preflight. The
         hand-rolled payload threw on every call and was silently swallowed. */
      const { assembleCrossObjectPayload } = await import(
        '../services/orchestration/cross-object-resolver.js'
      );
      const { computeReadinessAssessment } = await import('../services/orchestration/readiness-engine.js');
      if (computeReadinessAssessment) {
        const assessment = computeReadinessAssessment(
          await assembleCrossObjectPayload({
            organizationId: Number(orgId),
            projectId: Number(projectId),
          }),
        );
        readinessBlockers = (assessment?.blockers || []).filter((b: any) => b.severity === 'critical' || b.severity === 'major')
          .slice(0, 10).map((b: any) => ({
            kind: 'readiness-blocker', severity: b.severity,
            message: b.message || b.description, moduleCode: b.module,
          }));
      }
    } catch { /* readiness unavailable */ }

    // Aggregate dossier counts
    const dCounts = { totalModules: moduleResults.length, readyModules: 0, blockedModules: 0, provisionalModules: 0, needsReviewModules: 0, needsReapprovalModules: 0 };
    for (const mr of moduleResults) {
      if (mr.overall === 'ready') dCounts.readyModules++;
      else if (mr.overall === 'blocked') dCounts.blockedModules++;
      else if (mr.overall === 'provisional') dCounts.provisionalModules++;
      else if (mr.overall === 'needs-reapproval') dCounts.needsReapprovalModules++;
      else dCounts.needsReviewModules++;
    }

    const majorBlockers = [...readinessBlockers];
    for (const mr of moduleResults) {
      if (mr.overall === 'blocked') {
        majorBlockers.push({ moduleCode: mr.moduleCode, kind: 'readiness-blocker', severity: 'critical', message: `Module ${mr.moduleCode} is blocked` });
      }
    }

    /* WHAT THIS ACTUALLY COMPUTES.
       Nothing here runs a preflight check. Each section's contribution is read
       straight off its status column — 'locked'/'approved' counts ready,
       'review' counts provisional, anything else needs review — and
       `counts.blocked` is initialised to 0 and never incremented, so the
       blocked branch below is unreachable by construction.

       It said "Dossier ready — all N module(s) pass." A dossier whose artifacts
       are merely marked approved therefore reported that every module PASSED,
       naming a preflight that never ran. That is the same defect as the
       per-section verdict in /module-preflight — a check that ran zero
       assertions reporting a pass — one level up and without even the checks.

       The roll-up itself is worth having: the distribution of module states is a
       real answer to a real question. So it is reported as what it is, in the
       same spirit as the deficiency scan's `signal_type: 'heuristic_quality'`.
       The word "pass" is gone, because nothing was tested. */
    let overall: string;
    let summary: string;
    const NOT_A_PREFLIGHT =
      ' This is a roll-up of recorded module status; no preflight checks were run.';
    if (dCounts.blockedModules > 0) {
      overall = 'blocked';
      summary = `Dossier blocked — ${dCounts.blockedModules} of ${dCounts.totalModules} module(s) blocked.${NOT_A_PREFLIGHT}`;
    } else if (dCounts.provisionalModules > 0) {
      overall = 'provisional';
      summary = `Dossier provisional — ${dCounts.provisionalModules} module(s) are still in review.${NOT_A_PREFLIGHT}`;
    } else if (dCounts.readyModules === dCounts.totalModules && dCounts.totalModules > 0) {
      overall = 'ready';
      summary = `All ${dCounts.totalModules} module(s) are recorded as approved or locked.${NOT_A_PREFLIGHT}`;
    } else {
      overall = 'needs-review';
      summary = `Dossier needs review — ${dCounts.needsReviewModules} module(s) need attention.${NOT_A_PREFLIGHT}`;
    }

    const recommendedActions: any[] = [];
    if (dCounts.blockedModules > 0) {
      const worst = moduleResults.find((m: any) => m.overall === 'blocked');
      if (worst) {
        recommendedActions.push({ id: 'open-blocked-module', label: `Open blocked ${worst.moduleCode}`,
          reason: `${worst.moduleCode} is blocked`, targetModuleCode: worst.moduleCode });
        recommendedActions.push({ id: 'run-module-preflight', label: `Run preflight on ${worst.moduleCode}`,
          reason: 'Get detailed module results', targetModuleCode: worst.moduleCode });
      }
    }
    if (overall === 'ready') {
      recommendedActions.push({ id: 'promote-dossier-when-clean', label: 'Dossier ready for submission assembly',
        reason: 'All modules pass preflight.' });
    }

    // ── Record formal decision (non-blocking) ─────────────────────
    let decisionRecord: any = null;
    try {
      const { decisionLifecycleService } = await import(
        '../services/decision-lifecycle-service.js'
      );
      const signals: Array<{ kind: string; id?: string; summary: string; severity?: string }> = [];
      for (const blocker of majorBlockers) {
        signals.push({ kind: blocker.kind || 'readiness-blocker', summary: blocker.message, severity: blocker.severity });
      }
      decisionRecord = decisionLifecycleService.recordPreflightDecision({
        projectId: String(projectId),
        organizationId: Number(orgId),
        kind: 'dossier-preflight-judgment',
        regulatorBody, submissionType,
        workflowStage: 'submissions',
        overall, summary,
        sourceSignals: signals as any,
        recommendedActionIds: recommendedActions.map((a: any) => a.id),
        createdById: (req as any).userId || undefined,
      });
    } catch { /* non-blocking */ }

    // ── Decision-aware gating enrichment ─────────────────────────
    let decisionAwareStatus: any = null;
    try {
      const { decisionLifecycleService } = await import(
        '../services/decision-lifecycle-service.js'
      );
      decisionAwareStatus = decisionLifecycleService.computeDecisionAwareStatus(
        String(projectId), { organizationId: orgId }
      );
    } catch { /* non-blocking */ }

    // ── Pass 8: Contradiction context enrichment ─────────────────
    let contradictionContext: any = null;
    try {
      const { contradictionEngineService } = await import(
        '../services/contradiction-engine-service.js'
      );
      contradictionContext = await contradictionEngineService.buildPreflightContradictionContext(
        orgId, Number(projectId),
        { regulatorBody, submissionType }
      );
    } catch { /* non-blocking */ }

    void auditService.logAction({
      tenantId: orgId,
      userId: (req as any).user?.id ?? null,
      action: 'k510_workflow.preflight',
      resourceType: 'k510_dossier_preflight',
      resourceId: String(projectId),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: {
        projectId: Number(projectId),
        regulatorBody: regulatorBody ?? null,
        submissionType: submissionType ?? null,
        overall,
        majorBlockerCount: Array.isArray(majorBlockers) ? majorBlockers.length : 0,
        decisionId: decisionRecord?.id ?? null,
      },
    });

    return res.json({
      status: 'data', action: 'dossier_preflight',
      /* Reported so a consumer cannot mistake this for an executed preflight. */
      signalType: 'module_status_rollup',
      regulatorBody, submissionType, overall, summary,
      moduleResults, counts: dCounts, majorBlockers, recommendedActions,
      decisionId: decisionRecord?.id || null,
      decisionStatus: decisionRecord?.status || null,
      authority: decisionRecord?.authority || null,
      decisionAwareStatus: decisionAwareStatus || null,
      contradictionContext: contradictionContext || null,
    });
  } catch (err: any) {
    console.error('[authoring-actions] dossier-preflight error:', err?.message);
    return res.status(500).json({ error: 'Failed to run dossier preflight' });
  }
});

// ─── Section Preflight (Pass 5) ──────────────────────────────────────────────

/**
 * POST /section-preflight
 * Aggregates all existing checks into a canonical SectionPreflightResult.
 * Calls: readiness-engine, contradiction-engine, body-aware-authoring,
 *        harmonize-engine — all in parallel.
 * Returns structured preflight with overall verdict + recommended actions.
 */
router.post('/section-preflight', async (req: Request, res: Response) => {
  try {
    const {
      projectId, sectionCode, artifactId, artifactVersionId,
      regulatorBody, submissionType, linkedSectionCodes,
    } = req.body;
    if (!projectId || !sectionCode) {
      return res.status(400).json({ error: 'projectId and sectionCode are required' });
    }

    const orgId = requireTenantId(req, res);
    if (orgId == null) return;
    type CheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';
    const checks: Record<string, any> = {};

    // ── Run all checks in parallel ──────────────────────────────────
    const [readinessResult, contradictionResult, bodyResult, consistencyResult] =
      await Promise.allSettled([
        // 1. Readiness
        (async () => {
          try {
            const { assembleCrossObjectPayload } = await import(
              '../services/orchestration/cross-object-resolver.js'
            );
            const { computeReadinessAssessment } = await import(
              '../services/orchestration/readiness-engine.js'
            );
            if (!computeReadinessAssessment) return null;
            /* Canonical payload builder — see the note in /module-preflight. */
            const assessment = computeReadinessAssessment(
              await assembleCrossObjectPayload({
                organizationId: Number(orgId),
                projectId: Number(projectId),
              }),
            );
            const major = (Array.isArray(sectionCode) ? sectionCode[0] : sectionCode).split('.')[0];
            const moduleItem = (assessment?.moduleBreakdown || []).find(
              (m: any) => m.module === `Module ${major}` || m.module === `m${major}`
            );
            const blockers = (assessment?.blockers || [])
              .filter((b: any) => !b.module || b.module === `m${major}`)
              .slice(0, 10)
              .map((b: any) => ({ code: b.category || 'BLOCK', severity: b.severity, message: b.message || b.description }));
            const hasCritical = blockers.some((b: any) => b.severity === 'critical');
            const status: CheckStatus = hasCritical ? 'fail' : blockers.length > 0 ? 'warn' : 'pass';
            return { status, score: moduleItem?.score ?? assessment?.overallScore ?? null, blockers };
          } catch { return null; }
        })(),
        // 2. Contradictions
        (async () => {
          try {
            const { contradictionEngineService } = await import(
              '../services/contradiction-engine-service.js'
            );
            if (!contradictionEngineService?.scanProject) return null;
            const scanResult = await contradictionEngineService.scanProject(orgId, Number(projectId));
            const relevant = ((scanResult?.findings as any[]) || [])
              .filter((f: any) => f.sectionCode === sectionCode || (f.affectedSections || []).includes(sectionCode))
              .slice(0, 10)
              .map((f: any) => ({
                id: f.id || f.findingId || String(Math.random()),
                severity: f.authorityState === 'blocks_promotion' ? 'critical' : f.severity || 'minor',
                explanation: f.explanation || f.description || f.title,
              }));
            const hasCritical = relevant.some((r: any) => r.severity === 'critical');
            const status: CheckStatus = hasCritical ? 'fail' : relevant.length > 0 ? 'warn' : 'pass';
            return { status, items: relevant };
          } catch { return null; }
        })(),
        // 3. Body-aware gaps
        (async () => {
          if (!regulatorBody && !submissionType) return null;
          try {
            const { detectBodySpecificGaps } = await import(
              '../services/body-aware-authoring.js'
            );
            if (!detectBodySpecificGaps) return null;
            const analysis = await detectBodySpecificGaps(
              regulatorBody || 'FDA', submissionType || 'IND', sectionCode, ''
            );
            const missing = analysis.gaps.filter((g: any) => g.status === 'missing').map((g: any) => g.requirement);
            const weak = analysis.gaps.filter((g: any) => g.status === 'weak').map((g: any) => g.requirement);
            const status: CheckStatus = missing.length > 0 ? 'fail' : weak.length > 0 ? 'warn' : 'pass';
            return { status, missing, weak, requiredLevel: 'required' };
          } catch { return null; }
        })(),
        // 4. Cross-section consistency
        (async () => {
          const CTD_LINKS: Record<string, string[]> = {
            '2.2': ['2.3', '2.4', '2.5'], '2.3': ['3.2.S', '3.2.P'],
            '2.4': ['4.2.1', '4.2.2', '4.2.3'], '2.5': ['2.7.1', '2.7.3', '2.7.4', '5.3'],
            '2.7.1': ['5.2'], '2.7.3': ['2.5', '5.3'], '2.7.4': ['2.5', '5.3'],
            '3.2.S': ['2.3'], '3.2.P': ['2.3'], '5.3': ['2.5', '2.7.3', '2.7.4'],
          };
          const linked = linkedSectionCodes || CTD_LINKS[sectionCode]
            || CTD_LINKS[sectionCode.split('.').slice(0, -1).join('.')] || [];
          if (linked.length === 0) return { status: 'unknown' as CheckStatus, items: [] };
          try {
            const { HarmonizeEngine } = await import('../services/harmonize-engine.js');
            const { db } = await import('../db.js');
            const sections: Record<string, string> = {};
            for (const code of [sectionCode, ...linked]) {
              const artifact = await db.query.concept2cureArtifacts?.findFirst?.({
                where: (a: any, { and, eq }: any) =>
                  and(eq(a.projectId, Number(projectId)), eq(a.ctdSection, code)),
                orderBy: (a: any, { desc }: any) => [desc(a.updatedAt)],
              }).catch(() => null);
              if (artifact?.content) {
                sections[code] = typeof artifact.content === 'string'
                  ? artifact.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
              }
            }
            if (Object.keys(sections).length < 2) return { status: 'unknown' as CheckStatus, items: [] };
            const engine = new HarmonizeEngine();
            const result = await engine.check({ sections, submissionType: submissionType || 'IND' });
            const items = result.issues.slice(0, 10).map((i: any) => ({
              type: i.type, severity: i.severity, explanation: i.description,
              linkedSections: [i.sectionA, i.sectionB].filter(Boolean),
            }));
            const hasCritical = items.some((i: any) => i.severity === 'critical' || i.severity === 'error');
            const status: CheckStatus = hasCritical ? 'fail' : items.length > 0 ? 'warn' : 'pass';
            return { status, consistencyScore: result.consistencyScore, items };
          } catch { return { status: 'unknown' as CheckStatus, items: [] }; }
        })(),
      ]);

    // ── Assemble checks ─────────────────────────────────────────────
    checks.readiness = (readinessResult.status === 'fulfilled' && readinessResult.value)
      ? readinessResult.value : { status: 'unknown' };
    checks.contradictions = (contradictionResult.status === 'fulfilled' && contradictionResult.value)
      ? contradictionResult.value : { status: 'unknown' };
    checks.bodyExpectations = (bodyResult.status === 'fulfilled' && bodyResult.value)
      ? bodyResult.value : { status: 'unknown' };
    checks.crossSectionConsistency = (consistencyResult.status === 'fulfilled' && consistencyResult.value)
      ? consistencyResult.value : { status: 'unknown' };
    // A never-implemented placeholder must be EXCLUDED from the verdict, not
    // fed in as 'unknown' — 'unknown' means "a check that should run did not,"
    // which forces needs-review, whereas this check does not exist yet.
    checks.approvedBaselineCompare = { status: 'not-implemented' };

    // ── Compute overall verdict ─────────────────────────────────────
    // Use the shared sectionPreflightVerdict helper — the SAME logic
    // /module-preflight uses. The previous inline logic only avoided 'ready'
    // when EVERY check was 'unknown', so a section where one governed gate's
    // READ failed ('unknown') while another passed fell through to 'ready' /
    // "All preflight checks pass" — a false all-clear written into a GxP
    // promotion decision (recordPreflightDecision below). The helper treats ANY
    // 'unknown' (a check that did not run) as needs-review and requires at least
    // one check to have actually run.
    const verdict = sectionPreflightVerdict(checks);
    const overall: string = verdict.overall;
    let summary: string;
    if (overall === 'blocked') {
      const failChecks = Object.entries(checks).filter(([, v]: any) => v.status === 'fail').map(([k]) => k);
      summary = `Section is blocked by ${failChecks.length} failed check(s): ${failChecks.join(', ')}. Resolve before promotion.`;
    } else if (overall === 'provisional') {
      summary = 'Section has warnings. Review before promotion.';
    } else if (overall === 'needs-review') {
      summary = verdict.checksDidNotRun.length > 0
        ? `Preflight is incomplete — ${verdict.checksDidNotRun.length} check(s) did not run (${verdict.checksDidNotRun.join(', ')}). Manual review recommended before promotion.`
        : 'Preflight checks could not run — manual review recommended.';
    } else {
      summary = `All preflight checks pass (${verdict.checksRan} ran). Section is ready for promotion.`;
    }

    // ── Build recommended actions ───────────────────────────────────
    const recommendedActions: Array<{ id: string; label: string; reason: string }> = [];
    if (checks.bodyExpectations?.status === 'fail') {
      recommendedActions.push({ id: 'gather-body-evidence', label: 'Gather body-required evidence',
        reason: `${(checks.bodyExpectations.missing || []).length} body requirement(s) missing` });
    }
    if (checks.contradictions?.status === 'fail' || checks.contradictions?.status === 'warn') {
      recommendedActions.push({ id: 'prepare-correction-draft', label: 'Prepare correction draft',
        reason: `${(checks.contradictions.items || []).length} contradiction(s) detected` });
    }
    if (checks.crossSectionConsistency?.status === 'fail' || checks.crossSectionConsistency?.status === 'warn') {
      recommendedActions.push({ id: 'harmonize-linked-sections', label: 'Harmonize with linked sections',
        reason: `${(checks.crossSectionConsistency.items || []).length} inconsistency(s) across linked sections` });
    }
    if (checks.readiness?.status === 'fail') {
      recommendedActions.push({ id: 'explain-blockers', label: 'Explain blockers',
        reason: `${(checks.readiness.blockers || []).length} readiness blocker(s)` });
    }
    if (overall === 'ready') {
      recommendedActions.push({ id: 'promote-to-review', label: 'Promote to review',
        reason: 'All checks pass — ready for governed promotion.' });
    }

    // ── Record formal decision (non-blocking) ─────────────────────
    let decisionRecord: any = null;
    try {
      const { decisionLifecycleService } = await import(
        '../services/decision-lifecycle-service.js'
      );
      const signals: Array<{ kind: string; id?: string; summary: string; severity?: string }> = [];
      if (checks.contradictions?.items?.length) {
        for (const item of checks.contradictions.items) {
          signals.push({ kind: 'contradiction', id: item.id, summary: item.explanation, severity: item.severity });
        }
      }
      if (checks.bodyExpectations?.missing?.length) {
        signals.push({ kind: 'body-gap', summary: `${checks.bodyExpectations.missing.length} body requirement(s) missing`, severity: 'major' });
      }
      if (checks.crossSectionConsistency?.items?.length) {
        for (const item of checks.crossSectionConsistency.items) {
          signals.push({ kind: 'cross-section-inconsistency', summary: item.explanation, severity: item.severity });
        }
      }
      if (checks.readiness?.blockers?.length) {
        for (const b of checks.readiness.blockers) {
          signals.push({ kind: 'readiness-blocker', summary: b.message, severity: b.severity });
        }
      }

      decisionRecord = decisionLifecycleService.recordPreflightDecision({
        projectId: String(projectId),
        organizationId: Number(orgId),
        kind: 'section-preflight-judgment',
        sectionCode, artifactId, artifactVersionId,
        regulatorBody, submissionType,
        workflowStage: 'section-workspace',
        overall, summary,
        sourceSignals: signals as any,
        recommendedActionIds: recommendedActions.map((a: any) => a.id),
        createdById: (req as any).userId || undefined,
      });
    } catch {
      // Decision recording is non-blocking
    }

    // ── Pass 8: Contradiction context enrichment ─────────────────
    let contradictionContext: any = null;
    try {
      const { contradictionEngineService } = await import(
        '../services/contradiction-engine-service.js'
      );
      contradictionContext = await contradictionEngineService.buildPreflightContradictionContext(
        orgId, Number(projectId),
        { sectionCode, regulatorBody, submissionType }
      );
    } catch { /* non-blocking */ }

    return res.json({
      status: 'data', action: 'section_preflight',
      sectionCode, artifactId, artifactVersionId, regulatorBody, submissionType,
      overall, summary, checks, recommendedActions,
      decisionId: decisionRecord?.id || null,
      decisionStatus: decisionRecord?.status || null,
      authority: decisionRecord?.authority || null,
      contradictionContext: contradictionContext || null,
    });
  } catch (err: any) {
    console.error('[authoring-actions] section-preflight error:', err?.message);
    return res.status(500).json({ error: 'Failed to run section preflight' });
  }
});

// ─── Section-level readiness + contradiction data feed ───────────────────────

router.get('/section-context/:projectId/:sectionCode', async (req: Request, res: Response) => {
  try {
    const { projectId, sectionCode } = req.params;
    const orgId = requireTenantId(req, res);
    if (orgId == null) return;

    const result: {
      sectionCode: string;
      readiness: { score: number | null; blocked: boolean; blockers: any[] } | null;
      contradictions: any[];
    } = {
      sectionCode: Array.isArray(sectionCode) ? sectionCode[0] : sectionCode,
      readiness: null,
      contradictions: [],
    };

    // Fetch readiness data
    try {
      const { assembleCrossObjectPayload } = await import(
        '../services/orchestration/cross-object-resolver.js'
      );
      const { computeReadinessAssessment } = await import(
        '../services/orchestration/readiness-engine.js'
      );
      if (computeReadinessAssessment) {
        /* Canonical payload builder — see the note in /module-preflight. */
        const assessment = computeReadinessAssessment(
          await assembleCrossObjectPayload({
            organizationId: Number(orgId),
            projectId: Number(projectId),
          }),
        );
        // Extract section-level readiness from module breakdown
        const moduleBreakdown = assessment?.moduleBreakdown || [];
        const sectionCodeStr = Array.isArray(sectionCode) ? sectionCode[0] : sectionCode;
        const moduleMatch = moduleBreakdown.find(
          (m: any) => m.moduleCode === `m${sectionCodeStr.split('.')[0]}`
        );
        result.readiness = {
          score: moduleMatch?.score ?? assessment?.overallScore ?? null,
          blocked: assessment?.blockers?.some(
            (b: any) => b.severity === 'critical'
          ) ?? false,
          blockers: (assessment?.blockers || []).map((b: any) => ({
            code: b.type || 'readiness',
            severity: b.severity || 'major',
            message: b.description || b.message || 'Blocker',
            source: 'readiness-engine',
          })),
        };
      }
    } catch {
      // Non-blocking
    }

    // Fetch contradictions
    try {
      const { contradictionEngineService } = await import(
        '../services/contradiction-engine-service.js'
      );
      if (contradictionEngineService?.scanProject) {
        const scanResult = await contradictionEngineService.scanProject(
          0,
          Number(projectId)
        );
        // Filter to section-relevant contradictions
        result.contradictions = ((scanResult?.findings as any[]) || [])
          .filter(
            (f: any) =>
              !sectionCode ||
              f.sectionCode === sectionCode ||
              f.affectedSections?.includes(sectionCode)
          )
          .map((f: any) => ({
            id: f.id || `c-${Math.random().toString(36).slice(2)}`,
            type: f.contradictionType || f.type || 'finding',
            severity:
              f.authorityState === 'blocks_promotion'
                ? 'critical'
                : f.severity === 'major'
                  ? 'major'
                  : 'minor',
            explanation: f.explanation || f.description || 'Finding detected',
            relatedObjectIds: f.affectedObjectIds || [],
          }));
      }
    } catch {
      // Non-blocking
    }

    return res.json(result);
  } catch (err: any) {
    console.error('[authoring-actions] section-context error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch section context' });
  }
});

// ─── Decision Architecture API ───────────────────────────────────────────────

/**
 * GET /decisions/:projectId
 * Retrieve formal decision records for a project, optionally filtered.
 */
router.get('/decisions/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { kind, status, sectionCode, moduleCode, limit } = req.query;

    /* These three decision reads resolved no tenant at all — unlike every
       adjacent route in this file — and the store behind them is an in-memory
       Map, so there is no row-level security to fall back on. Any authenticated
       caller could read another organization's governed decisions and receipts
       by supplying an id. */
    const orgId = requireTenantId(req, res);
    if (orgId == null) return;

    const { decisionLifecycleService } = await import(
      '../services/decision-lifecycle-service.js'
    );

    const decisions = decisionLifecycleService.getProjectDecisions(
      String(projectId ?? ''),
      {
        organizationId: orgId,
        kind: kind as any || undefined,
        status: status as any || undefined,
        sectionCode: sectionCode as string || undefined,
        moduleCode: moduleCode as string || undefined,
        limit: limit ? Number(limit) : 20,
      }
    );

    return res.json({
      projectId,
      count: decisions.length,
      decisions: decisions.map(d => ({
        id: d.id,
        kind: d.kind,
        status: d.status,
        summary: d.summary,
        rationale: d.rationale,
        authority: d.authority,
        sectionCode: d.sectionCode,
        moduleCode: d.moduleCode,
        artifactId: d.artifactId,
        createdByType: d.createdByType,
        createdAt: d.createdAt,
        sourceSignalCount: d.sourceSignals.length,
        hasReceipt: !!d.linkedReceiptId,
      })),
    });
  } catch (err: any) {
    console.error('[authoring-actions] decisions error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch decisions' });
  }
});

/**
 * GET /decision/:decisionId
 * Retrieve a single decision + its receipt.
 */
router.get('/decision/:decisionId', async (req: Request, res: Response) => {
  try {
    const { decisionId } = req.params;

    /* These three decision reads resolved no tenant at all — unlike every
       adjacent route in this file — and the store behind them is an in-memory
       Map, so there is no row-level security to fall back on. Any authenticated
       caller could read another organization's governed decisions and receipts
       by supplying an id. */
    const orgId = requireTenantId(req, res);
    if (orgId == null) return;

    const { decisionLifecycleService } = await import(
      '../services/decision-lifecycle-service.js'
    );

    /* A decision belonging to another organization is reported as not found,
       not as forbidden — a 403 would confirm the id exists. */
    const decision = decisionLifecycleService.getDecision(String(decisionId ?? ''), orgId);
    if (!decision) {
      return res.status(404).json({ error: 'Decision not found' });
    }

    const receipt = decisionLifecycleService.getReceiptForDecision(String(decisionId ?? ''));

    return res.json({
      decision,
      receipt: receipt || null,
    });
  } catch (err: any) {
    console.error('[authoring-actions] decision detail error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch decision' });
  }
});

/**
 * POST /decision/:decisionId/confirm
 * Confirm or reject a recommended decision.
 */
router.post('/decision/:decisionId/confirm', async (req: Request, res: Response) => {
  try {
    const { decisionId } = req.params;
    const { accepted, reason } = req.body;
    const userId = (req as any).userId || 'unknown';
    const userRole = (req as any).userRole || undefined;

    const { decisionLifecycleService } = await import(
      '../services/decision-lifecycle-service.js'
    );

    const newStatus = accepted ? 'confirmed' : 'rejected';
    const result = decisionLifecycleService.transitionDecision(
      String(decisionId ?? ''),
      newStatus as any,
      { actorId: userId, actorRole: userRole, reason }
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.json({
      success: true,
      decision: result.decision,
    });
  } catch (err: any) {
    console.error('[authoring-actions] decision confirm error:', err?.message);
    return res.status(500).json({ error: 'Failed to confirm decision' });
  }
});

/**
 * GET /decision-context/:projectId
 * Get decision context for AnA explanation grounding.
 */
router.get('/decision-context/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { sectionCode, moduleCode, limit } = req.query;

    /* Same gap as the two decision reads above, and this one returns MORE per
       record — full receipts alongside the decisions. */
    const orgId = requireTenantId(req, res);
    if (orgId == null) return;

    const { decisionLifecycleService } = await import(
      '../services/decision-lifecycle-service.js'
    );

    const context = decisionLifecycleService.getDecisionContext(
      String(projectId ?? ''),
      {
        organizationId: orgId,
        sectionCode: sectionCode as string || undefined,
        moduleCode: moduleCode as string || undefined,
        limit: limit ? Number(limit) : 10,
      }
    );

    return res.json({
      projectId,
      count: context.length,
      items: context.map(({ decision, receipt }) => ({
        decision: {
          id: decision.id,
          kind: decision.kind,
          status: decision.status,
          summary: decision.summary,
          rationale: decision.rationale,
          authority: decision.authority,
          sourceSignals: decision.sourceSignals,
          recommendedActionIds: decision.recommendedActionIds,
          createdByType: decision.createdByType,
          createdAt: decision.createdAt,
        },
        receipt: receipt ? {
          id: receipt.id,
          recommendation: receipt.recommendation,
          confirmation: receipt.confirmation,
          execution: receipt.execution,
          affectedObjects: receipt.affectedObjects,
          pendingApprovals: receipt.pendingApprovals,
          provisionalItems: receipt.provisionalItems,
        } : null,
      })),
    });
  } catch (err: any) {
    console.error('[authoring-actions] decision-context error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch decision context' });
  }
});

/**
 * GET /authority-map
 * Return the full authority boundary map for UI display.
 */
router.get('/authority-map', async (_req: Request, res: Response) => {
  try {
    const { AUTHORITY_BOUNDARY_MAP } = await import(
      '../../shared/types/decision-architecture.js'
    );
    return res.json({
      entries: AUTHORITY_BOUNDARY_MAP.map((e: any) => ({
        action: e.action,
        level: e.authority.level,
        requiresHumanConfirmation: e.authority.requiresHumanConfirmation,
        requiresReviewerApproval: e.authority.requiresReviewerApproval,
        requiresEscalation: e.authority.requiresEscalation,
        allowedActorRoles: e.authority.allowedActorRoles,
        description: e.description,
      })),
    });
  } catch (err: any) {
    console.error('[authoring-actions] authority-map error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch authority map' });
  }
});

// ─── Pass 8: Cross-Artifact Contradiction + Overlay Context ──────────────────

/**
 * POST /contradiction-scan
 * Full cross-artifact contradiction scan with overlay application.
 * Returns structured findings with severity, authority, consequence paths,
 * and regulator/body overlay context.
 */
router.post('/contradiction-scan', async (req: Request, res: Response) => {
  try {
    const { projectId, regulatorBody, submissionType } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const orgId = requireTenantId(req, res);
    if (orgId == null) return;

    // Run full scan (Pass 8 extended)
    const { contradictionEngineService } = await import(
      '../services/contradiction-engine-service.js'
    );
    const scanResult = await contradictionEngineService.scanProjectFull(
      orgId, Number(projectId),
      { regulatorBody, submissionType }
    );

    // Apply overlay rules
    let overlayCount = 0;
    let overlayConsequences: any[] = [];
    if (regulatorBody) {
      try {
        const { regulatorOverlayEngine } = await import(
          '../services/regulator-overlay-engine.js'
        );
        const overlayResult = await regulatorOverlayEngine.applyOverlaysToFindings(
          scanResult.findings
        );
        overlayCount = overlayResult.overlayCount;
        overlayConsequences = overlayResult.overlayConsequences;
      } catch { /* overlay engine unavailable */ }
    }

    // Build consequence paths for each finding
    const consequencePathsByFinding: Record<string, any[]> = {};
    try {
      const { contradictionConsequenceService } = await import(
        '../services/contradiction-consequence-service.js'
      );
      for (const finding of scanResult.findings.slice(0, 20)) {
        const paths = await contradictionConsequenceService.getAvailableConsequencePaths(finding);
        if (paths.length > 0) {
          consequencePathsByFinding[finding.id] = paths.map(p => ({
            id: p.id,
            actionType: p.actionType,
            label: p.label,
            description: p.description,
            authorityLevel: p.authorityLevel,
            requiresConfirmation: p.requiresConfirmation,
            requiresApproval: p.requiresApproval,
            requiresEscalation: p.requiresEscalation,
            autoRecommended: p.autoRecommended,
          }));
        }
      }
    } catch { /* consequence service unavailable */ }

    // Link to decisions
    let linkedDecisionIds: string[] = [];
    try {
      const { decisionLifecycleService } = await import(
        '../services/decision-lifecycle-service.js'
      );
      const context = decisionLifecycleService.getContradictionDecisionContext(
        String(projectId), { limit: 20, organizationId: orgId }
      );
      linkedDecisionIds = context
        .filter(c => c.isContradictionDecision)
        .map(c => c.decision.id);
    } catch { /* non-blocking */ }

    return res.json({
      status: 'data',
      action: 'contradiction_scan',
      projectId,
      regulatorBody: regulatorBody || null,
      submissionType: submissionType || null,
      summary: scanResult.summary,
      detectionMethods: scanResult.detectionMethods,
      findings: scanResult.findings.map(f => ({
        id: f.id,
        contradictionType: f.contradictionType,
        severity: f.severity,
        confidenceLevel: f.confidenceLevel,
        confidenceScore: f.confidenceScore,
        title: f.title,
        description: f.description,
        objectAType: f.objectAType,
        objectAId: f.objectAId,
        objectALabel: f.objectALabel,
        objectBType: f.objectBType,
        objectBId: f.objectBId,
        objectBLabel: f.objectBLabel,
        authorityState: f.authorityState,
        reviewState: f.reviewState,
        consequenceType: f.consequenceType,
        consequenceExecuted: f.consequenceExecuted,
        sourceClassification: f.sourceClassification,
        deterministicRule: f.deterministicRule,
        llmRole: f.llmRole,
        regulatorBody: f.regulatorBody,
        overlayRuleId: f.overlayRuleId,
        regulatorSeverityOverride: f.regulatorSeverityOverride,
        truthHierarchyLevel: f.truthHierarchyLevel,
        consequencePaths: consequencePathsByFinding[f.id] || [],
      })),
      overlay: {
        overlayCount,
        consequences: overlayConsequences,
      },
      linkedDecisionIds,
    });
  } catch (err: any) {
    console.error('[authoring-actions] contradiction-scan error:', err?.message);
    return res.status(500).json({ error: 'Failed to run contradiction scan' });
  }
});

/**
 * POST /contradiction-consequence
 * Execute a consequence path for a contradiction finding.
 */
router.post('/contradiction-consequence', async (req: Request, res: Response) => {
  try {
    const { findingId, consequenceType } = req.body;
    if (!findingId || !consequenceType) {
      return res.status(400).json({ error: 'findingId and consequenceType are required' });
    }

    const orgId = requireTenantId(req, res);
    if (orgId == null) return;
    const userId = (req as any).userId || 'system';
    const userRole = (req as any).userRole || undefined;

    // Fetch the finding
    const { contradictionEngineService } = await import(
      '../services/contradiction-engine-service.js'
    );
    const finding = await contradictionEngineService.getFinding(findingId, orgId);
    if (!finding) {
      return res.status(404).json({ error: 'Finding not found' });
    }

    // Execute consequence
    const { contradictionConsequenceService } = await import(
      '../services/contradiction-consequence-service.js'
    );
    const result = await contradictionConsequenceService.executeConsequence(
      finding, consequenceType, userId,
      { projectId: finding.projectId ?? undefined, organizationId: orgId, actorRole: userRole }
    );

    return res.json({
      status: result.success ? 'executed' : 'failed',
      action: 'contradiction_consequence',
      findingId,
      consequenceType,
      consequenceObjectId: result.consequenceObjectId,
      consequenceObjectType: result.consequenceObjectType,
      decisionId: result.decision?.id || null,
      receiptId: result.receipt?.id || null,
      error: result.error || null,
    });
  } catch (err: any) {
    console.error('[authoring-actions] contradiction-consequence error:', err?.message);
    return res.status(500).json({ error: 'Failed to execute contradiction consequence' });
  }
});

/**
 * GET /contradiction-context/:projectId
 * Contradiction-enriched context for AnA and UI surfaces.
 * Includes contradiction findings, overlay state, decision links.
 */
router.get('/contradiction-context/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { sectionCode, moduleCode, regulatorBody, submissionType } = req.query;
    const orgId = requireTenantId(req, res);
    if (orgId == null) return;

    // Build enriched contradiction context
    const { contradictionEngineService } = await import(
      '../services/contradiction-engine-service.js'
    );
    const context = await contradictionEngineService.buildPreflightContradictionContext(
      orgId, Number(projectId),
      {
        sectionCode: sectionCode as string || undefined,
        moduleCode: moduleCode as string || undefined,
        regulatorBody: regulatorBody as string || undefined,
        submissionType: submissionType as string || undefined,
      }
    );

    // Also get contradiction-aware decision status
    let contradictionAwareStatus: any = null;
    try {
      const { decisionLifecycleService } = await import(
        '../services/decision-lifecycle-service.js'
      );
      contradictionAwareStatus = await decisionLifecycleService.computeContradictionAwareStatus(
        String(projectId ?? ''),
        {
          moduleCode: moduleCode as string || undefined,
          regulatorBody: regulatorBody as string || undefined,
          submissionType: submissionType as string || undefined,
        }
      );
    } catch { /* non-blocking */ }

    return res.json({
      status: 'data',
      action: 'contradiction_context',
      projectId,
      context,
      contradictionAwareStatus,
    });
  } catch (err: any) {
    console.error('[authoring-actions] contradiction-context error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch contradiction context' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// WAVE 3 ACTIONS — Contradiction → Resolution Bridge (Pass 10)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /plan-contradiction-resolution
 * Plan (but don't execute) resolution for a specific contradiction.
 * Returns authority check, recommended path, affected objects.
 */
router.post('/plan-contradiction-resolution', async (req: Request, res: Response) => {
  try {
    const { projectId, findingId, overlayRules } = req.body;
    if (!projectId || !findingId) {
      return res.status(400).json({ error: 'projectId and findingId are required' });
    }

    const orgId = requireTenantId(req, res);
    if (orgId == null) return;
    const userId = (req as any).userId || 0;

    /* Loaded, not accepted — see the note on /execute-contradiction-resolution.
       A `finding` supplied in the request body is ignored. */
    const { contradictionEngineService } = await import(
      '../services/contradiction-engine-service.js'
    );
    const finding = await contradictionEngineService.getFinding(findingId, Number(orgId));
    if (!finding) {
      return res.status(404).json({ error: 'Finding not found for this organization' });
    }

    const { planContradictionResolution } = await import(
      '../services/resolution/contradiction-resolution-bridge.js'
    );
    const result = await planContradictionResolution(
      Number(orgId), Number(userId), Number(projectId),
      findingId, finding, overlayRules
    );

    return res.json({
      status: result.success ? 'data' : 'error',
      action: 'plan_contradiction_resolution',
      ...result,
    });
  } catch (err: any) {
    console.error('[authoring-actions] plan-contradiction-resolution error:', err?.message);
    return res.status(500).json({ error: 'Failed to plan contradiction resolution' });
  }
});

/**
 * POST /execute-contradiction-resolution
 * Execute a contradiction resolution (full orchestration with authority + overlay awareness).
 * Creates decision record + receipt. Triggers preflight refresh.
 */
router.post('/execute-contradiction-resolution', async (req: Request, res: Response) => {
  try {
    const { projectId, findingId, overlayRules } = req.body;
    if (!projectId || !findingId) {
      return res.status(400).json({ error: 'projectId and findingId are required' });
    }

    const orgId = requireTenantId(req, res);
    if (orgId == null) return;
    const userId = (req as any).userId || 0;
    const actorRole = (req as any).userRole || undefined;

    /* The finding is LOADED here, not accepted from the caller.
       It used to arrive as `finding` in the request body and be passed straight
       downstream, where its own fields drive the resolution — including
       finding.authority*, which decides whether the action is permitted at all.
       A client that supplies the object also supplies the authority state used
       to judge it, and nothing checked that the finding existed, belonged to
       this org, or matched the id alongside it.

       /contradiction-consequence in this same file already does it correctly:
       take the id, load the row scoped to the caller's org, refuse when it does
       not resolve. Same pattern here. A `finding` in the body is now ignored. */
    const { contradictionEngineService } = await import(
      '../services/contradiction-engine-service.js'
    );
    const finding = await contradictionEngineService.getFinding(findingId, Number(orgId));
    if (!finding) {
      return res.status(404).json({ error: 'Finding not found for this organization' });
    }

    const { executeContradictionResolution } = await import(
      '../services/resolution/contradiction-resolution-bridge.js'
    );
    const result = await executeContradictionResolution(
      Number(orgId), Number(userId), Number(projectId),
      findingId, finding, overlayRules, actorRole
    );

    return res.json({
      status: result.success ? 'data' : 'blocked',
      action: 'execute_contradiction_resolution',
      ...result,
    });
  } catch (err: any) {
    console.error('[authoring-actions] execute-contradiction-resolution error:', err?.message);
    return res.status(500).json({ error: 'Failed to execute contradiction resolution' });
  }
});

/**
 * POST /explain-contradiction-resolution
 * Explain a contradiction resolution plan (structured, no LLM).
 */
router.post('/explain-contradiction-resolution', async (req: Request, res: Response) => {
  try {
    const { projectId, findingId, overlayRules } = req.body;
    if (!projectId || !findingId) {
      return res.status(400).json({ error: 'projectId and findingId are required' });
    }

    const orgId = requireTenantId(req, res);
    if (orgId == null) return;

    /* Loaded, not accepted — see the note on /execute-contradiction-resolution.
       A `finding` supplied in the request body is ignored. */
    const { contradictionEngineService } = await import(
      '../services/contradiction-engine-service.js'
    );
    const finding = await contradictionEngineService.getFinding(findingId, Number(orgId));
    if (!finding) {
      return res.status(404).json({ error: 'Finding not found for this organization' });
    }

    const { explainContradictionResolution } = await import(
      '../services/resolution/contradiction-resolution-bridge.js'
    );
    const result = await explainContradictionResolution(
      Number(orgId), Number(projectId), findingId, finding, overlayRules
    );

    return res.json({
      status: result.success ? 'data' : 'error',
      action: 'explain_contradiction_resolution',
      ...result,
    });
  } catch (err: any) {
    console.error('[authoring-actions] explain-contradiction-resolution error:', err?.message);
    return res.status(500).json({ error: 'Failed to explain contradiction resolution' });
  }
});

/**
 * GET /project-resolution-status/:projectId
 * Get resolution status for a project (plans + bundles summary).
 */
router.get('/project-resolution-status/:projectId', async (req: Request, res: Response) => {
  try {
    const projectIdRaw = Array.isArray(req.params.projectId)
      ? req.params.projectId[0]
      : req.params.projectId;
    const projectId = parseInt(String(projectIdRaw ?? ''), 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }

    const orgId = requireTenantId(req, res);
    if (orgId == null) return;

    const { getProjectResolutionStatus } = await import(
      '../services/resolution/contradiction-resolution-bridge.js'
    );
    const result = await getProjectResolutionStatus(Number(orgId), projectId);

    return res.json({
      status: result.success ? 'data' : 'error',
      action: 'project_resolution_status',
      ...result,
    });
  } catch (err: any) {
    console.error('[authoring-actions] project-resolution-status error:', err?.message);
    return res.status(500).json({ error: 'Failed to get project resolution status' });
  }
});

/**
 * POST /seed-overlay-rules
 * Seed the default regulator overlay rules for an organization.
 * Idempotent — safe to call multiple times.
 */
router.post('/seed-overlay-rules', async (req: Request, res: Response) => {
  try {
    const orgId = requireTenantId(req, res);
    if (orgId == null) return;

    const { regulatorOverlayEngine } = await import(
      '../services/regulator-overlay-engine.js'
    );
    const result = await regulatorOverlayEngine.ensureSeedRules(orgId);

    return res.json({
      status: 'data',
      action: 'seed_overlay_rules',
      seeded: result.seeded,
      skipped: result.skipped,
      totalAvailable: regulatorOverlayEngine.getSeedRules().length,
    });
  } catch (err: any) {
    console.error('[authoring-actions] seed-overlay-rules error:', err?.message);
    return res.status(500).json({ error: 'Failed to seed overlay rules' });
  }
});

export default router;

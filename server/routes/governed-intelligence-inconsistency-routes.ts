/**
 * Governed Intelligence — Inconsistency (Contradiction) Read-Model Route
 *
 * Read-only board endpoint that backs the ui-v2 "Inconsistency" surface
 * (client/src/concept2cure/v2/surfaces/Inconsistency.tsx). It aggregates the
 * three governed-intelligence stores for one project into the display shape the
 * surface renders, WITHOUT running a scan or mutating anything:
 *
 *   - contradiction_findings   (contradictionEngineService.searchFindings)
 *   - assumption_records       (assumptionRegistryService.search)
 *   - decision_records         (decisionRecordService.search)
 *   - projects                 (org-scoped header: name/code/status/indication)
 *
 * Envelope: { success: true, data: <board> }.
 *
 * Auth: mounted behind authenticateToken; organization id is read from the
 * tenant/user request context. Every store read is org-scoped.
 *
 * HONESTY (regulated product): the submission gate treats an empty findings set
 * as "clean / ready to file", so a findings READ FAILURE must never degrade to
 * an empty array — it fails closed with 503. Fields with no faithful persisted
 * source (program.app, program.filing, finding.factId, the verified-consistent
 * "checks" list) are returned as documented null / [] and are NEVER fabricated.
 *
 * @module server/routes/governed-intelligence-inconsistency-routes
 */

import { Router, Request, Response } from 'express';

import { createScopedLogger } from '../utils/logger.js';
import { query as dbQuery } from '../db.js';
import { contradictionEngineService } from '../services/contradiction-engine-service';
import { assumptionRegistryService } from '../services/assumption-registry-service';
import { decisionRecordService } from '../services/decision-record-service';

const logger = createScopedLogger('governed-intelligence-inconsistency');

// ─── Display shape (mirrors the surface's fixture types, honesty-adjusted) ─────

interface InconsistencyObjectRef {
  type: string;
  id: string;
  label: string;
}

interface InconsistencyFinding {
  id: string;
  projectId: number;
  contradictionType: string;
  severity: string;
  title: string;
  objectA: InconsistencyObjectRef;
  objectB: InconsistencyObjectRef;
  sourceClassification: string;
  truthHierarchyLevel: number;
  llmRole: string;
  confidenceScore: number;
  confidenceLevel: string;
  description: string;
  deterministicRule: string | null;
  consequenceType: string | null;
  reviewState: string;
  detectedBy: string;
  authorityState: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  /** No fact-linkage column exists on contradiction_findings — always null. */
  factId: string | null;
}

interface InconsistencyAssumption {
  id: string;
  category: string;
  domainTrack: string;
  assumedValue: string;
  status: string;
  title: string;
  source: string;
}

interface InconsistencyDecision {
  id: string;
  title: string;
  actionState: string;
  executedArtifactId: number | null;
  executedArtifactVersion: number | null;
  decidedBy: string;
  rationale: string;
}

interface InconsistencyProgram {
  projectId: number;
  name: string;
  code: string | null;
  /** Real project lifecycle status (planning|active|on-hold|completed|archived). */
  stage: string | null;
  indication: string | null;
  /** Application identifier belongs to a submission record, not the project — null. */
  app: string | null;
  /** Filing/submission type belongs to a submission record, not the project — null. */
  filing: string | null;
}

interface InconsistencyCheck {
  k: string;
  detail: string;
}

interface InconsistencyBoard {
  program: InconsistencyProgram;
  findings: InconsistencyFinding[];
  assumptions: InconsistencyAssumption[];
  decisions: InconsistencyDecision[];
  checks: InconsistencyCheck[];
}

interface ProjectHeaderRow {
  id: number;
  code: string | null;
  name: string;
  status: string | null;
  therapeutic_area: string | null;
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// ─── Router Factory ───────────────────────────────────────────────────────────

export default function createGovernedIntelligenceInconsistencyRoutes(): Router {
  const router = Router();

  function getOrgId(req: Request): number {
    const raw =
      (req as Request & { organizationId?: number | string }).organizationId ??
      (req as Request & { user?: { organizationId?: number | string } }).user?.organizationId ??
      (req as Request & { tenantId?: number | string }).tenantId;
    const orgId = Number(raw);
    if (!Number.isFinite(orgId) || orgId <= 0) {
      throw new Error('GI_NO_TENANT: Organization context required');
    }
    return orgId;
  }

  /**
   * GET /projects/:projectId/inconsistency
   *
   * Cross-document inconsistency board for one project: program header + live
   * contradiction findings + the assumption registry + decision records.
   */
  router.get('/projects/:projectId/inconsistency', async (req: Request, res: Response) => {
    try {
      let orgId: number;
      try {
        orgId = getOrgId(req);
      } catch {
        return res.status(403).json({ success: false, error: 'Organization context required' });
      }

      const projectId = Number(req.params.projectId);
      if (!Number.isInteger(projectId) || projectId <= 0) {
        return res
          .status(400)
          .json({ success: false, error: 'A valid numeric projectId is required' });
      }

      const rawLimit = Number(
        Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit,
      );
      const limit =
        Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 500) : 200;

      // 1) Program header — org-scoped. A DB failure here fails closed (503);
      //    a missing row means the project is not in this org (404) and also
      //    prevents returning findings for a project the caller cannot see.
      let header: ProjectHeaderRow | null = null;
      try {
        const result = await dbQuery(
          `SELECT id, code, name, status, therapeutic_area
             FROM projects
            WHERE id = $1 AND organization_id = $2
            LIMIT 1`,
          [projectId, orgId],
        );
        header = (result?.rows?.[0] ?? null) as ProjectHeaderRow | null;
      } catch (error) {
        logger.error('project header read failed', { projectId, err: errMsg(error) });
        return res.status(503).json({ success: false, error: 'Project store unavailable' });
      }
      if (!header) {
        return res
          .status(404)
          .json({ success: false, error: 'Project not found for this organization' });
      }

      // 2) Findings — the promotion-gating data. Fail CLOSED on read error:
      //    an empty findings set is interpreted downstream as "clean / ready to
      //    file", so we must never emit [] when we simply could not read.
      let findingRecords;
      try {
        findingRecords = await contradictionEngineService.searchFindings({
          organizationId: orgId,
          projectId,
          limit,
        });
      } catch (error) {
        logger.error('contradiction findings read failed', { projectId, err: errMsg(error) });
        return res
          .status(503)
          .json({ success: false, error: 'Contradiction findings store unavailable' });
      }

      // 3) Assumptions + decisions — supporting context only. Degrade to [] on
      //    failure so a registry hiccup never blocks the safety-critical board.
      const [assumptionsSettled, decisionsSettled] = await Promise.allSettled([
        assumptionRegistryService.search({ organizationId: orgId, projectId, limit }),
        decisionRecordService.search({ organizationId: orgId, projectId, limit }),
      ]);
      if (assumptionsSettled.status === 'rejected') {
        logger.warn('assumption registry read failed (degraded to empty)', {
          projectId,
          err: errMsg(assumptionsSettled.reason),
        });
      }
      if (decisionsSettled.status === 'rejected') {
        logger.warn('decision records read failed (degraded to empty)', {
          projectId,
          err: errMsg(decisionsSettled.reason),
        });
      }
      const assumptionRecords =
        assumptionsSettled.status === 'fulfilled' ? assumptionsSettled.value : [];
      const decisionRecords =
        decisionsSettled.status === 'fulfilled' ? decisionsSettled.value : [];

      // ── Map to the display shape ────────────────────────────────────────────

      const findings: InconsistencyFinding[] = findingRecords.map(f => {
        const level = Number(f.truthHierarchyLevel);
        return {
          id: f.id,
          projectId,
          contradictionType: f.contradictionType,
          severity: f.severity,
          title: f.title,
          objectA: { type: f.objectAType, id: f.objectAId, label: f.objectALabel ?? f.objectAId },
          objectB: { type: f.objectBType, id: f.objectBId, label: f.objectBLabel ?? f.objectBId },
          sourceClassification: f.sourceClassification,
          truthHierarchyLevel: Number.isFinite(level) ? level : 0,
          llmRole: f.llmRole,
          confidenceScore: f.confidenceScore,
          confidenceLevel: f.confidenceLevel,
          description: f.description,
          deterministicRule: f.deterministicRule,
          consequenceType: f.consequenceType,
          reviewState: f.reviewState,
          detectedBy: f.detectedBy,
          authorityState: f.authorityState,
          resolvedBy: f.resolvedBy,
          resolvedAt: f.resolvedAt,
          // HONESTY: contradiction_findings has no fact-linkage column; the CMC
          // "change value everywhere" affordance has no persisted backing datum.
          factId: null,
        };
      });

      const assumptions: InconsistencyAssumption[] = assumptionRecords.map(a => ({
        id: a.id,
        category: a.category,
        domainTrack: a.domainTrack,
        // Returned exactly as stored; `unit` is a separate column if the display
        // wants it — not concatenated here to avoid duplicating an inline unit.
        assumedValue: a.assumedValue,
        status: a.status,
        title: a.title,
        source: a.sourceReference ?? a.sourceType,
      }));

      const decisions: InconsistencyDecision[] = decisionRecords.map(d => ({
        id: d.id,
        title: d.title,
        actionState: d.actionState,
        executedArtifactId: d.executedArtifactId,
        executedArtifactVersion: d.executedArtifactVersion,
        decidedBy: d.decidedBy,
        rationale: d.recommendationRationale ?? d.recommendationSummary,
      }));

      const program: InconsistencyProgram = {
        projectId,
        name: header.name,
        code: header.code,
        // Real project lifecycle status. NOTE: this is the project status, not a
        // submission-assembly stage (the fixture's prose "stage").
        stage: header.status,
        indication: header.therapeutic_area,
        // HONESTY: application number and filing type describe a regulatory
        // submission, not the project record, and are not reliably 1:1 joinable
        // here — returned null rather than fabricated.
        app: null,
        filing: null,
      };

      const board: InconsistencyBoard = {
        program,
        findings,
        assumptions,
        decisions,
        // HONESTY: the engine persists contradictions (findings), not the set of
        // cross-references it verified as consistent. No source exists for a
        // "what AnA checked / all consistent" list, so this is always empty.
        checks: [],
      };

      return res.json({ success: true, data: board });
    } catch (error) {
      logger.error('inconsistency board read failed', { err: errMsg(error) });
      return res.status(500).json({ success: false, error: 'Failed to load inconsistency board' });
    }
  });

  return router;
}

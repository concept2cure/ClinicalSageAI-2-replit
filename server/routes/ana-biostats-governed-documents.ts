/**
 * AnA Biostats — Governed Statistical Documents (read/list)
 *
 * Backs the org-scoped "Governed statistical documents" list on the ui-v2
 * Biostatistics surface (labeled "org-scoped", not "this project" — the list spans
 * every persisted statistical_summary artifact for the tenant unless a projectId
 * filter is supplied)
 * (client/src/concept2cure/v2/surfaces/Biostatistics.tsx → BIOSTAT_PLANS, lines
 * 481-485 / 630-643).
 *
 * The Biostatistics surface computes the entire design + document body
 * deterministically in the browser — the engine is ported verbatim from
 * server/services/ana-biostats/* — so that part needs no backend. The ONE piece
 * of stored, org-scoped data it renders is the list of statistical documents that
 * AnA Biostats has already generated and persisted. Those are written to
 * `concept2cure_artifacts` (type = 'statistical_summary') by
 * server/services/ana-biostats/workflow-integrator.ts::createArtifact during
 * POST /api/ana-biostats/workflow. This route reads them back, org-scoped.
 *
 *   GET /api/ana-biostats/governed-documents?projectId=&limit=
 *     → { success: true, data: BiostatPlan[], total: number }
 *
 * BiostatPlan display shape (surface):
 *   { id: string; study: string; endpoint: string; doc: string; status: string }
 *
 * Field provenance (regulated product — nothing is fabricated):
 *   id      ← concept2cure_artifacts.artifact_id              (real external id)
 *   doc     ← metadata.statisticalDocumentType                (real; maps 1:1 to
 *             the surface DocDef ids in BiostatDocs.REGISTRY)
 *   status  ← concept2cure_artifacts.status                   (real: draft |
 *             review | approved | locked; surface renders approved→ok, else→warn)
 *   study   ← projects.name (joined on project_id)            (real; defensive
 *             fallback to metadata.indication/phase, else `Project <id>`)
 *   endpoint← null  ── HONESTY GAP: the clinical endpoint / endpointType is NOT
 *             persisted on the artifact row. workflow-integrator.ts writes only
 *             statisticalDocumentType, clientTrack, regulatoryBody, studyType,
 *             indication and phase into metadata. Returned as null rather than
 *             fabricated. To fill this truthfully in future, persist
 *             endpointType / a named primary endpoint into artifact metadata at
 *             generation time.
 *
 * @module routes/ana-biostats-governed-documents
 */

import { Router, Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';

import { db } from '../db.js';
import { concept2cureArtifacts, projects } from '../../shared/schema.js';
import { authenticateToken } from '../middleware/auth.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('ana-biostats-governed-documents');

/**
 * Discriminator written by the AnA Biostats workflow integrator for every
 * persisted statistical document (see workflow-integrator.ts::createArtifact).
 */
const STATISTICAL_ARTIFACT_TYPE = 'statistical_summary';

/**
 * Resolve the caller's organization id as a positive integer. The
 * concept2cure_artifacts.organization_id column is an integer FK, so the scope
 * value must be numeric. Resolution order mirrors server/routes/ana-biostats.ts.
 */
function resolveOrganizationId(req: Request): number | null {
  const raw =
    (req as any).organizationId ??
    (req as any).user?.organizationId ??
    (req as any).tenantContext?.organizationId ??
    (req as any).tenantId;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ─── Router Factory ───────────────────────────────────────────────────────────

export default function createAnaBiostatsGovernedDocumentsRoutes(): Router {
  const router = Router();

  /**
   * GET /api/ana-biostats/governed-documents
   *
   * Org-scoped list of persisted AnA Biostats statistical documents, newest
   * first. Optional query params:
   *   - projectId: positive integer — scope to a single project ("this project").
   *   - limit:     1..200 (default 50).
   */
  router.get('/', authenticateToken, async (req: Request, res: Response) => {
    try {
      const orgId = resolveOrganizationId(req);
      if (orgId == null) {
        return res.status(401).json({ success: false, error: 'Organization context required' });
      }

      // Optional projectId filter.
      let projectId: number | undefined;
      if (req.query.projectId !== undefined) {
        const n = Number(req.query.projectId);
        if (!Number.isInteger(n) || n <= 0) {
          return res
            .status(400)
            .json({ success: false, error: 'projectId must be a positive integer' });
        }
        projectId = n;
      }

      // Bounded result size.
      const limitRaw = Number(req.query.limit);
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50;

      const conditions = [
        eq(concept2cureArtifacts.organizationId, orgId),
        eq(concept2cureArtifacts.type, STATISTICAL_ARTIFACT_TYPE),
      ];
      if (projectId !== undefined) {
        conditions.push(eq(concept2cureArtifacts.projectId, projectId));
      }

      const rows = await db
        .select({
          artifactId: concept2cureArtifacts.artifactId,
          status: concept2cureArtifacts.status,
          projectId: concept2cureArtifacts.projectId,
          metadata: concept2cureArtifacts.metadata,
          projectName: projects.name,
          createdAt: concept2cureArtifacts.createdAt,
        })
        .from(concept2cureArtifacts)
        .leftJoin(projects, eq(projects.id, concept2cureArtifacts.projectId))
        .where(and(...conditions))
        .orderBy(desc(concept2cureArtifacts.createdAt))
        .limit(limit);

      const data = rows.map((r) => {
        // metadata is a json column (typed `unknown` on select); read defensively.
        const md: {
          statisticalDocumentType?: string;
          indication?: string;
          phase?: string;
        } =
          (r.metadata as {
            statisticalDocumentType?: string;
            indication?: string;
            phase?: string;
          } | null) ?? {};

        const projectName = (r.projectName ?? '').trim();
        const derived = [md.indication, md.phase].filter(Boolean).join(' — ');
        const study = projectName || derived || `Project ${r.projectId}`;

        return {
          id: r.artifactId,
          study,
          // HONESTY GAP: the clinical endpoint / endpointType is not persisted on
          // the artifact row, so it cannot be sourced. Null, never fabricated.
          endpoint: null,
          doc: md.statisticalDocumentType ?? null,
          status: r.status,
        };
      });

      return res.json({ success: true, data, total: data.length });
    } catch (error) {
      logger.error('governed documents list error', {
        err: error instanceof Error ? error.message : String(error),
      });
      return res
        .status(500)
        .json({ success: false, error: 'Failed to retrieve governed statistical documents' });
    }
  });

  return router;
}

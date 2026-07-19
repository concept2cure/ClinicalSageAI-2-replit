/**
 * @fileoverview CSR Workflow Board API Route (ui-v2 `csr-workflow` surface)
 * @module server/routes/csr-workflow-routes
 *
 * Backs the `CsrWorkflow` surface (client/src/concept2cure/v2/surfaces/
 * BiopharmaProject.tsx) with live, org-scoped ICH E3 Clinical Study Report
 * build state instead of the codebase fixture (project3-data.ts →
 * CSR_PROGRAM / CSR_SECTIONS).
 *
 * ONE read endpoint:
 *   GET /api/csr-workflow/board[?projectId=<n>]
 *     → { success: true, data: {
 *           program:  { title, code, readiness } | null,
 *           sections: Array<{ num, label, status, blocker? }>,
 *           meta, generatedAt
 *       } }
 *
 * Real data source (no new tables):
 *   - csr_build_jobs      — the async CSR build job for the org/project. Its
 *                           `progress` (0..100, persisted by csr-job-runner)
 *                           is the honest "% ready", and `study_info_snapshot`
 *                           carries the real study title/protocol.
 *   - csr_section_outputs — one row per drafted ICH-E3 section (content +
 *                           provenance). Presence of a row == the section has
 *                           been drafted. Read via the existing org-scoped
 *                           getCSRSectionOutputs(jobId, orgId).
 *   - ICH_E3_STRUCTURE    — the canonical ICH E3 section catalog (labels +
 *                           required flags) via getICHE3Structure().
 *
 * HONESTY (regulated product — see the surface's SampleTag contract):
 *   - `program.code` is the constant 'ICH E3'. The CSR build pipeline conforms
 *     to ICH E3 by construction (ICH_E3_STRUCTURE); this is a guideline label,
 *     not a per-record DB value.
 *   - Section `status` is derived strictly from what is persisted:
 *       drafted (a csr_section_outputs row exists for the section or one of its
 *       children) → 'draft'; otherwise → 'idle' (not started).
 *     The values 'review'/'complete'/'approved' are DELIBERATELY never emitted:
 *     csr_section_outputs has no review/approval status column, so those
 *     workflow states cannot be sourced honestly. See caveats.
 *   - `blocker` is true only for a REQUIRED section with no drafted content
 *     (a required section with no draft blocks CSR completion). Omitted (not
 *     false) otherwise, matching the fixture's optional shape.
 *   - No CSR build job for the org/project → program: null and an all-not-
 *     started section structure (mirrors the biopharma/ctd build-state
 *     "degrade to all-not-started" pattern). A wired client treats a null
 *     program as "no live program" and keeps its sample fixture.
 *
 * Tenant scoping: organizationId is resolved from JWT-bound request context
 * only (tenantContext / user), never from the body/query/headers. Every read
 * is org-scoped; the optional projectId is an additional narrowing filter.
 *
 * Style template: server/routes/pharmacovigilance-routes.ts (Router factory /
 * default export, org id from request context, scoped logger, honest error
 * shaping, { success, data } envelope).
 */

import { Router, type Request, type Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';

import { db } from '../db.js';
import { csrBuildJobs } from '@shared/schema';
import { getICHE3Structure, type CSRSection } from '../services/csr-builder.js';
import { getCSRSectionOutputs } from '../services/csr/csr-job-runner.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('csr-workflow-routes');

/**
 * The guideline the CSR section structure conforms to. Constant, not sourced
 * from a DB column — the whole csr-builder pipeline is ICH E3 by construction.
 */
const CSR_GUIDELINE_CODE = 'ICH E3';

// ─── Display-shape types (mirror the surface's CsrProgram / CsrSection) ────────

interface CsrWorkflowProgram {
  title: string;
  code: string;
  readiness: number; // 0..100, from csr_build_jobs.progress
}

interface CsrWorkflowSection {
  num: string;
  label: string;
  status: 'draft' | 'idle';
  blocker?: boolean;
}

interface CsrWorkflowBoard {
  program: CsrWorkflowProgram | null;
  sections: CsrWorkflowSection[];
  meta: Record<string, unknown>;
  generatedAt: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve organizationId from JWT-bound context only. Returns null when absent
 * — the caller MUST emit 401 rather than defaulting to a tenant id.
 */
function resolveOrganizationId(req: Request): number | null {
  const r = req as unknown as {
    tenantContext?: { organizationId?: unknown };
    user?: { organizationId?: unknown };
    tenantId?: unknown;
  };
  const candidate =
    r.tenantContext?.organizationId ?? r.user?.organizationId ?? r.tenantId;
  if (candidate == null) return null;
  const n = typeof candidate === 'string' ? parseInt(candidate, 10) : Number(candidate);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Parse the optional ?projectId query param. Returns:
 *   - undefined when the param is absent (no project narrowing),
 *   - a positive integer when valid,
 *   - null when present but malformed (caller emits 400).
 */
function parseProjectIdQuery(raw: unknown): number | undefined | null {
  if (raw === undefined) return undefined;
  const s = Array.isArray(raw) ? '' : String(raw);
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Clamp any numeric progress into a display-safe 0..100 integer. */
function clampPercent(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/**
 * Pull a real study title from the persisted study_info_snapshot. Handles the
 * current envelope ({ studyInfo: {...} }) and the legacy raw-studyInfo shape.
 * Falls back to protocolNumber, then to the always-present studyId — never a
 * fabricated value.
 */
function resolveStudyTitle(rawSnapshot: unknown, studyId: string): string {
  if (rawSnapshot && typeof rawSnapshot === 'object') {
    const obj = rawSnapshot as Record<string, unknown>;
    const inner =
      obj.studyInfo && typeof obj.studyInfo === 'object'
        ? (obj.studyInfo as Record<string, unknown>)
        : obj;
    const title = inner.title;
    if (typeof title === 'string' && title.trim()) return title.trim();
    const protocol = inner.protocolNumber;
    if (typeof protocol === 'string' && protocol.trim()) return protocol.trim();
  }
  return studyId;
}

/**
 * Map the canonical ICH-E3 top-level structure to the surface's section rows.
 * A top-level section counts as drafted when it (or any of its child sections)
 * has a persisted csr_section_outputs row. `draftedSet` empty ⇒ all-not-started.
 */
function buildSections(
  structure: CSRSection[],
  draftedSet: Set<string>,
): CsrWorkflowSection[] {
  return structure.map((section) => {
    const drafted =
      draftedSet.has(section.number) ||
      (section.childSections?.some((c) => draftedSet.has(c.number)) ?? false);

    const row: CsrWorkflowSection = {
      num: section.number,
      label: section.title,
      status: drafted ? 'draft' : 'idle',
    };
    // A required section with no drafted content blocks CSR completion.
    if (section.required && !drafted) {
      row.blocker = true;
    }
    return row;
  });
}

// ─── Router Factory ─────────────────────────────────────────────────────────────

export default function createCsrWorkflowRoutes(): Router {
  const router = Router();

  /**
   * GET /api/csr-workflow/board
   * Live ICH E3 CSR build state for the org's most-recently-updated CSR build
   * job (optionally narrowed to ?projectId). Returns program:null + an
   * all-not-started structure when no CSR job exists yet.
   */
  router.get('/board', async (req: Request, res: Response) => {
    try {
      const orgId = resolveOrganizationId(req);
      if (orgId == null) {
        return res.status(401).json({ success: false, error: 'Organization context required' });
      }

      const projectId = parseProjectIdQuery(req.query.projectId);
      if (projectId === null) {
        return res.status(400).json({ success: false, error: 'projectId must be a positive integer' });
      }

      if (!db) {
        logger.error('database not initialized');
        return res.status(503).json({ success: false, error: 'Database not available' });
      }
      const database = db;

      // Latest CSR build job for this org (+ optional project), most recent first.
      const conditions = [eq(csrBuildJobs.organizationId, orgId)];
      if (projectId !== undefined) {
        conditions.push(eq(csrBuildJobs.projectId, projectId));
      }

      const [job] = await database
        .select({
          id: csrBuildJobs.id,
          projectId: csrBuildJobs.projectId,
          studyId: csrBuildJobs.studyId,
          status: csrBuildJobs.status,
          progress: csrBuildJobs.progress,
          studyInfoSnapshot: csrBuildJobs.studyInfoSnapshot,
          updatedAt: csrBuildJobs.updatedAt,
        })
        .from(csrBuildJobs)
        .where(and(...conditions))
        .orderBy(desc(csrBuildJobs.updatedAt), desc(csrBuildJobs.id))
        .limit(1);

      // No CSR program yet — honest empty state (program:null, all-not-started).
      if (!job) {
        const board: CsrWorkflowBoard = {
          program: null,
          sections: buildSections(getICHE3Structure(), new Set<string>()),
          meta: {
            hasProgram: false,
            projectId: projectId ?? null,
          },
          generatedAt: new Date().toISOString(),
        };
        return res.json({ success: true, data: board });
      }

      // Drafted-section set from persisted outputs (org-scoped read).
      const outputs = await getCSRSectionOutputs(job.id, orgId);
      const draftedSet = new Set<string>(outputs.map((o) => o.sectionNumber));

      const sections = buildSections(getICHE3Structure(), draftedSet);
      const draftedTopLevel = sections.filter((s) => s.status === 'draft').length;

      const program: CsrWorkflowProgram = {
        title: resolveStudyTitle(job.studyInfoSnapshot, job.studyId),
        code: CSR_GUIDELINE_CODE,
        readiness: clampPercent(job.progress),
      };

      const board: CsrWorkflowBoard = {
        program,
        sections,
        meta: {
          hasProgram: true,
          jobId: job.id,
          studyId: job.studyId,
          jobStatus: job.status,
          projectId: job.projectId,
          sectionsDraftedTopLevel: draftedTopLevel,
          sectionsTotalTopLevel: sections.length,
          sectionOutputCount: outputs.length,
          updatedAt:
            job.updatedAt instanceof Date ? job.updatedAt.toISOString() : job.updatedAt ?? null,
        },
        generatedAt: new Date().toISOString(),
      };

      return res.json({ success: true, data: board });
    } catch (error) {
      logger.error('csr-workflow board error', {
        err: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ success: false, error: 'Failed to load CSR workflow board' });
    }
  });

  return router;
}

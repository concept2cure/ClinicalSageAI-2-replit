/**
 * Regulatory Workspace API — backs the ui-v2 `regulatory-workspace` surface.
 *
 * Mounted at:  /api/regulatory-workspace
 *
 * Serves the generic three-pane CTD authoring substrate
 * (client/src/concept2cure/v2/surfaces/BiopharmaProject.tsx →
 * RegulatoryWorkspace) with its exact display shape, populated from real,
 * org-scoped section-tracking data instead of the codebase fixture:
 *
 *   - tree[]  — the section navigator (left pane): every tracked CTD section
 *               for the resolved project, with its authoring status mapped to
 *               the kit's tree vocabulary (`complete | review | draft` — the
 *               only three values the `.ed-dot[data-s]` selector styles, see
 *               client/src/concept2cure/v2/styles/authoring-v2.css).
 *   - intel[] — the intelligence panel (right pane): readiness %, open-comment
 *               count, and linked-evidence count, each derived from real rows.
 *
 * HONESTY (regulated product): sub-metrics the platform does not actually
 * store are OMITTED, never fabricated. Specifically the fixture's
 * "· N from AnA" (comment authorship split) and "N unlinked claims"
 * (claim-level evidence linkage) have no backing column/table and are left
 * out — see the inline notes below and the route README/caveats.
 *
 * Read-only. The section-tracking tables come from
 * db/migrations/20260220_ind_section_tracking.sql (project_sections,
 * section_comments, section_dependencies); artifact links come from
 * db/migrations/20260311_concept2cure_artifacts.sql (concept2cure_artifacts).
 * Every query is scoped to the caller's organization id.
 *
 * @module routes/regulatory-workspace-routes
 * @compliance FDA 21 CFR Part 11 (tenant isolation; no fabricated data)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger.js';
import { resolveOrgId } from '../types/auth-request.js';

const logger = createScopedLogger('regulatory-workspace-routes');

// ─── Display-shape types (mirror client v2 RwTreeItem / RwIntelItem) ──────────

/** Left-pane section-tree row. `status` is constrained to the three values the
 *  `.ed-dot[data-s]` selector styles (authoring-v2.css) so no row renders an
 *  unstyled dot. */
interface WorkspaceTreeItem {
  id: string;
  num: string;
  label: string;
  status: 'complete' | 'review' | 'draft';
  active: boolean;
}

/** Right-pane intelligence row (label / value). */
interface WorkspaceIntelItem {
  k: string;
  v: string;
}

interface RegulatoryWorkspacePayload {
  /** Resolved project the tree/intel describe; null when the org has none. */
  projectId: number | null;
  /** Best-effort project name (metadata; not part of the strict display shape). */
  projectName: string | null;
  tree: WorkspaceTreeItem[];
  intel: WorkspaceIntelItem[];
}

// ─── Derivation helpers ───────────────────────────────────────────────────────

/** Section-authoring workflow states (the 21 CFR Part 11 lifecycle defined in
 *  services/regulatory/ind-ectd-sections.ts) collapsed onto the kit's tree-dot
 *  vocabulary. Every state maps to a styled value. */
const STATUS_TO_TREE: Record<string, WorkspaceTreeItem['status']> = {
  not_started: 'draft',
  data_gathering: 'draft',
  drafting: 'draft',
  internal_review: 'review',
  revision: 'review',
  qa_review: 'review',
  approved: 'complete',
  signed: 'complete',
  locked: 'complete',
};

/** Statuses that count as "done" for readiness + blocker math. */
const COMPLETE_STATUSES = new Set(['approved', 'signed', 'locked']);

/** Postgres "undefined table" — tolerated so an un-provisioned optional table
 *  degrades to an omitted intel row rather than a 500. */
function isUndefinedTable(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01';
}

/** eCTD code → display number: strip the leading module `m`
 *  (e.g. `m2.5` → `2.5`, `m3.2.S` → `3.2.S`, `m5.3.5` → `5.3.5`). */
function sectionNum(code: string): string {
  return code.replace(/^m(?=\d)/i, '');
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

interface SectionRow {
  section_code: string;
  title: string;
  status: string;
}

const querySchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
});

// ─── Router factory ───────────────────────────────────────────────────────────

export default function createRegulatoryWorkspaceRoutes(): Router {
  const router = Router();

  /**
   * GET /api/regulatory-workspace
   *
   * Optional query: ?projectId=<int>. When omitted, resolves the org's
   * most-recently-updated project that has tracked CTD sections.
   *
   * Response: { success: true, data: RegulatoryWorkspacePayload }
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const orgId = resolveOrgId(req);
      if (orgId === null) {
        return res.status(403).json({ success: false, error: 'Organization context required' });
      }

      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: parsed.error.issues,
        });
      }

      // ── Resolve the project whose section tree we render ──────────────────
      let projectId = parsed.data.projectId ?? null;
      if (projectId !== null) {
        // Authorize: the project must expose org-scoped section rows.
        const owned = await pool.query(
          `SELECT 1 FROM project_sections
            WHERE project_id = $1 AND organization_id = $2 LIMIT 1`,
          [projectId, orgId],
        );
        if (owned.rows.length === 0) projectId = null; // not visible in this org
      } else {
        const recent = await pool.query<{ project_id: number }>(
          `SELECT project_id
             FROM project_sections
            WHERE organization_id = $1
            GROUP BY project_id
            ORDER BY MAX(updated_at) DESC
            LIMIT 1`,
          [orgId],
        );
        projectId = recent.rows[0]?.project_id ?? null;
      }

      // No project with tracked sections in this org yet — honest empty shape.
      if (projectId === null) {
        const empty: RegulatoryWorkspacePayload = {
          projectId: null,
          projectName: null,
          tree: [],
          intel: [],
        };
        return res.json({ success: true, data: empty });
      }

      // ── Section tree (left pane) ──────────────────────────────────────────
      const sectionsResult = await pool.query<SectionRow>(
        `SELECT section_code, title, status
           FROM project_sections
          WHERE project_id = $1 AND organization_id = $2
          ORDER BY section_code ASC`,
        [projectId, orgId],
      );
      const sections = sectionsResult.rows;

      const tree: WorkspaceTreeItem[] = sections.map((s, i) => ({
        id: s.section_code,
        num: sectionNum(s.section_code),
        label: s.title,
        status: STATUS_TO_TREE[s.status] ?? 'draft',
        active: i === 0,
      }));

      // ── Readiness (real: completed / total) ───────────────────────────────
      const total = sections.length;
      const completed = sections.filter((s) => COMPLETE_STATUSES.has(s.status)).length;
      const readinessPct = total > 0 ? Math.round((completed / total) * 100) : 0;

      // ── Blockers (real: sections whose 'blocks' prerequisite is unfinished) ─
      let blockers = 0;
      try {
        const blk = await pool.query<{ blocked: number }>(
          `SELECT COUNT(DISTINCT sd.section_code)::int AS blocked
             FROM section_dependencies sd
             JOIN project_sections dep
               ON dep.project_id = sd.project_id
              AND dep.section_code = sd.depends_on_code
             JOIN project_sections blocked_sec
               ON blocked_sec.project_id = sd.project_id
              AND blocked_sec.section_code = sd.section_code
            WHERE sd.project_id = $1
              AND sd.organization_id = $2
              AND sd.dependency_type = 'blocks'
              AND dep.status NOT IN ('approved','signed','locked')
              AND blocked_sec.status NOT IN ('approved','signed','locked')`,
          [projectId, orgId],
        );
        blockers = blk.rows[0]?.blocked ?? 0;
      } catch (err) {
        if (!isUndefinedTable(err)) throw err;
      }

      // ── Open comments (real count) ────────────────────────────────────────
      // HONESTY: the fixture's "· N from AnA" sub-metric is omitted.
      // section_comments.author_id is always a real user FK; there is no
      // AI-authorship attribution column, so an AnA-vs-human split cannot be
      // sourced without fabricating it.
      let openComments: number | null = null;
      try {
        const oc = await pool.query<{ open: number }>(
          `SELECT COUNT(*)::int AS open
             FROM section_comments
            WHERE project_id = $1 AND organization_id = $2 AND NOT resolved`,
          [projectId, orgId],
        );
        openComments = oc.rows[0]?.open ?? 0;
      } catch (err) {
        if (!isUndefinedTable(err)) throw err;
      }

      // ── Linked evidence (real: governed artifacts bound to a CTD section) ──
      // HONESTY: the fixture's "N unlinked claims" sub-metric is omitted. The
      // platform links documents/artifacts to sections (concept2cure_artifacts
      // .ctd_section); it has no claim-level evidence-link table, so an
      // "unlinked claims" count cannot be sourced.
      let linkedDocs: number | null = null;
      let linkedSections = 0;
      try {
        const ev = await pool.query<{ linked: number; sections: number }>(
          `SELECT COUNT(*)::int AS linked,
                  COUNT(DISTINCT ctd_section)::int AS sections
             FROM concept2cure_artifacts
            WHERE project_id = $1 AND organization_id = $2 AND ctd_section IS NOT NULL`,
          [projectId, orgId],
        );
        linkedDocs = ev.rows[0]?.linked ?? 0;
        linkedSections = ev.rows[0]?.sections ?? 0;
      } catch (err) {
        if (!isUndefinedTable(err)) throw err;
      }

      // ── Assemble intel[] — only rows with a real value are included ───────
      const intel: WorkspaceIntelItem[] = [];
      intel.push({
        k: 'Readiness',
        v: blockers > 0
          ? `${readinessPct}% · ${plural(blockers, 'blocker')}`
          : `${readinessPct}% ready`,
      });
      if (openComments !== null) {
        intel.push({
          k: 'Open comments',
          v: openComments === 0 ? 'None open' : plural(openComments, 'open comment'),
        });
      }
      if (linkedDocs !== null) {
        intel.push({
          k: 'Linked evidence',
          v: linkedDocs === 0
            ? 'No linked documents'
            : `${plural(linkedDocs, 'document')} · ${plural(linkedSections, 'section')}`,
        });
      }

      // ── Optional project name (best-effort metadata; isolated so a lookup
      //    failure never 500s the payload). ──────────────────────────────────
      let projectName: string | null = null;
      try {
        const p = await pool.query<{ name: string }>(
          `SELECT name FROM projects WHERE id = $1 AND organization_id = $2 LIMIT 1`,
          [projectId, orgId],
        );
        projectName = p.rows[0]?.name ?? null;
      } catch (err) {
        logger.warn('project name lookup failed', {
          err: err instanceof Error ? err.message : String(err),
        });
      }

      const data: RegulatoryWorkspacePayload = { projectId, projectName, tree, intel };
      return res.json({ success: true, data });
    } catch (error) {
      logger.error('regulatory workspace error', {
        err: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ success: false, error: 'Failed to load regulatory workspace' });
    }
  });

  return router;
}

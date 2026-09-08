/**
 * Project Home Read-Model Routes
 *
 * A single aggregation read-model that populates the v2 ProjectHome surface
 * (client/src/concept2cure/v2/surfaces/ProjectHome.tsx — the `ProjH` shape)
 * from real, organization-scoped data instead of the PROJH codebase fixture.
 *
 * ── IDENTITY / SCOPE (read before wiring the client) ────────────────────────
 * This endpoint is keyed on the NUMERIC `projects.id`. That is the id-space in
 * which the rich half of the ProjectHome shape actually lives: the intelligence
 * layer (readiness, next-actions, profile, memory), project_tasks,
 * project_members, project_intelligence_profiles, concept2cure_conversations,
 * and documents are ALL keyed by numeric projects.id + numeric organization_id.
 *
 * The ProjectHome surface currently identifies the active project by the C2C
 * `regulatory_programs` UUID (via /api/c2c/projects -> window.C2C_PROJECT.id).
 * That is a SEPARATE, thinner store with no readiness/tasks/intelligence
 * backing. No verified UUID->numeric bridge column was found, so this route does
 * NOT fabricate that join — the client must resolve the numeric projects.id.
 * Fields that live only on `regulatory_programs` (productName/productType/
 * submissionType/region/indication) are returned as documented nulls.
 *
 * Honesty rule (regulated product): every field below is projected from a
 * verified column or a verified service return. Anything not sourceable is
 * omitted or returned as null and listed in `meta.unsourced` — no fabricated
 * confidence scores, schedule narratives, e-signature states, or CTD phases.
 *
 * Delegates computed intelligence to the intelligence services; performs
 * direct, explicit-column, org-scoped reads for stored rows. Fails closed on a
 * missing table (Postgres 42P01) rather than 500-ing the whole surface.
 *
 * @module server/routes/project-home-routes
 */

import { Router, type Request, type Response } from 'express';

import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger.js';
import { getTenantContext } from '../utils/tenantContext.js';
import {
  computeReadinessScore,
  generateNextActions,
  getProjectIntelligence,
} from '../services/intelligence/index.js';

const logger = createScopedLogger('project-home-routes');

// ── Helpers ─────────────────────────────────────────────────────────────────

const HIERARCHY_KIND = ['Program', 'Project', 'Study', 'Sub-project'] as const;

/** True for a Postgres "undefined table" error (store not provisioned). */
function isMissingTable(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '42P01';
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toDateOnly(value: unknown): string | null {
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : null;
}

function relTime(value: unknown): string | null {
  const iso = toIso(value);
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'module';
}

/**
 * A single tenant-scoped read. A MISSING TABLE degrades gracefully to [] (and is
 * recorded in `pending` so the caller can report the store as unprovisioned).
 * Any OTHER error is a real read failure and is rethrown so the aggregation fails
 * closed (→ the handler's 500) — returning [] there would report "0 rows" as a
 * genuine empty (0 tasks, no blockers) built from a read that failed.
 */
async function safeRows(
  label: string,
  text: string,
  params: unknown[],
  pending: Set<string>,
): Promise<any[]> {
  try {
    const { rows } = await pool.query(text, params as any[]);
    return rows;
  } catch (err) {
    if (isMissingTable(err)) {
      pending.add(label);
      return [];
    }
    logger.error(`${label} read failed`, { err: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

// ── Router Factory ────────────────────────────────────────────────────────────

export default function createProjectHomeRoutes(): Router {
  const router = Router();

  /**
   * GET /api/project-home/:projectId
   * Aggregated ProjectHome read-model for one numeric project, org-scoped.
   */
  router.get('/:projectId', async (req: Request, res: Response) => {
    const tenant = getTenantContext(req);
    if ('error' in tenant) {
      return res.status(400).json({ success: false, error: tenant.error });
    }
    const { organizationId } = tenant;

    const projectId = parseInt(String(req.params.projectId), 10);
    if (Number.isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'Invalid project ID' });
    }

    // ── Project existence + core metadata (fail-closed on missing store) ──
    let projectRow: any;
    try {
      const { rows } = await pool.query(
        `SELECT p.id, p.name, p.code, p.description, p.status, p.priority, p.type,
                p.progress, p.risk_level, p.therapeutic_area, p.retrieval_mode,
                p.knowledge_token_estimate, p.target_end_date, p.depth, p.path,
                COALESCE(u.name, u.email) AS lead_name
           FROM projects p
           LEFT JOIN users u ON u.id = p.owner_id
          WHERE p.id = $1 AND p.organization_id = $2
          LIMIT 1`,
        [projectId, organizationId],
      );
      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'PROJECT_NOT_FOUND' });
      }
      projectRow = rows[0];
    } catch (err) {
      if (isMissingTable(err)) {
        return res.status(503).json({ success: false, error: 'PROJECT_STORE_UNAVAILABLE' });
      }
      logger.error('project fetch failed', { err: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ success: false, error: 'Failed to load project' });
    }

    try {
      const pending = new Set<string>();

      // Ancestor ids from the materialized path ("1/5/12" includes self).
      const path = (projectRow.path as string | null) ?? null;
      const ancestorIds = path
        ? path.split('/').map(x => parseInt(x, 10)).filter(n => Number.isFinite(n))
        : [];

      // Computed intelligence (services own their own db access; degrade to null).
      const svcCtx = { organizationId, projectId, triggeredBy: 'project_home' };

      const [servicesSettled, raw] = await Promise.all([
        Promise.allSettled([
          computeReadinessScore(svcCtx),
          generateNextActions(svcCtx, 8),
          getProjectIntelligence(projectId, organizationId),
        ]),
        Promise.all([
          safeRows(
            'project_tasks',
            `SELECT t.id, t.name, t.status, t.priority, t.module_type, t.due_date,
                    t.critical_to_quality, t.depends_on, t.blocked_reason, t.updated_at,
                    COALESCE(a.name, a.email) AS assignee_name
               FROM project_tasks t
               LEFT JOIN users a ON a.id = t.assignee_id
              WHERE t.project_id = $1 AND t.organization_id = $2
              ORDER BY t.updated_at DESC
              LIMIT 200`,
            [projectId, organizationId],
            pending,
          ),
          safeRows(
            'project_tasks',
            `SELECT COUNT(*)::int AS n FROM project_tasks WHERE organization_id = $1`,
            [organizationId],
            pending,
          ),
          safeRows(
            'documents',
            `SELECT d.id, d.title, d.document_type, d.category, d.module, d.status,
                    d.version, d.updated_at, COALESCE(o.name, o.email) AS owner_name
               FROM documents d
               LEFT JOIN users o ON o.id = d.owner_id
              WHERE d.project_id = $1 AND d.organization_id = $2
              ORDER BY d.updated_at DESC
              LIMIT 50`,
            [projectId, organizationId],
            pending,
          ),
          safeRows(
            'concept2cure_conversations',
            `SELECT title, message_count, updated_at
               FROM concept2cure_conversations
              WHERE project_id = $1 AND organization_id = $2 AND status = 'active'
              ORDER BY updated_at DESC
              LIMIT 20`,
            [projectId, organizationId],
            pending,
          ),
          safeRows(
            'project_members',
            `SELECT pm.role, COALESCE(u.name, u.email) AS name
               FROM project_members pm
               JOIN users u ON u.id = pm.user_id
              WHERE pm.project_id = $1 AND pm.organization_id = $2 AND pm.status = 'active'
              ORDER BY pm.created_at ASC`,
            [projectId, organizationId],
            pending,
          ),
          safeRows(
            'project_visibility_settings',
            `SELECT visibility FROM project_visibility_settings
              WHERE project_id = $1 AND organization_id = $2 LIMIT 1`,
            [projectId, organizationId],
            pending,
          ),
          ancestorIds.length
            ? safeRows(
                'projects',
                `SELECT id, name, depth FROM projects
                  WHERE id = ANY($1::int[]) AND organization_id = $2
                  ORDER BY depth ASC`,
                [ancestorIds, organizationId],
                pending,
              )
            : Promise.resolve([] as any[]),
          safeRows(
            'project_intelligence_profiles',
            `SELECT custom_instructions, submission_timeline
               FROM project_intelligence_profiles
              WHERE project_id = $1 AND organization_id = $2 LIMIT 1`,
            [projectId, organizationId],
            pending,
          ),
          safeRows(
            'audit_events',
            `SELECT event_type, user_name, timestamp
               FROM audit_events
              WHERE organization_id = $2 AND entity_type = 'project' AND entity_id = $1
              ORDER BY timestamp DESC
              LIMIT 8`,
            [projectId, organizationId],
            pending,
          ),
        ]),
      ]);

      const readiness = servicesSettled[0].status === 'fulfilled' ? servicesSettled[0].value : null;
      const nextActions = servicesSettled[1].status === 'fulfilled' ? servicesSettled[1].value : null;
      const intel = servicesSettled[2].status === 'fulfilled' ? servicesSettled[2].value : null;

      const [
        taskRows, boardRows, docRows, convRows, teamRows,
        visRows, ancestorRows, profileExtraRows, activityRows,
      ] = raw;

      // ── program + breadcrumb hierarchy ──────────────────────────────────
      const hierarchy = ancestorRows.length > 0
        ? ancestorRows.map((a: any) => ({
            depth: Number(a.depth ?? 0),
            label: a.name,
            kind: HIERARCHY_KIND[Number(a.depth ?? 0)] ?? 'Node',
          }))
        : [{
            depth: Number(projectRow.depth ?? 0),
            label: projectRow.name,
            kind: HIERARCHY_KIND[Number(projectRow.depth ?? 0)] ?? 'Node',
          }];

      const program = {
        id: String(projectRow.id),
        title: projectRow.name,
        code: projectRow.code ?? null,
        status: projectRow.status,
        priority: projectRow.priority,
        type: projectRow.type,
        riskLevel: projectRow.risk_level ?? null,
        completion: Number(projectRow.progress ?? 0),
        ta: projectRow.therapeutic_area ?? null,
        retrievalMode: projectRow.retrieval_mode ?? null,
        knowledgeTokens: Number(projectRow.knowledge_token_estimate ?? 0),
        lead: projectRow.lead_name ?? null,
        due: toDateOnly(projectRow.target_end_date),
        desc: projectRow.description ?? null,
        hierarchy,
        // Only present on the C2C regulatory_programs (UUID) record, which this
        // numeric-projects read-model does not join — nulled, not fabricated.
        productName: null,
        productType: null,
        submissionType: null,
        region: null,
        indication: null,
      };

      // ── readiness (real dimensions + gaps; NOT the UI 3-bucket taxonomy) ─
      const gaps = readiness?.gaps ?? [];
      const criticalCount = gaps.filter(g => g.severity === 'critical').length;
      const blockerGaps = gaps.filter(g => g.severity === 'critical' || g.severity === 'high');
      const overallScore = readiness?.overallScore ?? null;
      const isReady = overallScore != null ? (criticalCount === 0 && overallScore >= 75) : null;

      const readinessOut = readiness
        ? {
            score: readiness.overallScore,
            isReady,
            blockerCount: criticalCount,
            dimensions: readiness.dimensions,
            trend: readiness.trend,
            predictions: readiness.predictions,
            findings: gaps.map(g => ({
              rule: g.description,
              kind: g.module,
              severity: g.severity,
              status: (g.severity === 'critical' || g.severity === 'high') ? 'fail' : 'warn',
              remediation: g.remediation,
            })),
          }
        : null;

      let readinessStatus: string | null = null;
      if (overallScore != null) {
        readinessStatus = isReady
          ? `Ready — readiness score ${overallScore}`
          : `At risk — ${criticalCount} critical gap${criticalCount === 1 ? '' : 's'} (score ${overallScore})`;
      }

      const intelligence = {
        readinessStatus,
        currentBlockers: blockerGaps.map(g => g.description),
        importantDecisions: (intel?.keyDecisions ?? []).map(d => d.decision),
        unresolvedRisks: (intel?.riskFactors ?? []).map(r => r.risk),
        nextRecommendedActions: (nextActions?.actions ?? []).map(a => a.title),
      };

      // ── memory / instructions (from the intelligence profile) ────────────
      const memory = {
        visibility: (visRows[0]?.visibility as string | undefined) ?? null,
        updated: intel?.lastEnrichedAt ?? null,
        body: intel?.regulatoryStrategy ?? null,
      };
      const instructions = {
        updated: intel?.lastEnrichedAt ?? null,
        body: (profileExtraRows[0]?.custom_instructions as string | undefined) ?? null,
      };

      // ── schedule (real milestones from the profile; no AI narrative) ─────
      const timeline = profileExtraRows[0]?.submission_timeline;
      const goals = Array.isArray(timeline)
        ? timeline
            .map((g: any) => ({
              t: g.milestone ?? g.name ?? g.t ?? null,
              when: g.targetDate ?? g.target_date ?? g.when ?? null,
              status: g.status ?? null,
            }))
            .filter((g: any) => g.t)
        : [];
      const schedule = {
        goals,
        generatedByAna: false, // no AI schedule-engine output is persisted for projects
        confidence: null,      // would be fabricated
        basis: null,           // would be fabricated
        updated: null,
      };

      // ── tasks (project_tasks) ────────────────────────────────────────────
      const tasks = taskRows.map((t: any) => ({
        id: String(t.id),
        name: t.name,
        status: t.status,
        priority: t.priority,
        module: t.module_type ?? null,
        assignee: t.assignee_name ?? null,
        due: toDateOnly(t.due_date),
        ctq: Boolean(t.critical_to_quality),
        dependsOn: Array.isArray(t.depends_on) ? t.depends_on : [],
        blockedReason: t.blocked_reason ?? null,
        // `critical` (critical-path flag) and `phase` (CTD pyramid phase) are
        // NOT stored on project_tasks — omitted rather than derived-and-faked.
      }));

      const board = { orgTotal: Number(boardRows[0]?.n ?? 0), byStatus: null };

      // ── linkedModules: real per-module completion rollup over tasks ──────
      const modAgg = new Map<string, { total: number; done: number; blocked: number }>();
      for (const t of taskRows) {
        const key = (t.module_type as string) || 'Unassigned';
        const e = modAgg.get(key) ?? { total: 0, done: 0, blocked: 0 };
        e.total += 1;
        if (t.status === 'done') e.done += 1;
        if (t.status === 'blocked') e.blocked += 1;
        modAgg.set(key, e);
      }
      const linkedModules = [...modAgg.entries()].map(([label, e]) => ({
        m: slug(label),
        t: label,
        done: e.total ? Math.round((e.done / e.total) * 100) : 0,
        risk: e.blocked > 0,
      }));

      // ── files (documents) ────────────────────────────────────────────────
      const files = docRows.map((d: any) => ({
        name: d.title,
        type: (d.document_type as string | null) ?? 'doc',
        module: d.module ?? null,
        section: null, // documents carries no CTD-section granularity
        dtype: d.category ?? null,
        status: d.status,
        conf: null,    // no extraction-confidence score is persisted on documents
        version: d.version ?? null,
        updated: relTime(d.updated_at),
        author: d.owner_name ?? null,
      }));

      // ── conversations / team / activity ──────────────────────────────────
      const conversations = convRows.map((c: any) => ({
        t: c.title,
        when: relTime(c.updated_at),
        n: Number(c.message_count ?? 0),
      }));

      const team = teamRows.map((m: any) => ({
        role: m.role,
        name: m.name,
        sig: null, // project_members carries no e-signature state
      }));

      const activity = activityRows.map((a: any) => ({
        who: a.user_name ?? 'system',
        what: String(a.event_type ?? '').replace(/_/g, ' '),
        when: relTime(a.timestamp),
      }));

      return res.json({
        success: true,
        data: {
          program,
          intelligence,
          memory,
          instructions,
          readiness: readinessOut,
          schedule,
          tasks,
          board,
          linkedModules,
          files,
          conversations,
          team,
          activity,
        },
        meta: {
          projectId,
          generatedAt: new Date().toISOString(),
          intelligenceAvailable: {
            readiness: readiness != null,
            nextActions: nextActions != null,
            profile: intel != null,
          },
          pendingStores: [...pending],
          // Display fields deliberately omitted or nulled (no real source):
          unsourced: [
            'program.productName', 'program.productType', 'program.submissionType',
            'program.region', 'program.indication',
            'readiness.rulesBased|validation|aiInferred (engine emits gaps by module/severity, not this 3-bucket provenance split)',
            'schedule.confidence', 'schedule.basis', 'schedule.generatedByAna',
            'tasks[].critical', 'tasks[].phase',
            'files[].conf', 'files[].section',
            'team[].sig',
            'pyramid (7-phase CTD pyramid — no phase taxonomy stored)',
            'capacity (context-window % — no persisted source)',
          ],
        },
      });
    } catch (err) {
      logger.error('project-home aggregation failed', {
        projectId,
        err: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ success: false, error: 'Failed to build project home read-model' });
    }
  });

  return router;
}

/**
 * Client Review Room read-model (work order MDX-CLIENT-01) — a read-first,
 * client-scoped view over the canonical `unified_tasks` store.
 *
 *   GET /api/mdx/client-review?programId=<uuid>&project_id=<int>
 *     → { data: { groups, counts, total }, meta: { scope, projectId, programId } }
 *
 * ## Visibility contract (the point of this endpoint)
 *
 * Only rows whose `client_visibility` is one of CLIENT_REVIEW_STATES
 * (client_action_required | client_visible | authority_ready — see
 * shared/client-visibility.ts) are ever selected. `internal` rows — and rows
 * never classified (NULL) — are excluded by the SQL `IN (...)` whitelist in
 * the WHERE clause, not by post-processing, so internal strategy is
 * structurally unable to reach a client-facing payload. The row projection
 * is likewise curated: internal-only fields (approval chains, escalation
 * paths, AI suggestions, module data, comment threads) are not selected.
 *
 * ## Scope honesty
 *
 * `unified_tasks` links `projects.id` (integer) and carries no program uuid
 * column — the canonical program space (regulatory_programs.id) is a
 * different id space. `programId` is therefore validated and echoed back in
 * `meta` for kit-surface parity, but the row filter is organization-wide,
 * optionally narrowed by `project_id`. `meta.scope` reports which applied
 * ('project' | 'organization') so the surface can label the zone honestly —
 * same convention as the engineering board's per-panel scopes.
 *
 * RLS (CI gate ci:requestdb-coverage): reads run through requestDb(req)
 * (request-scoped, tenant-pinned connection) and additionally filter
 * organization_id explicitly as defense in depth for the window before
 * RLS_ENFORCE is on. Fails closed to an empty room when the table is
 * unprovisioned (42P01) rather than 500-ing.
 *
 * READ-ONLY by design: classification writes (setting a task's visibility)
 * and client commenting are explicitly out of scope for this slice.
 *
 * @module routes/mdx-client-review
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { createScopedLogger } from '../utils/logger';
import { requestDb } from '../db/requestDb';
import { ok, clientError, orgRequired, serverError } from '../lib/api-response';
import { unifiedTasks } from '../../shared/schema';
import {
  CLIENT_REVIEW_STATES,
  countClientReviewGroups,
  emptyClientReviewGroups,
  groupByClientReviewState,
} from '../../shared/client-visibility';

const router = Router();
const log = createScopedLogger('mdx-client-review');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres "relation does not exist" — fail closed to an empty room. */
function isMissingTable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === '42P01'
  );
}

const listQuery = z.object({
  programId: z.string().regex(UUID_RE, 'programId must be a UUID').optional(),
  project_id: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().positive())
    .optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(500))
    .optional(),
});

/* ─── GET /api/mdx/client-review ──────────────────────────────────── */

router.get('/client-review', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);

  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  }
  const { programId, project_id: projectId, limit = 500 } = parsed.data;

  const scope: 'project' | 'organization' =
    projectId !== undefined ? 'project' : 'organization';

  // The whitelist filter: internal / NULL / unknown values never match.
  const conditions = [
    eq(unifiedTasks.organizationId, orgId),
    inArray(unifiedTasks.clientVisibility, [...CLIENT_REVIEW_STATES]),
  ];
  if (projectId !== undefined) conditions.push(eq(unifiedTasks.projectId, projectId));

  try {
    const db = requestDb(req);
    const rows = await db
      .select({
        // Curated client-safe projection — internal-only columns
        // (approvers, escalation_path, ai_suggestions, module_data,
        // comments, assignee ids) are deliberately not selected.
        taskId: unifiedTasks.taskId,
        title: unifiedTasks.title,
        description: unifiedTasks.description,
        status: unifiedTasks.status,
        priority: unifiedTasks.priority,
        progress: unifiedTasks.progress,
        taskType: unifiedTasks.taskType,
        moduleType: unifiedTasks.moduleType,
        projectId: unifiedTasks.projectId,
        lifecyclePhase: unifiedTasks.lifecyclePhase,
        market: unifiedTasks.market,
        filingType: unifiedTasks.filingType,
        clientVisibility: unifiedTasks.clientVisibility,
        dueDate: unifiedTasks.dueDate,
        completedAt: unifiedTasks.completedAt,
        updatedAt: unifiedTasks.updatedAt,
      })
      .from(unifiedTasks)
      .where(and(...conditions))
      .orderBy(asc(unifiedTasks.dueDate))
      .limit(limit);

    const groups = groupByClientReviewState(rows, (row) => row.clientVisibility);
    const { counts, total } = countClientReviewGroups(groups);

    return ok(res, { groups, counts, total }, {
      scope,
      projectId: projectId ?? null,
      programId: programId ?? null,
    });
  } catch (err) {
    if (isMissingTable(err)) {
      log.error('client-review: unified_tasks unprovisioned — returning empty room', {
        err: err instanceof Error ? err.message : String(err),
      });
      const groups = emptyClientReviewGroups<never>();
      const { counts, total } = countClientReviewGroups(groups);
      return ok(res, { groups, counts, total }, {
        scope,
        projectId: projectId ?? null,
        programId: programId ?? null,
      });
    }
    return serverError(res, log, 'client-review list', err);
  }
});

export default router;

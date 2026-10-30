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
 * ## The project is admitted first (P-61 item 5, 2026-10-29)
 *
 * `unified_tasks` links `projects.id` (integer) and carries no program uuid
 * column; a project's program is `projects.regulatory_program_id`. Until
 * 2026-10-29 `programId` was validated and echoed back in `meta` while the row
 * filter stayed organization-wide, and `project_id` was trusted as given, so a
 * room that named one project shared every project's tasks. Now, before
 * anything is read or shared:
 *   - a `programId` goes through admitProject (server/lib/admit-project.ts):
 *     404 when the organization does not own the live project, 503 when the
 *     check cannot run;
 *   - a `project_id` must be one of the organization's projects and, with a
 *     `programId`, that program's: 404 otherwise, 503 when the check cannot run.
 * The room then holds that project's tasks only: the integer project's, or
 * those of every integer project anchored to the program. `meta.scope` is
 * 'project'. With neither, the room is the organization's, as before, and
 * `meta.scope` says 'organization'. Pinned by
 * __tests__/mdx-client-review-admits-project.test.ts.
 *
 * RLS (CI gate ci:requestdb-coverage): reads run through requestDb(req)
 * (request-scoped, tenant-pinned connection) and additionally filter
 * organization_id explicitly as defense in depth for the window before
 * RLS_ENFORCE is on. Fails closed to an empty room when the table is
 * unprovisioned (42P01) rather than 500-ing.
 *
 * READ-ONLY by design: classification writes (setting a task's visibility)
 * and client commenting are explicitly out of scope for this slice. There is
 * no write here, so no requireEditorAccess either.
 *
 * @module routes/mdx-client-review
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { and, asc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';

import { createScopedLogger } from '../utils/logger';
import { requestDb } from '../db/requestDb';
import { ok, clientError, orgRequired, serverError, notFoundInTenant } from '../lib/api-response';
import { admitProject } from '../lib/admit-project';
import { respondVerificationUnavailable } from '../lib/verification-outcome';
import { readProgramAnchorRow } from '../services/c2c/program-project-anchor';
import { projects, unifiedTasks } from '../../shared/schema';
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

type RoomDb = ReturnType<typeof requestDb>;

/**
 * Admit the project the request names and return the room's project filter
 * (P-61 item 5): undefined for the organization's room, null once a refusal has
 * been answered. A program goes through admitProject; an integer project must
 * be the organization's and, with a program, that program's.
 */
async function admitRoom(
  res: Response,
  db: RoomDb,
  orgId: number,
  programId: string | undefined,
  projectId: number | undefined,
): Promise<SQL | undefined | null> {
  if (!(await admitProject(res, log, programId, orgId))) return null;
  if (projectId === undefined) {
    if (programId === undefined) return undefined;
    // The program's project, read through the one anchor reader (program-project-anchor.ts): a
    // program has one projects row, and a second reader here could disagree with it about which.
    // No anchor is an empty room, never the organization's.
    let anchor: { id: number } | null;
    try {
      anchor = await readProgramAnchorRow(db, { programId, orgId, context: 'mdx-client-review' });
    } catch (err) {
      respondVerificationUnavailable(res, log, 'The project anchor check', err);
      return null;
    }
    return anchor ? eq(unifiedTasks.projectId, anchor.id) : sql`false`;
  }
  let owned: Array<{ programId: string | null }>;
  try {
    owned = await db
      .select({ programId: projects.regulatoryProgramId })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)))
      .limit(1);
  } catch (err) {
    respondVerificationUnavailable(res, log, 'The project ownership check', err);
    return null;
  }
  const anchored = owned[0]?.programId?.toLowerCase() ?? null;
  if (owned.length === 0 || (programId !== undefined && anchored !== programId.toLowerCase())) {
    notFoundInTenant(res, 'Project');
    return null;
  }
  return eq(unifiedTasks.projectId, projectId);
}

/* ─── GET /api/mdx/client-review ──────────────────────────────────── */

router.get('/client-review', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);

  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  }
  const { programId, project_id: projectId, limit = 500 } = parsed.data;

  // The project is admitted before anything is read (P-61 item 5).
  const db = requestDb(req);
  const projectFilter = await admitRoom(res, db, orgId, programId, projectId);
  if (projectFilter === null) return;
  const scope: 'project' | 'organization' = projectFilter ? 'project' : 'organization';

  // The whitelist filter: internal / NULL / unknown values never match.
  const conditions = [
    eq(unifiedTasks.organizationId, orgId),
    inArray(unifiedTasks.clientVisibility, [...CLIENT_REVIEW_STATES]),
    // Archived (soft-deleted) work is invisible to every internal read model;
    // this customer-facing room must not be the one place it survives. Without
    // this filter a task archived on the board kept appearing to the client.
    isNull(unifiedTasks.deletedAt),
  ];
  if (projectFilter) conditions.push(projectFilter);

  try {
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

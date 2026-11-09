/**
 * The project a new task belongs to, read from the record the task is raised on.
 *
 * ── The defect (QA 2026-10-08, second walk, j1) ──────────────────────────────
 * Assign review creates the reviewer's task (POST /api/tasks/tasks) with
 * sourceEntityType 'authoring_document' and the document id — and no
 * projectId: the editor holds the program's UUID, and unified_tasks.project_id
 * is the integer projects.id. The task was stored with project_id NULL, and the
 * program's Review tab — which reads work by project (loadUnifiedWork) — said
 * "No tasks or approvals on this program" while a review was assigned on it.
 *
 * The project is taken from the DOCUMENT, not from the client: the document's
 * own program (authoring_documents.client_program_id), in the caller's
 * organisation, to that program's project record (the one anchor reader,
 * readProgramAnchorRow: the lowest-id row, org-scoped). The `programId` the
 * dialog puts in moduleData is the client's copy of the same fact and is not
 * read. migrations/20261008d_unified_tasks_authoring_review_project.sql gives
 * the tasks created before this the same answer by the same rule.
 *
 * Answers null when the source is not an authoring document, the document is
 * not this organisation's, it has no program, or the program has no project
 * record. Throws when the read cannot complete; the caller refuses the create
 * rather than writing a task whose project it could not tell.
 *
 * @module server/services/tasking/task-project
 */

import { sql } from 'drizzle-orm';
import type { RequestDb, RequestSqlClient } from '../../db/requestDb';
import { readProgramAnchorRow } from '../c2c/program-project-anchor';
import { ProgramReadAccessError, readCurrentProgramActor } from '../c2c/current-program-access';
import { canAccessReportProject, getAccessibleReportProjectIds } from '../report-os/project-access';
import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The source kind whose project this module can tell. */
export const AUTHORING_DOCUMENT_SOURCE = 'authoring_document';

/**
 * A Vault version's lifecycle record (canonical_documents), the subject of a
 * review route (RR1a): its project is the one its program anchors
 * (canonical_documents.project_id holds the regulatory program's id).
 */
export const CANONICAL_DOCUMENT_SOURCE = 'canonical_document';

/** The source kinds whose project this module can tell. */
export const PROJECT_TELLING_SOURCES: readonly string[] = [AUTHORING_DOCUMENT_SOURCE, CANONICAL_DOCUMENT_SOURCE];

/** Known admission refusals describe the existing task writer, not its database. */
export class TaskProjectAdmissionError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 503, readonly code: string, message: string) {
    super(message);
    this.name = 'TaskProjectAdmissionError';
  }
}

const projectDenied = () => new TaskProjectAdmissionError(403, 'TASK_PROJECT_ACCESS_DENIED',
  'Your current project permissions do not allow these tasks. Nothing was created.');
const projectUnavailable = () => new TaskProjectAdmissionError(503, 'TASK_PROJECT_ACCESS_UNAVAILABLE',
  'Current project access could not be verified. Nothing was created. Try again.');
const validProjectId = (value: unknown): value is number => typeof value === 'number'
  && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;

/** An explicit project never falls back to unfiled or organization-wide work. */
export function requireTaskProjectId(value: unknown): number {
  if (!validProjectId(value)) throw new TaskProjectAdmissionError(400, 'TASK_PROJECT_INVALID',
    'Choose a valid project before creating these tasks. Nothing was created.');
  return value;
}

function actualTaskWorkspace(row: Record<string, unknown>, projectId: number): number | null {
  if (row.id !== projectId || typeof row.status !== 'string' || !row.status.trim()
    || row.client_workspace_id !== null && !validProjectId(row.client_workspace_id)) throw projectUnavailable();
  if (['archived', 'deleted'].includes(row.status)) throw new TaskProjectAdmissionError(409, 'TASK_PROJECT_CLOSED',
    'New tasks cannot be created in an archived or deleted project. Nothing was created.');
  return row.client_workspace_id as number | null;
}

/** Retain the selected workspace after actor admission. Project-bound callers
 * pass the parent's actual workspace; unfiled intake may select an owned one. */
export async function retainTaskWorkspace(q: RequestSqlClient, organizationId: number, workspaceId: number | null,
  claimed: unknown): Promise<void> {
  try {
    if (workspaceId !== null && !validProjectId(workspaceId)) throw projectDenied();
    if (claimed != null) {
      const numeric = typeof claimed === 'string' && /^\d+$/.test(claimed) ? Number(claimed) : claimed;
      if (!validProjectId(numeric) || numeric !== workspaceId) throw projectDenied();
    }
    if (workspaceId === null) return;
    const owned = await q.query(`SELECT id FROM client_workspaces
      WHERE id=$1 AND organization_id=$2 FOR SHARE`, [workspaceId, organizationId]);
    if (owned.rows.length !== 1 || owned.rows[0].id !== workspaceId) throw projectDenied();
  } catch (error) {
    if (error instanceof TaskProjectAdmissionError) throw error;
    throw projectUnavailable();
  }
}

/** Unfiled work still requires current active write membership, retained on the
 * writer's own transaction just like the actor of project-bound work. */
export async function admitTaskCreationActor(q: RequestSqlClient, input: {
  organizationId: number; actorUserId: number;
}) {
  try {
    const actor = await readCurrentProgramActor(q, { organizationId: input.organizationId,
      userId: input.actorUserId, forShare: true });
    if (!GOVERNED_WRITE_ROLES.has(actor.role)) throw projectDenied();
    return actor;
  } catch (error) {
    if (error instanceof TaskProjectAdmissionError) throw error;
    if (error instanceof ProgramReadAccessError && error.status === 403) throw projectDenied();
    throw projectUnavailable();
  }
}

/** A work project's tasks (P-111; the coordinating session's ruling (b), 2026-11-09): the exact project's own access
 * decides first, exactly as canAccessReportProject decides it, so nothing is looser than before. Beyond it, one clause
 * only: a writer on the work project's filing project (its root) may read and add its tasks, unless the work project
 * has its own private visibility setting. One direction: a work project's members gain nothing on its parent or its
 * siblings, and the walk never leaves the organisation. */
export async function canWorkOnProjectTasks(q: RequestSqlClient, organizationId: number,
  actor: { userId: number; role: string | null | undefined }, projectId: number, options: { forWrite?: boolean } = {}): Promise<boolean> {
  /* Exactly today's call, arguments included, so the exact-row decision is unchanged. */
  const exact = options.forWrite === true
    ? await canAccessReportProject(organizationId, actor, projectId, q, { forWrite: true })
    : await canAccessReportProject(organizationId, actor, projectId, q);
  if (exact) return true;
  const { rows } = await q.query(`WITH RECURSIVE up AS (
        SELECT id, parent_project_id, 0 AS hops FROM projects WHERE id = $1 AND organization_id = $2
        UNION ALL
        SELECT p.id, p.parent_project_id, up.hops + 1 FROM projects p
          JOIN up ON p.id = up.parent_project_id AND p.organization_id = $2 WHERE up.hops < 8)
      SELECT (SELECT id FROM up WHERE parent_project_id IS NULL) AS root,
        EXISTS(SELECT 1 FROM project_visibility_settings v
          WHERE v.project_id = $1 AND v.organization_id = $2 AND v.visibility = 'private') AS private_child`,
  [projectId, organizationId]);
  const root = Number(rows[0]?.root);
  if (!Number.isSafeInteger(root) || root <= 0 || root === projectId || rows[0]?.private_child === true) return false;
  return canAccessReportProject(organizationId, actor, root, q, { forWrite: true });
}

/** The work projects under a filing project whose tasks this reader may read, decided for all of them at once and by
 * the same rule as canWorkOnProjectTasks (read): the work project's own access, or a writer on the filing project
 * where the work project is not private. A project with a parent is not a filing project, so it rolls nothing up.
 * Three reads, whatever the number of work projects: the descendants with their private flag, the reader's readable
 * projects, and the reader's write access on the filing project. */
export async function workProjectsReadableBy(q: RequestSqlClient, organizationId: number,
  actor: { userId: number; role: string | null | undefined }, filingProjectId: number): Promise<Array<{ id: number; name: string }>> {
  const { rows } = await q.query(`WITH RECURSIVE down AS (
        SELECT c.id, c.name, 1 AS hops FROM projects c
          JOIN projects f ON f.id = c.parent_project_id AND f.organization_id = c.organization_id
         WHERE f.id = $1 AND f.organization_id = $2 AND f.parent_project_id IS NULL
        UNION ALL
        SELECT c.id, c.name, down.hops + 1 FROM projects c
          JOIN down ON c.parent_project_id = down.id WHERE c.organization_id = $2 AND down.hops < 8)
      SELECT down.id, down.name, EXISTS(SELECT 1 FROM project_visibility_settings v
          WHERE v.project_id = down.id AND v.organization_id = $2 AND v.visibility = 'private') AS private_child
        FROM down ORDER BY down.id`, [filingProjectId, organizationId]);
  if (!rows.length) return [];
  const readable = new Set(await getAccessibleReportProjectIds(organizationId, actor, q));
  const parentWriter = await canAccessReportProject(organizationId, actor, filingProjectId, q, { forWrite: true });
  return (rows as Array<Record<string, unknown>>)
    .filter((r) => readable.has(Number(r.id)) || (parentWriter && r.private_child !== true))
    .map((r) => ({ id: Number(r.id), name: String(r.name) }));
}

/** Extend the existing task/project boundary on the writer's own transaction.
 * Locks retain the current actor, parent, visibility and edit membership through
 * the task/edge/audit commit; a read/review share never becomes write authority. */
export async function admitTaskCreationProject(q: RequestSqlClient, input: {
  organizationId: number; actorUserId: number; projectId: number; clientWorkspaceId?: unknown;
}): Promise<{ projectId: number; clientWorkspaceId: number | null }> {
  const projectId = requireTaskProjectId(input.projectId);
  try {
    const actor = await admitTaskCreationActor(q, input);
    const { rows } = await q.query(`SELECT id,client_workspace_id,status FROM projects
      WHERE id=$1 AND organization_id=$2 FOR SHARE`, [projectId, input.organizationId]);
    if (!rows.length) throw new TaskProjectAdmissionError(404, 'TASK_PROJECT_NOT_FOUND',
      'Project not found for this organization. Nothing was created.');
    if (rows.length !== 1) throw projectUnavailable();
    const clientWorkspaceId = actualTaskWorkspace(rows[0], projectId);
    await retainTaskWorkspace(q, input.organizationId, clientWorkspaceId, input.clientWorkspaceId);
    await q.query(`SELECT project_id FROM project_visibility_settings
      WHERE project_id=$1 AND organization_id=$2 FOR SHARE`, [projectId, input.organizationId]);
    if (!await canWorkOnProjectTasks(q, input.organizationId, actor, projectId, { forWrite: true })) throw projectDenied();
    return { projectId, clientWorkspaceId };
  } catch (error) {
    if (error instanceof TaskProjectAdmissionError) throw error;
    if (error instanceof ProgramReadAccessError && error.status === 403) throw projectDenied();
    throw projectUnavailable();
  }
}

/** The project a Vault version's lifecycle record anchors to, or null. */
async function canonicalDocumentProject(db: RequestDb, orgId: number, sourceEntityId: string | null | undefined): Promise<number | null> {
  const canonicalId = String(sourceEntityId ?? '').trim();
  if (!UUID.test(canonicalId)) return null;
  const result = await db.execute(sql`
    SELECT project_id FROM canonical_documents
     WHERE canonical_id = ${canonicalId} AND organization_id = ${orgId}
     LIMIT 1`);
  const programId = ((result as unknown as { rows?: Array<{ project_id: string | null }> }).rows ?? [])[0]?.project_id ?? null;
  if (!programId || !UUID.test(programId)) return null;
  const anchor = await readProgramAnchorRow(db, { programId, orgId, context: 'task-source-project' });
  return anchor?.id ?? null;
}

export async function projectForTaskSource(
  /** The request's RLS client — requestDb(req), never the shared pool. */
  db: RequestDb,
  params: { orgId: number; sourceEntityType?: string | null; sourceEntityId?: string | null },
): Promise<number | null> {
  if (params.sourceEntityType === CANONICAL_DOCUMENT_SOURCE) return canonicalDocumentProject(db, params.orgId, params.sourceEntityId);
  if (params.sourceEntityType !== AUTHORING_DOCUMENT_SOURCE) return null;
  const docId = String(params.sourceEntityId ?? '').trim();
  if (!UUID.test(docId)) return null;
  // authoring_documents has no Drizzle definition (the authoring subsystem's
  // SQL creates it), so it is read as SQL on the same client.
  const result = await db.execute(sql`
    SELECT client_program_id::text AS program_id
      FROM authoring_documents
     WHERE id = ${docId}::uuid AND tenant_id = ${params.orgId}
     LIMIT 1`);
  const rows = (result as unknown as { rows?: Array<{ program_id: string | null }> }).rows ?? [];
  const programId = rows[0]?.program_id ?? null;
  if (!programId) return null;
  const anchor = await readProgramAnchorRow(db, { programId, orgId: params.orgId, context: 'task-source-project' });
  return anchor?.id ?? null;
}

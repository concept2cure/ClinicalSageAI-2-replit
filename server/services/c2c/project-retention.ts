/**
 * What a hard delete of legacy projects rows would destroy, and the refusal it
 * earns (PF-08 and PF-13, project first).
 *
 * `projects` is the integer key every governed artifact, conversation and
 * module hangs from, and most of those keys are ON DELETE CASCADE
 * (concept2cure_artifacts.project_id among them: 0000_sweet_joseph.sql). Three
 * routes hard-delete projects rows:
 *   - DELETE /api/projects/:projectId deletes one;
 *   - DELETE /api/device-projects/:id deletes one;
 *   - DELETE /api/clients/:id deletes every project of a workspace.
 * Each checked only the organization. So one call removed a program's anchor
 * row, the row its documents are keyed to, and cascaded its approved and
 * locked artifacts away. The program's own delete (DELETE /api/c2c/projects/:id)
 * is a soft delete, guarded by projectHolds in routes/c2c/projects.ts. These
 * routes never reached it.
 *
 * The rule is the founder's (PF-13, 2026-09-26): drafts only may be deleted,
 * otherwise archive. Applied to what these deletes destroy:
 *   - the anchor row of a live program (projects.regulatory_program_id names a
 *     program not deleted) is never deleted here. It is the program's, and the
 *     program has its own governed path. The anchor of a deleted program is an
 *     ordinary project row, judged by the next rule.
 *   - a project holding any artifact that is a record is refused: one in
 *     review, approved or locked, or one that carries a signature or a lock
 *     snapshot. A locked document can be taken back to draft, and it keeps
 *     both; the append-only triggers on those tables would refuse the cascade
 *     with an opaque error, and this says why instead.
 *
 * Read inside the deleting transaction, locking what it judges: the workspace
 * row (so no project joins it before the delete), the projects rows and their
 * artifacts (so none becomes an anchor or a record between the check and the
 * delete). The rows are the ones the delete would remove, whatever their
 * organization: the cascade does not ask. Under row-level security the read
 * sees only the caller's organization's artifacts. A cross-organization
 * artifact under the caller's project is what the same-organization key on
 * concept2cure_artifacts prevents, and its preflight lists any that predate it.
 */

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export interface ProjectDeletionHolds {
  /** Live programs whose anchor row the delete would remove. */
  anchoredPrograms: string[];
  /** Artifacts that are records (past draft, signed or snapshotted) the cascade would remove. */
  governedArtifacts: number;
}

export type ProjectDeletionTarget = { projectIds: number[] } | { workspaceId: number };

export async function projectDeletionHolds(q: Queryable, target: ProjectDeletionTarget): Promise<ProjectDeletionHolds> {
  let predicate: string;
  let param: number | number[];
  if ('projectIds' in target) {
    predicate = 'p.id = ANY($1::int[])';
    param = target.projectIds;
  } else {
    // An unreferenced CTE never runs, so the workspace lock is its own statement.
    await q.query('SELECT id FROM client_workspaces WHERE id = $1 FOR UPDATE', [target.workspaceId]);
    predicate = 'p.client_workspace_id = $1';
    param = target.workspaceId;
  }
  // tenant-isolation-safe: by design this reads every row the caller's delete would cascade away, whatever its organization, because the cascade does not ask (see header). Ownership is established before it is called: clients-routes.ts (loadWorkspaceForCaller), projects-management.ts (organizationId check) and device-projects.ts (organization filter). An organization predicate here would undercount the delete.
  const { rows } = await q.query(
    `WITH doomed AS (
       SELECT p.id, p.regulatory_program_id FROM projects p WHERE ${predicate} FOR UPDATE
     ),
     arts AS (
       SELECT a.id, a.status FROM concept2cure_artifacts a WHERE a.project_id IN (SELECT id FROM doomed) FOR SHARE
     )
     SELECT
       COALESCE((SELECT array_agg(DISTINCT d.regulatory_program_id::text) FROM doomed d
                   JOIN regulatory_programs rp ON rp.id = d.regulatory_program_id AND rp.deleted_at IS NULL),
                ARRAY[]::text[]) AS anchored_programs,
       (SELECT count(*)::int FROM arts a
         WHERE a.status <> 'draft'
            OR EXISTS (SELECT 1 FROM concept2cure_signatures s WHERE s.artifact_id = a.id)
            OR EXISTS (SELECT 1 FROM concept2cure_submission_snapshots ss WHERE ss.artifact_id = a.id)
            -- Review comments are part of the artifact's review record (D5, 2026-10-01;
            -- migrations/20261001_review_comments_record.sql): an artifact that has any
            -- holds records, as a signed one does.
            OR EXISTS (SELECT 1 FROM concept2cure_thread_comments tc WHERE tc.artifact_id = a.id)) AS governed_artifacts`,
    [param],
  );
  const row = (rows[0] ?? {}) as { anchored_programs?: string[] | null; governed_artifacts?: number | null };
  return {
    anchoredPrograms: [...(row.anchored_programs ?? [])].sort(),
    governedArtifacts: Number(row.governed_artifacts ?? 0),
  };
}

export interface ProjectDeletionRefusalBody {
  error: 'PROJECT_IS_PROGRAM_ANCHOR' | 'PROJECT_HOLDS_RECORDS';
  message: string;
  programIds?: string[];
  holds?: { governedArtifacts: number };
}

/** The 409 a delete earns, or null when it destroys only drafts. */
export function projectDeletionRefusal(
  holds: ProjectDeletionHolds,
  scope: 'project' | 'workspace',
): { status: 409; body: ProjectDeletionRefusalBody } | null {
  const subject = scope === 'project' ? 'This project' : 'This workspace';
  if (holds.anchoredPrograms.length > 0) {
    return {
      status: 409,
      body: {
        error: 'PROJECT_IS_PROGRAM_ANCHOR',
        message:
          scope === 'project'
            ? 'This project is the record of a program in Projects; its documents are kept under it. Archive or delete the program from Projects instead. Nothing was deleted.'
            : `This workspace holds the record of ${holds.anchoredPrograms.length} program(s) in Projects; their documents are kept under it. Delete those programs from Projects first, or archive the workspace instead. Nothing was deleted.`,
        programIds: holds.anchoredPrograms,
      },
    };
  }
  if (holds.governedArtifacts > 0) {
    return {
      status: 409,
      body: {
        error: 'PROJECT_HOLDS_RECORDS',
        message: `${subject} holds ${holds.governedArtifacts} document(s) that are records (in review, approved, locked, or signed), and deleting it would delete them. Archive it instead. Nothing was deleted.`,
        holds: { governedArtifacts: holds.governedArtifacts },
      },
    };
  }
  return null;
}

/** The driver's error inside whatever wrapped it (drizzle puts it in `cause`). */
function databaseErrorOf(err: unknown): { code: string; table?: string; constraint?: string } | null {
  let e: unknown = err;
  for (let depth = 0; depth < 3 && e && typeof e === 'object'; depth += 1) {
    if (typeof (e as { code?: unknown }).code === 'string') return e as { code: string; table?: string; constraint?: string };
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * The 409 a delete earns when the DATABASE refuses it, or null for any other
 * error (which stays the route's 500).
 *
 * projectDeletionHolds judges what the delete would cascade away. About forty
 * other stores name a project under a key that does not cascade (ON DELETE NO
 * ACTION): agency correspondence, submissions, evidence-chain records and the
 * like. A row in any of them makes the DELETE fail 23503, and every hard-delete
 * route answered that as a bare 500 "Failed to delete" (PF-13 follow-up). Those
 * rows are kept with the project, so the answer is the one a held record gets:
 * archive instead. Nothing was deleted: the 23503 rolled the transaction back.
 *
 * `heldBy` names the store for the log only. A table or constraint name means
 * nothing to the person and describes the schema, so it stays out of the body.
 */
export function projectDeleteBlockedRefusal(
  err: unknown,
  scope: 'project' | 'workspace',
): { status: 409; body: ProjectDeletionRefusalBody; heldBy: { table?: string; constraint?: string } } | null {
  const cause = databaseErrorOf(err);
  if (cause?.code !== '23503') return null;
  const subject = scope === 'project' ? 'This project' : 'This workspace';
  return {
    status: 409,
    body: {
      error: 'PROJECT_HOLDS_RECORDS',
      message:
        `${subject} still has records elsewhere on the platform that are kept with it, such as agency ` +
        'correspondence, submissions or evidence records, so it cannot be deleted. Archive it instead. Nothing was deleted.',
    },
    heldBy: { table: cause.table, constraint: cause.constraint },
  };
}

/** Thrown inside a deleting transaction so it rolls back; the route answers the refusal. */
export class ProjectDeletionRefused extends Error {
  constructor(readonly refusal: { status: 409; body: ProjectDeletionRefusalBody }) {
    super(refusal.body.message);
    this.name = 'ProjectDeletionRefused';
  }
}

/**
 * What a hard delete of legacy projects rows would destroy, and the refusal it
 * earns (PF-08 and PF-13, project first).
 *
 * `projects` is the integer key every governed artifact, conversation and
 * module hangs from, and most of those keys are ON DELETE CASCADE
 * (concept2cure_artifacts.project_id among them: 0000_sweet_joseph.sql). Two
 * routes hard-delete projects rows after checking only the organization:
 *   - DELETE /api/projects/:projectId deletes one;
 *   - DELETE /api/clients/:id deletes every project of a workspace.
 * So one call removed a program's anchor row, the row its documents are
 * keyed to, and cascaded its approved and locked artifacts away. The
 * program's own delete (DELETE /api/c2c/projects/:id) is a soft delete, guarded
 * by projectHolds in routes/c2c/projects.ts. These two routes never reached it.
 *
 * The rule is the founder's (PF-13, 2026-09-26): drafts only may be deleted,
 * otherwise archive. Applied to what these deletes destroy:
 *   - an anchor row (projects.regulatory_program_id set) is never deleted here:
 *     it is the program's, and the program has its own governed path;
 *   - a project holding any artifact that is not a draft (in review, approved,
 *     locked) is refused: deleting it would delete them.
 *
 * Read inside the deleting transaction, locking the rows it names, so nothing
 * becomes an anchor or leaves draft between the check and the delete. The rows
 * are the ones the delete would remove, whatever their organization: the
 * cascade does not ask.
 */

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export interface ProjectDeletionHolds {
  /** Programs whose anchor row the delete would remove. */
  anchoredPrograms: string[];
  /** Artifacts in review, approved or locked that the cascade would remove. */
  governedArtifacts: number;
}

export type ProjectDeletionTarget = { projectIds: number[] } | { workspaceId: number };

export async function projectDeletionHolds(q: Queryable, target: ProjectDeletionTarget): Promise<ProjectDeletionHolds> {
  const [predicate, param] =
    'projectIds' in target
      ? ['p.id = ANY($1::int[])', target.projectIds]
      : ['p.client_workspace_id = $1', target.workspaceId];
  const { rows } = await q.query(
    `WITH doomed AS (
       SELECT p.id, p.regulatory_program_id FROM projects p WHERE ${predicate} FOR UPDATE
     )
     SELECT
       COALESCE((SELECT array_agg(DISTINCT regulatory_program_id::text) FROM doomed
                  WHERE regulatory_program_id IS NOT NULL), ARRAY[]::text[]) AS anchored_programs,
       (SELECT count(*)::int FROM concept2cure_artifacts a
         WHERE a.project_id IN (SELECT id FROM doomed) AND a.status <> 'draft') AS governed_artifacts`,
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
            : `This workspace holds the record of ${holds.anchoredPrograms.length} program(s) in Projects; their documents are kept under it. Archive or delete those programs from Projects first. Nothing was deleted.`,
        programIds: holds.anchoredPrograms,
      },
    };
  }
  if (holds.governedArtifacts > 0) {
    return {
      status: 409,
      body: {
        error: 'PROJECT_HOLDS_RECORDS',
        message: `${subject} holds ${holds.governedArtifacts} document(s) in review, approved or locked, and deleting it would delete them. Archive it instead. Nothing was deleted.`,
        holds: { governedArtifacts: holds.governedArtifacts },
      },
    };
  }
  return null;
}

/** Thrown inside a deleting transaction so it rolls back; the route answers the refusal. */
export class ProjectDeletionRefused extends Error {
  constructor(readonly refusal: { status: 409; body: ProjectDeletionRefusalBody }) {
    super(refusal.body.message);
    this.name = 'ProjectDeletionRefused';
  }
}

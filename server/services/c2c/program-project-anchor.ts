/**
 * The program ↔ project anchor — slice C1 of the Document Identity Contract
 * (docs/DOCUMENT_IDENTITY_CONTRACT_2026-08.md, approved 2026-08-13).
 *
 * ── What it bridges ───────────────────────────────────────────────────────────
 * `regulatory_programs.id` is uuid — the spine every v2 surface reads.
 * `projects.id` is integer — the legacy PM spine that
 * `concept2cure_artifacts.project_id` (the governed artifact registry, with its
 * Part 11 history) FKs to. There was no bridge, so:
 *   • program-scoped Vault listing could not filter at all,
 *   • governed 510(k)/CER exports for uuid programs were delivered
 *     "audited but unplaced" because the registry had nowhere to put them.
 *
 * `projects.regulatory_program_id` (migrations/20260814_projects_regulatory_
 * program_anchor.sql) is that bridge. This module is the ONE place that reads
 * and writes it, so the intake writer, the export placers and the Vault filter
 * cannot drift apart on what an anchor means.
 *
 * ── The column may legitimately be absent ─────────────────────────────────────
 * The migration is on the durable path, but an environment can be running code
 * that predates its application. Every entry point here degrades to "no anchor"
 * on 42703 (undefined_column) and says so, rather than 500-ing — the same
 * fail-closed posture mdx-vault.ts already takes for a missing store. Nothing
 * here ever invents an anchor to avoid the degraded path.
 */

import type { PoolClient } from 'pg';
import { and, asc, eq } from 'drizzle-orm';
import { projects } from '../../../shared/schema';
import type { RequestDb } from '../../db/requestDb';
import { createScopedLogger } from '../../utils/logger.js';
import { DEFAULT_WORKSPACE_MARKER } from './organization-default-workspace';

const logger = createScopedLogger('program-project-anchor');

/** Postgres `undefined_column`: the anchor migration has not been applied here. */
export const UNDEFINED_COLUMN = '42703';

export function isMissingAnchorColumn(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === UNDEFINED_COLUMN;
}

/**
 * Why an intake could not anchor its program to a PM-spine project row. Every
 * value is a fact about the data, never a failure to try.
 */
export type AnchorSkip =
  /** `projects.regulatory_program_id` is not present in this database. */
  | 'PENDING_ANCHOR_COLUMN'
  /** The org has no client workspace, and `projects.client_workspace_id` is NOT NULL. */
  | 'NO_CLIENT_WORKSPACE'
  /** The org has several client workspaces and the program names none of them. */
  | 'AMBIGUOUS_CLIENT_WORKSPACE';

export interface AnchorResult {
  /** The anchored `projects.id`, or null when the anchor was skipped. */
  projectId: number | null;
  /** True when this call inserted the row; false when one already existed. */
  created: boolean;
  skipped?: AnchorSkip;
  /** Why, for the operator's log. Intake refuses on a skip (requireProgramProjectAnchor). */
  detail?: string;
}

export interface EnsureAnchorInput {
  /** Caller-owned transaction. This module never opens or commits one. */
  client: PoolClient;
  orgId: number;
  /** The creating user — becomes created_by_id / owner_id, exactly as intake sets lead_user_id. */
  userId: number | null;
  /** regulatory_programs.id (uuid) — the program this project anchors. */
  programId: string;
  /** regulatory_programs.name, verbatim. */
  name: string;
  /** The code actually persisted on the program row (post-collision-retry). */
  code: string | null;
  /** regulatory_programs.priority, verbatim. */
  priority: string;
}

interface PreflightRow {
  has_column: number | string;
  workspace_count: number | string;
  workspace_id: number | string | null;
  /** The organisation's own workspace, when one is marked. */
  default_workspace_id: number | string | null;
}

/**
 * THE NOT-NULL HONESTY CHECK (contract §4 C1: "leave unmatched rows null rather
 * than guessing"), applied to the intake writer rather than the backfill.
 *
 * `projects` NOT NULL columns, and where each value genuinely comes from:
 *
 *   organization_id      the intake's org.                              TRUTHFUL
 *   name                 the program's name.                            TRUTHFUL
 *   type                 'regulatory'. Not a guess about unknown data —
 *                        a restatement of what this row IS: the project
 *                        created FOR a regulatory program. The column's
 *                        documented domain is research | clinical |
 *                        regulatory | commercial.                       TRUTHFUL
 *   status/priority/depth defaults, or the program's own priority.      TRUTHFUL
 *   client_workspace_id  NOT NULL, FK → client_workspaces.id.           *** NOT DERIVABLE ***
 *
 * There is no client workspace in program data. `regulatory_programs` carries
 * no workspace column; the v2 New-Project wizard sends none; and the only
 * request-level source (`x-client-id` → tenantContext.clientWorkspaceId) is
 * optional, unvalidated against the org, and sent by no client in this
 * repository. The two other live `INSERT INTO projects` sites that populate it
 * (routes/project-hierarchy.ts, services/rules-engine/actions) both copy it
 * from a PARENT project — neither invents one either.
 *
 * Picking "the org's first workspace" would not be a defaulting choice, it
 * would be an access-control decision: `projects.client_workspace_id` is what
 * services/project-module-bridge.ts checks to decide whether a caller in a
 * given workspace may see a project at all. Assigning the wrong one grants or
 * denies visibility to the wrong people.
 *
 * So the anchor is created only where the workspace is UNAMBIGUOUS, which is
 * two cases, in this order:
 *
 *   1. The organisation has its OWN workspace — one marked
 *      `metadata.defaultForOrganization`, written by
 *      services/c2c/organization-default-workspace.ts. A regulatory program
 *      belongs to the sponsor organisation, not to one of its clients, so this
 *      is where its PM-spine project belongs however many client workspaces sit
 *      beside it. This branch is what lets a CRO add client workspaces through
 *      the live POST /api/clients without its own programs silently stopping
 *      anchoring the moment it has two.
 *   2. Failing that, the organisation has exactly one client workspace, in
 *      which case there is no choice to make and every project in that org is
 *      in it.
 *
 * With none, or with more than one and none of them the organisation's own, the
 * anchor is SKIPPED and the reason is returned. This is the same standard the
 * migrations' backfills hold themselves to (20260814 links, 20261008 inserts):
 * act on the unambiguous case, leave the rest, never guess.
 *
 * Intake does not accept a skip (P-19, 2026-10-08): it calls
 * requireProgramProjectAnchor below, which turns the skip into a refusal that
 * rolls the whole creation back. Until then a skip still created the program,
 * and the program answered "no record" on the schedule, unified work, AnA's
 * project context and the Vault for good. A fabricated workspace is still never
 * the way out; refusing the program is.
 */
export async function ensureProgramProjectAnchor(input: EnsureAnchorInput): Promise<AnchorResult> {
  const { client, orgId, userId, programId, name, code, priority } = input;

  // One round trip for both preconditions. The column presence check comes
  // FIRST and is read from the catalog rather than discovered by a failed
  // write: inside a transaction a 42703 aborts the whole transaction, so
  // "attempt and catch" would take the program creation down with it on any
  // environment that has not applied the migration yet.
  const preflight = await client.query<PreflightRow>(
    `SELECT
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'projects'
           AND column_name = 'regulatory_program_id')            AS has_column,
       (SELECT count(*) FROM client_workspaces
         WHERE organization_id = $1)                             AS workspace_count,
       (SELECT min(id) FROM client_workspaces
         WHERE organization_id = $1)                             AS workspace_id,
       -- The organisation's OWN workspace, written by
       -- services/c2c/organization-default-workspace.ts and marked as such.
       -- Preferred over the count below: a regulatory program belongs to the
       -- sponsor organisation, not to one of its client workspaces, so this is
       -- the answer the count was only ever standing in for. Without it, a
       -- tenant that adds a client workspace through the live POST /api/clients
       -- goes from one workspace to two and stops anchoring every program it
       -- creates afterwards.
       (SELECT min(id) FROM client_workspaces
         WHERE organization_id = $1
           AND (metadata ->> $2) = 'true')                       AS default_workspace_id`,
    [orgId, DEFAULT_WORKSPACE_MARKER],
  );
  const row = preflight.rows[0];
  const hasColumn = Number(row?.has_column ?? 0) > 0;
  const workspaceCount = Number(row?.workspace_count ?? 0);
  const defaultWorkspaceId =
    row?.default_workspace_id == null ? null : Number(row.default_workspace_id);
  // The organisation's own workspace when it has one; otherwise the single
  // workspace it has, which the count check below is what makes safe.
  const workspaceId =
    defaultWorkspaceId ?? (row?.workspace_id == null ? null : Number(row.workspace_id));

  if (!hasColumn) {
    return {
      projectId: null, created: false, skipped: 'PENDING_ANCHOR_COLUMN',
      detail:
        'projects.regulatory_program_id is not present in this database ' +
        '(migrations/20260814_projects_regulatory_program_anchor.sql has not been applied). ' +
        'A program cannot be created without its PM-spine anchor.',
    };
  }

  // Idempotent: an org's program anchors exactly one project row. At intake the
  // program id was generated moments ago so this cannot match, but `ensure` is
  // the contract — a re-invocation must link, never fork.
  const existing = await client.query<{ id: number | string }>(
    `SELECT id FROM projects
      WHERE regulatory_program_id = $1 AND organization_id = $2
      ORDER BY id
      LIMIT 1`,
    [programId, orgId],
  );
  if (existing.rows.length > 0) {
    return { projectId: Number(existing.rows[0].id), created: false };
  }

  if (workspaceCount === 0 || workspaceId === null) {
    return {
      projectId: null, created: false, skipped: 'NO_CLIENT_WORKSPACE',
      detail:
        'This organization has no client workspace, and projects.client_workspace_id is NOT NULL. ' +
        'A program cannot be created without its PM-spine anchor until a workspace exists.',
    };
  }
  if (workspaceCount > 1 && defaultWorkspaceId === null) {
    return {
      projectId: null, created: false, skipped: 'AMBIGUOUS_CLIENT_WORKSPACE',
      detail:
        `This organization has ${workspaceCount} client workspaces, none of them marked as the ` +
        'organization\u2019s own, and the program names none of them. ' +
        'projects.client_workspace_id decides who can see a project, so it is not defaulted. ' +
        'A program cannot be created without its PM-spine anchor.',
    };
  }

  // `path` and `parent_project_id` are deliberately left NULL: this is a root
  // project with no hierarchy, and project-rollup-service treats an
  // unmaterialized path as a supported state (it falls back to the bare id in
  // its prefix scans and can recompute on demand). Writing a path here would
  // assert a hierarchy position nothing established.
  const inserted = await client.query<{ id: number | string }>(
    `INSERT INTO projects
       (organization_id, client_workspace_id, name, code, type, status, priority,
        created_by_id, owner_id, regulatory_program_id)
     VALUES ($1, $2, $3, $4, 'regulatory', 'active', $5, $6, $6, $7)
     RETURNING id`,
    [orgId, workspaceId, name, code, priority, userId, programId],
  );
  return { projectId: Number(inserted.rows[0].id), created: true };
}

/**
 * The program could not be given its project record, so it must not be created
 * (P-19). Thrown inside the caller's transaction, so the caller's rollback takes
 * the program, its scaffold, its submission spine and its audit row with it.
 * `detail` is for the operator's log, not the screen: it names schema objects.
 */
export class ProgramAnchorUnavailableError extends Error {
  readonly code = 'PROJECT_RECORD_UNAVAILABLE';

  constructor(
    readonly reason: AnchorSkip,
    readonly detail: string,
  ) {
    super(`The program's project record could not be written (${reason})`);
    this.name = 'ProgramAnchorUnavailableError';
  }
}

/**
 * Intake's form of ensureProgramProjectAnchor: the anchor, or a throw. Every
 * program a client can open has its project record, so a program that cannot
 * have one is refused rather than created without it.
 */
export async function requireProgramProjectAnchor(
  input: EnsureAnchorInput,
): Promise<{ projectId: number; created: boolean }> {
  const result = await ensureProgramProjectAnchor(input);
  if (result.projectId === null) {
    throw new ProgramAnchorUnavailableError(result.skipped ?? 'PENDING_ANCHOR_COLUMN', result.detail ?? '');
  }
  return { projectId: result.projectId, created: result.created };
}

export interface ProgramAnchorRow {
  id: number;
  clientWorkspaceId: number | null;
}

/**
 * The program's anchor row, org-scoped: the lowest-id projects row naming it,
 * which is the row intake links (ensureProgramProjectAnchor, ORDER BY id). The
 * one reader of the anchor (PF-08). Its copies used `.limit(1)` with no order,
 * so two anchor rows for one program read as whichever the plan met first, and
 * one export could file under one row and the next under the other.
 *
 * Two rows is a data fault, so it is named in the log. One anchor per program
 * is held by the partial unique index projects_one_anchor_per_program
 * (migrations/20261001b) wherever the data allowed it.
 *
 * Raw-SQL callers use the same reader on their own connection. requireUnique
 * refuses duplicate anchors; other existing callers retain lowest-id behavior.
 *
 * Throws when the read cannot complete; an absent anchor column is the
 * caller's to judge (isMissingAnchorColumn).
 */
export async function readProgramAnchorRow(
  db: RequestDb | { query(text: string, params?: unknown[]): Promise<{ rows: ProgramAnchorRow[] }> },
  params: { programId: string; orgId: number; context: string; requireUnique?: boolean },
): Promise<ProgramAnchorRow | null> {
  const rows = 'select' in db ? await db
    .select({ id: projects.id, clientWorkspaceId: projects.clientWorkspaceId })
    .from(projects)
    .where(and(eq(projects.regulatoryProgramId, params.programId), eq(projects.organizationId, params.orgId)))
    .orderBy(asc(projects.id))
    .limit(2) : (await db.query(
      `SELECT id, client_workspace_id AS "clientWorkspaceId" FROM projects
       WHERE regulatory_program_id = $1 AND organization_id = $2 ORDER BY id LIMIT 2`,
      [params.programId, params.orgId],
    )).rows;
  if ((rows?.length ?? 0) > 1) {
    logger.warn(params.requireUnique ? 'Program has more than one anchor row; unique anchor required' : 'Program has more than one anchor row; reading the lowest id, the row intake links', {
      context: params.context,
      programId: params.programId,
      projectIds: rows.map((r) => r.id),
    });
    if (params.requireUnique) return null;
  }
  const row = rows?.[0];
  if (!row) return null;
  // A non-integer id is not an anchor. `concept2cure_artifacts.project_id` is
  // an integer FK, so placing against anything else would fail at the
  // registry — better to take the honest unanchored path than to try.
  const id = Number(row.id);
  return Number.isInteger(id) && id > 0 ? { id, clientWorkspaceId: row.clientWorkspaceId ?? null } : null;
}

/**
 * Resolve the PM-spine project id anchored to `programId`, org-scoped.
 *
 * Returns null when the program has no anchor — which is a real and expected
 * state (see the skip reasons above) — and also when the anchor column is
 * absent in this database. Callers MUST keep their honest unanchored path for
 * null; this function exists to stop them taking it when a real anchor exists,
 * not to remove it.
 *
 * `context` names the caller in the log line, so an un-migrated environment is
 * visible in operations rather than silently degraded.
 */
export async function resolveProgramProjectAnchor(
  /** The RLS-scoped per-request Drizzle client — `requestDb(req)`, never the shared pool. */
  db: RequestDb,
  /** `strict`: rethrow a lookup that could not complete (see resolveCmcArtifactProject). An absent anchor column is still null. */
  params: { programId: string; orgId: number; context: string; strict?: boolean },
): Promise<number | null> {
  try {
    return (await readProgramAnchorRow(db, params))?.id ?? null;
  } catch (err) {
    if (isMissingAnchorColumn(err)) {
      logger.warn(
        'projects.regulatory_program_id absent — program exports stay registry-unplaced ' +
          '(apply migrations/20260814_projects_regulatory_program_anchor.sql)',
        { context: params.context },
      );
      return null;
    }
    if (params.strict) throw err;
    logger.warn('Program anchor lookup failed; treating the program as unanchored', {
      context: params.context,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

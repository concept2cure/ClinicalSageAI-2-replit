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
import { projectIntakeId } from '../../../shared/project-intake-workspace';
import { and, asc, eq, sql } from 'drizzle-orm';
import { projects } from '../../../shared/schema';
import type { RequestDb } from '../../db/requestDb';
import { looksLikeProgramUuid, parseIntegerProjectId } from '../../lib/project-id.js';
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
  | 'AMBIGUOUS_CLIENT_WORKSPACE'
  | 'INVALID_CLIENT_WORKSPACE'
  | 'CLIENT_WORKSPACE_MISMATCH';

export interface AnchorResult {
  /** The anchored `projects.id`, or null when the anchor was skipped. */
  projectId: number | null;
  /** True when this call inserted the row; false when one already existed. */
  created: boolean;
  skipped?: AnchorSkip;
  /** Why, for the operator's log. Intake refuses on a skip (requireProgramProjectAnchor). */
  detail?: string;
  clientWorkspaceId?: number;
  clientWorkspaceName?: string;
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
  /**
   * `projects.metadata` for the new row: the registry context the readiness
   * engine reads (services/c2c/program-registry-context.ts), or null when the
   * program names none. Written only on insert; an existing anchor keeps its
   * own (its context comes from migrations/20261008c, Rule 1).
   */
  metadata?: Record<string, unknown> | null;
  /** Explicit, organization-owned active workspace. Never a fallback hint. */
  clientWorkspaceId?: number;
  /** New-project intake requires a choice whenever active options are multiple. */
  requireExplicitWorkspace?: boolean;
  /** An optional request consistency claim; it never chooses the parent. */
  workspaceClaim?: number;
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
 *   client_workspace_id  active owned selection, or legacy default.    TRUTHFUL
 *
 * New-project intake supplies an explicit active organization-owned workspace,
 * or accepts the sole active workspace for legacy callers of POST /. Multiple
 * active options require a choice even when one carries the organization default
 * marker. The selected row is held FOR SHARE until the caller ends its transaction.
 * Outside strict intake, the existing organization-default/unique-workspace
 * behavior remains compatible. An explicit repeat must match the recorded anchor;
 * no call moves an existing project or grants access to it.
 */
export async function ensureProgramProjectAnchor(input: EnsureAnchorInput): Promise<AnchorResult> {
  const { client, orgId, userId, programId, name, code, priority, metadata } = input;

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
       -- Legacy ensure callers retain the existing organization default.
       -- Strict intake ignores this marker and locks the actual chosen row.
       (SELECT min(id) FROM client_workspaces
         WHERE organization_id = $1
           AND (metadata ->> $2) = 'true')                       AS default_workspace_id`,
    [orgId, DEFAULT_WORKSPACE_MARKER],
  );
  const row = preflight.rows[0];
  const hasColumn = Number(row?.has_column ?? 0) > 0;

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
  const existing = await client.query<{ id: number | string; client_workspace_id: number | string }>(
    `SELECT id, client_workspace_id FROM projects
      WHERE regulatory_program_id = $1 AND organization_id = $2
      ORDER BY id
      LIMIT 1`,
    [programId, orgId],
  );
  if (existing.rows.length > 0 && !input.requireExplicitWorkspace && input.clientWorkspaceId === undefined) {
    return retainedAnchor(input, existing.rows[0], { id: Number(existing.rows[0].client_workspace_id) });
  }
  const selected = input.requireExplicitWorkspace || input.clientWorkspaceId !== undefined
    ? await lockIntakeWorkspace(input) : legacyWorkspace(row);
  if ('skipped' in selected) return selected;
  if (existing.rows.length > 0) return retainedAnchor(input, existing.rows[0], selected);
  const { id: workspaceId, name: workspaceName } = selected;

  // `path` and `parent_project_id` are deliberately left NULL: this is a root
  // project with no hierarchy, and project-rollup-service treats an
  // unmaterialized path as a supported state (it falls back to the bare id in
  // its prefix scans and can recompute on demand). Writing a path here would
  // assert a hierarchy position nothing established.
  // `metadata` carries the registry context the readiness engine reads
  // (projects.metadata.registryId / submissionType, report-os orchestrator).
  // Intake wrote none, so no program's readiness could ever be computed there
  // (QA 2026-10-08, j8). NULL when the program names no registry entry.
  const inserted = await client.query<{ id: number | string }>(
    `INSERT INTO projects
       (organization_id, client_workspace_id, name, code, type, status, priority,
        created_by_id, owner_id, regulatory_program_id, metadata)
     VALUES ($1, $2, $3, $4, 'regulatory', 'active', $5, $6, $6, $7, $8::json)
     RETURNING id`,
    [orgId, workspaceId, name, code, priority, userId, programId, metadata ? JSON.stringify(metadata) : null],
  );
  return { projectId: Number(inserted.rows[0].id), created: true, clientWorkspaceId: workspaceId,
    ...(workspaceName ? { clientWorkspaceName: workspaceName } : {}) };
}

interface SelectedWorkspace { id: number; name?: string }

function legacyWorkspace(row: PreflightRow | undefined): SelectedWorkspace | (AnchorResult & { skipped: AnchorSkip }) {
  const count = Number(row?.workspace_count ?? 0);
  const marked = row?.default_workspace_id == null ? null : Number(row.default_workspace_id);
  const id = marked ?? (row?.workspace_id == null ? null : Number(row.workspace_id));
  if (count === 0 || id === null) return workspaceRefusal('NO_CLIENT_WORKSPACE', 'No organization workspace exists.');
  if (count > 1 && marked === null) return workspaceRefusal('AMBIGUOUS_CLIENT_WORKSPACE', 'Several workspaces exist and no organization default is marked.');
  return { id };
}

function retainedAnchor(input: EnsureAnchorInput, saved: { id: number | string; client_workspace_id: number | string }, selected: SelectedWorkspace): AnchorResult {
  const clientWorkspaceId = Number(saved.client_workspace_id);
  if (input.requireExplicitWorkspace && clientWorkspaceId !== selected.id
    || input.clientWorkspaceId !== undefined && clientWorkspaceId !== input.clientWorkspaceId
    || input.workspaceClaim !== undefined && clientWorkspaceId !== input.workspaceClaim) {
    return workspaceRefusal('CLIENT_WORKSPACE_MISMATCH', 'The explicit workspace contradicts the recorded project anchor.');
  }
  return { projectId: Number(saved.id), created: false, clientWorkspaceId,
    ...(selected.name ? { clientWorkspaceName: selected.name } : {}) };
}

function workspaceRefusal(skipped: AnchorSkip, detail: string): AnchorResult & { skipped: AnchorSkip } {
  return { projectId: null, created: false, skipped, detail };
}

/** Part of the ONE anchor writer, on its caller-owned transaction. */
async function lockIntakeWorkspace(input: EnsureAnchorInput): Promise<{ id: number; name: string } | (AnchorResult & { skipped: AnchorSkip })> {
  const explicit = input.clientWorkspaceId;
  if (explicit !== undefined && (typeof explicit !== 'number' || projectIntakeId(explicit) === null)) {
    return workspaceRefusal('INVALID_CLIENT_WORKSPACE', 'The supplied workspace ID is invalid.');
  }
  const selected = await input.client.query<{ id: number; name: string }>(explicit === undefined
    ? `SELECT id, name FROM client_workspaces WHERE organization_id=$1 AND status='active' ORDER BY id FOR SHARE`
    : `SELECT id, name FROM client_workspaces WHERE organization_id=$1 AND status='active' AND id=$2 ORDER BY id FOR SHARE`,
  explicit === undefined ? [input.orgId] : [input.orgId, explicit]);
  if (selected.rows.length === 0) return workspaceRefusal(explicit === undefined ? 'NO_CLIENT_WORKSPACE' : 'INVALID_CLIENT_WORKSPACE', 'No active owned workspace matched the selection.');
  if (selected.rows.length !== 1) return workspaceRefusal('AMBIGUOUS_CLIENT_WORKSPACE', 'An explicit workspace selection is required.');
  const row = selected.rows[0];
  if (!Number.isSafeInteger(row.id) || row.id <= 0 || typeof row.name !== 'string' || !row.name.trim()) {
    throw new Error('The selected workspace identity could not be verified');
  }
  if (input.workspaceClaim !== undefined && input.workspaceClaim !== row.id) {
    return workspaceRefusal('CLIENT_WORKSPACE_MISMATCH', 'The supplied request claim contradicts the selected workspace.');
  }
  return row;
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
): Promise<{ projectId: number; created: boolean; clientWorkspaceId?: number; clientWorkspaceName?: string }> {
  const result = await ensureProgramProjectAnchor(input);
  if (result.projectId === null) {
    throw new ProgramAnchorUnavailableError(result.skipped ?? 'PENDING_ANCHOR_COLUMN', result.detail ?? '');
  }
  return { ...result, projectId: result.projectId };
}

export interface ProgramAnchorRow {
  id: number;
  clientWorkspaceId: number | null;
}

export interface ProgramAnchorReadExecutor {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}
export type ProgramAnchorEligibility = 'all' | 'non-deleted';
export interface ProgramAnchorCandidate { programId: string; anchor: ProgramAnchorRow | null }

function parsedAnchor(row: unknown): ProgramAnchorRow | null {
  if (!row || typeof row !== 'object' || !('id' in row)) return null;
  const id = Number(row.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const workspace = 'clientWorkspaceId' in row ? row.clientWorkspaceId : null;
  if (workspace == null) return { id, clientWorkspaceId: null };
  const clientWorkspaceId = Number(workspace);
  return Number.isSafeInteger(clientWorkspaceId) && clientWorkspaceId > 0 ? { id, clientWorkspaceId } : null;
}

/** All recorded eligible anchors, before sharing is evaluated. A malformed or
 * duplicate relationship never becomes unique by hiding its private row. */
export async function listProgramAnchorCandidates(db: ProgramAnchorReadExecutor, params: {
  orgId: number; eligibility?: ProgramAnchorEligibility;
}): Promise<ProgramAnchorCandidate[]> {
  const statement = params.eligibility === 'non-deleted'
    ? `SELECT regulatory_program_id::text AS program_id,id,client_workspace_id AS "clientWorkspaceId"
       FROM projects WHERE organization_id=$1 AND regulatory_program_id IS NOT NULL
         AND status IS DISTINCT FROM 'deleted' ORDER BY regulatory_program_id,id`
    : `SELECT regulatory_program_id::text AS program_id,id,client_workspace_id AS "clientWorkspaceId"
       FROM projects WHERE organization_id=$1 AND regulatory_program_id IS NOT NULL ORDER BY regulatory_program_id,id`;
  const { rows } = await db.query(statement,[params.orgId]);
  return rows.map(row => {
    if (!row || typeof row !== 'object' || !('program_id' in row) || typeof row.program_id !== 'string') {
      throw new Error('Program anchor identity could not be read');
    }
    return { programId: row.program_id, anchor: parsedAnchor(row) };
  });
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
  db: RequestDb | ProgramAnchorReadExecutor,
  params: { programId: string; orgId: number; context: string; requireUnique?: boolean; eligibility?: ProgramAnchorEligibility },
): Promise<ProgramAnchorRow | null> {
  const rows = 'select' in db ? await db
    .select({ id: projects.id, clientWorkspaceId: projects.clientWorkspaceId })
    .from(projects)
    .where(and(eq(projects.regulatoryProgramId, params.programId), eq(projects.organizationId, params.orgId),
      params.eligibility === 'non-deleted' ? sql`${projects.status} IS DISTINCT FROM 'deleted'` : undefined))
    .orderBy(asc(projects.id))
    .limit(2) : (await db.query(
      params.eligibility === 'non-deleted'
        ? `SELECT id, client_workspace_id AS "clientWorkspaceId" FROM projects
           WHERE regulatory_program_id=$1 AND organization_id=$2 AND status IS DISTINCT FROM 'deleted' ORDER BY id LIMIT 2`
        : `SELECT id, client_workspace_id AS "clientWorkspaceId" FROM projects
           WHERE regulatory_program_id=$1 AND organization_id=$2 ORDER BY id LIMIT 2`,
      [params.programId, params.orgId],
    )).rows;
  if ((rows?.length ?? 0) > 1) {
    logger.warn(params.requireUnique ? 'Program has more than one anchor row; unique anchor required' : 'Program has more than one anchor row; reading the lowest id, the row intake links', {
      context: params.context,
      programId: params.programId,
      projectIds: rows.map((r) => parsedAnchor(r)?.id ?? null),
    });
    if (params.requireUnique) return null;
  }
  const row = rows?.[0];
  if (!row) return null;
  // A non-integer id is not an anchor. `concept2cure_artifacts.project_id` is
  // an integer FK, so placing against anything else would fail at the
  // registry — better to take the honest unanchored path than to try.
  return parsedAnchor(row);
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

/**
 * The integer `projects.id` a project ref names, for a reader that must tell
 * "no linked project" from "could not tell" (ana-14, 2026-10-08).
 *
 * The same answer as integerProjectForRef (services/c2c/project-ref.ts): an
 * integer (parseIntegerProjectId, fail-closed) is itself, a program UUID is
 * its anchor row (resolveProgramProjectAnchor, the lowest id, org-scoped), and
 * anything else is null. One difference: this is strict. A lookup that could
 * not complete THROWS, where integerProjectForRef logs it and answers null.
 *
 * project-ref.ts is not strict on purpose (its callers are best-effort, and a
 * wrong project is worse than none), and it directs a caller that must fail on
 * "could not tell" to pass strict to resolveProgramProjectAnchor itself. AnA's
 * turn is such a caller: null lets it treat the program as having no project
 * records, while a failed lookup must be reported, never read as "nothing
 * recorded". This is that call, in one place, for the stream route and context
 * enrichment. An absent anchor column is still null (no anchor can exist), as
 * in resolveProgramProjectAnchor.
 */
export async function strictProjectRowForRef(
  /** The db, or a loader for it: only a program UUID needs a read. */
  db: RequestDb | (() => Promise<RequestDb>),
  params: { ref: unknown; orgId: number; context: string },
): Promise<number | null> {
  const asInteger = parseIntegerProjectId(params.ref);
  if (asInteger !== null) return asInteger;
  if (!looksLikeProgramUuid(params.ref)) return null;
  // A program is read inside its organization. With none, the lookup cannot be
  // made, which is "could not tell", not "no linked project".
  if (!Number.isSafeInteger(params.orgId) || params.orgId <= 0) {
    throw new Error('no organization to scope the program lookup');
  }
  const handle = typeof db === 'function' ? await db() : db;
  return resolveProgramProjectAnchor(handle, {
    programId: String(params.ref).trim().toLowerCase(),
    orgId: params.orgId,
    context: params.context,
    strict: true,
  });
}

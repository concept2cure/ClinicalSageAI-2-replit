/**
 * Vault saved views (D2, P-46; docs/design/VAULT_SAVED_VIEWS_2026-10-29.md R2).
 *
 * A saved view is a search remembered: the text, the metadata filters the
 * search already validates, earlier versions or not, and whether it is one
 * project's view or the library. It lives in the one saved-query store,
 * saved_precedent_queries, as surface 'vault'. It stores parameters only (the
 * database refuses a count or a run time, spq_vault_view_shape) and is never run
 * here: applying one sets the find view's state, and the existing search routes
 * run it under the reader's current access.
 *
 * Personal views ('private') are their owner's alone. Organisation views
 * ('org_public') are listed to every current member, a project view only to
 * members who can open that project. Who may change which is
 * savedViewAuthority (design §3.3, recorded under P-46). Every statement below
 * names the organisation, the surface and the owner arm literally; the guard
 * saved-view-store-predicates.test.ts holds that.
 *
 * A view is a preference, not a governed record (design §3.4): no chained audit
 * row. The creator, the last editor and the time stay on the row, and each
 * change is logged without its query text or filter values.
 *
 * @module server/services/vault/vault-saved-views
 */
import { z } from 'zod';
import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership.js';
import { hasOrganizationProjectManagementRole } from '../project-sharing-access.js';
import {
  parseProgramSearchFilters, parseVaultFilters, vaultFilterQuery,
  VAULT_FILTER_PARAMETER_NAMES, type VaultFilterRefusal,
} from './vault-document-filter.js';
import type { VaultViewId } from '../../../shared/constants/domain/vault-taxonomy.js';

type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

export type SavedViewVisibility = 'private' | 'org_public';
export type SavedViewFilters = Partial<Record<string, string[]>>;

export interface SavedViewActor { userId: number; role: string }

export interface SavedViewAuthority {
  mine: boolean;
  /** Replace the text, filters or earlier-versions choice. */
  canEdit: boolean;
  canRename: boolean;
  /** Personal → organisation, or organisation → personal. */
  canShare: boolean;
  canDelete: boolean;
}

/**
 * Who may do what to one view (design §3.3). A personal view is its owner's.
 * Publishing, and changing what a shared view selects, take a writing role and
 * are the creator's; a manager may rename or delete any organisation view; the
 * creator may always withdraw their own, whatever their current role.
 */
export function savedViewAuthority(row: { userId: number; visibility: SavedViewVisibility }, actor: SavedViewActor): SavedViewAuthority {
  const mine = row.userId === actor.userId;
  const writer = GOVERNED_WRITE_ROLES.has(actor.role);
  const manager = hasOrganizationProjectManagementRole(actor.role);
  if (row.visibility === 'private') {
    return { mine, canEdit: mine, canRename: mine, canShare: mine && writer, canDelete: mine };
  }
  return { mine, canEdit: mine && writer, canRename: (mine && writer) || manager, canShare: mine, canDelete: mine || manager };
}

/* ── Bodies ──────────────────────────────────────────────────────────────── */

const filtersSchema = z.record(z.string().max(64), z.array(z.string().max(200)).max(100));
const paramsShape = {
  q: z.string().trim().max(500),
  filters: filtersSchema,
  includeSuperseded: z.boolean(),
};
export const createSavedViewSchema = z.object({
  label: z.string().trim().min(1).max(120),
  visibility: z.enum(['private', 'org_public']),
  programId: z.string().uuid().nullable(),
  ...paramsShape,
}).strict();
export const patchSavedViewSchema = z.union([
  z.object({ label: z.string().trim().min(1).max(120) }).strict(),
  z.object({ visibility: z.enum(['private', 'org_public']) }).strict(),
  z.object(paramsShape).strict(),
]);
export type CreateSavedViewBody = z.infer<typeof createSavedViewSchema>;
export type PatchSavedViewBody = z.infer<typeof patchSavedViewSchema>;

/** A refusal the route answers with its own status. */
export class SavedViewRefusal extends Error {
  constructor(readonly status: 400 | 403 | 404 | 422, readonly code: string, message: string, readonly body: Record<string, unknown> = {}) {
    super(message);
    this.name = 'SavedViewRefusal';
  }
}

const UNSUPPORTED_PROGRAM_ID = 'A library view spans the projects you can access when it is run; it does not store a project list.';

/**
 * A view's parameters, checked by the search's own parsers, so a view can never
 * hold a filter the search would refuse; a refusal is the search's own object.
 * Returns the filters as the search's parameters, normalised.
 */
export async function validateViewParameters(input: {
  programId: string | null; q: string; filters: SavedViewFilters; resolveView: () => Promise<VaultViewId>;
}): Promise<SavedViewFilters> {
  // processingStatus is left to the parser, which refuses it by name exactly as
  // the search does, so the two answers are the same object.
  const unknown = Object.keys(input.filters).find((k) => k !== 'processingStatus' && !VAULT_FILTER_PARAMETER_NAMES.includes(k));
  if (unknown !== undefined) {
    throw new SavedViewRefusal(400, 'UNSUPPORTED_PARAMETER', unknown === 'programId' ? UNSUPPORTED_PROGRAM_ID : `'${unknown}' is not a Vault search filter.`, { parameter: unknown });
  }
  const parsed = input.programId
    ? await parseProgramSearchFilters(input.filters, input.resolveView)
    : parseVaultFilters(input.filters);
  if ('refusal' in parsed) {
    throw new SavedViewRefusal(400, parsed.refusal.error, parsed.refusal.message, { ...parsed.refusal });
  }
  const filters = vaultFilterQuery(parsed.filters);
  if (!input.q && Object.keys(filters).length === 0) {
    throw new SavedViewRefusal(422, 'EMPTY_VIEW', 'A view with no search text and no filter selects nothing, so it was not saved.');
  }
  return filters;
}

/* ── The wire shape ──────────────────────────────────────────────────────── */

export type SavedVaultView = {
  id: number; label: string; visibility: SavedViewVisibility; programId: string | null;
  q: string; filters: SavedViewFilters; includeSuperseded: boolean;
  createdBy: { userId: number; name: string | null };
  updatedBy: { userId: number; name: string | null } | null;
  createdAt: string; updatedAt: string;
} & SavedViewAuthority & ({ applies: true } | { applies: false; refusal: VaultFilterRefusal });

const UNREADABLE: VaultFilterRefusal = { error: 'INVALID_FILTER', parameter: 'scope', message: "This view's stored parameters cannot be read." };

function iso(v: unknown): string {
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

function storedScope(raw: unknown): { filters: SavedViewFilters; includeSuperseded: boolean } | null {
  const scope = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null;
  const filters = scope?.filters;
  if (!scope || !filters || typeof filters !== 'object' || Array.isArray(filters) || typeof scope.includeSuperseded !== 'boolean') return null;
  return { filters: filters as SavedViewFilters, includeSuperseded: scope.includeSuperseded };
}

/** Does a stored view still apply? The same parser the search runs; stored values are never rewritten. */
async function applicability(programId: string | null, filters: SavedViewFilters, resolveView: () => Promise<VaultViewId>): Promise<{ applies: true } | { applies: false; refusal: VaultFilterRefusal }> {
  const parsed = programId ? await parseProgramSearchFilters(filters, resolveView) : parseVaultFilters(filters);
  return 'refusal' in parsed ? { applies: false, refusal: parsed.refusal } : { applies: true };
}

const LIST_SQL = `SELECT v.id, v.label, v.query, v.scope, v.visibility, v.program_id::text AS program_id,
       v.user_id, v.updated_by, v.created_at, v.updated_at,
       COALESCE(c.name, c.email) AS created_by_name,
       COALESCE(u.name, u.email) AS updated_by_name
  FROM saved_precedent_queries v
  LEFT JOIN LATERAL public.actor_name(v.user_id) c ON TRUE
  LEFT JOIN LATERAL public.actor_name(v.updated_by) u ON TRUE
 WHERE v.organization_id = $1 AND v.surface = 'vault'
   AND (v.visibility = 'org_public' OR v.user_id = $2)
   AND (v.program_id IS NULL OR v.program_id = $3::uuid)
   AND ($4::int IS NULL OR v.id = $4)
 ORDER BY (v.visibility = 'private') DESC, lower(v.label), v.id`;

/**
 * The views a member sees with one project open: the library views and that
 * project's views, personal ones only their owner's. One statement serves the
 * list and the re-read after a change (`viewId`), so there is one wire mapper.
 */
export async function listSavedViews(q: Queryable, input: {
  /** The open project; null re-reads a library view by id. */
  organizationId: number; actor: SavedViewActor; programId: string | null; viewId?: number;
  resolveView: () => Promise<VaultViewId>;
}): Promise<SavedVaultView[]> {
  const { rows } = await q.query(LIST_SQL, [input.organizationId, input.actor.userId, input.programId, input.viewId ?? null]);
  // The project's cabinet is read at most once, and only if a stored view holds a folder.
  let view: Promise<VaultViewId> | null = null;
  const resolveOnce = () => (view ??= input.resolveView());
  const out: SavedVaultView[] = [];
  for (const r of rows) {
    const scope = storedScope(r.scope);
    const programId = (r.program_id as string | null) ?? null;
    const authority = savedViewAuthority({ userId: Number(r.user_id), visibility: r.visibility as SavedViewVisibility }, input.actor);
    const state = scope ? await applicability(programId, scope.filters, resolveOnce) : { applies: false as const, refusal: UNREADABLE };
    out.push({
      id: Number(r.id), label: String(r.label), visibility: r.visibility as SavedViewVisibility, programId,
      q: String(r.query ?? ''), filters: scope?.filters ?? {}, includeSuperseded: scope?.includeSuperseded ?? false,
      createdBy: { userId: Number(r.user_id), name: (r.created_by_name as string | null) ?? null },
      updatedBy: r.updated_by == null ? null : { userId: Number(r.updated_by), name: (r.updated_by_name as string | null) ?? null },
      createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
      ...authority, ...state,
    });
  }
  return out;
}

const INSERT_SQL = `INSERT INTO saved_precedent_queries
       (organization_id, user_id, surface, visibility, program_id, label, query, scope, hits, updated_by)
VALUES ($1, $2, 'vault', $3, $4::uuid, $5, $6, $7::jsonb, -1, $2)
RETURNING id`;

/** Store a view whose parameters validateViewParameters has already admitted. */
export async function insertSavedView(q: Queryable, input: {
  organizationId: number; actor: SavedViewActor; body: CreateSavedViewBody; filters: SavedViewFilters;
}): Promise<number> {
  if (input.body.visibility === 'org_public' && !GOVERNED_WRITE_ROLES.has(input.actor.role)) {
    throw new SavedViewRefusal(403, 'SAVED_VIEW_PUBLISH_DENIED', 'Your role can save views for yourself only. Nothing was saved.');
  }
  const scope = { v: 1, filters: input.filters, includeSuperseded: input.body.includeSuperseded };
  const { rows } = await q.query(INSERT_SQL, [
    input.organizationId, input.actor.userId, input.body.visibility, input.body.programId,
    input.body.label, input.body.q, JSON.stringify(scope),
  ]);
  return Number(rows[0].id);
}

const PRE_READ_SQL = `SELECT id, user_id, visibility, program_id::text AS program_id, scope
  FROM saved_precedent_queries
 WHERE id = $1 AND organization_id = $2 AND surface = 'vault'
   AND (visibility = 'org_public' OR user_id = $3)
   FOR UPDATE`;

export interface SavedViewRow { id: number; userId: number; visibility: SavedViewVisibility; programId: string | null }

/** The row an actor may see, locked for a change. Anything else is not found. */
export async function lockSavedView(q: Queryable, input: { organizationId: number; actor: SavedViewActor; viewId: number }): Promise<SavedViewRow> {
  const { rows } = await q.query(PRE_READ_SQL, [input.viewId, input.organizationId, input.actor.userId]);
  const r = rows[0];
  if (!r) throw new SavedViewRefusal(404, 'SAVED_VIEW_NOT_FOUND', 'No such saved view.');
  return { id: Number(r.id), userId: Number(r.user_id), visibility: r.visibility as SavedViewVisibility, programId: (r.program_id as string | null) ?? null };
}

const NOT_YOURS = 'Only the person who saved this view, or an organisation manager for a rename or delete, can change it. Nothing was changed.';

const RENAME_SQL = `UPDATE saved_precedent_queries SET label = $4, updated_by = $3, updated_at = now()
 WHERE id = $1 AND organization_id = $2 AND surface = 'vault'
   AND ((user_id = $3 AND (visibility = 'private' OR $5::boolean))
        OR (visibility = 'org_public' AND $6::boolean))
RETURNING id`;
const REPLACE_SQL = `UPDATE saved_precedent_queries SET query = $4, scope = $5::jsonb, updated_by = $3, updated_at = now()
 WHERE id = $1 AND organization_id = $2 AND surface = 'vault'
   AND user_id = $3 AND (visibility = 'private' OR $6::boolean)
RETURNING id`;
const SHARE_SQL = `UPDATE saved_precedent_queries SET visibility = $4, updated_by = $3, updated_at = now()
 WHERE id = $1 AND organization_id = $2 AND surface = 'vault'
   AND user_id = $3 AND ($4::text = 'private' OR $5::boolean)
RETURNING id`;
const DELETE_SQL = `DELETE FROM saved_precedent_queries
 WHERE id = $1 AND organization_id = $2 AND surface = 'vault'
   AND (user_id = $3 OR (visibility = 'org_public' AND $4::boolean))
RETURNING id`;

/**
 * One change to a locked row. Authority is checked first, for a precise answer,
 * then repeated inside the statement as bound booleans, so a role change between
 * the two cannot widen it: zero rows is a refusal, never a silent success.
 */
export async function changeSavedView(q: Queryable, input: {
  organizationId: number; actor: SavedViewActor; row: SavedViewRow; body: PatchSavedViewBody;
  /** For a parameter change: the filters validateViewParameters admitted. */
  filters?: SavedViewFilters;
}): Promise<'rename' | 'share' | 'parameters'> {
  const { row, actor, body } = input;
  const can = savedViewAuthority(row, actor);
  const writer = GOVERNED_WRITE_ROLES.has(actor.role);
  const manager = hasOrganizationProjectManagementRole(actor.role);
  const base = [row.id, input.organizationId, actor.userId];
  let kind: 'rename' | 'share' | 'parameters';
  let result: { rows: Array<Record<string, unknown>> };
  if ('label' in body) {
    if (!can.canRename) throw new SavedViewRefusal(403, 'SAVED_VIEW_NOT_YOURS', NOT_YOURS);
    kind = 'rename';
    result = await q.query(RENAME_SQL, [...base, body.label, writer, manager]);
  } else if ('visibility' in body) {
    if (body.visibility === 'org_public' && row.visibility === 'private' && row.userId === actor.userId && !writer) {
      throw new SavedViewRefusal(403, 'SAVED_VIEW_PUBLISH_DENIED', 'Your role can save views for yourself only. Nothing was changed.');
    }
    if (!can.canShare) throw new SavedViewRefusal(403, 'SAVED_VIEW_NOT_YOURS', NOT_YOURS);
    kind = 'share';
    result = await q.query(SHARE_SQL, [...base, body.visibility, writer]);
  } else {
    if (!can.canEdit) throw new SavedViewRefusal(403, 'SAVED_VIEW_NOT_YOURS', NOT_YOURS);
    kind = 'parameters';
    const scope = { v: 1, filters: input.filters ?? {}, includeSuperseded: body.includeSuperseded };
    result = await q.query(REPLACE_SQL, [...base, body.q, JSON.stringify(scope), writer]);
  }
  if (!result.rows[0]) throw new SavedViewRefusal(403, 'SAVED_VIEW_NOT_YOURS', NOT_YOURS);
  return kind;
}

/** Delete a locked row, with the same double check. */
export async function deleteSavedView(q: Queryable, input: { organizationId: number; actor: SavedViewActor; row: SavedViewRow }): Promise<void> {
  const can = savedViewAuthority(input.row, input.actor);
  if (!can.canDelete) throw new SavedViewRefusal(403, 'SAVED_VIEW_NOT_YOURS', NOT_YOURS);
  const manager = hasOrganizationProjectManagementRole(input.actor.role);
  const { rows } = await q.query(DELETE_SQL, [input.row.id, input.organizationId, input.actor.userId, manager]);
  if (!rows[0]) throw new SavedViewRefusal(403, 'SAVED_VIEW_NOT_YOURS', NOT_YOURS);
}

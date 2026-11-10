/**
 * The governed artifact registry's one read (fold F3 slice A, D2, 2026-10-29).
 *
 * The Vault lists concept2cure_artifacts with their governance state twice:
 * each project's "Governed artifacts" branch, every artifact of the project
 * (GET /api/c2c/project-vault/:id), and its organization view, every artifact
 * of the projects the caller can open (GET /api/artifacts-center, the retired
 * Artifacts center's read, fold F3 slice C). This query was the Artifacts
 * center's own (artifacts-center-routes.ts:187-298 at 8b3ee4b57). It moved
 * here so both read the same rows the same way, never a second copy of the
 * signature, review and source sub-reads.
 *
 * Scope, all bound, nothing interpolated:
 *   $1 organization: the caller's integer organization. Repeated on projects,
 *      so an artifact written under another organization's project id never
 *      shows that project (PF-03).
 *   $2 program: a regulatory_programs.id the caller has been admitted to (the
 *      project Vault), or null. The row must reach the program through
 *      projects.regulatory_program_id on a project of the same organization.
 *   $3 projects: the projects.id list the sharing policy admits the caller to
 *      (getAccessibleReportProjectIds; the Vault's organization view), or null.
 *      The row's own project must be one of them, on the same organization.
 *   $4 limit: a window. `total_rows` is counted before the limit, so a window
 *      can say how much it did not list.
 * Exactly one of program and projects is given; there is no organization-wide
 * read (fold F3 slice C, 2026-10-29: the Artifacts center's gallery listed
 * every artifact of the organization to any member, and retired into the
 * Vault's organization view, which lists only the projects the caller can
 * open). Archived artifacts are left out in both scopes.
 *
 * Field sources (concept2cure_artifacts a):
 *   kind_source ← COALESCE(metadata->>'documentType', type)
 *   model       ← metadata->>'model' | 'modelTier' | 'aiModel', else null (never invented)
 *   is_signed   ← an active concept2cure_signatures row of this organization (any version)
 *   signed_version ← the version the newest active signature covers
 *   is_reviewed ← an 'approve' review decision on the CURRENT version
 *   source_count ← metadata.sourceArtifactIds when it is an array, else 0
 *   compiled_from / recorded_source ← metadata, for the recorded origin
 *   author_name ← public.actor_name(created_by_id), which still names a person who has left
 *
 * metadata is `json`, not jsonb, so only json operators and functions are used
 * on it (scripts/ci/check-json-operator-types.mjs).
 */
import { pool } from '../db.js';
import { normalizeCtdCode } from '../../shared/regulatory/section-code.js';
import {
  artifactOrigin,
  artifactSignatureFacts,
  artifactSignatureState,
  type ArtifactOrigin,
  type ArtifactSignatureState,
} from '../../shared/artifact-governance.js';
import { ProgramReadAccessError } from './c2c/current-program-access.js';

/** A sponsor (client workspace) as a governed artifact names it. */
export type ArtifactSponsor = { id: number; name: string };

/** The sponsor named as the organisation records it, or none; a sponsor that cannot be named is a failure, never none. */
export function artifactSponsor(id: number | string | null | undefined, name: string | null | undefined): ArtifactSponsor | null {
  if (id === null || id === undefined) return null;
  if (typeof name !== 'string' || !name.trim()) throw new Error('A sponsor of an accessible project could not be named.');
  return { id: Number(id), name };
}

type ProjectSponsorRow = { id: number; program_id: string | null; client_workspace_id: number | null; client_name: string | null };
const workspaceOf = (r: { client_workspace_id: number | null }): number | null => (r.client_workspace_id == null ? null : Number(r.client_workspace_id));

/** Each of these projects with its sponsor (client workspace), as the organisation records them. */
async function readProjectSponsors(orgId: number, projectIds: readonly number[]): Promise<ProjectSponsorRow[]> {
  const { rows } = await pool.query<ProjectSponsorRow>(
    `SELECT p.id, p.regulatory_program_id::text AS program_id, p.client_workspace_id, cw.name AS client_name
       FROM projects p
       LEFT JOIN client_workspaces cw ON cw.id = p.client_workspace_id AND cw.organization_id = p.organization_id
      WHERE p.organization_id = $1 AND p.id = ANY($2::int[])`,
    [orgId, [...projectIds]],
  );
  return rows;
}

/** A sponsor asked for by a listing with no project open: a client workspace id, or the projects with no client. */
export type AskedSponsor = number | 'none';

const PROJECT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const textOf = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '');

/** `client`: undefined when not asked, the client workspace id or 'none' (the projects with no client), null when neither. */
function askedSponsorOf(raw: unknown): AskedSponsor | undefined | null {
  const value = textOf(raw);
  if (!value) return undefined;
  if (value === 'none') return 'none';
  return /^[1-9][0-9]{0,9}$/.test(value) ? Number(value) : null;
}

/** How a read with no single project is scoped to one sponsor: by the open project, by a client, or by neither. */
export type SponsorAsk = { sameClientAs: string | null; client: AskedSponsor | undefined };

/**
 * The sponsor scope a request asks for, the same words for every read that takes one (the governed-artifacts listing,
 * the library search): `sameClientAs` is the open project's id, `client` a client id or "none"; never both. `what`
 * names the read in the refusal ("listing", "library").
 */
export function askedSponsorScope(query: { sameClientAs?: unknown; client?: unknown }, what: string): SponsorAsk | { refusal: { error: string; message: string } } {
  const sameClientAs = textOf(query.sameClientAs) || null;
  if (sameClientAs && !PROJECT_UUID.test(sameClientAs)) {
    return { refusal: { error: 'INVALID_PROJECT', message: `The project the ${what} is scoped by must be a project id.` } };
  }
  const client = askedSponsorOf(query.client);
  if (client === null || (client !== undefined && sameClientAs)) {
    return { refusal: { error: 'INVALID_CLIENT', message: `The ${what} is scoped by one client (a client id, or "none"), or by the open project, never both.` } };
  }
  return { sameClientAs, client };
}

/** Refused: these projects belong to more than one sponsor, and none was named. `clients` are the choices; null is "no client". */
export class ClientRequiredError extends ProgramReadAccessError {
  constructor(readonly clients: Array<ArtifactSponsor | null>) {
    super(409, 'CLIENT_REQUIRED', 'Your projects belong to more than one client. Choose a client first: the Vault lists one client’s records at a time.');
    this.name = 'ClientRequiredError';
  }
}

/**
 * One sponsor at a time (P-107 item 3, 2026-11-08: "No cross-sponsor library view for a CRO. With no project open,
 * the Vault first asks which sponsor; every view is inside one sponsor."). The listing with no project open named each
 * row's sponsor and listed every sponsor's together.
 *
 * - Projects of one sponsor (or all with none) need no choice and are returned as they are.
 * - Projects of more than one, with none asked for, are refused (ClientRequiredError), naming the choices.
 * - With one asked for, only its projects are returned. A sponsor none of whose projects are among these is not
 *   found, as one that does not exist is. The projects with no client are their own choice ('none').
 * The narrowing only ever removes projects the caller can open.
 */
export async function narrowToOneSponsor(orgId: number, projectIds: readonly number[], asked: AskedSponsor | undefined): Promise<{
  projectIds: number[]; client?: ArtifactSponsor | null;
}> {
  if (projectIds.length === 0 && asked === undefined) return { projectIds: [] };
  const rows = await readProjectSponsors(orgId, projectIds);
  const groups = new Map<number | null, ProjectSponsorRow[]>();
  for (const row of rows) groups.set(workspaceOf(row), [...(groups.get(workspaceOf(row)) ?? []), row]);
  if (asked === undefined) {
    if (groups.size <= 1) return { projectIds: rows.map((r) => Number(r.id)) };
    throw new ClientRequiredError(sponsorChoices([...groups.entries()].map(([id, own]) => artifactSponsor(id, own[0].client_name))));
  }
  const own = groups.get(asked === 'none' ? null : asked);
  if (!own) throw new ProgramReadAccessError(404, 'CLIENT_NOT_FOUND', 'Client not found.');
  return { projectIds: own.map((r) => Number(r.id)), client: artifactSponsor(workspaceOf(own[0]), own[0].client_name) };
}

/** The sponsors to choose from, by name, with "no client" (null) last. */
export function sponsorChoices(sponsors: ReadonlyArray<ArtifactSponsor | null>): Array<ArtifactSponsor | null> {
  const named = sponsors.filter((sponsor): sponsor is ArtifactSponsor => sponsor !== null).sort((a, b) => a.name.localeCompare(b.name));
  return sponsors.includes(null) ? [...named, null] : named;
}

/**
 * A refusal that names a sponsor, as the response a route sends: the clients to choose from when one must be chosen
 * (in the envelope's `meta`, where the screen that asked reads them; null is "no client"), or that the one asked for
 * was not found. Null for any other failure, which the route answers in its own way (the Vault's project routes
 * answer every 404 as a project not found, so this one is sent before that).
 */
export function sponsorRefusal(err: unknown): { status: number; body: { success: false; error: string; message: string; meta?: { clients: Array<ArtifactSponsor | null> } } } | null {
  if (err instanceof ClientRequiredError) return { status: err.status, body: { success: false, error: err.code, message: err.message, meta: { clients: err.clients } } };
  if (err instanceof ProgramReadAccessError && err.code === 'CLIENT_NOT_FOUND') return { status: err.status, body: { success: false, error: err.code, message: err.message } };
  return null;
}

/**
 * A CRO's sponsors never mix (F1, S6 V4, 2026-11-05). A CRO is one organisation working for several sponsors, each a
 * client workspace, and the Vault's organization view named only each artifact's project, so inside sponsor A's
 * project its "governed artifacts across your projects" listed sponsor B's too. Asked from inside a project, the
 * accessible projects are narrowed to that project's sponsor's, read from the organisation's own project records; the
 * narrowing only ever removes projects the caller can open. A project outside them is not found.
 *
 * `open` is the open project: its regulatory program uuid (the Vault's `sameClientAs`) or its `projects.id` (AnA's
 * reads, where a legacy project has no program). Moved here from routes/artifacts-center-routes.ts (F1, 2026-11-05)
 * so AnA's governed-artifact tools narrow the same way, never a second copy.
 */
export async function narrowToSponsorOf(orgId: number, projectIds: readonly number[], open: string | number): Promise<{ projectIds: number[]; client: ArtifactSponsor | null }> {
  const rows = await readProjectSponsors(orgId, projectIds);
  const isOpen = (r: { id: number; program_id: string | null }) =>
    (typeof open === 'number' ? Number(r.id) === open : (r.program_id ?? '').toLowerCase() === open.toLowerCase());
  const own = rows.filter(isOpen);
  if (own.length === 0) throw new ProgramReadAccessError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  if (new Set(own.map(workspaceOf)).size !== 1) {
    throw new ProgramReadAccessError(409, 'PROJECT_ANCHOR_UNRESOLVED', 'This project needs one verified tracking record before its records can be supplied.');
  }
  const sponsor = workspaceOf(own[0]);
  return { projectIds: rows.filter((r) => workspaceOf(r) === sponsor).map((r) => Number(r.id)), client: artifactSponsor(sponsor, own[0].client_name) };
}

/** One registry row as the read projects it. */
export interface ArtifactRegistryRow {
  id: number | string;
  artifact_id: string;
  title: string | null;
  type: string | null;
  category: string | null;
  ctd_section: string | null;
  status: string | null;
  version: number | string | null;
  updated_at: Date | string | null;
  project_id: number | string | null;
  content_hash: string | null;
  kind_source: string | null;
  content_bytes: number | string | null;
  model: string | null;
  compiled_from: string | null;
  recorded_source: string | null;
  program: string | null;
  /** The project's sponsor (client workspace), and its name, as the organisation records them (F1, S6 V4). */
  client_workspace_id: number | string | null;
  client_name: string | null;
  author_name: string | null;
  is_signed: boolean;
  is_reviewed: boolean;
  source_count: number | string | null;
  signed_version: number | string | null;
  /** Every row the scope matches, counted before the limit. */
  total_rows: number | string | null;
}

/** One project's Vault (a program the caller was admitted to), or the projects the caller can open. */
export type ArtifactRegistryScope =
  | { organizationId: number; programId: string; projectIds?: undefined; limit: number }
  | { organizationId: number; programId?: undefined; projectIds: readonly number[]; limit: number };

export async function readArtifactRegistry(scope: ArtifactRegistryScope): Promise<ArtifactRegistryRow[]> {
  const programId = typeof scope.programId === 'string' && scope.programId ? scope.programId : null;
  const projectIds = Array.isArray(scope.projectIds) ? scope.projectIds : null;
  if ((programId === null) === (projectIds === null)) {
    // Fail closed: neither scope would read the whole organization, both would widen one.
    throw new Error('readArtifactRegistry needs exactly one of programId and projectIds');
  }
  // An admitted caller with no project open to them has nothing to read.
  if (projectIds && projectIds.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT
       a.id                                            AS id,
       a.artifact_id                                   AS artifact_id,
       a.title                                         AS title,
       a.type                                          AS type,
       a.category                                      AS category,
       a.ctd_section                                   AS ctd_section,
       a.status                                        AS status,
       a.version                                       AS version,
       a.updated_at                                    AS updated_at,
       a.project_id                                    AS project_id,
       a.content_hash                                  AS content_hash,
       COALESCE(a.metadata ->> 'documentType', a.type) AS kind_source,
       octet_length(a.content)                         AS content_bytes,
       COALESCE(
         a.metadata ->> 'model',
         a.metadata ->> 'modelTier',
         a.metadata ->> 'aiModel'
       )                                               AS model,
       a.metadata ->> 'compiledFrom'                   AS compiled_from,
       a.metadata ->> 'source'                         AS recorded_source,
       COALESCE(p.code, p.name)                        AS program,
       p.client_workspace_id                           AS client_workspace_id,
       cw.name                                         AS client_name,
       COALESCE(au.name, au.email)                     AS author_name,
       EXISTS (
         SELECT 1
           FROM concept2cure_signatures s
          WHERE s.artifact_id = a.id
            AND s.organization_id = a.organization_id
            AND s.status = 'active'
       )                                               AS is_signed,
       EXISTS (
         SELECT 1 FROM concept2cure_review_decisions d
          WHERE d.artifact_id = a.id
            AND d.organization_id = a.organization_id
            AND d.decision = 'approve'
            AND d.version_reviewed = a.version
       )                                               AS is_reviewed,
       CASE
         WHEN json_typeof(a.metadata -> 'sourceArtifactIds') = 'array'
         THEN json_array_length(a.metadata -> 'sourceArtifactIds')
         ELSE 0
       END                                             AS source_count,
       /* Which version the newest active signature covers. is_signed above
          is EXISTS-any: it says a signature exists, not that it covers what
          is on file now. Version content is immutable (an edit mints a new
          version), so an older signature is not invalid; it covers earlier
          bytes, and the number is what lets a reader say so. */
       (
         SELECT v.version
           FROM concept2cure_signatures s
           JOIN concept2cure_artifact_versions v ON v.id = s.artifact_version_id
          WHERE s.artifact_id = a.id
            AND s.organization_id = a.organization_id
            AND s.status = 'active'
          ORDER BY s.id DESC
          LIMIT 1
       )                                               AS signed_version,
       (COUNT(*) OVER ())::int                         AS total_rows
     FROM concept2cure_artifacts a
     LEFT JOIN projects p ON p.id = a.project_id AND p.organization_id = a.organization_id
     LEFT JOIN client_workspaces cw ON cw.id = p.client_workspace_id AND cw.organization_id = a.organization_id
     LEFT JOIN LATERAL public.actor_name(a.created_by_id) au ON TRUE
     WHERE a.organization_id = $1
       AND a.status <> 'archived'
       AND (
         ($2::uuid IS NOT NULL AND p.regulatory_program_id = $2::uuid)
         OR ($3::int[] IS NOT NULL AND p.id = ANY($3::int[]))
       )
     ORDER BY a.updated_at DESC, a.id DESC
     LIMIT $4`,
    [scope.organizationId, programId, projectIds ? [...projectIds] : null, scope.limit],
  );
  return rows as ArtifactRegistryRow[];
}

/** 'regulatory_document' → 'Regulatory document'; an explicit documentType passes through. */
export function humanizeArtifactKind(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return 'Document';
  const normalized = s.replace(/[_-]+/g, ' ').trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/**
 * The format key from the real category. These artifacts are editable text
 * (no rendered file is stored); the writeback paths produce
 * category='document', which opens to edit as 'docx'. A derivation from the
 * column, not a per-row format the data cannot support.
 */
export function deriveArtifactFormat(category: string | null | undefined): string {
  const c = (category ?? '').toLowerCase().trim();
  if (!c || c === 'document') return 'docx';
  return c;
}

/*
 * One row's section, status and size, said the same way in both views (fold
 * F3 slice B, 2026-10-29). Both export one CSV manifest of these rows (client
 * artifactManifest.ts), so a row must not read one way in a project's Vault and
 * another in its organization view (the Artifacts center's gallery until slice
 * C). Moved here, not copied: the size formatter
 * was the Artifacts center's (formatBytes), the status mapping the Vault
 * branch's (artifactLeafStatus), the section rule the Vault leaf's.
 */

/** The row's CTD section in canonical form, or the recorded text when it is not a code; null when none. */
export function artifactCtdSection(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() || null;
  return normalizeCtdCode(trimmed) ?? trimmed;
}

/**
 * The registry's status in the Vault chip's vocabulary. An unrecognised value
 * is passed through, and the chip says "Status unavailable" rather than a
 * status nobody recorded.
 */
export function artifactRegistryStatus(raw: string | null | undefined): string {
  switch (raw) {
    case 'draft': return 'draft';
    case 'review': return 'review';
    case 'approved': return 'approved';
    case 'locked': return 'final';
    default: return raw || 'unknown';
  }
}

/** Human byte size of the STORED content (octet_length), not of a rendered file: '182 KB', '1.4 MB'. */
export function formatContentBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** What both screens show of one row's governance. */
export interface ArtifactGovernance {
  kind: string;
  fmt: string;
  model: string | null;
  sig: boolean;
  sigVersion: number | null;
  sigStale: boolean | null;
  signature: ArtifactSignatureState;
  reviewed: boolean;
  sourceCount: number;
  origin: ArtifactOrigin | null;
}

export function artifactGovernance(row: ArtifactRegistryRow): ArtifactGovernance {
  const facts = artifactSignatureFacts({ isSigned: row.is_signed, signedVersion: row.signed_version, version: row.version });
  const model = row.model ?? null;
  return {
    kind: humanizeArtifactKind(row.kind_source ?? row.type),
    fmt: deriveArtifactFormat(row.category),
    model,
    ...facts,
    signature: artifactSignatureState(facts),
    reviewed: row.is_reviewed === true,
    sourceCount: Number(row.source_count) || 0,
    origin: artifactOrigin({
      compiledFrom: row.compiled_from,
      type: row.type,
      category: row.category,
      recordedSource: row.recorded_source,
      model,
    }),
  };
}

/**
 * AnA over the data catalog (S2 step 4; the founder, 2026-11-06: "Anna needs to have autonomous control over
 * all of this, of course, agentically"). Split out of document-catalog-tools.ts: list_project_documents with
 * `catalog: true`.
 *
 * The same read, scope and grade as Vault → Data catalog (GET /api/c2c/projects/:id/sources?scope=catalog):
 *   - the projects are the person's verified accessible projects of the open project's sponsor
 *     (catalogProgramIds), never ones the model names;
 *   - the rows are searchDataRoom's, with the person's readable-source scope;
 *   - each grade is data-room-grade.ts's, a deterministic engine over recorded facts (RULE 2): AnA reports it
 *     and its basis, it never sets or adjusts one;
 *   - whether the project already uses a capture is read from c2c_project_pinned_evidence.
 *
 * Acting on it stays with the person or the existing governed tools: AnA proposes "Use in this project" (the
 * person presses it in the catalog), and files a capture into Vault with file_chat_upload_to_vault's
 * `source_id`, which lands suggested for a person to confirm.
 */
import type { ProgramAccessExecutor } from '../c2c/current-program-access.js';
import type { ToolContext } from './AnaToolExecutor.js';
import { requireDocumentAccess } from './document-tools-shared.js';
import { catalogScope } from './catalog-scope.js';
import { NATIVE_RECORD_ORIGIN, NATIVE_RECORD_REVISION } from '../clinical-regulatory-evidence/record-source.js';

/** The tool's own refusal, as the catalog tools say one. */
const refusal = (r: { refusal?: string; error?: string; code?: string }) =>
  JSON.stringify({ ok: false, error: r.refusal ?? r.error, ...(r.code ? { code: r.code } : {}) });

/** list_project_documents with catalog:true: the person's access and open project first, then the catalog. */
export async function dataCatalogTool(input: Record<string, unknown>, ctx?: ToolContext): Promise<string> {
  const gate = await requireDocumentAccess(ctx, 'list_project_documents');
  if ('refusal' in gate) return refusal(gate);
  const scope = await catalogScope(ctx, gate.orgId, null, 'read');
  if ('error' in scope) return refusal(scope);
  return listDataCatalogForAna(input, { programId: scope.programId, userId: scope.admittedScope.userId, orgId: gate.orgId, executor: scope.executor });
}

/** file_chat_upload_to_vault with source_id: the person's access and open project first, then the data room's filing. */
export async function fileDataRoomSourceTool(input: Record<string, unknown>, ctx?: ToolContext): Promise<string> {
  const gate = await requireDocumentAccess(ctx, 'file_chat_upload_to_vault');
  if ('refusal' in gate) return refusal(gate);
  const scope = await catalogScope(ctx, gate.orgId, null, 'file');
  if ('error' in scope) return refusal(scope);
  return fileDataRoomSourceForAna(input.source_id, { organizationId: gate.orgId, userId: ctx?.userId ?? null, programId: scope.programId! });
}

const CATALOG_LIMIT = 50;

/** A grade as AnA reads it: the letter, the score, any cap, and each criterion's fact in one line. */
function gradeForAna(g: { grade: string; score: number; cap: string | null; basis: Array<{ criterion: string; points: number | null; max: number; detail: string }> } | undefined) {
  if (!g) return null;
  return {
    grade: g.grade, score: g.score, cap: g.cap,
    basis: g.basis.map((b) => `${b.criterion} ${b.points === null ? 'n/a' : `${b.points}/${b.max}`}: ${b.detail}`),
  };
}

/** Display only: searchDataRoom already admits and rechecks the native receipt.
 * Match the UI's nativeRecord shape, without inferring scope from capture placement. */
function nativeRecordForAna(provenance: Record<string, any>, version: unknown) {
  if (provenance.origin !== NATIVE_RECORD_ORIGIN) return null;
  const record = provenance.recordSnapshot;
  const native = record?.native;
  if (![record, native].every(v => v && typeof v === 'object' && !Array.isArray(v))) return null;
  if (record.version !== 1 || record.renderer !== NATIVE_RECORD_REVISION || record.workArea !== 'quality'
    || !['project', 'organization'].includes(record.sourceScope)
    || ![native.kind, native.id, record.lifecycle].every(v => typeof v === 'string' && v.trim())
    || (version != null && typeof version !== 'string')) return null;
  return { workArea: record.workArea, sourceScope: record.sourceScope, kind: native.kind,
    id: native.id, lifecycle: record.lifecycle, version: version ?? null };
}

/**
 * The narrowings the model may ask for, each beside the catalog parameter it becomes; the catalog's own parser checks
 * every one. `filed_in` is the catalog's Vault-folder narrowing. It is not named `folder`: this tool is one a
 * sub-agent is offered, and no input of such a tool is named for a path, a directory or a folder
 * (__tests__/sub-agent-toolset.test.ts).
 */
const CATALOG_NARROWINGS = { query: 'q', kind: 'kind', ctd: 'ctd', filed_in: 'folder', project: 'project', study: 'study' } as const;

function catalogQuery(input: Record<string, unknown>): Record<string, unknown> {
  const raw: Record<string, unknown> = { limit: String(Math.min(CATALOG_LIMIT, Math.max(1, Math.floor(Number(input.limit) || 25)))) };
  for (const [key, parameter] of Object.entries(CATALOG_NARROWINGS)) {
    if (typeof input[key] === 'string' || typeof input[key] === 'number') raw[parameter] = String(input[key]);
  }
  return raw;
}

/** Which captures this project already uses, by source id. */
async function usedSourceIds(q: ProgramAccessExecutor, programId: string): Promise<Set<number>> {
  const { rows } = await q.query(
    `SELECT evidence_ref FROM c2c_project_pinned_evidence WHERE project_id = $1 AND evidence_kind = 'data_room'`,
    [programId],
  );
  return new Set(rows.map((r) => Number(r.evidence_ref)).filter(Number.isSafeInteger));
}

/**
 * The data catalog for the open project's person, as list_project_documents answers it with `catalog: true`.
 * Returns the JSON string the tool returns.
 */
export async function listDataCatalogForAna(
  input: Record<string, unknown>,
  scope: { programId: string | null; userId: number | undefined; orgId: number; executor: ProgramAccessExecutor },
): Promise<string> {
  if (!scope.programId) {
    return JSON.stringify({ ok: false, code: 'NO_PROJECT', error: 'The data catalog is read from an open project (it spans that project’s sponsor). Ask the user to open a project.' });
  }
  const { parseDataRoomQuery, searchDataRoom, catalogProgramIds, DataRoomQueryError } = await import('../clinical-regulatory-evidence/data-room-search.js');
  const { gradeSources } = await import('../clinical-regulatory-evidence/data-room-grade.js');
  let query;
  try {
    query = parseDataRoomQuery(scope.programId, catalogQuery(input));
  } catch (e) {
    if (e instanceof DataRoomQueryError) return JSON.stringify({ ok: false, code: 'INVALID_CATALOG_QUERY', error: e.message });
    throw e;
  }
  const identity = { organizationId: scope.orgId, userId: scope.userId };
  query.programIds = await catalogProgramIds(identity, scope.programId);
  if (query.project && !query.programIds.includes(query.project)) {
    return JSON.stringify({ ok: false, code: 'PROJECT_NOT_IN_CATALOG', error: 'That project is not in this person’s catalog for the open project.' });
  }
  const page = await searchDataRoom(scope.orgId, query, { userId: scope.userId });
  const grades = await gradeSources(scope.executor, page.sources.map((s) => ({ ...s, organizationId: Number(s.organizationId) })));
  const used = await usedSourceIds(scope.executor, scope.programId);
  const items = page.sources.map((s) => {
    const meta = (s.metadata ?? {}) as Record<string, any>;
    const prov = (s.provenance ?? {}) as Record<string, any>;
    return {
      sourceId: s.id,
      title: s.title,
      project: s.projectName, projectId: s.clientProgramId,
      study: s.studyName,
      kind: meta.dossier?.evidenceKind ?? null,
      nativeRecord: nativeRecordForAna(prov, s.version),
      ctdSection: meta.dossier?.ctdSection ?? null,
      proposedFolder: meta.dossier?.suggestedFolder ?? null,
      version: s.version, revisesCapture: s.previousVersionId, isCurrent: s.isCurrent !== false,
      grade: gradeForAna(grades.get(s.id)),
      usedInThisProject: used.has(s.id),
      // For file_chat_upload_to_vault's source_id: a capture of the open project with its original file held.
      fileable: s.clientProgramId === scope.programId && s.isCurrent !== false && Boolean(prov.fileUploadId),
    };
  });
  const vault = await vaultItemsForAna(scope.orgId, query);
  return JSON.stringify({
    ok: true,
    scope: { catalog: true, projects: query.programIds.length, actorFiltered: true },
    total: page.total, returned: items.length, truncated: page.total > items.length,
    organizedBy: page.facets,
    items,
    ...vault,
    message:
      `The data catalog: ${page.total} source capture(s)${vault.vaultTotal === undefined ? '' : ` and ${vault.vaultTotal} Vault document(s)`} across ${query.programIds.length} project(s) of this sponsor, the same list as ` +
      'Vault → Data catalog. Captures can be uploaded files or native records. For a nativeRecord, quote its recorded scope and lifecycle: ' +
      'organization context does not establish project-specific evidence, and capture placement does not change that scope. ' +
      'A null nativeRecord supplies no verified native classification; do not assume it is a file or project-specific evidence. ' +
      'A native lifecycle describes that record; capture placement and grade do not establish scientific or regulatory approval of a project deliverable. ' +
      'Each grade is computed by the data-room grade engine from recorded facts: quote it and its basis, never ' +
      'set or change one. To bring a capture into this project, PROPOSE it and say where the person confirms it: Vault → Data catalog ' +
      '(or the project’s Data room) → "Use in this project". To file a fileable capture into the Vault, use ' +
      'file_chat_upload_to_vault with its source_id; it lands suggested, for a person to confirm.',
  });
}

/**
 * The Vault's current documents of the same projects under the same narrowings (data-room-vault.ts), as the screen
 * lists them, paged with the captures. A failed read says so; the captures are still answered.
 */
async function vaultItemsForAna(orgId: number, query: import('../clinical-regulatory-evidence/data-room-search.js').DataRoomQuery):
Promise<{ vaultTotal?: number; vaultDocuments?: Array<Record<string, unknown>>; vaultUnavailable?: string }> {
  try {
    const { listVaultForCatalog } = await import('../clinical-regulatory-evidence/data-room-vault.js');
    const page = await listVaultForCatalog(orgId, query);
    return {
      vaultTotal: page.total,
      vaultDocuments: page.documents.map((d) => ({
        documentId: d.documentId, title: d.title, project: d.projectName, projectId: d.projectId, kind: d.evidenceKind,
        ctdSection: d.ctdSection, folder: d.folderLabel ?? d.folder, placementStatus: d.placementStatus, version: d.version,
        // What a profiled dataset holds (standard, class, columns, rows), from its bytes; absent for any other document.
        ...(d.dataset ? { dataset: d.dataset } : {}),
        grade: gradeForAna(d.grade),
      })),
    };
  } catch {
    return { vaultUnavailable: 'The Vault’s documents could not be listed for the catalog. The source captures above are complete.' };
  }
}

/**
 * File one data-room capture into the open project's Vault through the data room's own filing
 * (vault-data-room-filing.ts, the Vault's "File into Vault"): the same access and role checks, the bytes checked
 * against the capture, and the document lands suggested or unfiled for a person to confirm.
 */
export async function fileDataRoomSourceForAna(
  sourceId: unknown,
  p: { organizationId: number; userId: number | null; programId: string },
): Promise<string> {
  const id = Number(sourceId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return JSON.stringify({ ok: false, code: 'INVALID_SOURCE', error: 'source_id must be a data-room sourceId from list_project_documents with catalog:true.' });
  }
  const { fileDataRoomSources } = await import('../vault/vault-data-room-filing.js');
  const result = await fileDataRoomSources({ organizationId: p.organizationId, userId: p.userId, programId: p.programId, sourceIds: [id] });
  if (!result.ok) return JSON.stringify({ ok: false, refused: true, code: result.code, reason: result.message });
  const item = result.items[0];
  if (item.outcome === 'refused') return JSON.stringify({ ok: false, refused: true, sourceId: id, code: item.code, reason: item.message });
  if (item.outcome === 'already_filed') {
    return JSON.stringify({ ok: true, sourceId: id, alreadyFiled: true, documentId: item.documentId, version: item.version,
      message: `These bytes are already in this project\u2019s Vault as version ${item.version ?? 'unknown'}. Nothing changed.` });
  }
  const where = item.placementStatus === 'suggested' && item.folderLabel ? `suggested for ${item.folderLabel}` : 'not placed in a folder yet';
  return JSON.stringify({ ok: true, sourceId: id, documentId: item.documentId, version: item.version, filing: { placementStatus: item.placementStatus, folderLabel: item.folderLabel },
    message: `Filed into the Vault as version ${item.version}, ${where}, awaiting a person\u2019s filing decision in the Vault. Tell the user that; it is not confirmed.` });
}

type ToolHandler = (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>;

/** list_project_documents: with catalog:true, the data catalog; otherwise the tool as it was. */
export const orDataCatalog = (handler: ToolHandler): ToolHandler =>
  (input, ctx) => (input.catalog === true ? dataCatalogTool(input, ctx) : handler(input, ctx));

/** file_chat_upload_to_vault: with source_id, the data room's filing; otherwise the tool as it was. */
export const orDataRoomFiling = (handler: ToolHandler): ToolHandler =>
  (input, ctx) => (input.source_id !== undefined && input.source_id !== null ? fileDataRoomSourceTool(input, ctx) : handler(input, ctx));

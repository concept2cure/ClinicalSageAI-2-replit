/**
 * What a Vault folder's export says about itself (MR-08 Stage 6 step 3,
 * CAT1-14, docs/work-orders/MR-08-vault-upload-safety-and-document-control.md):
 * the manifest, the printable index's header and the audit extract.
 *
 * A regulatory team hands a folder over: Module 3 to a CMC consultant, the
 * clinical folder to a partner's diligence team, a module to an inspector. The
 * export holds the current version of every document the folder shows, by the
 * tree's own rules (`readSealDocumentRows`). Each is read through the one
 * verified reader against its recorded SHA-256 and staged by the seal's archive
 * builder (`vault-archive-builder.ts`), so the two archives are one format. The
 * route stages the bytes; this module describes them.
 */
import type { Pool } from 'pg';
import { readArchiveAuditExtract, archiveActorIdentity, type WithheldDocument } from './vault-seal-archive.js';
import type { ArchivedFile } from './vault-archive-builder.js';
import { vaultBinaryAvailableSql } from '../document-data-disposition/eligibility.js';
import { cabinetFolderOf, folderLabel, isFolderInView, resolveVaultView } from './vault-filing.service.js';
import { readSealDocumentRows, VaultSealError } from './vault-seal.service.js';
import type { VaultViewId } from '../../../shared/constants/domain/vault-taxonomy.js';

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

/** A folder export that cannot be made, and why, before anything is read. */
export type FolderExportRefusal = { ok: false; status: 404 | 409; code: string; message: string };

/** What an export of one folder holds, read before a byte is: the tree's rows, and each one's stored file. */
export interface FolderExportPlan {
  ok: true;
  view: VaultViewId;
  folder: { id: string; label: string };
  programName: string;
  /** Every current, eligible row of the project, for the tree's index numbers. */
  programRows: Array<Record<string, unknown>>;
  /** The folder's rows, each with its storage address and whether its file is available. */
  inFolder: Array<{ row: Record<string, unknown>; file: Record<string, unknown> }>;
}

const NOTHING = 'Nothing was sent.';

/** Plan the export of `folderId`: refused for an unknown or empty folder; otherwise what it holds. */
export async function planFolderExport(
  q: Queryable, p: { organizationId: number; programId: string; folderId: string },
): Promise<FolderExportRefusal | FolderExportPlan> {
  let programRows: Array<Record<string, unknown>>;
  try {
    programRows = await readSealDocumentRows(q, p.organizationId, p.programId);
  } catch (err) {
    if (err instanceof VaultSealError) return { ok: false, status: 404, code: 'NOT_FOUND', message: `Project not found in this organization. ${NOTHING}` };
    throw err;
  }
  const view = await resolveVaultView(p.programId, p.organizationId, q);
  if (!isFolderInView(view, p.folderId)) {
    return { ok: false, status: 404, code: 'FOLDER_NOT_FOUND', message: `There is no such folder in this project's Vault. ${NOTHING}` };
  }
  const label = folderLabel(view, p.folderId) || p.folderId;
  const rows = programRows.filter((r) => cabinetFolderOf(r) === p.folderId);
  if (!rows.length) {
    return { ok: false, status: 409, code: 'FOLDER_EMPTY', message: `${label} holds no documents to export. ${NOTHING}` };
  }
  // tenant-isolation-safe: the ids are this program's own rows, read above in this organization; both are bound again here.
  const files = await q.query(
    `SELECT d.id::text AS id, d.storage_version_id, d.s3_key, d.storage_provider, d.content_hash, d.file_name,
            ${vaultBinaryAvailableSql('d')} AS binary_available
       FROM vault.documents d
      WHERE d.id = ANY($1::uuid[]) AND d.program_id = $2::uuid AND d.organization_id = $3`,
    [rows.map((r) => String(r.id)), p.programId, p.organizationId],
  );
  const byId = new Map(files.rows.map((f) => [String(f.id), f]));
  const missing = rows.find((row) => !byId.has(String(row.id)));
  if (missing) return { ok: false, status: 409, code: 'EXPORT_DOCUMENT_CHANGED',
    message: `${missing.document_title ?? missing.file_name ?? missing.id} is no longer available as planned. Reload the Vault before exporting again. ${NOTHING}` };

  const name = await q.query(`SELECT name FROM regulatory_programs WHERE id = $1::uuid AND organization_id = $2`, [p.programId, p.organizationId]);
  return {
    ok: true, view, folder: { id: p.folderId, label }, programName: String(name.rows[0]?.name ?? 'Vault'), programRows,
    inFolder: rows.map((row) => ({ row, file: byId.get(String(row.id))! })),
  };
}

/** One folder row as the manifest lists it. */
export function folderExportDocument(row: Record<string, unknown>, indexNumber: string | null): FolderExportDocument {
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    id: String(row.id), documentCode: str(row.document_code), title: str(row.document_title) ?? str(row.file_name),
    version: str(row.version), sha256: str(row.content_hash)?.toLowerCase() ?? null, indexNumber,
    placementStatus: str(row.placement_status) ?? 'unfiled', lifecycleStage: str(row.lifecycle_stage),
  };
}

export const FOLDER_EXPORT_SCHEMA = 'vault-folder-export/1';

/** One document the export holds, as the tree shows it. */
export interface FolderExportDocument {
  id: string;
  documentCode: string | null;
  title: string | null;
  version: string | null;
  sha256: string | null;
  indexNumber: string | null;
  placementStatus: string;
  lifecycleStage: string | null;
}

/** The manifest, index header and audit extract of one folder's export. */
export async function buildFolderExportContents(
  pool: Pick<Pool, 'connect'>,
  input: {
    organizationId: number; userId: number | undefined; programId: string; programName: string;
    folder: { id: string; label: string }; documents: FolderExportDocument[]; withheld: WithheldDocument[]; builtAt?: Date; namedActors?: boolean;
  },
): Promise<{ manifest: (files: ArchivedFile[]) => Record<string, unknown>; indexHeader: string[]; attachments: Array<{ path: string; content: string }> }> {
  const { folder, documents, withheld } = input;
  const builtAt = (input.builtAt ?? new Date()).toISOString();
  const ids = [...documents.map((d) => d.id), ...withheld.map((w) => w.id)];
  const history = await readArchiveAuditExtract(pool, input.organizationId, input.userId,
    { tableName: 'vault_document', recordId: ids }, { of: `the documents in ${folder.label}`, namedActors: input.namedActors });
  const entries = [...history.data].reverse();
  const auditPath = 'audit/audit-trail.json';
  const actorIdentity = archiveActorIdentity(input.namedActors);
  const audit = {
    schema: 'vault-folder-export-audit/1',
    actorIdentity,
    readAt: builtAt,
    order: 'oldest first',
    records: { documents: ids },
    chain: history.meta.chain,
    entries,
  };
  return {
    manifest: (files) => ({
      schema: FOLDER_EXPORT_SCHEMA,
      builtAt,
      builtBy: input.userId ?? null,
      programId: input.programId,
      program: input.programName,
      folder,
      // Every file was read again and matched its recorded SHA-256 before the
      // archive was written; one that did not refused the whole export.
      verification: { verdict: 'intact', filesReadAgain: files.length, withheld: withheld.length },
      documents,
      files,
      withheld,
      auditTrail: { path: auditPath, entries: entries.length, chain: history.meta.chain, actorIdentity },
    }),
    indexHeader: [
      `Export of a Vault folder: ${folder.label}`,
      '',
      `Project:    ${input.programName} (${input.programId})`,
      `Folder:     ${folder.label} (${folder.id})`,
      `Documents:  ${documents.length}, the current version of each`,
      `Built:      ${builtAt}`,
      '',
      'Every file in this archive is listed in SHA256SUMS; `sha256sum -c SHA256SUMS` checks them all.',
      'manifest.json lists each document with its version, recorded SHA-256 and filing.',
      `Audit identities: ${actorIdentity}.`,
      `${auditPath} holds the chained audit rows of each exported version, oldest first.`,
      ...(documents.some((d) => d.placementStatus === 'suggested')
        ? ['', 'Suggested filings: these placements have not been confirmed by a person.',
          ...documents.filter((d) => d.placementStatus === 'suggested').map((d) => `  ${d.title ?? d.id}`)] : []),
      ...(withheld.length
        ? ['', `Withheld (${withheld.length}): documents in this folder whose file this export does not hold.`,
          ...withheld.map((w) => `  ${w.title ?? w.id}  ${w.sha256 ?? '-'}  ${w.why}`)]
        : []),
      '',
      'Position  Index number  Title  SHA-256  Path',
    ],
    attachments: [{ path: auditPath, content: `${JSON.stringify(audit, null, 2)}\n` }],
  };
}

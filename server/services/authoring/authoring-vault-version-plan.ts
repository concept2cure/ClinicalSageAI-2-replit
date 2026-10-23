/** Select the existing Authoring rendition's verified Vault head. Numbering,
 * admission, locking and lineage remain the canonical Vault check-in's job. */
import type { PoolClient } from '../audit/chain';
import { currentVersionOfCode, nextMajorVersion } from '../vault/vault-version-checkin';
import { readAuthoringVaultFilingReceipt } from './authoring-vault-filing-receipt';
import { ProgramReadAccessError } from '../c2c/current-program-access';

export type AuthoringVaultVersionPlan =
  | { ok: true; documentCode: string; supersedesDocumentId: string | null }
  | { ok: false; status: number; code: string; message: string };
interface VersionContext {
  organizationId: number;
  programId: string;
  sourceDocumentId: string;
  format: 'pdf' | 'docx';
  folderId?: string | null;
}
const review = (message: string, status = 409): AuthoringVaultVersionPlan => ({
  ok: false, status, code: 'AUTHORING_VAULT_VERSION_REVIEW_REQUIRED',
  message: `${message} Review the existing Vault records before filing again. Nothing was filed.`,
});

async function verifyRecordedHead(q: PoolClient, p: VersionContext, headId: string, documentCode: string): Promise<AuthoringVaultVersionPlan> {
  const { rows } = await q.query(
    `SELECT content_hash, mime_type, folder_id FROM vault.documents
      WHERE id=$1::uuid AND program_id=$2::uuid AND organization_id=$3 AND deleted_at IS NULL`,
    [headId, p.programId, p.organizationId],
  );
  const row = rows[0];
  const mime = p.format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (!row || row.mime_type !== mime) return review('The current Vault version does not match this rendition format.');
  const derivation = await readAuthoringVaultFilingReceipt(q, { organizationId: p.organizationId,
    programId: p.programId, vaultDocumentId: headId, artifactSha256: String(row.content_hash ?? '').trim() });
  if (derivation.status !== 'recorded' || derivation.source.nativeId !== p.sourceDocumentId.toLowerCase()) {
    return review('The current Vault version cannot be verified as a filing of this source document.');
  }
  const requestedFolder = p.folderId?.trim();
  if (requestedFolder && requestedFolder !== row.folder_id) return {
    ok: false, status: 400, code: 'FILING_IS_KEPT',
    message: 'A new version keeps its document’s filing. Move the document in Vault to file it elsewhere. Nothing was filed.',
  };
  return { ok: true, documentCode, supersedesDocumentId: headId };
}

export async function planAuthoringVaultVersion(q: PoolClient, p: VersionContext): Promise<AuthoringVaultVersionPlan> {
  const legacyCode = `authoring-${p.sourceDocumentId}`;
  const documentCode = `${legacyCode}-${p.format}`;
  try {
    // Retired rows still reserve their labels and cannot be treated as a fresh
    // family. No title, date or document-code text establishes source identity.
    const retained = await q.query(
      `SELECT document_code, count(*)::integer AS retained_count,
         bool_or(version IS NULL OR btrim(version) !~ '^[0-9]{1,6}(\\.[0-9]{1,6})?$') AS unknown_scheme
         FROM vault.documents WHERE program_id=$1::uuid AND organization_id=$2
           AND document_code IN ($3,$4) GROUP BY document_code`,
      [p.programId, p.organizationId, legacyCode, documentCode],
    );
    if (retained.rows.some(row => row.document_code === legacyCode)) {
      return review('This document has retained Vault filings under an earlier version scheme.');
    }
    const family = retained.rows.find(row => row.document_code === documentCode);
    if (!family) return { ok: true, documentCode, supersedesDocumentId: null };
    if (family.unknown_scheme) return review('This rendition has a retained version label that cannot be advanced automatically.');
    const head = await currentVersionOfCode(q, { ...p, documentCode });
    if (!head || !nextMajorVersion(head.version)) return review('This rendition does not have one current numeric version that can be advanced.');
    return await verifyRecordedHead(q, p, head.id, documentCode);
  } catch {
    return review('The retained Vault version history could not be confirmed.', 503);
  }
}

/** Reuse canonical ingest's source-admission seam after storage and inside its
 * admission transaction. Never keep a preparation-time head after it changed. */
export async function assertAuthoringVaultVersionPlan(q: PoolClient, p: VersionContext,
  expected: Extract<AuthoringVaultVersionPlan, { ok: true }>): Promise<void> {
  const current = await planAuthoringVaultVersion(q, p);
  if (!current.ok) throw new ProgramReadAccessError(current.status === 503 ? 503 : 409, current.code, current.message);
  if (current.documentCode !== expected.documentCode || current.supersedesDocumentId !== expected.supersedesDocumentId) {
    throw new ProgramReadAccessError(409, 'VERSION_NOT_CURRENT',
      'This rendition changed while its new version was being prepared. Review the current Vault records before filing again. Nothing was filed.');
  }
}

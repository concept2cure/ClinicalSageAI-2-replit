/** Compose the existing project, original-byte and approved-version gates for
 * an official eSTAR attachment. This reads no alternate source or lifecycle. */
import { pool } from '../../../db';
import type { RequestSqlClient } from '../../../db/requestDb';
import { ProgramReadAccessError, requireCurrentProgramAccess } from '../../c2c/current-program-access';
import { vaultBinaryAvailableSql } from '../../document-data-disposition/eligibility';
import { vaultVersionNotTransmittable } from '../../vault/vault-lifecycle';
import { vaultWriteRefusal } from '../../vault/vault-write-authority';
import type { LegalDocumentContext } from '../../../../shared/company-documents';

export interface DeviceAttachmentAccessInput {
  organizationId: number;
  programUuid: string | null;
  userId?: number | null;
  executor?: RequestSqlClient;
  submissionType?: string;
}
export interface AdmittedVaultAttachment {
  id: string;
  file_name: string | null;
  document_title: string | null;
  mime_type: string | null;
  s3_key: string | null;
  storage_version_id: string | null;
  storage_provider: string | null;
  content_hash: string;
}
export const attachmentSourceExecutor = (input: DeviceAttachmentAccessInput): RequestSqlClient => input.executor ?? pool;

export async function assertDeviceAttachmentAccess(input: DeviceAttachmentAccessInput, forWrite = false): Promise<void> {
  if (!Number.isSafeInteger(input.userId) || !input.userId || input.userId <= 0) {
    throw new ProgramReadAccessError(403, 'ESTAR_ATTACHMENT_ACTOR_REQUIRED', 'A current authenticated actor is required to attach project documents.');
  }
  if (!input.programUuid) throw new ProgramReadAccessError(409, 'ESTAR_ATTACHMENT_PROGRAM_REQUIRED',
    'This export has no regulatory program, so no governed document or program Vault can be attached.');
  const access = await requireCurrentProgramAccess(attachmentSourceExecutor(input), {
    organizationId: input.organizationId, userId: input.userId, programId: input.programUuid,
  });
  const refusal = forWrite ? vaultWriteRefusal(access.actor.role) : null;
  if (refusal) throw new ProgramReadAccessError(refusal.status, refusal.code, refusal.message);
}

/** Exact UUID and expected hash survive each asynchronous read; a newer
 * family member is never substituted for the version the person selected. */
export async function admitVaultAttachmentSource(input: DeviceAttachmentAccessInput, documentId: string,
  expectedHash?: string): Promise<AdmittedVaultAttachment> {
  await assertDeviceAttachmentAccess(input);
  const q = attachmentSourceExecutor(input);
  const { rows } = await q.query(`SELECT d.id::text AS id,d.file_name,d.document_title,d.mime_type,d.s3_key,
    d.storage_version_id,d.storage_provider,d.content_hash,${vaultBinaryAvailableSql('d')} AS binary_available
    FROM vault.documents d WHERE d.id=$1::uuid AND d.program_id=$2::uuid AND d.organization_id=$3
      AND d.deleted_at IS NULL`, [documentId,input.programUuid,input.organizationId]);
  const row = rows[0];
  if (!row) throw new ProgramReadAccessError(404, 'ESTAR_ATTACHMENT_SOURCE_UNAVAILABLE', 'The selected Vault version is not available in this program.');
  if (row.binary_available !== true) throw new ProgramReadAccessError(409, 'ESTAR_ATTACHMENT_BYTES_WITHDRAWN', 'The selected Vault version’s original bytes have been withdrawn.');
  const hash = String(row.content_hash ?? '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash) || expectedHash !== undefined && expectedHash !== hash) {
    throw new ProgramReadAccessError(409, 'ESTAR_ATTACHMENT_SOURCE_CHANGED', 'The selected Vault version’s recorded bytes could not be confirmed.');
  }
  const target: LegalDocumentContext = { programId: input.programUuid, agency: 'FDA', country: 'US', submissionType: input.submissionType };
  const refusal = await vaultVersionNotTransmittable(q,input.organizationId,documentId,hash,target);
  if (refusal) throw new ProgramReadAccessError(409, 'ESTAR_ATTACHMENT_NOT_APPROVED', `The selected Vault version cannot be attached: ${refusal}.`);
  return { ...row, content_hash: hash } as unknown as AdmittedVaultAttachment;
}

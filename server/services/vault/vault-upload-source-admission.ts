/** Recheck the original upload on the exact executor used to file its bytes. */
import type { RequestSqlClient } from '../../db/requestDb';
import { assertAnaUploadAccess } from '../ana/source-context-admission';
import { AnaProjectScopeError } from '../ana/project-scope-admission';
import { sha256Hex, type UploadedFile } from '../ana/uploaded-file-access';
import { lockDocumentDispositionProgram } from '../document-data-disposition/program-lock';
import { capturedBinaryAvailableSql, uploadedBinaryAvailableSql } from '../document-data-disposition/eligibility';
import type { FileUploadIntoVaultArgs } from './vault-file-upload-to-vault';

export async function assertVaultUploadSource(q: RequestSqlClient, args: FileUploadIntoVaultArgs,
  phase: 'preview' | 'commit', file?: UploadedFile): Promise<void> {
  if (phase === 'commit') {
    await lockDocumentDispositionProgram(q, args.organizationId, args.programId);
    // Confirmation takes SHARE over these stores before recording withdrawal.
    await q.query('LOCK TABLE public.cre_evidence_sources, public.file_uploads IN ROW EXCLUSIVE MODE');
  }
  await assertAnaUploadAccess(q, { organizationId: args.organizationId, userId: args.userId, fileIds: [args.fileId] });
  if (phase === 'commit') {
    // Reserve the original identity before evaluating its current availability.
    await q.query('SELECT id FROM file_uploads WHERE id=$1 AND organization_id=$2 FOR SHARE',
      [args.fileId, args.organizationId]);
  }
  const uploaded = await q.query(`SELECT f.id,f.storage_path,f.checksum_sha256 FROM file_uploads f
    WHERE f.id=$1 AND f.organization_id=$2 AND ${uploadedBinaryAvailableSql('f')}`,
  [args.fileId, args.organizationId]);
  const identity = uploaded.rows[0];
  if (uploaded.rows.length !== 1) throw new AnaProjectScopeError(404, 'UPLOAD_NOT_FOUND', 'The original upload is unavailable. Nothing was filed.');
  if (file && (identity.storage_path !== file.storagePath || identity.checksum_sha256 !== sha256Hex(file.buffer))) {
    throw new AnaProjectScopeError(409, 'SOURCE_BYTES_CHANGED', 'The original upload identity changed before filing. Nothing was filed.');
  }
  if (args.dataRoomSourceId !== undefined) {
    if (phase === 'commit') {
      await q.query(`SELECT id FROM cre_evidence_sources
        WHERE id=$1 AND organization_id=$2 AND client_program_id=$3 AND source_type='client_document'
          AND provenance->>'fileUploadId'=$4 AND deleted_at IS NULL AND is_current IS NOT FALSE FOR SHARE`,
        [args.dataRoomSourceId, args.organizationId, args.programId, args.fileId]);
    }
    const captured = await q.query(`SELECT s.checksum FROM cre_evidence_sources s
      WHERE s.id=$1 AND s.organization_id=$2 AND s.client_program_id=$3 AND s.source_type='client_document'
        AND s.provenance->>'fileUploadId'=$4 AND s.deleted_at IS NULL AND s.is_current IS NOT FALSE
        AND ${capturedBinaryAvailableSql('s')}`,
    [args.dataRoomSourceId, args.organizationId, args.programId, args.fileId]);
    if (captured.rows.length !== 1 || !args.capturedChecksum || String(captured.rows[0].checksum).trim() !== args.capturedChecksum.trim()) {
      throw new AnaProjectScopeError(409, 'SOURCE_CHANGED', 'The captured source identity or availability changed before filing. Nothing was filed.');
    }
  }
  await assertAnaUploadAccess(q, { organizationId: args.organizationId, userId: args.userId, fileIds: [args.fileId] });
}

/**
 * A document's study data (CLAUDE.md RULE 4, 2026-10-31): the study's clinical source, frozen as a source of
 * its clinical study report document, in its project, without a Submission Center package run.
 *
 * The frozen row is the snapshot a package run's inputs hold (organizationId, programId, clinicalStudyData,
 * clinicalSourceReceipts), digested and sealed by the same functions, and read by the same verifying reader
 * (readSavedClinicalTables, readRetainedStudyForAssembly), so the build, its narratives and its assembly use it
 * unchanged. The source passes the same exact-version, digest and lifecycle-approval checks as a run
 * (withCsrVaultSource, requireApproval). The snapshot holds subject-level observations: only its receipts are
 * ever returned. docs/design/CSR_END_TO_END_2026-10-29.md, step 2 design.
 */
import { randomUUID } from 'crypto';
import type { RequestConnectable, RequestSqlClient } from '../../db/requestDb.js';
import type { CsrSourceReceipt, CsrSourceSelection } from '../../../shared/csr-source-input.js';
import { orchestratorInputDigest } from '../submission-orchestrator-inputs.js';
import { sealSignPayloadDigest } from '../ectd/sign-payload-seal.js';
import { authorizeCsrSourceProgram, CsrSourceInputError, type CsrSourceScope } from './source-access.js';
import { withCsrVaultSource } from './vault-source-input.js';

/** `via`: frozen for this document, or the study data the CSR build a working copy was imported from was drafted over. */
export interface CsrStudyDataEntry { studyDataId: string; createdAt: string; createdBy: number; sources: CsrSourceReceipt[];
  via: 'this-document' | 'imported-build' }

/** The authoring document the study data is a source of: in this organization and this project. */
async function requireProjectDocument(q: RequestSqlClient, scope: CsrSourceScope, authoringDocumentId: string): Promise<void> {
  const { rows } = await q.query(`SELECT id FROM authoring_documents
    WHERE id = $1 AND tenant_id = $2 AND client_program_id::text = $3`, [authoringDocumentId, scope.organizationId, scope.programId]);
  if (rows.length !== 1) {
    throw new CsrSourceInputError(404, 'CSR_STUDY_DATA_DOCUMENT_NOT_FOUND', 'This document is not in the selected project. No study data was frozen.');
  }
}

/** Freeze the approved clinical source as the document's study data. Returns the new row's receipts only. */
export async function freezeCsrStudyData(connectable: RequestConnectable, q: RequestSqlClient, scope: CsrSourceScope,
  input: { authoringDocumentId: string; selection: CsrSourceSelection }): Promise<CsrStudyDataEntry> {
  await authorizeCsrSourceProgram(q, scope, true);
  await requireProjectDocument(q, scope, input.authoringDocumentId);
  return withCsrVaultSource(connectable, scope, input.selection, {
    requireApproval: true,
    consume: async loaded => {
      const snapshot = {
        organizationId: scope.organizationId,
        programId: scope.programId,
        authoringDocumentId: input.authoringDocumentId,
        clinicalStudyData: [loaded.envelope.studyData],
        clinicalSourceReceipts: [loaded.source],
      };
      const digest = orchestratorInputDigest(snapshot);
      const studyDataId = randomUUID();
      const { rows } = await q.query(`INSERT INTO csr_study_data
        (study_data_id, organization_id, program_id, authoring_document_id, input_snapshot, input_digest, input_seal, created_by)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8) RETURNING created_at`,
      [studyDataId, scope.organizationId, scope.programId, input.authoringDocumentId, JSON.stringify(snapshot), digest,
        sealSignPayloadDigest(digest, scope.organizationId), scope.userId]);
      return { studyDataId, createdAt: new Date(String(rows[0].created_at)).toISOString(), createdBy: scope.userId, sources: [loaded.source], via: 'this-document' };
    },
  });
}

/**
 * The study data a document is read against, newest first: receipts only, never the subject-level snapshot.
 * That is the study data frozen for it and, for a working copy imported from a CSR build, the study data the
 * build was drafted over (CSR scientific review, CDISC pilot demo walk 2026-11-02). A stored import names its
 * build as `importSource.id`, the job id as text, as authoring-source-import.ts reads it. Either row is read in
 * this organization and this project only; the build is this organization's.
 */
export async function listCsrStudyData(q: RequestSqlClient, scope: CsrSourceScope, authoringDocumentId: string): Promise<CsrStudyDataEntry[]> {
  await authorizeCsrSourceProgram(q, scope);
  await requireProjectDocument(q, scope, authoringDocumentId);
  const { rows } = await q.query(`SELECT s.study_data_id, s.created_at, s.created_by, s.input_snapshot -> 'clinicalSourceReceipts' AS sources,
      s.authoring_document_id = $3 AS own
    FROM csr_study_data s WHERE s.organization_id = $1 AND s.program_id = $2
      AND (s.authoring_document_id = $3 OR s.study_data_id::text IN (SELECT j.source_run_id FROM authoring_documents d
        JOIN csr_build_jobs j ON j.organization_id = d.tenant_id AND j.id::text = d.provenance -> 'importSource' ->> 'id'
        WHERE d.id = $3 AND d.tenant_id = $1 AND d.provenance -> 'importSource' ->> 'kind' = 'csr'))
    ORDER BY s.created_at DESC, s.study_data_id DESC LIMIT 50`, [scope.organizationId, scope.programId, authoringDocumentId]);
  return rows.map(row => ({
    studyDataId: String(row.study_data_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    createdBy: Number(row.created_by),
    sources: Array.isArray(row.sources) ? row.sources as CsrSourceReceipt[] : [],
    via: row.own === true ? 'this-document' as const : 'imported-build' as const,
  }));
}

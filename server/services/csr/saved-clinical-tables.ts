import type { RequestSqlClient } from '../../db/requestDb.js';
import { authorizeCsrSourceProgram, CsrSourceInputError, type CsrSourceScope } from './source-access.js';
import { verifyOrchestratorReceipt } from '../submission-orchestrator-inputs.js';
import { buildCSRTables } from '../csr-tabulation-builders.js';
import type { OrchestratorInputs } from '../submission-package-orchestrator.js';
import { CSR_SOURCE_FORMAT, type CsrSourceReceipt } from '../../../shared/csr-source-input.js';
import { validateCsrSourceReceipts } from './source-receipt-eligibility.js';

/** A retained run is a historical record. Reconstruction still honors explicit
 * source data dispositions and current project ACL on every aggregate read.
 * Never serialize input_snapshot: it contains private participant observations. */
export async function readSavedClinicalTables(q: RequestSqlClient, scope: CsrSourceScope, runId: string,
  options: { forRelease?: boolean } = {}) {
  const verified = await readVerifiedRetainedStudies(q, scope, runId, { historical: options.forRelease !== true, lock: options.forRelease === true });
  const studies = verified.map(({ source, study }) => ({ source, tables: buildCSRTables(study) }));
  return { runId, programId: scope.programId, historical: true as const, releaseEligibilityVerified: options.forRelease === true, studies };
}

/**
 * CSR slice 8 (2026-10-29): the one retained study the CSR assembler composes
 * §14 and the §16.2 listings from, with the same verification as
 * readSavedClinicalTables (current project access, the run's sealed digest,
 * the source receipt and any data disposition), and the source must still be
 * the current approved version, as at release (no lock: assembly writes
 * nothing the source could race). The result carries subject
 * rows: it is for the server-side assembler only and must never be serialized
 * to a client.
 */
export async function readRetainedStudyForAssembly(q: RequestSqlClient, scope: CsrSourceScope, runId: string, studyId: string) {
  const verified = await readVerifiedRetainedStudies(q, scope, runId, { historical: false, lock: false });
  const matches = verified.filter(entry => entry.study.studyId === studyId);
  if (matches.length !== 1) throw new CsrSourceInputError(409, 'CSR_RUN_STUDY_NOT_FOUND', 'The retained run holds no single source for this CSR job’s study.');
  return { runId, source: matches[0].source, study: matches[0].study, tables: buildCSRTables(matches[0].study) };
}

async function readVerifiedRetainedStudies(q: RequestSqlClient, scope: CsrSourceScope, runId: string, eligibility: { historical: boolean; lock: boolean }) {
  await authorizeCsrSourceProgram(q, scope);
  const { rows } = await q.query(`SELECT i.input_snapshot, i.input_digest, i.input_seal
    FROM submission_orchestrator_runs r JOIN submission_orchestrator_inputs i
      ON i.run_id = r.run_id AND i.organization_id = r.organization_id
    WHERE r.run_id = $1 AND r.organization_id = $2 AND i.program_id = $3`, [runId, scope.organizationId, scope.programId]);
  if (rows.length !== 1) throw new CsrSourceInputError(404, 'CSR_RUN_INPUTS_NOT_FOUND', 'This saved run has no retained source inputs in the selected project.');
  const row = rows[0];
  if (!verifyOrchestratorReceipt(row.input_snapshot, row.input_digest, row.input_seal, scope.organizationId)) {
    throw new CsrSourceInputError(409, 'CSR_RUN_INPUTS_INVALID', 'The retained run inputs did not verify. Tables were not reconstructed.');
  }
  const input = row.input_snapshot as OrchestratorInputs;
  if (input.organizationId !== scope.organizationId || input.programId !== scope.programId || !Array.isArray(input.clinicalStudyData)) {
    throw new CsrSourceInputError(409, 'CSR_RUN_INPUTS_INVALID', 'The retained inputs do not match the selected project.');
  }
  const studies: Array<{ source: CsrSourceReceipt; study: OrchestratorInputs['clinicalStudyData'][number] }> = [];
  // Release/review reads require the current approved source and reserve it
  // against concurrent withdrawal. Ordinary historical reads remain unchanged.
  const receipts = await validateCsrSourceReceipts(q, scope, input.clinicalSourceReceipts, eligibility);
  for (const receipt of receipts) {
    if (receipt.adapter !== CSR_SOURCE_FORMAT || receipt.sourceApproval !== 'canonical-lifecycle' || receipt.clinicalVerification !== 'not-established') {
      throw new CsrSourceInputError(409, 'CSR_RUN_INPUTS_INVALID', 'The retained source receipt did not verify.');
    }
    const matches = input.clinicalStudyData.filter(study => study.studyId === receipt.studyId && study.protocolNumber === receipt.protocolNumber);
    if (matches.length !== 1) throw new CsrSourceInputError(409, 'CSR_RUN_INPUTS_INVALID', 'The retained source receipt does not identify one study.');
    studies.push({ source: receipt, study: matches[0] });
  }
  return studies;
}

import type { RequestSqlClient } from '../../db/requestDb.js';
import { authorizeCsrSourceProgram, CsrSourceInputError, type CsrSourceScope } from './vault-source-input.js';
import { verifyOrchestratorReceipt } from '../submission-orchestrator-inputs.js';
import { buildCSRTables, type CSRTables } from '../csr-tabulation-builders.js';
import type { OrchestratorInputs } from '../submission-package-orchestrator.js';
import { CSR_SOURCE_FORMAT, type CsrSourceReceipt } from '../../../shared/csr-source-input.js';
import { validateCsrSourceReceipts } from './source-receipt-eligibility.js';

/** A retained run is a historical record. Reconstruction still honors explicit
 * source data dispositions and current project ACL on every aggregate read.
 * Never serialize input_snapshot: it contains private participant observations. */
export async function readSavedClinicalTables(q: RequestSqlClient, scope: CsrSourceScope, runId: string) {
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
  const studies: Array<{ source: CsrSourceReceipt; tables: CSRTables }> = [];
  const receipts = await validateCsrSourceReceipts(q, scope, input.clinicalSourceReceipts, { historical: true });
  for (const receipt of receipts) {
    if (receipt.adapter !== CSR_SOURCE_FORMAT || receipt.sourceApproval !== 'canonical-lifecycle' || receipt.clinicalVerification !== 'not-established') {
      throw new CsrSourceInputError(409, 'CSR_RUN_INPUTS_INVALID', 'The retained source receipt did not verify.');
    }
    const matches = input.clinicalStudyData.filter(study => study.studyId === receipt.studyId && study.protocolNumber === receipt.protocolNumber);
    if (matches.length !== 1) throw new CsrSourceInputError(409, 'CSR_RUN_INPUTS_INVALID', 'The retained source receipt does not identify one study.');
    studies.push({ source: receipt, tables: buildCSRTables(matches[0]) });
  }
  return { runId, programId: scope.programId, historical: true as const, studies };
}

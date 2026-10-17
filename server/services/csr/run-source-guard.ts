import type { RequestSqlClient } from '../../db/requestDb.js';
import { setTenantContextTx } from '../tenant/governed-tenant-context.js';
import { verifyOrchestratorReceipt } from '../submission-orchestrator-inputs.js';
import type { OrchestratorInputs, OrchestratorRun } from '../submission-package-orchestrator.js';
import { authorizeCsrSourceProgram, CsrSourceInputError } from './vault-source-input.js';
import { validateCsrSourceReceipts } from './source-receipt-eligibility.js';

/** Enlisted in the signature transaction: source withdrawal/check-in cannot
 * cross the validation/INSERT boundary. The transaction owns lock release. */
export async function guardRunCsrSourcesTx(q: RequestSqlClient, run: OrchestratorRun, userId: number): Promise<void> {
  await setTenantContextTx(q, run.organizationId);
  const { rows } = await q.query(`SELECT program_id, input_snapshot, input_digest, input_seal
    FROM submission_orchestrator_inputs WHERE run_id=$1 AND organization_id=$2`, [run.runId, run.organizationId]);
  if (rows.length === 0) return; // Legacy release records carry no new source adapter.
  const row = rows[0];
  const inputs = row.input_snapshot as OrchestratorInputs | null;
  if (!inputs || inputs.clinicalSourceReceipts === undefined) return;
  if (!verifyOrchestratorReceipt(inputs, row.input_digest, row.input_seal, run.organizationId) ||
      inputs.organizationId !== run.organizationId || inputs.submissionId !== run.submissionId ||
      typeof inputs.programId !== 'string' || inputs.programId !== row.program_id) {
    throw new CsrSourceInputError(409, 'CSR_RUN_INPUTS_INVALID', 'The clinical source receipt no longer identifies this release.');
  }
  const scope = { organizationId: run.organizationId, programId: inputs.programId, userId };
  await authorizeCsrSourceProgram(q, scope, true);
  await validateCsrSourceReceipts(q, scope, inputs.clinicalSourceReceipts, { lock: true });
}

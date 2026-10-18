import { createHash } from 'crypto';
import { pool } from '../db.js';
import { stableStringify } from '../../shared/canonical-json.js';
import { sealSignPayloadDigest, verifySignPayloadSeal, isSignSealConfigured } from './ectd/sign-payload-seal.js';
import type { OrchestratorInputs, OrchestratorOutputs } from './submission-package-orchestrator.js';

/** Private persisted inputs, never returned by the run/read/audit API. */
export function orchestratorInputDigest(value: unknown): string {
  return createHash('sha256').update('orchestrator.continuation.v1\n').update(stableStringify(value)).digest('hex');
}

export async function captureOrchestratorInputs(runId: string, inputs: OrchestratorInputs): Promise<void> {
  const digest = orchestratorInputDigest(inputs);
  await pool.query(`INSERT INTO submission_orchestrator_inputs
    (run_id, organization_id, program_id, input_snapshot, input_digest, input_seal)
    VALUES ($1, $2, $3, $4::jsonb, $5, $6) ON CONFLICT (run_id) DO NOTHING`,
  [runId, inputs.organizationId, inputs.programId ?? null, JSON.stringify(inputs), digest, sealSignPayloadDigest(digest, inputs.organizationId)]);
}

export async function captureOrchestratorSuspendedOutputs(runId: string, organizationId: number, outputs: OrchestratorOutputs): Promise<void> {
  const digest = orchestratorInputDigest(outputs);
  const result = await pool.query(`UPDATE submission_orchestrator_inputs SET suspended_outputs = $3::jsonb,
    outputs_digest = $4, outputs_seal = $5 WHERE run_id = $1 AND organization_id = $2 AND suspended_outputs IS NULL RETURNING run_id`,
  [runId, organizationId, JSON.stringify(outputs), digest, sealSignPayloadDigest(digest, organizationId)]);
  if (result.rowCount === 0) throw new Error('Orchestrator suspended outputs could not be reserved.');
}

export function verifyOrchestratorReceipt(snapshot: unknown, digest: unknown, seal: unknown, organizationId: number): boolean {
  if (!snapshot || typeof snapshot !== 'object' || typeof digest !== 'string' || orchestratorInputDigest(snapshot) !== digest) return false;
  if (isSignSealConfigured() && (typeof seal !== 'string' || !seal)) return false;
  return verifySignPayloadSeal(digest, organizationId, typeof seal === 'string' ? seal : null) !== 'failed';
}

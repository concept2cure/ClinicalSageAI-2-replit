import { createHash } from 'crypto';
import { pool, db } from '../db.js';
import { looksLikeProgramUuid } from '../lib/project-id.js';
import { GOVERNED_WRITE_ROLES } from '../middleware/orgMembership.js';
import { canMutateProgram } from './c2c/program-access.js';
import { readCsrProjectActor, resolveCsrScope } from './csr/project-scope.js';
import {
  getRun, getRunResumeReadiness, runOrchestrator, computeBoundPayloadDigestFromComponents,
  type OrchestratorRun, type OrchestratorInputs, type OrchestratorOutputs, type SignedPackageSnapshot,
} from './submission-package-orchestrator.js';
import { verifyOrchestratorReceipt, orchestratorInputDigest } from './submission-orchestrator-inputs.js';
import { loadApprovedCmcSourcesForProject } from './cmc/load-approved-cmc-sources-for-project.js';
import { verifySignPayloadSeal, isSignSealConfigured, verifySignPayloadSignature, isKmsSignerConfigured, type PayloadSignatureEnvelope } from './ectd/sign-payload-seal.js';
import { validateCsrSourceReceipts } from './csr/source-receipt-eligibility.js';
import { CsrSourceInputError } from './csr/vault-source-input.js';
import { setTenantContextTx } from './tenant/governed-tenant-context.js';

export class OrchestratorContinuationRefusal extends Error {
  constructor(readonly code: string, readonly status: 403 | 404 | 409, message: string) { super(message); }
}

function sameRunIdentity(value: OrchestratorInputs | SignedPackageSnapshot, run: OrchestratorRun): boolean {
  return (['organizationId', 'submissionId', 'applicationNumber', 'region', 'submissionType'] as const).every(key => value[key] === run[key]);
}

function releaseSealVerified(digest: string, organizationId: number, expectedDigest: string, seal?: string): boolean {
  const verdict = verifySignPayloadSeal(digest, organizationId, seal);
  return digest === expectedDigest && verdict !== 'failed' && !(verdict === 'unsealed' && isSignSealConfigured());
}

export async function requireOrchestratorProgramAccess(organizationId: number, programId: string, userId: number): Promise<Record<string, unknown>> {
  if (!looksLikeProgramUuid(programId)) throw new OrchestratorContinuationRefusal('PROGRAM_SCOPE_REQUIRED', 409, 'A recorded program is required.');
  const actor = await readCsrProjectActor(pool, organizationId, userId);
  if (!GOVERNED_WRITE_ROLES.has(String(actor.role ?? '').toLowerCase())) throw new OrchestratorContinuationRefusal('PROGRAM_WRITE_ACCESS_DENIED', 403, 'Current governed write permission is required to build or continue this submission.');
  const { rows } = await pool.query(`SELECT id, name, code, program_type, lead_user_id, product_name FROM regulatory_programs
    WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [programId, organizationId]);
  const program = rows[0];
  if (!program) throw new OrchestratorContinuationRefusal('PROGRAM_NOT_ACCESSIBLE', 404, 'The program is not accessible.');
  if (!canMutateProgram({ actor: { userId: actor.userId, orgRole: actor.role }, program: { leadUserId: program.lead_user_id == null ? null : Number(program.lead_user_id) } })) {
    throw new OrchestratorContinuationRefusal('PROGRAM_ACCESS_DENIED', 403, 'Current program management access is required to build or continue this submission.');
  }
  return program;
}

/** Verify the frozen record before asking anyone to bind a release signature. */
export async function verifyAwaitingReleasePayload(run: OrchestratorRun): Promise<string> {
  const step = run.steps.find(s => s.key === 'package.sign');
  let payload: { payloadDigest: string; payloadSeal?: string; payloadSignature?: PayloadSignatureEnvelope; signedSnapshot: SignedPackageSnapshot };
  try { payload = JSON.parse(step?.outputRef ?? ''); } catch { throw new OrchestratorContinuationRefusal('SIGNATURE_SNAPSHOT_INVALID', 409, 'The release record is unavailable. Regenerate the package.'); }
  const snap = payload?.signedSnapshot;
  if (!snap || !Array.isArray(snap.leaves) || !snap.validatorOutcome || !sameRunIdentity(snap, run)) {
    throw new OrchestratorContinuationRefusal('SIGNATURE_SNAPSHOT_INVALID', 409, 'The release record identity did not verify.');
  }
  const digest = computeBoundPayloadDigestFromComponents({ ...snap, backboneXml: snap.backboneXml || undefined });
  if (!releaseSealVerified(digest, run.organizationId, payload.payloadDigest, payload.payloadSeal)) {
    throw new OrchestratorContinuationRefusal('SIGNATURE_PAYLOAD_INVALID', 409, 'The frozen release record did not verify.');
  }
  const signature = await verifySignPayloadSignature(digest, run.organizationId, payload.payloadSignature);
  if (signature === 'failed' || (signature === 'unsigned' && isKmsSignerConfigured())) {
    throw new OrchestratorContinuationRefusal('SIGNATURE_PAYLOAD_INVALID', 409, 'The release record signature envelope did not verify.');
  }
  return digest;
}

async function readContinuationInputs(run: OrchestratorRun, userId: number): Promise<{ inputs: OrchestratorInputs; outputs?: OrchestratorOutputs }> {
  const { rows } = await pool.query(`SELECT program_id, input_snapshot, input_digest, input_seal, suspended_outputs, outputs_digest, outputs_seal
    FROM submission_orchestrator_inputs WHERE run_id = $1 AND organization_id = $2`, [run.runId, run.organizationId]);
  const receipt = rows[0];
  if (!receipt) return readLegacyReleaseInputs(run, userId);
  if (!verifyOrchestratorReceipt(receipt.input_snapshot, receipt.input_digest, receipt.input_seal, run.organizationId)) {
    throw new OrchestratorContinuationRefusal('RESUME_INPUTS_UNAVAILABLE', 409, 'The original continuation inputs are unavailable or did not verify. Regenerate this package.');
  }
  const inputs = receipt.input_snapshot as OrchestratorInputs;
  if (!sameRunIdentity(inputs, run) ||
    (inputs.submissionFk ?? null) !== (run.submissionFk ?? null) || (inputs.programId ?? null) !== receipt.program_id ||
    !(['cmcSources', 'csrInputs', 'clinicalStudyData', 'nonclinicalStudies'] as const).every(key => Array.isArray(inputs[key]))) {
    throw new OrchestratorContinuationRefusal('RESUME_INPUTS_MISMATCH', 409, 'The original inputs do not identify this submission run.');
  }
  if (!inputs.programId) return readLegacyReleaseInputs(run, userId);
  await requireOrchestratorProgramAccess(run.organizationId, inputs.programId, userId);
  // The original worker actor must still be allowed; a queued job never inherits revoked access.
  if (inputs.userId && inputs.userId !== userId) await requireOrchestratorProgramAccess(run.organizationId, inputs.programId!, inputs.userId);
  if (inputs.projectId) await resolveCsrScope(db, run.organizationId, { projectId: inputs.projectId, programId: inputs.programId }, { forWrite: true, actorUserId: userId });
  return { inputs, outputs: readSuspendedOutputs(receipt, run) };
}

function readSuspendedOutputs(receipt: Record<string, unknown>, run: OrchestratorRun): OrchestratorOutputs | undefined {
  if (receipt.suspended_outputs != null) {
    if (!verifyOrchestratorReceipt(receipt.suspended_outputs, receipt.outputs_digest, receipt.outputs_seal, run.organizationId)) {
      throw new OrchestratorContinuationRefusal('RESUME_OUTPUTS_INVALID', 409, 'The paused outputs did not verify.');
    }
    const outputs = receipt.suspended_outputs as OrchestratorOutputs;
    if (!Array.isArray(outputs.module3Sections) || !Array.isArray(outputs.csrTables)) throw new OrchestratorContinuationRefusal('RESUME_OUTPUTS_INVALID', 409, 'The paused outputs are malformed.');
    return outputs;
  }
  if (run.status === 'awaiting-async') throw new OrchestratorContinuationRefusal('RESUME_OUTPUTS_UNAVAILABLE', 409, 'The paused outputs are unavailable. Regenerate this package.');
  return undefined;
}

/** A pre-migration release already has its exact record; only identity is needed to hydrate it.
 * Never apply this fallback to asynchronous work, whose original source/output inputs are unknown. */
async function readLegacyReleaseInputs(run: OrchestratorRun, userId: number): Promise<{ inputs: OrchestratorInputs }> {
  if (run.status === 'awaiting-async') throw new OrchestratorContinuationRefusal('RESUME_INPUTS_UNAVAILABLE', 409, 'This older asynchronous run has no original input receipt. Regenerate this package.');
  await verifyAwaitingReleasePayload(run);
  const { rows } = await pool.query(`SELECT program_id FROM submissions WHERE organization_id = $1 AND deleted_at IS NULL
    AND (($2::integer IS NOT NULL AND id = $2) OR ($2::integer IS NULL AND id::text = $3)) LIMIT 1`, [run.organizationId, run.submissionFk ?? null, run.submissionId]);
  const programId = rows[0]?.program_id;
  if (typeof programId !== 'string') throw new OrchestratorContinuationRefusal('PROGRAM_SCOPE_REQUIRED', 409, 'The recorded submission has no program scope. Regenerate this package.');
  await requireOrchestratorProgramAccess(run.organizationId, programId, userId);
  const snapshot = JSON.parse(run.steps.find(s => s.key === 'package.sign')!.outputRef!).signedSnapshot as SignedPackageSnapshot;
  return { inputs: { organizationId: run.organizationId, programId, userId,
    submissionId: run.submissionId, submissionFk: run.submissionFk ?? undefined, applicationNumber: run.applicationNumber,
    sequenceNumber: snapshot.sequenceNumber, region: run.region as OrchestratorInputs['region'], submissionType: run.submissionType as OrchestratorInputs['submissionType'],
    cmcSources: [], csrInputs: [], clinicalStudyData: [], nonclinicalStudies: [],
  } };
}

export type OrchestratorContinuation = { run: OrchestratorRun; continuation: 'busy' | 'waiting' | 'advanced' | 'finished' };

export async function prepareOrchestratorRelease(run: OrchestratorRun, userId: number): Promise<string> {
  const { inputs } = await readContinuationInputs(run, userId);
  if (inputs.clinicalSourceReceipts !== undefined && inputs.programId) {
    try { await validateCsrSourceReceipts(pool, { organizationId: run.organizationId, programId: inputs.programId, userId }, inputs.clinicalSourceReceipts); }
    catch (error) {
      if (error instanceof CsrSourceInputError) throw new OrchestratorContinuationRefusal(error.code, 409, error.message);
      throw error;
    }
  }
  return verifyAwaitingReleasePayload(run);
}

async function revalidatePausedCmc(inputs: OrchestratorInputs, userId: number): Promise<void> {
  if (!inputs.cmcSources.length) return;
  const current = await loadApprovedCmcSourcesForProject(inputs.organizationId, inputs.programId!, String(userId));
  const sourceSet = (sources: OrchestratorInputs['cmcSources']) => [...sources].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (current.gate !== 'open' || orchestratorInputDigest(sourceSet(current.sources)) !== orchestratorInputDigest(sourceSet(inputs.cmcSources))) {
    throw new OrchestratorContinuationRefusal('RESUME_CMC_SOURCES_CHANGED', 409, 'The paused Module 3 sources are no longer the same approved exportable records. Regenerate this package.');
  }
}

async function verifyPausedJobs(run: OrchestratorRun, inputs: OrchestratorInputs, outputs?: OrchestratorOutputs): Promise<void> {
  const expected = outputs?.csrNarrativeJobs?.jobs;
  let recorded: Array<{ jobId: number; studyId: string; protocolNumber: string }>;
  try { recorded = JSON.parse(run.steps.find(s => s.key === 'csr.draft-narrative' && s.status === 'awaiting-async')?.outputRef ?? '').jobs; }
  catch { throw new OrchestratorContinuationRefusal('RESUME_JOBS_INVALID', 409, 'The paused job receipt is unavailable.'); }
  const tuple = (jobs: Array<{ jobId: number; studyId: string; protocolNumber: string }>) => jobs.map(j => ({ jobId: j.jobId, studyId: j.studyId, protocolNumber: j.protocolNumber }));
  if (!inputs.projectId || !Array.isArray(expected) || !expected.length || !Array.isArray(recorded) || orchestratorInputDigest(tuple(expected)) !== orchestratorInputDigest(tuple(recorded))) {
    throw new OrchestratorContinuationRefusal('RESUME_JOBS_INVALID', 409, 'The paused jobs no longer match the original program receipt.');
  }
  const ids = [...new Set(expected.map(j => j.jobId))];
  const { rows } = await pool.query(`SELECT id, project_id, requested_by FROM csr_build_jobs WHERE organization_id = $1 AND id = ANY($2::integer[])`, [inputs.organizationId, ids]);
  if (rows.length !== ids.length || rows.some(j => Number(j.project_id) !== inputs.projectId || Number(j.requested_by) !== inputs.userId)) {
    throw new OrchestratorContinuationRefusal('RESUME_JOBS_SCOPE_MISMATCH', 409, 'A paused CSR job is no longer bound to its original program and actor.');
  }
}

async function resumeWithFrozenSources(runId: string, inputs: OrchestratorInputs, userId: number, outputs?: OrchestratorOutputs) {
  if (!inputs.clinicalSourceReceipts?.length || !inputs.programId) {
    return runOrchestrator(inputs, { resumeRunId: runId, resumeOutputs: outputs });
  }
  // Keep the original frozen values and hold the existing source read locks.
  const sourceClient = await pool.connect();
  try {
    await sourceClient.query('BEGIN');
    await setTenantContextTx(sourceClient, inputs.organizationId);
    await validateCsrSourceReceipts(sourceClient, { organizationId: inputs.organizationId, programId: inputs.programId, userId }, inputs.clinicalSourceReceipts, { lock: true });
    const resumed = await runOrchestrator(inputs, { resumeRunId: runId, resumeOutputs: outputs });
    await sourceClient.query('COMMIT');
    return resumed;
  } catch (error) {
    await sourceClient.query('ROLLBACK').catch(() => undefined);
    if (error instanceof CsrSourceInputError) throw new OrchestratorContinuationRefusal(error.code, 409, error.message);
    throw error;
  } finally { sourceClient.release(); }
}

/** One claim for every production resume path; the lease ends with the DB session. */
export async function continueOrchestratorRun(runId: string, organizationId: number, userId: number): Promise<OrchestratorContinuation> {
  let run = await getRun(runId, organizationId);
  if (!run) throw new OrchestratorContinuationRefusal('RUN_NOT_FOUND', 404, 'The run is not accessible.');
  const client = await pool.connect();
  const key = createHash('sha256').update(`orchestrator.continue:${organizationId}:${runId}`).digest().readInt32BE(0);
  let acquired = false;
  try {
    acquired = (await client.query('SELECT pg_try_advisory_lock($1, $2) AS acquired', [0x43524354, key])).rows[0]?.acquired === true;
    if (!acquired) return { run, continuation: 'busy' };
    // Re-read after the claim: an earlier claimant may have finished since our first read.
    run = await getRun(runId, organizationId);
    if (!run) throw new OrchestratorContinuationRefusal('RUN_NOT_FOUND', 404, 'The run is not accessible.');
    // Access, integrity and original worker authority are judged inside the claim.
    const { inputs, outputs } = await readContinuationInputs(run, userId);
    if (run.status !== 'awaiting-async' && run.status !== 'awaiting-signature') return { run, continuation: 'finished' };
    if (run.status === 'awaiting-signature') await verifyAwaitingReleasePayload(run);
    if (run.status === 'awaiting-async') await verifyPausedJobs(run, inputs, outputs);
    if (run.status === 'awaiting-async' && !(await getRunResumeReadiness(runId, organizationId)).ready) return { run, continuation: 'waiting' };
    if (run.status === 'awaiting-async') await revalidatePausedCmc(inputs, userId);
    const resumed = await resumeWithFrozenSources(runId, inputs, userId, outputs);
    return { run: resumed.run, continuation: resumed.run.status === 'awaiting-async' || resumed.run.status === 'awaiting-signature' ? 'waiting' : 'advanced' };
  } finally {
    try { if (acquired) await client.query('SELECT pg_advisory_unlock($1, $2)', [0x43524354, key]); } finally { client.release(); }
  }
}

/** Called after durable CSR completion. A refused continuation never undoes the completed job. */
export async function continueOrchestratorRunsForCsrJob(jobId: number, organizationId: number): Promise<Array<{ runId: string; continuation: string; code?: string }>> {
  if (!Number.isSafeInteger(jobId) || jobId <= 0 || !Number.isSafeInteger(organizationId) || organizationId <= 0) throw new Error('Invalid CSR continuation scope.');
  const { rows } = await pool.query(`SELECT r.run_id, i.input_snapshot->>'userId' AS actor_id
    FROM submission_orchestrator_runs r JOIN submission_orchestrator_inputs i ON i.run_id = r.run_id AND i.organization_id = r.organization_id
    WHERE r.organization_id = $2 AND r.status = 'awaiting-async'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(i.suspended_outputs#>'{csrNarrativeJobs,jobs}') j WHERE j->>'jobId' = $1::text)`, [jobId, organizationId]);
  const outcomes: Array<{ runId: string; continuation: string; code?: string }> = [];
  for (const row of rows) {
    const runId = String(row.run_id);
    try {
      const result = await continueOrchestratorRun(runId, organizationId, Number(row.actor_id));
      outcomes.push({ runId, continuation: result.continuation });
    } catch (err) {
      outcomes.push({ runId, continuation: 'retry-required', code: err instanceof OrchestratorContinuationRefusal ? err.code : 'CONTINUATION_UNAVAILABLE' });
    }
  }
  return outcomes;
}

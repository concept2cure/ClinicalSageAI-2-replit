import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ query: vi.fn(), lockQuery: vi.fn(), release: vi.fn(), getRun: vi.fn(), resume: vi.fn(), ready: vi.fn(), scope: vi.fn(), actor: vi.fn(), digest: vi.fn(), kms: vi.fn(), cmc: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query: m.query, connect: async () => ({ query: m.lockQuery, release: m.release }) }, db: {} }));
vi.mock('../csr/project-scope.js', () => ({ readCsrProjectActor: m.actor, resolveCsrScope: m.scope }));
vi.mock('../submission-package-orchestrator.js', async (original) => ({ ...await original<typeof import('../submission-package-orchestrator.js')>(), getRun: m.getRun, runOrchestrator: m.resume, getRunResumeReadiness: m.ready, computeBoundPayloadDigestFromComponents: m.digest }));
vi.mock('../cmc/load-approved-cmc-sources-for-project.js', () => ({ loadApprovedCmcSourcesForProject: m.cmc }));
vi.mock('../ectd/sign-payload-seal.js', async (original) => ({ ...await original<typeof import('../ectd/sign-payload-seal')>(), verifySignPayloadSignature: m.kms, isKmsSignerConfigured: () => false }));
import { continueOrchestratorRun, prepareOrchestratorRelease, continueOrchestratorRunsForCsrJob, verifyAwaitingReleasePayload } from '../submission-orchestrator-continuation';
import { orchestratorInputDigest } from '../submission-orchestrator-inputs';
import { sealSignPayloadDigest } from '../ectd/sign-payload-seal';
const ORG = 42, USER = 7, PROGRAM = '672d578b-8f27-4b15-8b40-5484a4996ace', RUN = '22e4f86d-4b76-48ac-87e3-8bce8804c324';
let run: any, receipt: any;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('AUDIT_HMAC_KEY', 'unit-only-receipt-seal');
  const inputs = { organizationId: ORG, programId: PROGRAM, userId: USER, submissionId: '91', submissionFk: 91, applicationNumber: '123456', region: 'US', submissionType: 'IND', cmcSources: [], csrInputs: [], clinicalStudyData: [], nonclinicalStudies: [] };
  const recordedPackageIdentity = { version: 1, identity: { programId: PROGRAM, applicationNumber: inputs.applicationNumber,
    applicantSponsorId: '22222222-2222-4222-8222-222222222222', applicantName: 'Recorded Sponsor',
    applicantId: '123456789', contact: { name: 'Regulatory Contact', phone: '+1 555 0100', email: 'ra@example.test' } } };
  const snapshot = { leaves: [], backboneXml: '', validatorOutcome: {}, ...inputs, sequenceNumber: '0000', totalSizeBytes: 0, recordedPackageIdentity };
  const payload = { signedSnapshot: snapshot, payloadDigest: 'verified-release-digest', payloadSeal: sealSignPayloadDigest('verified-release-digest', ORG) };
  run = { runId: RUN, ...inputs, status: 'awaiting-signature', steps: [{ key: 'package.sign', status: 'awaiting-signature', outputRef: JSON.stringify(payload) }] };
  receipt = { program_id: PROGRAM, input_snapshot: inputs, input_digest: orchestratorInputDigest(inputs), input_seal: sealSignPayloadDigest(orchestratorInputDigest(inputs), ORG) };
  m.actor.mockResolvedValue({ userId: USER, role: 'manager' }); m.scope.mockResolvedValue({});
  m.query.mockImplementation(async (sql: string) => {
    if (sql.includes('submission_orchestrator_inputs')) return { rows: receipt ? [receipt] : [] };
    if (sql.includes('FROM submissions')) return { rows: [{ program_id: PROGRAM }] };
    if (sql.includes('FROM csr_build_jobs')) return { rows: [{ id: 555, project_id: 88, requested_by: USER }] };
    if (sql.includes('FROM regulatory_programs')) return { rows: [{ id: PROGRAM, lead_user_id: USER }] };
    return { rows: [] };
  });
  m.getRun.mockImplementation(async () => run); m.lockQuery.mockResolvedValue({ rows: [{ acquired: true }] });
  m.resume.mockImplementation(async () => ({ run: { ...run, status: 'complete' }, outputs: {} }));
  m.ready.mockResolvedValue({ ready: true }); m.digest.mockReturnValue('verified-release-digest'); m.kms.mockResolvedValue('unsigned');
});
function pauseForAsync(outputs: any = { module3Sections: [], csrTables: [] }) {
  run.status = 'awaiting-async';
  const jobs = [{ jobId: 555, studyId: 'S1', protocolNumber: 'P1' }];
  run.steps.unshift({ key: 'csr.draft-narrative', status: 'awaiting-async', outputRef: JSON.stringify({ jobs }) });
  receipt.input_snapshot.projectId = 88;
  receipt.input_digest = orchestratorInputDigest(receipt.input_snapshot); receipt.input_seal = sealSignPayloadDigest(receipt.input_digest, ORG);
  outputs.csrNarrativeJobs = { jobs: jobs.map(j => ({ ...j, status: 'queued', progress: 0, sectionsComplete: 0 })), pendingJobIds: [555] };
  receipt.suspended_outputs = outputs; receipt.outputs_digest = orchestratorInputDigest(outputs); receipt.outputs_seal = sealSignPayloadDigest(receipt.outputs_digest, ORG);
}
function registerOrchestratorContinuationCases1() {
  it('uses only verified persisted inputs and the original run id, then releases the claim', async () => {
    const result = await continueOrchestratorRun(RUN, ORG, USER);
    expect(result.continuation).toBe('advanced'); expect(m.resume).toHaveBeenCalledWith(receipt.input_snapshot, { resumeRunId: RUN, resumeOutputs: undefined });
    expect(m.lockQuery.mock.calls.at(-1)?.[0]).toContain('pg_advisory_unlock'); expect(m.release).toHaveBeenCalledTimes(1);
  });
  it('does not run any downstream effect if another connection already holds the run', async () => {
    m.lockQuery.mockResolvedValueOnce({ rows: [{ acquired: false }] });
    expect((await continueOrchestratorRun(RUN, ORG, USER)).continuation).toBe('busy'); expect(m.resume).not.toHaveBeenCalled(); expect(m.release).toHaveBeenCalled();
  });
  it('returns an already finished run after the claim without repeating its effects', async () => {
    m.getRun.mockResolvedValueOnce(run).mockResolvedValueOnce({ ...run, status: 'complete' });
    expect((await continueOrchestratorRun(RUN, ORG, USER)).continuation).toBe('finished'); expect(m.resume).not.toHaveBeenCalled();
  });
  it('releases the claim even when downstream persistence fails', async () => {
    m.resume.mockRejectedValue(new Error('db unavailable'));
    await expect(continueOrchestratorRun(RUN, ORG, USER)).rejects.toThrow('db unavailable'); expect(m.release).toHaveBeenCalled();
  });
  it('allows only one of two overlapping continuation requests to execute the driver', async () => {
    let held = false;
    m.lockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_advisory_unlock')) { held = false; return { rows: [] }; }
      if (held) return { rows: [{ acquired: false }] };
      held = true; return { rows: [{ acquired: true }] };
    });
    let entered!: () => void, finish!: (value: any) => void;
    const enteredDriver = new Promise<void>(resolve => { entered = resolve; });
    m.resume.mockImplementation(() => { entered(); return new Promise(resolve => { finish = resolve; }); });
    const first = continueOrchestratorRun(RUN, ORG, USER); await enteredDriver;
    const second = await continueOrchestratorRun(RUN, ORG, USER);
    expect(second.continuation).toBe('busy'); expect(m.resume).toHaveBeenCalledTimes(1);
    finish({ run: { ...run, status: 'complete' } }); await first;
    expect(held).toBe(false);
  });
  it.each(['snapshot', 'hash', 'seal', 'identity', 'program'])('refuses a changed %s before any effect', async (change) => {
    if (change === 'snapshot') receipt.input_snapshot.cmcSources.push({ content: 'altered' });
    if (change === 'hash') receipt.input_digest = 'forged';
    if (change === 'seal') receipt.input_seal = null;
    if (change === 'identity') run.submissionId = 'another';
    if (change === 'program') receipt.program_id = 'another';
    await expect(continueOrchestratorRun(RUN, ORG, USER)).rejects.toMatchObject({ status: 409 }); expect(m.resume).not.toHaveBeenCalled();
  });
  it('collapses a foreign or missing run before loading any source inputs', async () => {
    m.getRun.mockResolvedValue(null);
    await expect(continueOrchestratorRun(RUN, ORG, USER)).rejects.toMatchObject({ status: 404 }); expect(m.query).not.toHaveBeenCalled();
  });
  it('rechecks current program authority, ignoring the original actor role', async () => {
    m.actor.mockResolvedValue({ userId: 8, role: 'viewer' });
    await expect(continueOrchestratorRun(RUN, ORG, 8)).rejects.toMatchObject({ status: 403 }); expect(m.resume).not.toHaveBeenCalled();
  });
  it('refuses a program lead downgraded to viewer before build/resume effects', async () => {
    m.actor.mockResolvedValue({ userId: USER, role: 'viewer' });
    await expect(continueOrchestratorRun(RUN, ORG, USER)).rejects.toMatchObject({ code: 'PROGRAM_WRITE_ACCESS_DENIED', status: 403 });
    expect(m.resume).not.toHaveBeenCalled();
    expect(m.query.mock.calls.some(call => String(call[0]).includes('FROM regulatory_programs'))).toBe(false);
  });
  it('does not guess original inputs for older asynchronous work', async () => {
    receipt = null; run.status = 'awaiting-async';
    await expect(continueOrchestratorRun(RUN, ORG, USER)).rejects.toMatchObject({ code: 'RESUME_INPUTS_UNAVAILABLE' }); expect(m.resume).not.toHaveBeenCalled();
  });
  it('hydrates an older frozen signature record using its scoped submission identity', async () => {
    receipt = null;
    expect((await continueOrchestratorRun(RUN, ORG, USER)).continuation).toBe('advanced');
    expect(m.resume.mock.calls[0][0]).toMatchObject({ organizationId: ORG, programId: PROGRAM, submissionFk: 91, cmcSources: [] });
  });
}

function registerOrchestratorContinuationCases2() {
  it('refuses a forged frozen release before creating any signature', async () => {
    m.digest.mockReturnValue('changed');
    await expect(prepareOrchestratorRelease(run, USER)).rejects.toMatchObject({ code: 'SIGNATURE_PAYLOAD_INVALID' });
  });
  it('waits for async jobs without running downstream work, then resumes with exact paused outputs', async () => {
    const outputs = { module3Sections: [{ narrativeDraft: 'the original AI text' }], csrTables: [] };
    pauseForAsync(outputs);
    m.ready.mockResolvedValueOnce({ ready: false });
    expect((await continueOrchestratorRun(RUN, ORG, USER)).continuation).toBe('waiting'); expect(m.resume).not.toHaveBeenCalled();
    await continueOrchestratorRun(RUN, ORG, USER);
    expect(m.resume).toHaveBeenCalledWith(receipt.input_snapshot, { resumeRunId: RUN, resumeOutputs: outputs });
  });
  it.each(['closed', 'changed'])('refuses %s CMC approval/source records before assembling an async continuation', async (change) => {
    receipt.input_snapshot.cmcSources = [{ id: 'source-1', sourceHash: 'original' }];
    receipt.input_digest = orchestratorInputDigest(receipt.input_snapshot); receipt.input_seal = sealSignPayloadDigest(receipt.input_digest, ORG);
    pauseForAsync();
    m.cmc.mockResolvedValue(change === 'closed' ? { gate: 'closed', sources: [] } : { gate: 'open', sources: [{ id: 'source-1', sourceHash: 'new' }] });
    await expect(continueOrchestratorRun(RUN, ORG, USER)).rejects.toMatchObject({ code: 'RESUME_CMC_SOURCES_CHANGED' });
    expect(m.resume).not.toHaveBeenCalled();
  });
  it('refuses replacing the paused job id with another same-organization job', async () => {
    pauseForAsync(); run.steps[0].outputRef = JSON.stringify({ jobs: [{ jobId: 999, studyId: 'S1', protocolNumber: 'P1' }] });
    await expect(continueOrchestratorRun(RUN, ORG, USER)).rejects.toMatchObject({ code: 'RESUME_JOBS_INVALID' });
    expect(m.ready).not.toHaveBeenCalled(); expect(m.resume).not.toHaveBeenCalled();
  });
  it('refuses a CSR job whose persisted project has changed from the original program anchor', async () => {
    pauseForAsync(); const base = m.query.getMockImplementation()!;
    m.query.mockImplementation(async (sql: string, args: unknown[]) => sql.includes('FROM csr_build_jobs') ? { rows: [{ id: 555, project_id: 99, requested_by: USER }] } : base(sql, args));
    await expect(continueOrchestratorRun(RUN, ORG, USER)).rejects.toMatchObject({ code: 'RESUME_JOBS_SCOPE_MISMATCH' }); expect(m.resume).not.toHaveBeenCalled();
  });
  it('continues dependent work on CSR completion using only its stored tenant and original actor', async () => {
    pauseForAsync(); const base = m.query.getMockImplementation()!;
    m.query.mockImplementation(async (sql: string, args: unknown[]) => sql.includes('SELECT r.run_id') ? { rows: [{ run_id: RUN, actor_id: USER }] } : base(sql, args));
    const results = await continueOrchestratorRunsForCsrJob(555, ORG);
    expect(results).toEqual([{ runId: RUN, continuation: 'advanced' }]);
    expect(m.query.mock.calls[0][1]).toEqual([555, ORG]); expect(m.actor).toHaveBeenCalledWith(expect.anything(), ORG, USER);
  });
}

describe('guarded persisted continuation', () => {
  registerOrchestratorContinuationCases1();
  registerOrchestratorContinuationCases2();
});

async function captureRegionalRelease(region: string, proof: unknown) {
  const actual = await vi.importActual<typeof import('../submission-package-orchestrator.js')>('../submission-package-orchestrator.js');
  m.digest.mockImplementation(actual.computeBoundPayloadDigestFromComponents);
  const oldSnapshot = JSON.parse(run.steps[0].outputRef).signedSnapshot;
  const snapshot = { ...oldSnapshot, region, recordedPackageIdentity: proof };
  const payloadDigest = actual.computeBoundPayloadDigestFromComponents(snapshot);
  run.region = region;
  run.steps[0].outputRef = JSON.stringify({ signedSnapshot: snapshot, payloadDigest, payloadSeal: sealSignPayloadDigest(payloadDigest, ORG) });
  receipt.input_snapshot.region = region;
  receipt.input_digest = orchestratorInputDigest(receipt.input_snapshot);
  receipt.input_seal = sealSignPayloadDigest(receipt.input_digest, ORG);
  return payloadDigest;
}

describe('release preparation reuses the canonical captured identity sign boundary', () => {
  const proof = { version: 1, identity: { programId: PROGRAM, applicationNumber: '123456',
    applicantSponsorId: '22222222-2222-4222-8222-222222222222', applicantName: 'Recorded Sponsor',
    applicantId: null, contact: { name: null, phone: null, email: null } } };

  it.each(['EU', 'JP', 'US'])('refuses an intact hash/seal on a proof-free awaiting %s record', async (region) => {
    await captureRegionalRelease(region, undefined);
    await expect(verifyAwaitingReleasePayload(run)).rejects.toMatchObject({ code: 'SIGNATURE_PACKAGE_IDENTITY_REQUIRED', status: 409 });
    expect(m.kms).toHaveBeenCalled();
  });

  it.each([
    { ...proof, version: 2 },
    { ...proof, identity: { ...proof.identity, applicationNumber: '654321' } },
    { ...proof, identity: { ...proof.identity, applicantName: null } },
    { ...proof, identity: { ...proof.identity, contact: null } },
    { ...proof, identity: { ...proof.identity, applicantId: '123456789' } },
  ])('refuses malformed or unprojected proof despite a valid hash and seal', async (captured) => {
    await captureRegionalRelease('EU', captured);
    await expect(verifyAwaitingReleasePayload(run)).rejects.toMatchObject({ code: 'SIGNATURE_PACKAGE_IDENTITY_REQUIRED', status: 409 });
  });

  it('refuses a proof-bearing unknown region before a ceremony can be prepared', async () => {
    await captureRegionalRelease('unknown-agency', proof);
    await expect(prepareOrchestratorRelease(run, USER)).rejects.toMatchObject({ code: 'SIGNATURE_PACKAGE_IDENTITY_REQUIRED', status: 409 });
    expect(m.resume).not.toHaveBeenCalled();
  });

  it.each(['EU', 'JP'])('prepares complete captured %s facts without FDA DUNS/contact', async (region) => {
    const payloadDigest = await captureRegionalRelease(region, proof);
    expect(await prepareOrchestratorRelease(run, USER)).toBe(payloadDigest);
  });

  it('refuses a legacy proof-free record before source lookup or continuation', async () => {
    await captureRegionalRelease('EU', undefined);
    receipt = null;
    await expect(prepareOrchestratorRelease(run, USER)).rejects.toMatchObject({ code: 'SIGNATURE_PACKAGE_IDENTITY_REQUIRED', status: 409 });
    expect(m.query.mock.calls.some(call => String(call[0]).includes('FROM submissions'))).toBe(false);
    expect(m.resume).not.toHaveBeenCalled();
  });
});

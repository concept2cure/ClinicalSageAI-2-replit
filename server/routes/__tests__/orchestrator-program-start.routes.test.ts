import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const m = vi.hoisted(() => ({ start: vi.fn(), access: vi.fn(), spine: vi.fn(), sequence: vi.fn(), anchor: vi.fn(), identity: vi.fn(), identityRefusal: vi.fn(), cmc: vi.fn(), csr: vi.fn(), query: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query: m.query }, db: {} }));
vi.mock('../../services/submission-package-orchestrator.js', () => ({ runOrchestrator: m.start, loadSubmissionFkBySubmissionIdText: vi.fn(), getRun: vi.fn(), getRunAudit: vi.fn(), regenerateAffected: vi.fn() }));
vi.mock('../../services/submission-orchestrator-continuation.js', () => ({ continueOrchestratorRun: vi.fn(), requireOrchestratorProgramAccess: m.access, OrchestratorContinuationRefusal: class extends Error {} }));
vi.mock('../../services/c2c/program-project-anchor.js', () => ({ readProgramAnchorRow: m.anchor }));
vi.mock('../../services/cmc/submission-spine.js', () => ({ resolveSubmissionSpine: m.spine, resolveSequenceSpine: m.sequence }));
// The run reads its sequence's market's identity by submission since P-44; the same stand-in.
vi.mock('../../services/ectd/package-identity.js', () => ({ readRecordedPackageIdentity: m.identity, readSubmissionPackageIdentity: m.identity, packageIdentityRefusal: m.identityRefusal }));
vi.mock('../../services/cmc/load-approved-cmc-sources-for-project.js', () => ({ loadApprovedCmcSourcesForProject: m.cmc }));
vi.mock('../../services/csr/load-csr-inputs-for-project.js', () => ({ loadCsrInputsForProject: m.csr }));
vi.mock('../../services/auditService.js', () => ({ default: { logAction: vi.fn() } }));
import router from '../submission-orchestrator';
const PROGRAM = '672d578b-8f27-4b15-8b40-5484a4996ace';
function app() { const a = express(); a.use(express.json()); a.use((req, _res, next) => { (req as any).user = { id: 7, role: 'manager', organizationId: 42 }; next(); }); a.use('/api/submission-orchestrator', router); return a; }
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ id: PROGRAM, program_type: 'ind', name: 'My trial', product_name: 'My product', code: 'IND' });
  const spine = { submissionId: 91, match: 'program', applicationType: 'ind', sequence: { id: 4, sequenceNumber: '0002', region: 'FDA' } };
  m.spine.mockResolvedValue(spine); m.sequence.mockResolvedValue(spine); m.anchor.mockResolvedValue({ id: 88 });
  m.identity.mockResolvedValue({ applicationNumber: 'IND-123', applicantName: 'Recorded applicant' }); m.identityRefusal.mockReturnValue(null);
  m.cmc.mockResolvedValue({ gate: 'open', sources: [{ id: 'approved-source' }], approvedSections: 1 }); m.csr.mockResolvedValue([{ studyId: 'completed-CSR' }]);
  m.start.mockResolvedValue({ run: { runId: 'run-1', status: 'awaiting-signature', steps: [{ key: 'package.sign', outputRef: JSON.stringify({ payloadDigest: 'digest', signedSnapshot: { secret: true } }) }] } });
  m.query.mockResolvedValue({ rows: [] });
});
describe('selected canonical program orchestration', () => {
  it('uses recorded sequence identity and governed inputs with the current tenant/actor, never supplied body arrays', async () => {
    const res = await request(app()).post('/api/submission-orchestrator/runs/for-program').send({ programId: PROGRAM, sequenceId: 4, organizationId: 99, userId: 100, applicationNumber: 'forged', cmcSources: [{ forged: true }] });
    expect(res.status).toBe(200); expect(m.access).toHaveBeenCalledWith(42, PROGRAM, 7);
    expect(m.cmc).toHaveBeenCalledWith(42, PROGRAM, '7'); expect(m.csr).toHaveBeenCalledWith(42, 88, { actorUserId: 7 });
    expect(m.start).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 42, userId: 7, programId: PROGRAM, projectId: 88, submissionId: '91', submissionFk: 91, applicationNumber: 'IND-123', region: 'US', sequenceNumber: '0002', cmcSources: [{ id: 'approved-source' }] }));
    expect(JSON.stringify(res.body)).not.toContain('secret'); expect(res.body.inputGaps).toHaveLength(2);
  });
  it('refuses a foreign or missing sequence without starting replacement work', async () => {
    m.sequence.mockResolvedValue(null);
    const res = await request(app()).post('/api/submission-orchestrator/runs/for-program').send({ programId: PROGRAM, sequenceId: 999 });
    expect(res.status).toBe(409); expect(res.body.error).toBe('SUBMISSION_SEQUENCE_REQUIRED'); expect(m.start).not.toHaveBeenCalled();
  });
  it('refuses absent regulatory identity before loading data or writing a run', async () => {
    m.identityRefusal.mockReturnValue({ code: 'PACKAGE_IDENTITY_MISSING', message: 'Record the application number.' });
    const res = await request(app()).post('/api/submission-orchestrator/runs/for-program').send({ programId: PROGRAM });
    expect(res.status).toBe(409); expect(m.cmc).not.toHaveBeenCalled(); expect(m.start).not.toHaveBeenCalled();
  });
  it('keeps a refused Module 3 empty and reports the export gate reason honestly', async () => {
    m.cmc.mockResolvedValue({ gate: 'closed', sources: [], reason: 'Approve current Module 3 first.' });
    const res = await request(app()).post('/api/submission-orchestrator/runs/for-program').send({ programId: PROGRAM });
    expect(res.status).toBe(200); expect(res.body.m3Refusal).toBe('Approve current Module 3 first.'); expect(m.start.mock.calls[0][0].cmcSources).toEqual([]);
  });
  it('lists only the requested tenant/program scope without exposing the private receipt', async () => {
    m.query.mockResolvedValue({ rows: [{ runId: 'recorded', status: 'awaiting-signature' }] });
    const res = await request(app()).get(`/api/submission-orchestrator/runs?programId=${PROGRAM}&organizationId=99`);
    expect(res.status).toBe(200); expect(m.query.mock.calls[0][1]).toEqual([42, PROGRAM]); expect(res.body).toEqual({ runs: [{ runId: 'recorded', status: 'awaiting-signature' }] });
    expect(m.query.mock.calls[0][0]).not.toContain('input_snapshot');
  });
});

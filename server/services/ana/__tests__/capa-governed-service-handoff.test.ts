/** Actual registered tool handlers preserve trusted caller identity and commit
 * uncertainty. Permission/SQL guarantees are exercised by the native service
 * tests; these controls isolate transport after tool admission. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
const service = vi.hoisted(() => ({ createComplaint: vi.fn(), createCapaRecord: vi.fn(), getTriageQueue: vi.fn(), listVigilanceEvents: vi.fn() }));
vi.mock('../../capa-mdr/capaMdr.service', () => service);
vi.mock('../tool-record-scope', () => ({ foreignProgramRefusal: async () => null, foreignRecordRefusal: async () => null }));
vi.mock('../../part11/editor-role', () => ({ editorRoleDecision: async () => ({ allowed: true }), editorRoleRefusalText: () => 'Not allowed.' }));
vi.mock('../../ai-governance/approved-models', () => ({ isServedModelApprovedForHighRisk: () => true }));
import { getToolHandler } from '../AnaToolExecutor';
import { classifyResult } from '../tool-telemetry';

const context = { organizationId: 1, userId: 7, humanConfirmed: true };
const receipt = { persisted: true, chained: true };
const complaint = { programId: 'program-1', source: 'direct', channel: 'phone', receivedAt: '2026-10-14T12:00:00Z', eventNarrative: 'Synthetic intake', patientHarm: 'injury', severityAssessment: 'serious', reason: 'Synthetic review reason.', userId: 999, organizationId: 2, createdBy: '999' };
const capa = { programId: 'program-1', title: 'Synthetic CAPA', type: 'corrective', source: 'complaint', reason: 'Synthetic review reason.', userId: 999, createdBy: '999' };
const call = async (name: string, input: Record<string, unknown>) => JSON.parse(await getToolHandler(name)!(input, context));

beforeEach(() => {
  for (const fn of Object.values(service)) fn.mockReset();
  service.createComplaint.mockResolvedValue({ id: 'complaint-1', complaintCode: 'CMP-2026-0001', preliminaryClassification: {}, auditTrail: receipt });
  service.createCapaRecord.mockResolvedValue({ id: 'capa-1', capaCode: 'CAPA-2026-0001', state: 'open', auditTrail: receipt });
  service.getTriageQueue.mockResolvedValue([]);
  service.listVigilanceEvents.mockResolvedValue([]);
});

describe('CAPA AnA service handoff', () => {
  it('passes the trusted context actor to both writes and carries the committed critical audit receipt', async () => {
    expect(await call('create_complaint', complaint)).toMatchObject({ status: 'created', complaintId: 'complaint-1', meta: { auditTrail: receipt } });
    expect(await call('open_device_capa', capa)).toMatchObject({ status: 'created', capaId: 'capa-1', meta: { auditTrail: receipt } });
    expect(service.createComplaint).toHaveBeenCalledWith(1, expect.objectContaining({ createdBy: '7', patientHarm: 'injury', severityAssessment: 'serious' }), { userId: 7 });
    expect(service.createCapaRecord).toHaveBeenCalledWith(1, expect.objectContaining({ createdBy: '7' }), { userId: 7 });
  });

  it.each([['create_complaint', 'createComplaint', complaint], ['open_device_capa', 'createCapaRecord', capa]] as const)('%s returns readback uncertainty instead of a definite failed or successful creation', async (tool, method, input) => {
      service[method].mockRejectedValueOnce({ code: 'CAPA_COMMIT_UNCONFIRMED', message: 'Read back before retrying.',
        recovery: { recordId: 'record-1', recoveryUrl: '/api/capa-mdr/capa/record-1' } });
      const output = await call(tool, input);
      expect(output).toEqual({ status: 'unconfirmed', error: 'CAPA_COMMIT_UNCONFIRMED', code: 'CAPA_COMMIT_UNCONFIRMED', message: 'Read back before retrying.',
        recovery: { recordId: 'record-1', recoveryUrl: '/api/capa-mdr/capa/record-1' } });
      expect(output).not.toHaveProperty('meta');
      expect(classifyResult(JSON.stringify(output))).toMatchObject({ outcome: 'degraded', note: 'CAPA_COMMIT_UNCONFIRMED' });
    });

  it('passes the verified context actor to both read entrypoints', async () => {
    expect(await call('triage_capa_mdr_queue', { programId: 'program-1', userId: 999 })).toMatchObject({ status: 'computed', items: [] });
    expect(await call('read_vigilance_timeline', { programId: 'program-1', userId: 999 })).toMatchObject({ status: 'computed', events: [] });
    expect(service.getTriageQueue).toHaveBeenCalledWith(1, expect.objectContaining({ programId: 'program-1' }), { userId: 7 });
    expect(service.listVigilanceEvents).toHaveBeenCalledWith(1, expect.objectContaining({ programId: 'program-1' }), { userId: 7 });
  });
});

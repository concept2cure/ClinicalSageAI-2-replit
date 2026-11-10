import { qmsApprovalFixture } from '../../services/qms/__tests__/_release-approval-fixture';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeQmsDocumentContentDigest, type QmsDocumentRow } from '../../services/qms/document-approval-signature';
import * as trainingService from '../../services/qms/training';
import * as controlledTextService from '../../services/qms/training-controlled-text';

const h = vi.hoisted(() => ({
  doc: null as QmsDocumentRow | null, pendingDoc: null as QmsDocumentRow | null, records: [] as Record<string, unknown>[],
  pending: [] as Record<string, unknown>[], statements: [] as string[],
  auditFails: false, commitFails: false, account: 'active', org: 'active', member: true, role: 'viewer', membershipRole: 'viewer',
  pooled: vi.fn(), audit: vi.fn(), client: { query: vi.fn() }, tasks: vi.fn(),
}));
vi.mock('../../db', () => ({ pool: { query: h.pooled, connect: vi.fn(() => { throw new Error('No pooled fallback'); }) } }));
// The training tasks are planned after the acknowledgement commits, in their own read-only transaction
// (training-task.ts, tested in tests/db/qms-training-tasks.dbtest.ts); here, only that the route asks.
vi.mock('../../services/qms/training-task', () => ({ reconcileTrainingTasks: (...args: unknown[]) => h.tasks(...args) }));
vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn(async () => ({ persisted: true, chained: true })) },
  writeChainedAuditRow: (...args: unknown[]) => h.audit(...args),
}));
import router from '../mdx-qms';

const ORG = 9; const USER = 7;
function release(): QmsDocumentRow {
  const row: QmsDocumentRow = {
    id: 11, organization_id: ORG, doc_number: 'SOP-001', title: 'Design control',
    doc_type: 'sop', category: 'design', version: '1.0', status: 'effective',
    effective_date: '2020-01-01', next_review_date: null, author_id: 3,
    approver_id: 5, approved_at: '2020-01-01T00:00:00.000Z', superseded_by_id: null,
    artifact_id: null, metadata: { sections: [{ key: 'purpose', body: 'Read the recorded procedure.' }] },
  };
  row.metadata!.approval = { contentDigest: computeQmsDocumentContentDigest(row), meaning: 'APPROVED',
    bindingBasis: 'qms-document-version-content-sha256', by: 5, at: row.approved_at };
  return row;
}
const body = () => ({ documentVersion: '1.0', contentDigest: computeQmsDocumentContentDigest(h.doc!), understood: true, method: 'attestation' });
const controlledBody = () => ({ controlledText: { documentVersion: '1.0', contentDigest: computeQmsDocumentContentDigest(h.doc!),
  sections: [{ key: 'purpose', label: 'Purpose', body: 'The human-edited controlled procedure.' }] },
reason: 'Capture the reviewed procedure text' });
function app(pinned = true) {
  const app = express(); app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: USER, organizationId: ORG, role: h.role };
    if (pinned) Object.assign(req, { dbClient: h.client });
    next();
  });
  app.use('/api/mdx', router); return app;
}
function commitFixture() {
  h.records.push(...h.pending); h.pending = [];
  if (h.pendingDoc) h.doc = h.pendingDoc;
  h.pendingDoc = null;
  if (h.commitFails) throw new Error('Commit response lost');
  return { rows: [] };
}
beforeEach(() => {
  h.doc = release(); h.pendingDoc = null; h.records = []; h.pending = []; h.statements = [];
  h.auditFails = false; h.commitFails = false; h.account = 'active'; h.org = 'active'; h.member = true; h.role = 'viewer'; h.membershipRole = 'viewer';
  h.tasks.mockReset().mockResolvedValue(undefined);
  h.pooled.mockReset().mockRejectedValue(new Error('Shared pool cannot carry request context'));
  h.audit.mockReset().mockImplementation(async () => { if (h.auditFails) throw new Error('Audit refused'); });
  h.client.query.mockReset().mockImplementation(async (sql: string, params: unknown[] = []) => {
    h.statements.push(sql.trim().split(/\s+/)[0]);
    if (sql === 'BEGIN') { h.pending = []; h.pendingDoc = null; return { rows: [] }; }
    if (sql === 'ROLLBACK') { h.pending = []; h.pendingDoc = null; return { rows: [] }; }
    if (sql === 'COMMIT') return commitFixture();
    if (/FROM organization_users/.test(sql)) return { rows: h.member ? [{ account_status: h.account, organization_status: h.org, payment_status: 'active', membership_role: h.membershipRole }] : [] };
    if (/UPDATE qms_documents/.test(sql)) {
      h.pendingDoc = { ...h.doc!, metadata: JSON.parse(String(params[2])), status: 'draft', approver_id: null, approved_at: null };
      return { rows: [h.pendingDoc] };
    }
    if (/FROM electronic_signatures/.test(sql)) return { rows: [{ id: 501, ...qmsApprovalFixture(h.doc!) }] };
    if (/FROM qms_documents/.test(sql)) return { rows: h.doc && Number(params[0]) === h.doc.id && Number(params[1]) === ORG ? [h.doc] : [] };
    if (/INSERT INTO qms_training_records/.test(sql)) {
      const row = { id: h.records.length + 1, organization_id: ORG, user_id: USER, document_id: 11,
        document_version: '1.0', acknowledgment_method: 'attestation', acknowledged_at: params[4],
        expires_at: params[5], metadata: JSON.parse(String(params[6])) };
      h.pending.push(row); return { rows: [row] };
    }
    if (/FROM qms_training_records/.test(sql)) return { rows: h.records };
    throw new Error('Unexpected training SQL');
  });
});
afterEach(() => vi.restoreAllMocks());

describe('native personal QMS training request contract', () => {
  it('refuses fictional server-owned contributor metadata during native creation', async () => {
    h.role = 'member';
    const res = await request(app()).post('/api/mdx/qms/documents').send({ docNumber: 'SOP-FAKE', title: 'Forged authorship', docType: 'sop',
      metadata: { controlledTextAuthorship: { authorUserIds: [99] } } });
    expect(res.status).toBe(422); expect(h.pooled).not.toHaveBeenCalled(); expect(h.audit).not.toHaveBeenCalled();
  });
  it('keeps document data and exposes actual release text through the pinned client', async () => {
    const res = await request(app()).get('/api/mdx/qms/documents/11');
    expect(res.status).toBe(200); expect(res.body.data.id).toBe(11);
    expect(res.body.meta.training).toMatchObject({ eligible: true, documentVersion: '1.0', acknowledgement: null,
      sections: [{ key: 'purpose', body: 'Read the recorded procedure.' }] });
    expect(h.pooled).not.toHaveBeenCalled();
  });
  it('allows a viewer to record only their own explicit attestation with atomic audit', async () => {
    const res = await request(app()).post('/api/mdx/qms/documents/11/training-ack').send(body());
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ documentId: 11, userId: USER, method: 'attestation', documentVersion: '1.0' });
    expect(res.body.meta.auditTrail).toEqual({ persisted: true, chained: true });
    expect(h.audit).toHaveBeenCalledWith(h.client, expect.objectContaining({ userId: USER, tenantId: ORG }));
    expect(h.statements.at(-1)).toBe('COMMIT'); expect(h.records).toHaveLength(1);
    expect(h.pooled).not.toHaveBeenCalled();
    expect(h.tasks).toHaveBeenCalledExactlyOnceWith(h.client, ORG, { documentIds: [11], userIds: [USER] }, USER);
  });
  it.each([{ userId: 99 }, { understood: false }, { method: 'e-signature' }, { quizScore: 100 }])('refuses fabricated claims before a transaction: %j', async extra => {
    const res = await request(app()).post('/api/mdx/qms/documents/11/training-ack').send({ ...body(), ...extra });
    expect(res.status).toBe(422); expect(h.statements).toEqual([]); expect(h.records).toEqual([]);
  });
  it('refuses a stale digest without recording or claiming an acknowledgement', async () => {
    const res = await request(app()).post('/api/mdx/qms/documents/11/training-ack').send({ ...body(), contentDigest: 'a'.repeat(64) });
    expect(res.status).toBe(409); expect(h.records).toEqual([]); expect(h.audit).not.toHaveBeenCalled();
    expect(h.tasks, 'a refused acknowledgement moves no task').not.toHaveBeenCalled();
  });
  it('rolls the record back if the chained audit refuses', async () => {
    h.auditFails = true;
    const res = await request(app()).post('/api/mdx/qms/documents/11/training-ack').send(body());
    expect(res.status).toBe(500); expect(h.statements.at(-1)).toBe('ROLLBACK');
    expect(h.records).toEqual([]); expect(res.body.meta?.auditTrail).toBeUndefined();
  });
  it('returns the same current receipt on a retry without a second record or audit', async () => {
    const first = await request(app()).post('/api/mdx/qms/documents/11/training-ack').send(body());
    const second = await request(app()).post('/api/mdx/qms/documents/11/training-ack').send(body());
    expect(first.status).toBe(201); expect(second.status).toBe(200);
    expect(second.body.data).toEqual(first.body.data); expect(second.body.meta.alreadyAcknowledged).toBe(true);
    expect(h.records).toHaveLength(1); expect(h.audit).toHaveBeenCalledTimes(1);
  });
  it('does not claim rollback when the COMMIT response is uncertain; rereading shows the persisted receipt', async () => {
    h.commitFails = true;
    const res = await request(app()).post('/api/mdx/qms/documents/11/training-ack').send(body());
    expect(res.status).toBe(503); expect(res.body.error).toMatch(/confirm|reload/i);
    expect(JSON.stringify(res.body)).not.toMatch(/rolled back|nothing changed/i);
    const reread = await request(app()).get('/api/mdx/qms/documents/11');
    expect(reread.body.meta.training.acknowledgement.id).toBe(h.records[0].id);
  });
  it('fails closed without the request-pinned context', async () => {
    const res = await request(app(false)).post('/api/mdx/qms/documents/11/training-ack').send(body());
    expect(res.status).toBe(500); expect(h.records).toEqual([]); expect(h.pooled).not.toHaveBeenCalled();
  });
});

describe('native controlled QMS text request contract', () => {
  it('saves controlled draft text through the same request client without a pooled fallback', async () => {
    h.role = h.membershipRole = 'member'; h.doc!.status = 'draft';
    const res = await request(app()).patch('/api/mdx/qms/documents/11').send(controlledBody());
    expect(res.status).toBe(200); expect(res.body.meta.auditTrail).toEqual({ persisted: true, chained: true });
    expect(res.body.data.metadata.sections[0].body).toBe('The human-edited controlled procedure.');
    expect(res.body.meta.training.eligible).toBe(false); expect(h.pooled).not.toHaveBeenCalled();
  });
  it('refuses a stale controlled save and mixing legacy fields before any mutation', async () => {
    h.role = h.membershipRole = 'member'; h.doc!.status = 'draft';
    const input = controlledBody(); input.controlledText.contentDigest = 'a'.repeat(64);
    const stale = await request(app()).patch('/api/mdx/qms/documents/11').send(input);
    expect(stale.status).toBe(409); expect(h.audit).not.toHaveBeenCalled();
    expect(h.doc!.metadata!.sections).toEqual([{ key: 'purpose', body: 'Read the recorded procedure.' }]);
    h.statements = [];
    const mixed = await request(app()).patch('/api/mdx/qms/documents/11').send({ ...controlledBody(), title: 'Silent header edit' });
    expect(mixed.status).toBe(422); expect(h.statements).toEqual([]);
  });
  it('rechecks actual viewer membership even when the session still claims editor access', async () => {
    h.role = 'member'; h.doc!.status = 'draft';
    const res = await request(app()).patch('/api/mdx/qms/documents/11').send(controlledBody());
    expect(res.status).toBe(403); expect(h.audit).not.toHaveBeenCalled();
    expect(h.statements).not.toContain('UPDATE'); expect(h.pooled).not.toHaveBeenCalled();
  });
  it('rolls the controlled text back when its chained audit refuses', async () => {
    h.role = h.membershipRole = 'member'; h.doc!.status = 'draft'; h.auditFails = true;
    const original = JSON.parse(JSON.stringify(h.doc));
    const res = await request(app()).patch('/api/mdx/qms/documents/11').send(controlledBody());
    expect(res.status).toBe(500); expect(h.doc).toEqual(original);
    expect(h.statements.at(-1)).toBe('ROLLBACK'); expect(res.body.meta?.auditTrail).toBeUndefined();
  });
  it('requires the pinned request client for a controlled save', async () => {
    h.role = h.membershipRole = 'member'; h.doc!.status = 'draft';
    const res = await request(app(false)).patch('/api/mdx/qms/documents/11').send(controlledBody());
    expect(res.status).toBe(500); expect(h.audit).not.toHaveBeenCalled(); expect(h.pooled).not.toHaveBeenCalled();
  });
  it('reports uncertain controlled-text COMMIT without a false success and supports rereading', async () => {
    h.role = h.membershipRole = 'member'; h.doc!.status = 'draft'; h.commitFails = true;
    const res = await request(app()).patch('/api/mdx/qms/documents/11').send(controlledBody());
    expect(res.status).toBe(503); expect(res.body.error).toMatch(/confirm|reload/i);
    expect(JSON.stringify(res.body)).not.toMatch(/rolled back|nothing changed/i);
    const reread = await request(app()).get('/api/mdx/qms/documents/11');
    expect(reread.body.meta.training.sections[0].body).toBe('The human-edited controlled procedure.');
  });
  it('does not expose training content from a mismatched tenant row', async () => {
    h.doc!.organization_id = 99;
    const res = await request(app()).get('/api/mdx/qms/documents/11');
    expect(res.status).toBe(404); expect(res.body.meta?.training).toBeUndefined();
  });
});

describe('uncertain QMS writes expose safe recovery information', () => {
  const driverDetail = 'Synthetic sensitive driver diagnostic: DO_NOT_REFLECT_FIXTURE_DETAILS';
  const driverCode = 'SYNTHETIC_INTERNAL_DRIVER_CODE';
  function assertSafeRecovery(res: request.Response) {
    expect(res.status).toBe(503); expect(res.body.error).toMatch(/confirm.*reload|reload.*confirm/i);
    expect(res.body.details.code).toBe('QMS_TRAINING_COMMIT_UNCONFIRMED');
    expect(JSON.stringify(res.body)).not.toContain(driverDetail);
    expect(JSON.stringify(res.body)).not.toContain(driverCode);
    expect(res.body.meta?.auditTrail).toBeUndefined();
  }
  it('does not reflect a custom acknowledgement COMMIT error message or code', async () => {
    vi.spyOn(trainingService, 'acknowledgeQmsTraining').mockRejectedValueOnce(
      new trainingService.QmsTrainingCommitUnconfirmed(driverDetail, driverCode));
    const res = await request(app()).post('/api/mdx/qms/documents/11/training-ack').send(body());
    assertSafeRecovery(res); expect(h.pooled).not.toHaveBeenCalled();
  });
  it('does not reflect a custom controlled-text COMMIT error message or code', async () => {
    h.role = h.membershipRole = 'member'; h.doc!.status = 'draft';
    vi.spyOn(controlledTextService, 'saveQmsControlledText').mockRejectedValueOnce(
      new trainingService.QmsTrainingCommitUnconfirmed(driverDetail, driverCode));
    const res = await request(app()).patch('/api/mdx/qms/documents/11').send(controlledBody());
    assertSafeRecovery(res); expect(h.pooled).not.toHaveBeenCalled();
  });
});

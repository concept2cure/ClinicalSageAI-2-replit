import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const h = vi.hoisted(() => {
  class MarketError extends Error {}
  class AdmissionRefusal extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
  return {
    createPosition: vi.fn(),
    logAction: vi.fn(), exportLineage: vi.fn(), recordDecision: vi.fn(), readDecisionAttempt: vi.fn(), actor: vi.fn(),
    MarketError, AdmissionRefusal,
  };
});
vi.mock('../../services/market-access/market-access-service', () => ({
  createMarketAccessPosition: h.createPosition, listMarketAccessPositions: vi.fn(),
  MarketAccessValidationError: h.MarketError,
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: h.logAction }, writeChainedAuditRow: vi.fn(),
}));
vi.mock('../../services/workflow/DecisionLineageService', () => ({
  decisionLineageService: { exportLineage: h.exportLineage, recordDecision: h.recordDecision, readDecisionAttempt: h.readDecisionAttempt },
}));
vi.mock('../c2c/project-access', () => ({ requireCurrentProjectActor: h.actor, ProjectAdmissionRefusal: h.AdmissionRefusal }));
vi.mock('../../middleware/requirePlatformAdmin.js', () => ({ resolvePlatformAdmin: vi.fn() }));
vi.mock('../../services/audit/tenant-chain-verdict.js', () => ({ verifyTenantChainOnAdminScope: vi.fn() }));
vi.mock('../../services/audit/audited-export.js', () => ({ breakForTenant: vi.fn() }));

import market from '../market-access.routes';
import lineage from '../decision-lineage';

const POSITION = {
  id: 'position-1', program: 'REAL-1', market: 'Germany', payer: 'G-BA', mechanism: null,
  code: null, status: 'review', decision_date: null, note: null,
};
const LEAK = 'SENTINEL-private-driver-and-credential-detail';
const SUCCESS = { persisted: true, chained: true, tamperProof: true };
const LOST = { persisted: false, chained: false, tamperProof: false, error: LEAK };

function app(actor: { organizationId?: unknown; id?: unknown } = { organizationId: 7, id: 5 }) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { user: actor }); next();
  });
  a.use('/api/market-access', market);
  a.use('/api/decision-lineage', lineage);
  return a;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.logAction.mockReset().mockResolvedValue(SUCCESS);
  h.createPosition.mockReset().mockResolvedValue(POSITION);
  h.exportLineage.mockReset().mockResolvedValue({
    data: 'actual,lineage\nrecord,1\n', contentType: 'text/csv', filename: 'actual-lineage.csv',
  });
  h.actor.mockReset().mockResolvedValue({ userId: 5, role: 'member' });
  h.recordDecision.mockReset(); h.readDecisionAttempt.mockReset();
});

describe('decision attempts have a real persistence and exact readback contract', () => {
  const attemptId = 'DEC-d13e3e17-b13a-4d4b-9cb2-aabbccddeeff';
  const body = { entityType: 'document', entityId: 41, action: 'review_note', performedBy: 'spoofed', performedByRole: 'super_admin', organizationId: 999 };
  it.each([
    { auditTrail: { persisted: true, chained: true }, recorded: true, queryable: true, status: 201, code: undefined },
    { auditTrail: { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message: 'The action completed.' }, recorded: false, queryable: false, status: 503, code: 'DECISION_NOT_CONFIRMED' },
    { auditTrail: { persisted: true, chained: false }, recorded: true, queryable: false, status: 503, code: 'DECISION_NOT_QUERYABLE' },
  ])('reports actual recorded=$recorded queryable=$queryable', async ({ auditTrail, recorded, queryable, status, code }) => {
    h.recordDecision.mockResolvedValueOnce({ decisionId: attemptId, auditTrail, recorded, queryable });
    const res = await request(app()).post('/api/decision-lineage/record').send(body);
    expect(res.status).toBe(status);
    expect(res.body).toMatchObject({ recorded, queryable });
    expect(res.body.error?.code).toBe(code);
    expect(h.recordDecision).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 7, performedBy: '5', performedByRole: 'member' }));
    if (!queryable) {
      expect(res.body.attemptId).toBe(attemptId);
      expect(res.body.recoveryUrl).toBe(`/api/decision-lineage/record-attempt/${attemptId}`);
      expect(JSON.stringify(res.body)).not.toMatch(/action completed|nothing was written/i);
    }
  });
  it('refuses a stale viewer role before attempting to write the decision entry', async () => {
    h.actor.mockRejectedValueOnce(new h.AdmissionRefusal(403, 'PROJECT_WRITE_PERMISSION_DENIED', 'Current write permission is required.'));
    const res = await request(app()).post('/api/decision-lineage/record').send(body);
    expect(res.status).toBe(403); expect(h.recordDecision).not.toHaveBeenCalled();
  });
  it.each([0, '7-not-an-integer', -1, 1.5, true])('rejects an invalid entity identifier %j without recording a decision', async (entityId) => {
    const res = await request(app()).post('/api/decision-lineage/record').send({ ...body, entityId });
    expect(res.status).toBe(400); expect(h.recordDecision).not.toHaveBeenCalled();
  });
  it('routes exact attempt receipts before the generic entity graph and preserves actual tenant scope', async () => {
    const receipt = { state: 'recorded', recorded: true, queryable: true, decisionId: attemptId, auditRecordId: 'actual-row', asOf: 'now', recordedAt: 'then' };
    h.readDecisionAttempt.mockResolvedValueOnce(receipt);
    const res = await request(app()).get(`/api/decision-lineage/record-attempt/${attemptId}?organizationId=999`);
    expect(res.status).toBe(200); expect(res.body).toEqual(receipt);
    expect(h.readDecisionAttempt).toHaveBeenCalledWith(7, attemptId);
    expect(h.actor).toHaveBeenCalledWith(expect.anything(), false);
  });
  it('reports absence only as of the actual receipt read', async () => {
    h.readDecisionAttempt.mockResolvedValueOnce({ state: 'not_found', recorded: false, queryable: false, attemptId, asOf: '2026-10-14T12:00:00Z' });
    const res = await request(app()).get(`/api/decision-lineage/record-attempt/${attemptId}`);
    expect(res.status).toBe(404); expect(res.body.asOf).toBe('2026-10-14T12:00:00Z');
  });
  it('keeps an unavailable read distinct from an absent receipt', async () => {
    h.readDecisionAttempt.mockRejectedValueOnce(new Error(LEAK));
    const res = await request(app()).get(`/api/decision-lineage/record-attempt/${attemptId}`);
    expect(res.status).toBe(503); expect(res.body).toMatchObject({ state: 'unavailable', recorded: null, queryable: null });
    expect(JSON.stringify(res.body)).not.toContain(LEAK);
  });
});

const MUTATIONS = [
  { path: '/api/market-access', body: { program: 'REAL-1', market: 'Germany', payer: 'G-BA' },
    status: 201, writer: h.createPosition, action: 'MARKET_ACCESS_POSITION_CREATED' },
];

describe.each(MUTATIONS)('$action actual post-commit audit outcome', ({ path, body, status, writer, action }) => {
  it.each([
    { result: SUCCESS, expected: { persisted: true, chained: true } },
    { result: { persisted: true, chained: false, tamperProof: true }, expected: { persisted: true, chained: false } },
    { result: LOST, expected: { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' } },
  ])('keeps the durable response and reports $expected', async ({ result, expected }) => {
    h.logAction.mockResolvedValue(result);
    const res = await request(app()).post(path).send({ ...body, organizationId: 999, userId: 888, createdBy: 888 });
    expect(res.status).toBe(status);
    expect(res.body.data).toBeTruthy();
    expect(res.body.meta.auditTrail).toMatchObject(expected);
    expect(writer).toHaveBeenCalledTimes(1);
    expect(h.logAction).toHaveBeenCalledWith(expect.objectContaining({ action, organizationId: 7, userId: 5 }));
    expect(JSON.stringify(res.body)).not.toContain(LEAK);
  });

  it('reports an unexpected audit rejection without reporting a failed mutation', async () => {
    h.logAction.mockRejectedValue(new Error(LEAK));
    const res = await request(app()).post(path).send(body);
    expect(res.status).toBe(status);
    expect(res.body.meta.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    expect(writer).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(res.body)).not.toContain(LEAK);
  });

  it('reports recovery from the outcome of the next request', async () => {
    h.logAction.mockResolvedValueOnce(LOST).mockResolvedValueOnce(SUCCESS);
    const first = await request(app()).post(path).send(body);
    const second = await request(app()).post(path).send(body);
    expect(first.body.meta.auditTrail.persisted).toBe(false);
    expect(second.body.meta.auditTrail).toEqual({ persisted: true, chained: true });
    expect(writer).toHaveBeenCalledTimes(2);
  });

  it.each([{}, { organizationId: 7 }, { organizationId: 7, id: 0 }])('refuses missing authenticated identity %j before writing', async (actor) => {
    const res = await request(app(actor)).post(path).send({ ...body, organizationId: 7, userId: 5 });
    expect(res.status).toBe(403);
    expect(writer).not.toHaveBeenCalled();
    expect(h.logAction).not.toHaveBeenCalled();
  });

  it('does not report a completed act or write its audit when the source mutation failed', async () => {
    writer.mockRejectedValueOnce(new Error(LEAK));
    const res = await request(app()).post(path).send(body);
    expect(res.status).toBe(500);
    expect(res.body.meta?.auditTrail).toBeUndefined();
    expect(h.logAction).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain(LEAK);
  });
});

describe('lineage export keeps the real file and reports its audit in headers', () => {
  const path = '/api/decision-lineage/document/41/export?format=csv';
  it.each([
    { result: SUCCESS, persisted: 'true', code: undefined },
    { result: { persisted: true, chained: false, tamperProof: true }, persisted: 'true', code: 'AUDIT_ROW_NOT_RETRIEVABLE' },
    { result: LOST, persisted: 'false', code: 'AUDIT_ROW_NOT_PERSISTED' },
  ])('returns the exact download with $persisted persistence', async ({ result, persisted, code }) => {
    h.logAction.mockResolvedValueOnce(result);
    const res = await request(app()).get(path + '&organizationId=999&userId=888');
    expect(res.status).toBe(200);
    expect(res.text).toBe('actual,lineage\nrecord,1\n');
    expect(res.headers['content-disposition']).toBe('attachment; filename="actual-lineage.csv"');
    expect(res.headers['x-audit-row-persisted']).toBe(persisted);
    expect(res.headers['x-audit-row-code']).toBe(code);
    expect(h.exportLineage).toHaveBeenCalledWith('document', 41, 'csv', 7);
    expect(h.logAction).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 7, userId: 5, action: 'lineage_export' }));
  });

  it('keeps the actual file when the audit rejects, and reports recovery on the next export', async () => {
    h.logAction.mockRejectedValueOnce(new Error(LEAK)).mockResolvedValueOnce(SUCCESS);
    const first = await request(app()).get(path);
    const second = await request(app()).get(path);
    expect(first.status).toBe(200);
    expect(first.headers['x-audit-row-persisted']).toBe('false');
    expect(first.text).toBe('actual,lineage\nrecord,1\n');
    expect(second.headers['x-audit-row-persisted']).toBe('true');
    expect(second.headers['x-audit-row-code']).toBeUndefined();
    expect(first.text).not.toContain(LEAK);
  });

  it.each([{}, { organizationId: 7 }, { organizationId: 0, id: 5 }])('does not export for missing identity %j', async (actor) => {
    const res = await request(app(actor)).get(path);
    expect(res.status).toBe(403);
    expect(h.exportLineage).not.toHaveBeenCalled();
    expect(h.logAction).not.toHaveBeenCalled();
  });

  it('does not audit a download when the source export fails', async () => {
    h.exportLineage.mockRejectedValueOnce(new Error(LEAK));
    const res = await request(app()).get(path);
    expect(res.status).toBe(500);
    expect(res.headers['x-audit-row-persisted']).toBeUndefined();
    expect(h.logAction).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain(LEAK);
  });
});

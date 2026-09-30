/**
 * A write the schedule of assessments refuses because the protocol is signed
 * reaches the author as a conflict that says so, and nothing is ledgered
 * (periodic review 2026-09-28, editor family, SEC-C-2).
 *
 * The service refusal itself is proven against the real migrations in
 * protocol-write-scope.pglite.integration.test.ts. This pins the route's half:
 * the router mapped only NOT_FOUND and BAD_INPUT, so the service's
 * INVALID_STATE would have left as a 500 "INTERNAL".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const client = {
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  release: vi.fn(),
};
vi.mock('../../db', () => ({ pool: { connect: vi.fn(async () => client), query: vi.fn(async () => ({ rows: [] })) }, db: {} }));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn(async () => undefined) }));

const recordGovernedAction = vi.fn(async () => ({ actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'chain_1' }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: (...a: unknown[]) => recordGovernedAction(...(a as [])) }));

const signed = vi.hoisted(() => ({ message: 'Protocol is finalized; create a new version to edit.' }));
vi.mock('../../services/protocol-soa/protocol-soa-service', async (orig) => {
  const { ProtocolDevError } = await import('../../services/protocol-development/protocol-development-service');
  const refuse = async () => { throw new ProtocolDevError('INVALID_STATE', signed.message); };
  return { ...(await orig<Record<string, unknown>>()), addAssessmentTx: vi.fn(refuse), setCellTx: vi.fn(refuse), clearCellTx: vi.fn(refuse) };
});

import protocolSoa from '../protocol-soa';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, { userId: 11, organizationId: 2, userRole: 'member', user: { id: 11, organizationId: 2, role: 'member' } });
  next();
});
app.use('/api/protocol-soa', protocolSoa);

const REASON = 'Adding the ECG requested by the safety review.';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a signed protocol’s schedule of assessments refuses a change, and says why (SEC-C-2)', () => {
  it.each([
    ['adding an assessment', '/api/protocol-soa/documents/5/assessments', { name: 'ECG', reason: REASON }],
    ['setting a cell', '/api/protocol-soa/cells', { assessmentId: 3, visitId: 4, reason: REASON }],
    ['clearing a cell', '/api/protocol-soa/cells/clear', { assessmentId: 3, visitId: 4, reason: REASON }],
  ])('%s is a 409 naming the state, rolled back, with no ledger entry', async (_label, url, body) => {
    const r = await request(app).post(url).send(body);
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: { code: 'INVALID_STATE', message: signed.message } });
    expect(recordGovernedAction).not.toHaveBeenCalled();
    const statements = client.query.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(statements).toContain('ROLLBACK');
    expect(statements).not.toContain('COMMIT');
  });
});

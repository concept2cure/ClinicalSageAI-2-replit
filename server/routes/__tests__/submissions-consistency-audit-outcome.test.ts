/**
 * POST /api/submissions/:id/consistency reports its audit row in headers.
 *
 * The body is the array of persisted findings, which the Submission Center
 * reads as-is, so the outcome of the check's §11.10(e) row travels as
 * `X-Audit-Row-Persisted` / `X-Audit-Row-Code`, the pair this file's leaf
 * removal already uses. Before, the route answered whatever the service
 * returned, and the service discarded the outcome.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-consistency-audit-secret-32ch';
});

const svc = vi.hoisted(() => ({ impl: (async () => ({})) as (...a: unknown[]) => Promise<unknown> }));
vi.mock('../../services/truth-engine/truth-engine-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/truth-engine/truth-engine-service')>();
  return { ...actual, runConsistencyCheck: (...a: unknown[]) => svc.impl(...a) };
});

import request from 'supertest';
import express from 'express';
import { expandRoleClaims } from '../../middleware/auth';
import submissionsRouter from '../submissions';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 3, userId: 3, organizationId: 7, role: 'admin', roles: expandRoleClaims('admin', undefined) };
  next();
});
app.use('/api/submissions', submissionsRouter);

const FINDINGS = [{ id: 1, status: 'conflict' }, { id: 2, status: 'match' }];
const body = {
  dimension: 'enrollment',
  left: { ref: '2.7.3', text: '186' },
  right: [{ ref: 'CSR-001', text: '120' }],
};

beforeEach(() => {
  svc.impl = async () => ({ findings: FINDINGS, auditTrail: { persisted: true, chained: true } });
});

describe('the consistency route reports its audit row', () => {
  it('answers the findings array unchanged, with the recorded row in a header', async () => {
    const res = await request(app).post('/api/submissions/11/consistency').send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(FINDINGS);
    expect(res.headers['x-audit-row-persisted']).toBe('true');
    expect(res.headers['x-audit-row-code']).toBeUndefined();
  });

  it('says so in headers when the row was not written', async () => {
    svc.impl = async () => ({
      findings: FINDINGS,
      auditTrail: { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message: 'x' },
    });
    const res = await request(app).post('/api/submissions/11/consistency').send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(FINDINGS);
    expect(res.headers['x-audit-row-persisted']).toBe('false');
    expect(res.headers['x-audit-row-code']).toBe('AUDIT_ROW_NOT_PERSISTED');
  });
});

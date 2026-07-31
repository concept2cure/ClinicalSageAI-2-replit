import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockVerifyReauth = vi.fn();
const mockRecordGoverned = vi.fn();

vi.mock('../../../db', () => ({
  getPool: () => ({
    query: mockQuery,
    connect: async () => ({ query: mockQuery, release: vi.fn() }),
  }),
}));

// The section-approve endpoint re-authenticates the signer (§11) before any
// write, then records a hash-chained governed action; mock both so the gate +
// audit are exercised without bcrypt/MFA or a real ledger.
vi.mock('../../../routes/c2c/actions', () => ({
  verifyReauth: (...a: unknown[]) => mockVerifyReauth(...a),
  recordGovernedAction: (...a: unknown[]) => mockRecordGoverned(...a),
}));

// Canonical governed-state evaluation is a heavyweight service call the approve
// handler makes before the write transaction; stub it so the test drives only
// the SQL/audit sequence (the handler already degrades gracefully if it fails).
vi.mock('../../../services/governed-ana-execution.js', () => ({
  buildCanonicalGovernedState: async () => ({ ok: true }),
}));

import router from '../module3OperatingSystemRoutes';

describe('module3OperatingSystemRoutes', () => {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    // Route reads `req.tenantId || req.tenantContext?.organizationId` — the
    // x-organization-id header isn't converted to either field without the
    // tenant-context middleware. Set both directly so the route hands off
    // org id 101 to the SQL layer.
    req.tenantId = 101;
    req.tenantContext = { organizationId: 101 };
    req.user = { id: 1, organizationId: 101 };
    next();
  });
  app.use('/api/cmc/module3-os', router);

  beforeEach(() => {
    mockQuery.mockReset();
    mockVerifyReauth.mockReset();
    mockVerifyReauth.mockResolvedValue({ ok: true });
    mockRecordGoverned.mockReset();
    mockRecordGoverned.mockResolvedValue({ actionId: 'act-1', sha256Chain: 'deadbeef' });
  });

  it('returns readiness snapshot from canonical section/contradiction data', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ approval_state: 'approved', stale: false }, { approval_state: 'draft', stale: true }] })
      .mockResolvedValueOnce({ rows: [{ severity: 'critical', status: 'open' }, { severity: 'high', status: 'resolved' }] });

    const res = await request(app).get('/api/cmc/module3-os/readiness/proj-1');

    expect(res.status).toBe(200);
    expect(res.body.data.totalSections).toBe(2);
    expect(res.body.data.approvedSections).toBe(1);
    expect(res.body.data.staleSections).toBe(1);
    expect(res.body.data.openCriticalContradictions).toBe(1);
    expect(res.body.data.exportReady).toBe(false);
  });

  it('returns section provenance feed', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'sec-1' }] })
      .mockResolvedValueOnce({ rows: [{ eventType: 'compiled' }, { eventType: 'approved' }] });

    const res = await request(app).get('/api/cmc/module3-os/provenance/proj-1/3.2.P.5');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('resolves contradiction and returns resolved status', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'c-1', projectId: 'proj-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch('/api/cmc/module3-os/contradictions/c-1/resolve')
      .send({ resolutionNote: 'closed after CAPA' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('resolved');
  });

  it('section approve fails closed with 401 when re-authentication fails — before any DB write', async () => {
    mockVerifyReauth.mockResolvedValueOnce({ ok: false, error: 'REAUTH_REQUIRED' });

    const res = await request(app)
      .post('/api/cmc/module3-os/sections/proj-1/3.2.P.5/approve')
      .send({ reason: 'approve for filing', reauth: { password: 'wrong' } });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('REAUTH_REQUIRED');
    // The gate runs before the contradiction check and any write — no SQL ran.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('section approve proceeds past the re-auth gate on success (then honors the contradiction block)', async () => {
    mockVerifyReauth.mockResolvedValueOnce({ ok: true });
    // First query after the gate is the critical-contradiction check.
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'c-1' }] });

    const res = await request(app)
      .post('/api/cmc/module3-os/sections/proj-1/3.2.P.5/approve')
      .send({ reason: 'approve for filing', reauth: { password: 'right', totp: '123456' } });

    expect(mockVerifyReauth).toHaveBeenCalledWith(1, { password: 'right', totp: '123456' });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Critical contradictions');
  });

  it('approves a section atomically and records a hash-chained governed action (§11)', async () => {
    mockVerifyReauth.mockResolvedValueOnce({ ok: true });
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // contradiction check: none critical
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'sec-1', deterministic_json: {}, approval_state: 'draft' }] }) // section
      .mockResolvedValueOnce({ rows: [{ max_version: 2 }] }) // version max
      .mockResolvedValueOnce({ rows: [{ id: 'ver-3' }] }) // insert version
      .mockResolvedValueOnce({}) // update section
      .mockResolvedValueOnce({}) // provenance event
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .post('/api/cmc/module3-os/sections/proj-1/3.2.P.5/approve')
      .send({ reason: 'Approved after review of the executed batch and CoA.', reauth: { password: 'ok' } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.versionNumber).toBe(3);
    expect(res.body.approvedVersionId).toBe('ver-3');
    // The governed-action ledger was written inside the transaction, and its
    // chain is returned to the caller.
    expect(mockRecordGoverned).toHaveBeenCalledTimes(1);
    const governedArg = mockRecordGoverned.mock.calls[0][1];
    expect(governedArg).toMatchObject({ orgId: 101, userId: 1, command: 'sign', domain: 'cmc' });
    expect(governedArg.target).toBe('cmc_module3_section:proj-1/3.2.P.5');
    expect(res.body.governance).toEqual({ actionId: 'act-1', sha256Chain: 'deadbeef' });
    // The write ran as a transaction: BEGIN … COMMIT bracket the section writes.
    const executed = mockQuery.mock.calls.map((c) => String(c[0]).trim().split(/\s+/)[0].toUpperCase());
    expect(executed).toContain('BEGIN');
    expect(executed).toContain('COMMIT');
  });

  it('blocks final export when not all sections approved and critical contradictions open', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ approval_state: 'approved' }, { approval_state: 'draft' }] })
      .mockResolvedValueOnce({ rows: [{ severity: 'critical', status: 'open' }] });

    const res = await request(app).post('/api/cmc/module3-os/guard/final-export/proj-1').send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Critical contradictions');
  });

  it('blocks final export when an approved section went stale afterwards (isStale gate)', async () => {
    // Every section approved and NO open contradictions — the ONLY blocker is that
    // one approved section was invalidated after sign-off (stale). Before the fix the
    // guard SELECTed no `stale` column and hardcoded isStale:false, so this exported
    // silently, shipping an approval that no longer matched its source.
    mockQuery
      .mockResolvedValueOnce({ rows: [{ approval_state: 'approved', stale: false }, { approval_state: 'approved', stale: true }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/cmc/module3-os/guard/final-export/proj-1').send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('stale');
    expect(res.body.data.staleSections).toBe(1);
  });
});

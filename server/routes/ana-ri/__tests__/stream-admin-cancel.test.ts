/**
 * POST /api/ana-ri/stream/:runId/control, from an organisation admin or owner
 * (AnA detach DT3, §2.5; DT3 test 12, route half). The route tells run
 * control the caller is an admin (record-access.ts readsEveryRecord, the one
 * rule); run control admits a cancel and nothing else, asks the admin why,
 * and writes the cancel and its chained audit row in one transaction
 * (run-control-detach.pglite.test.ts holds that half; DT3 review, DP-82). The
 * route passes the reason and maps the two new refusals.
 */
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  applyControl: vi.fn(),
  logAction: vi.fn(async (): Promise<Record<string, unknown>> => ({ persisted: true, chained: true, tamperProof: true })),
  user: { id: 11, organizationId: 7, role: 'admin' } as Record<string, unknown>,
}));
const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
vi.mock('../../../db.js', async () => (await harnessModule()).mocks.db());
vi.mock('../../../services/ana/run-control.js', async importOriginal => ({
  ...(await harnessModule()).mocks.runControl(await importOriginal<typeof import('../../../services/ana/run-control.js')>()),
  applyControl: io.applyControl,
}));
vi.mock('../../../services/auditService.js', () => ({ default: { logAction: io.logAction } }));

import { ADMIN_CANCEL_AUDIT_REFUSED, ADMIN_CANCEL_REASON_REQUIRED, mountStreamRoute } from '../stream.js';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).tenantId = 7;
    (req as any).user = { ...io.user };
    next();
  });
  const router = express.Router();
  mountStreamRoute(router);
  a.use('/api/ana-ri', router);
  return a;
}

afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  io.applyControl.mockReset();
  io.logAction.mockClear();
  io.user = { id: 11, organizationId: 7, role: 'admin' };
});

describe("an admin's cancel through the control route", () => {
  it('tells run control the caller is an admin, with their reason and where the request came from', async () => {
    io.applyControl.mockResolvedValue({ ok: true, status: 'cancelled', byRole: 'admin' });
    const res = await request(app())
      .post('/api/ana-ri/stream/run_x/control')
      .set('User-Agent', 'vitest-admin')
      .send({ action: 'cancel', reason: 'Wrong agency.' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, status: 'cancelled', byRole: 'admin' });
    expect(io.applyControl).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_x',
        organizationId: 7,
        userId: 11,
        action: 'cancel',
        callerIsAdmin: true,
        reason: 'Wrong agency.',
        requestMeta: expect.objectContaining({ userAgent: 'vitest-admin' }),
      }),
    );
  });

  /* DT3 review (DP-82): the chained audit row is written by run control in
     the cancel's own transaction, never by the route after the cancel has
     landed — so there is no "stopped, but its audit row was lost" outcome to
     report, and the route writes no second row. */
  it('writes no audit row of its own: the cancel and its row are one transaction in run control', async () => {
    io.applyControl.mockResolvedValue({ ok: true, status: 'cancelled', byRole: 'admin' });
    await request(app()).post('/api/ana-ri/stream/run_x/control').send({ action: 'cancel', reason: 'Wrong agency.' });
    expect(io.logAction).not.toHaveBeenCalled();
  });

  it('a cancel with no reason is refused 400, in words that say what to do', async () => {
    io.applyControl.mockResolvedValue({ ok: false, code: 'REASON_REQUIRED', status: 'running' });
    const res = await request(app()).post('/api/ana-ri/stream/run_x/control').send({ action: 'cancel' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, status: 'running', error: ADMIN_CANCEL_REASON_REQUIRED });
  });

  it('a cancel whose audit row the chain refused is refused 503: nothing changed, try again', async () => {
    io.applyControl.mockResolvedValue({ ok: false, code: 'AUDIT_REFUSED', status: 'running' });
    const res = await request(app()).post('/api/ana-ri/stream/run_x/control').send({ action: 'cancel', reason: 'Wrong agency.' });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ ok: false, status: 'running', error: ADMIN_CANCEL_AUDIT_REFUSED });
  });

  it("an admin's pause is refused 403 by run control, and nothing is audited", async () => {
    io.applyControl.mockResolvedValue({ ok: false, code: 'NOT_YOURS', status: 'running' });
    const res = await request(app()).post('/api/ana-ri/stream/run_x/control').send({ action: 'pause' });
    expect(res.status).toBe(403);
    expect(io.logAction).not.toHaveBeenCalled();
  });

  it('a member is not an admin: callerIsAdmin is false', async () => {
    io.user = { id: 13, organizationId: 7, role: 'member' };
    io.applyControl.mockResolvedValue({ ok: false, code: 'NOT_YOURS', status: 'running' });
    await request(app()).post('/api/ana-ri/stream/run_x/control').send({ action: 'cancel' });
    expect(io.applyControl).toHaveBeenCalledWith(expect.objectContaining({ callerIsAdmin: false }));
    expect(io.logAction).not.toHaveBeenCalled();
  });

  it("the asker's own cancel is not an admin's: no byRole in the answer", async () => {
    io.applyControl.mockResolvedValue({ ok: true, status: 'cancelled' });
    const res = await request(app()).post('/api/ana-ri/stream/run_x/control').send({ action: 'cancel' });
    expect(res.body.byRole).toBeUndefined();
    expect(io.logAction).not.toHaveBeenCalled();
  });
});

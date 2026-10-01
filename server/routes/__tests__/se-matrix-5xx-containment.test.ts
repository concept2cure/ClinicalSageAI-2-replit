/**
 * SE-matrix render — the program-access 500 and the shadow-service 502 carry
 * no thrower text (security audit 2026-09-24 IAM-18 (1); plan P1-17).
 *
 * `requireProgramAccess` answered a failed regulatory_programs read with
 * `detail: err.message` (driver text), and the render orchestration answered a
 * shadow-service failure with 502 `detail: err.message` (the internal host and
 * port it dials). The 500 now answers through `serverError()`; the 502 keeps
 * its status and sentence and loses the detail (`serverError()` answers only
 * 500, the first P1-17 tranche's treatment of a coded non-500).
 *
 * Fix round: the shadow service *answering* >= 500 was relayed as 502
 * `detail: <shadow body>`. It now answers the same 502 sentence as the
 * transport failure; a shadow 4xx (validation) body is still relayed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const DB_SENTINEL = 'SENTINEL-DB-DETAIL relation "regulatory_programs" does not exist';
const UPSTREAM_SENTINEL = 'SENTINEL-UPSTREAM-DETAIL connect ECONNREFUSED 10.0.4.17:8001';
const SHADOW_SENTINEL =
  'SENTINEL-SHADOW psycopg2.errors.UndefinedTable: relation "predicate_devices" does not exist File "/srv/shadow/app.py", line 88';

const { dbLimit, fetchMock, logAuditEvent, logError } = vi.hoisted(() => ({
  dbLimit: vi.fn(),
  fetchMock: vi.fn(),
  logAuditEvent: vi.fn(async () => undefined),
  logError: vi.fn(),
}));

vi.mock('../../middleware/auth.js', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 4, organizationId: 7 };
    next();
  },
}));
vi.mock('../../db.js', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: dbLimit }) }) }) },
}));
vi.mock('../../services/audit/auditLogger.js', () => ({ logAuditEvent }));
vi.mock('../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logger')>();
  return {
    ...actual,
    createScopedLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  };
});
vi.stubGlobal('fetch', fetchMock);
process.env.REVIEW_ADMIN_TOKEN = 'test-admin-token';

import router from '../se-matrix';

function app() {
  const a = express();
  a.use(express.json());
  a.use((_req, res, next) => {
    res.setHeader('X-Request-Id', 'req-set-a-sematrix');
    next();
  });
  a.use('/api/programs', router);
  return a;
}

const RENDER = '/api/programs/prog-1/se-matrix/render';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  dbLimit.mockResolvedValue([{ id: 'prog-1' }]);
});

describe('se-matrix: no thrower text in a 5xx body', () => {
  it('a failed program-access read answers 500 with the envelope', async () => {
    dbLimit.mockRejectedValue(new Error(DB_SENTINEL));
    const res = await request(app()).post(RENDER).send({ selectedPredicate: { kNumber: 'K123456' } });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/SENTINEL-DB-DETAIL|regulatory_programs|does not exist/);
    expect(res.body.detail).toBeUndefined();
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(res.body.correlationId).toBe('req-set-a-sematrix');
    expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-DB-DETAIL');
  });

  it('an unreachable shadow service answers 502 with its sentence and no detail', async () => {
    fetchMock.mockRejectedValue(new Error(UPSTREAM_SENTINEL));
    const res = await request(app()).post(RENDER).send({ selectedPredicate: { kNumber: 'K123456' } });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('Shadow service unavailable');
    expect(res.body.detail).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/SENTINEL-UPSTREAM-DETAIL|ECONNREFUSED|10\.0\.4\.17/);
    expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-UPSTREAM-DETAIL');
    // The failure is still audited with its cause — the audit row is server-side.
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SE_MATRIX_GENERATION_FAILED', errorMessage: UPSTREAM_SENTINEL }),
    );
  });

  /* Fix round (2026-10-01): the shadow service *answering* >= 500 was relayed
     to the tenant as 502 `detail: <shadow body>` — its own traceback, driver
     error and file path. Same disclosure as the transport failure above, on
     the non-throwing branch, which the leak gate cannot see. */
  it.each([
    {
      name: 'a JSON 500 body',
      status: 500,
      text: JSON.stringify({ detail: SHADOW_SENTINEL }),
    },
    {
      name: 'a plain-text 503 body',
      status: 503,
      text: `Traceback (most recent call last): ${SHADOW_SENTINEL}`,
    },
  ])('a shadow service answering >= 500 with $name answers 502 with no detail', async ({ status, text }) => {
    fetchMock.mockResolvedValue({ status, text: async () => text });
    const res = await request(app()).post(RENDER).send({ selectedPredicate: { kNumber: 'K123456' } });
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'Shadow service unavailable' });
    expect(JSON.stringify(res.body)).not.toMatch(/SENTINEL-SHADOW|psycopg2|UndefinedTable|\/srv\/shadow|Traceback/);
    // The shadow body goes to the log against the program, not to the caller.
    expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-SHADOW');
    expect(JSON.stringify(logError.mock.calls)).toContain('prog-1');
    // The failure is still audited with the shadow status.
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SE_MATRIX_GENERATION_FAILED',
        success: false,
        errorMessage: `Shadow returned ${status}`,
        metadata: expect.objectContaining({ program_id: 'prog-1', shadow_status: status }),
      }),
    );
  });

  it('still relays a shadow 4xx validation body with its status (intended behaviour)', async () => {
    const validation = { detail: [{ loc: ['body', 'product_code'], msg: 'field required' }] };
    fetchMock.mockResolvedValue({ status: 422, text: async () => JSON.stringify(validation) });
    const res = await request(app()).post(RENDER).send({ selectedPredicate: { kNumber: 'K123456' } });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'SE matrix payload generation failed', detail: validation });
  });

  it('leaves the 403 and 422 answers unchanged', async () => {
    dbLimit.mockResolvedValue([]);
    const denied = await request(app()).post(RENDER).send({ selectedPredicate: { kNumber: 'K1' } });
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ error: 'Access denied', detail: 'You do not have access to this program' });
    dbLimit.mockResolvedValue([{ id: 'prog-1' }]);
    const bad = await request(app()).post(RENDER).send({});
    expect(bad.status).toBe(422);
    expect(bad.body).toEqual({ error: 'selectedPredicate.kNumber is required' });
  });
});

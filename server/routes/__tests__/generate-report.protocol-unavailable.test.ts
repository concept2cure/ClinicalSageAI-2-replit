/**
 * Regression guard for the report-generation route.
 *
 * Previously, a supplied `protocolId` was silently dropped: `protocolData`
 * stayed hardcoded `null` and the route still returned `success: true` with
 * no signal that the report was never grounded in real protocol records.
 * That is the "error rendered as an empty result" failure mode CLAUDE.md
 * forbids — fail closed, never fabricate, honest empty states.
 *
 * This test asserts the route now surfaces the gap explicitly instead of
 * returning a plain, confident success. It fails against the pre-fix code,
 * which never set `protocolDataUnavailable` and never included a `warning`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Prevent any real DB connection when the router's transitive imports load.
vi.mock('../../db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    })),
  },
  pool: {},
  getPool: () => ({}),
  getDb: () => ({}),
  query: vi.fn(),
  transaction: vi.fn(),
}));

let app: express.Express;

beforeEach(async () => {
  vi.resetModules();
  const router = (await import('../reports/generate-report')).default;
  app = express();
  app.use(express.json());
  app.use('/api/reports', router);
});

describe('POST /api/reports/generate — protocolId that cannot be resolved', () => {
  it('does not return a plain success; it carries the ungrounded/unavailable signal', async () => {
    const res = await request(app).post('/api/reports/generate').send({
      persona: 'investor',
      protocolId: 'protocol-does-not-exist-in-any-store',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // The response must not look like an ordinary, fully-grounded success —
    // it must carry an explicit signal that protocol data was unavailable.
    expect(res.body.protocolDataUnavailable).toBe(true);
    expect(typeof res.body.warning).toBe('string');
    expect(res.body.warning.length).toBeGreaterThan(0);

    // The generator must also have received the flag so it can decline to
    // fabricate protocol-grounded specifics.
    expect(res.body.report?.metadata?.protocolDataUnavailable).toBe(true);
  });

  it('does not set the unavailable signal when only an indication is supplied', async () => {
    const res = await request(app).post('/api/reports/generate').send({
      persona: 'investor',
      indication: 'Oncology',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.protocolDataUnavailable).toBeUndefined();
    expect(res.body.warning).toBeUndefined();
  });
});

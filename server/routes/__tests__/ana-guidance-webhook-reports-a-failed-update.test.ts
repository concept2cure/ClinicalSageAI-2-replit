/**
 * POST /api/ana/guidance/webhook reports an update it could not ingest as
 * failed, never as "unchanged" inside an ok batch.
 *
 * What the route used to do (until 2026-10-15): when ingestGuidanceUpdate threw
 * — the version upsert or its impact scan failed — the entry was reported as
 * { changed: false, prevVersion: null } and the batch as ok: true, so a failed
 * scan read as a guidance that had not changed. ingestGuidanceUpdate now rolls
 * the version back when its scan fails, so nothing is recorded and a resend is
 * safe; the route says so.
 *
 * Runs the real router; the scanner module is a double.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { ingestMock } = vi.hoisted(() => ({ ingestMock: vi.fn() }));
const pass = vi.hoisted(() => (_q: unknown, _s: unknown, n: () => void) => n());
vi.mock('../../middleware/auth', () => ({ authenticateToken: pass }));
vi.mock('../../middleware/tenantContext', () => ({ requireOrganizationContext: pass, requireTenantContext: pass }));
vi.mock('../../middleware/rateLimiter', () => ({ createRateLimiter: () => pass }));
vi.mock('../../services/intelligence/guidance-impact-scanner', () => ({ ingestGuidanceUpdate: ingestMock }));

import anaFeaturesRouter from '../ana-features';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _s: Response, n: NextFunction) => {
    (req as any).user = { id: 3, organizationId: 7 };
    (req as any).tenantContext = { organizationId: 7 };
    n();
  });
  a.use('/api/ana', anaFeaturesRouter);
  return a;
}

const update = (guidanceCode: string) => ({ guidanceCode, authority: 'ICH', newVersion: 'R3' });
const post = (codes: string[]) =>
  request(app()).post('/api/ana/guidance/webhook').send({ updates: codes.map(update) });

const ingested = (guidanceCode: string) => ({
  upsert: { guidanceCode, authority: 'ICH', prevVersion: 'R2', newVersion: 'R3', changed: true, registryRowId: 'r1' },
  scan: { guidanceCode, newVersion: 'R3', ctdSectionsMatched: ['2.4'], artifactsAffected: 1, alertsCreated: 1, alertsSkippedDuplicate: 0 },
});

beforeEach(() => {
  ingestMock.mockReset();
  ingestMock.mockImplementation(async ({ guidanceCode }: { guidanceCode: string }) => {
    if (guidanceCode === 'ICH M4S(R3)') {
      throw Object.assign(new Error('relation "guidance_alerts" does not exist'), { code: '42P01' });
    }
    return ingested(guidanceCode);
  });
});

describe('POST /api/ana/guidance/webhook', () => {
  it('reports an update whose scan failed as failed, not as unchanged, and the batch as not ok', async () => {
    const res = await post(['ICH M4S(R3)', 'ICH E6(R3)']);

    expect(res.body.ok, 'a batch with a failed update was reported ok').toBe(false);
    expect(res.body.failed).toBe(1);
    const [failed, done] = res.body.ingested;
    expect(failed).toMatchObject({ guidanceCode: 'ICH M4S(R3)', failed: true, changed: null });
    expect(failed.error).toMatch(/nothing was recorded/i);
    expect(done).toMatchObject({ guidanceCode: 'ICH E6(R3)', changed: true, alertsCreated: 1 });
    expect(done.failed).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/does not exist|guidance_alerts|42P01/);
  });

  it('answers 500 when no update in the batch could be ingested', async () => {
    const res = await post(['ICH M4S(R3)']);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, failed: 1 });
  });

  it('is ok when every update was ingested', async () => {
    const res = await post(['ICH E6(R3)']);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, failed: 0 });
  });
});

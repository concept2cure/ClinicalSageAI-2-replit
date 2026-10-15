/**
 * POST /api/stability/studies/:id/timepoints/push-calendar writes the team
 * calendar only for the organisation it belongs to (2026-10-01, D6; decision
 * P-8, docs/LAUNCH_DEFINITION_OF_DONE.md).
 *
 * The calendar (GOOGLE_CALENDAR_ID + GOOGLE_SERVICE_ACCOUNT) is the
 * deployment's own account. Any organisation's stability study pushed its
 * sampling dates onto it. It now serves only the organisation
 * PLATFORM_INTEGRATIONS_ORGANIZATION_ID names, as AnA's create_calendar_event
 * does (services/integrations/platform-integration-owner.ts); any other is
 * refused before a connection is taken and before the calendar is reached.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const STUDY = '0b0e8a52-6c1e-4b2a-9d55-6d2f3c1a7e10';
const { connect, insertAllDayEvent } = vi.hoisted(() => ({ connect: vi.fn(), insertAllDayEvent: vi.fn() }));
vi.mock('../../../db', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getPool: () => ({ connect, query: vi.fn() }),
}));
vi.mock('../../services/calendar', () => ({ calendarEnabled: () => true, insertAllDayEvent }));

import router from '../stability.router';
import { runWithTenantScope } from '../../../db/tenantStore';

function app(tenantId: string) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, email: 'qa@example.test' };
    (req as any).userRole = 'member'; // a writing role (requireEditorAccessForWrites)
    // The request's organization, as establishRequestTenantScope publishes it
    // beside the scope; the write-role gate reads it from the request.
    (req as any).tenantId = Number(tenantId);
    runWithTenantScope({ tenantId, role: 'admin', source: 'test', caller: 'stab-test' } as any, () => next());
  });
  a.use('/api/stability', router);
  return a;
}

beforeEach(() => {
  process.env.PLATFORM_INTEGRATIONS_ORGANIZATION_ID = '7';
  insertAllDayEvent.mockReset().mockResolvedValue({ id: 'evt-1' });
  // A study with one planned timepoint, so a push that is let through reaches the calendar.
  connect.mockReset().mockResolvedValue({
    query: vi.fn(async (sql: string) =>
      /v_stab_upcoming_tp/.test(sql)
        ? { rows: [{ planned_date: '2026-11-02', kind: 'LT', label: '3M' }] }
        : { rows: [{ study_id: STUDY, code: 'S-1', name: 'Study' }] },
    ),
    release: vi.fn(),
  });
});
afterEach(() => {
  delete process.env.PLATFORM_INTEGRATIONS_ORGANIZATION_ID;
});

const push = (tenantId: string) =>
  request(app(tenantId)).post(`/api/stability/studies/${STUDY}/timepoints/push-calendar`).send({ count: 1 });

describe("the deployment's calendar is written for the organisation it belongs to only", () => {
  it('another organisation: 503 CALENDAR_NOT_YOURS, no connection taken, the calendar not reached', async () => {
    const res = await push('8');

    expect(res.status, JSON.stringify(res.body)).toBe(503);
    expect(res.body.code).toBe('CALENDAR_NOT_YOURS');
    expect(res.body.error).toMatch(/not connected for your organisation/);
    expect(insertAllDayEvent).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it('the organisation it belongs to still pushes its sampling dates', async () => {
    const res = await push('7');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(insertAllDayEvent).toHaveBeenCalledTimes(1);
  });
});

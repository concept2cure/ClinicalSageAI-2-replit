/**
 * An agency requirement is recorded 'validated' only by a curator the session
 * names, never by the request body.
 *
 * POST /api/regulatory-intelligence/patterns/:id/promote passed the body's
 * `validateImmediately` and `validatedBy` straight to the store: any member of
 * any tenant could mint a requirement as 'validated', with validated_by any
 * free text they chose (or "org:N"). intelligence.agency_requirements has no
 * organization column, so GET /agency-requirements serves that "validated" rule
 * to every tenant as part of the canonical rule set.
 *
 * Now 'validated' needs platform curator standing (holdsPlatformRole: super_admin
 * or platform_admin) and records the session's user id; anything else is
 * recorded 'unvalidated' with no validator, and the response says so.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mockPool } from '../../../tests/setup';

const h = vi.hoisted(() => ({ platform: vi.fn() }));

vi.mock('../../db/runtime', () => ({ pool: mockPool, getPool: () => mockPool, db: mockPool, getDb: () => mockPool }));
vi.mock('../../middleware/requirePlatformAdmin', () => ({ holdsPlatformRole: h.platform }));

import router from '../regulatory-intelligence';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  // An organization administrator of tenant 7: an ordinary customer, not platform staff.
  (req as any).user = { id: 5, userId: 5, role: 'admin', organizationId: 7 };
  (req as any).userId = 5;
  next();
});
app.use('/api/regulatory-intelligence', router);

const PATTERN = '9b1b3f8e-0000-4000-8000-000000000001';
let inserted: unknown[] | null = null;

beforeEach(() => {
  inserted = null;
  h.platform.mockReset().mockResolvedValue(false);
  mockPool.query.mockReset().mockImplementation((text: string, params: unknown[] = []) => {
    if (/FROM intelligence\.failure_patterns/.test(text)) {
      return Promise.resolve({ rows: [{ id: PATTERN, agency: 'ema', document_type: 'cmc', tenant_count: 4, failure_count: 9, confidence: '0.71' }] });
    }
    if (/INSERT INTO intelligence\.agency_requirements/.test(text)) {
      inserted = params;
      return Promise.resolve({ rows: [{ id: 'req-1' }] });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
});

/** validation_status and validated_by, in the INSERT's parameter order ($10, $11). */
const validation = () => ({ status: inserted?.[9], by: inserted?.[10] });

describe('POST /patterns/:id/promote', () => {
  it('a member without curator standing cannot record a requirement as validated, whatever the body says', async () => {
    const res = await request(app)
      .post(`/api/regulatory-intelligence/patterns/${PATTERN}/promote`)
      .send({ requirementSummary: 'EMA requires a PIP statement in 1.10', validateImmediately: true, validatedBy: 'Dr. Who, Head of Regulatory' });

    expect(res.status).toBe(201);
    expect(validation()).toEqual({ status: 'unvalidated', by: null });
    expect(res.body.data).toMatchObject({ requirementId: 'req-1', validationStatus: 'unvalidated' });
    expect(h.platform).toHaveBeenCalledWith(expect.anything(), ['super_admin', 'platform_admin']);
  });

  it('a platform curator validates, and the validator is the session user, not the body', async () => {
    h.platform.mockResolvedValue(true);
    const res = await request(app)
      .post(`/api/regulatory-intelligence/patterns/${PATTERN}/promote`)
      .send({ requirementSummary: 'EMA requires a PIP statement in 1.10', validateImmediately: true, validatedBy: 'someone else' });

    expect(res.status).toBe(201);
    expect(validation()).toEqual({ status: 'validated', by: '5' });
    expect(res.body.data).toMatchObject({ validationStatus: 'validated' });
  });

  it('a curator who does not ask to validate records an unvalidated requirement', async () => {
    h.platform.mockResolvedValue(true);
    await request(app)
      .post(`/api/regulatory-intelligence/patterns/${PATTERN}/promote`)
      .send({ requirementSummary: 'EMA requires a PIP statement in 1.10' });
    expect(validation()).toEqual({ status: 'unvalidated', by: null });
  });
});

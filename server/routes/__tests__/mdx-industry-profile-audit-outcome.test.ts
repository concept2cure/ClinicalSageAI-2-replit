/**
 * PATCH /api/mdx/industry-profile — the organisation's industry profile, which
 * Admin → Setup and the Onboarding activation step both write — and its
 * §11.10(e) audit row.
 *
 * The upsert committed and `await auditService.logAction(…)` then ran at
 * statement position with its outcome discarded, so a profile saved with no
 * audit row answered exactly as one with a row. The change stands either way,
 * and `meta.auditTrail` now says which happened, in the canonical shape the
 * client transport turns into "The request completed, but the audit trail did not record it".
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

const logActionMock = vi.fn();
let upserted: Record<string, unknown> | null = null;

function upsertChain() {
  const chain: any = {};
  chain.values = (v: Record<string, unknown>) => {
    upserted = v;
    return chain;
  };
  chain.onConflictDoUpdate = () => chain;
  chain.returning = async () => [{ organizationId: 7, ...(upserted ?? {}) }];
  return chain;
}

vi.mock('../../db/requestDb', () => ({ requestDb: () => ({ insert: () => upsertChain() }) }));
vi.mock('../../services/auditService', () => ({
  default: { logAction: (...a: unknown[]) => logActionMock(...a) },
}));
vi.mock('../../services/industry-context/resolver', () => ({ resolveEffectiveProjectContext: vi.fn() }));

let app: express.Express;
beforeAll(async () => {
  const router = (await import('../mdx-industry-context')).default;
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 3, organizationId: 7 };
    next();
  });
  app.use('/api/mdx', router);
});

beforeEach(() => {
  logActionMock.mockReset();
  upserted = null;
});

// The route requires a reason for change (finding 122); this file is about
// what the response says of the audit row, so its body carries one.
const BODY = { primaryIndustry: 'biotech_pharma', reason: 'Client type corrected' };

describe('PATCH /api/mdx/industry-profile carries its audit-row outcome', () => {
  it('a lost row: 200 with the saved profile, and meta.auditTrail says the row is missing', async () => {
    logActionMock.mockResolvedValueOnce({ persisted: false, chained: false, tamperProof: false, error: 'pool exhausted' });

    const res = await request(app).patch('/api/mdx/industry-profile').send(BODY);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ organizationId: 7, primaryIndustry: 'biotech_pharma' });
    expect(res.body.meta?.auditTrail).toEqual({
      persisted: false,
      code: 'AUDIT_ROW_NOT_PERSISTED',
      message: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toContain('pool exhausted');
    expect(upserted).not.toBeNull();
  });

  it('a written row says so', async () => {
    logActionMock.mockResolvedValueOnce({ persisted: true, chained: true, tamperProof: true });
    const res = await request(app).patch('/api/mdx/industry-profile').send(BODY);
    expect(res.status).toBe(200);
    expect(res.body.meta?.auditTrail).toEqual({ persisted: true, chained: true });
    expect(logActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'organization_industry_profile', resourceId: 7 }),
    );
  });
});

describe('PATCH /api/mdx/industry-profile requires a reason for change (finding 122)', () => {
  it('refuses a change with no reason, and writes nothing', async () => {
    const res = await request(app).patch('/api/mdx/industry-profile').send({ primaryIndustry: 'biotech_pharma' });
    expect(res.status).toBe(422);
    expect(upserted).toBeNull();
    expect(logActionMock).not.toHaveBeenCalled();
  });

  it('refuses a blank or too-short reason', async () => {
    for (const reason of ['', '  ', 'ok']) {
      const res = await request(app).patch('/api/mdx/industry-profile').send({ primaryIndustry: 'cro', reason });
      expect(res.status).toBe(422);
    }
    expect(upserted).toBeNull();
  });

  it('records the reason in the audit row it writes', async () => {
    logActionMock.mockResolvedValue({ id: 'a1' });
    const res = await request(app).patch('/api/mdx/industry-profile').send({ primaryIndustry: 'cro', reason: '  Now a CRO  ' });
    expect(res.status).toBe(200);
    const details = JSON.stringify(logActionMock.mock.calls[0]);
    expect(details).toContain('Now a CRO');
  });
});

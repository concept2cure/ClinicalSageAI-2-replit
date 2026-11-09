/**
 * The route answer: a stability edit naming a field the register does not
 * record is refused 400, BEFORE the record is read and before anything is
 * written.
 *
 * ## The defect exactly as shipped
 *
 * `PUT /api/cmc/stability-studies/:id` parses its body with
 * `stabilityStudyBody.partial().parse(req.body)`, and a zod object strips the
 * keys it does not know. On 2026-11-09 this repository's own demo seeder sent
 * `shelfLifeClaim` where the column is `shelf_life` (`shelfLife`). The route
 * answered 200 three times with the record unchanged, and the seeder reported
 * the shelf life as recorded — a 200 from a write route is the only answer a
 * caller has.
 *
 * The third case below is that 200: with the record present and the update
 * mocked, removing the guard makes this route answer `200 success:true` over a
 * patch that carries nothing of what the caller asked for.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';

const { poolQuery, txUpdate, connect } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  txUpdate: vi.fn(),
  connect: vi.fn(async () => ({ query: vi.fn(async () => ({ rows: [] })), release: vi.fn() })),
}));

vi.mock('../../../metrics.js', () => ({ metrics: { concept2cureErrors: { inc: vi.fn() } } }));
vi.mock('../../../services/auditService', () => ({ writeChainedAuditRow: async () => undefined }));

/** The stored study every path here reads: running, filed, nothing signed. */
const STORED = {
  id: 5,
  organizationId: 101,
  projectId: PROJECT,
  productName: 'C2C-201 tablets',
  status: 'ONGOING',
  shelfLife: null,
};

const tx = {
  select: () => ({
    from: () => ({ for: () => ({ where: async () => [STORED] }), where: async () => [STORED] }),
  }),
  update: () => ({
    set: (patch: Record<string, unknown>) => ({
      where: () => ({
        returning: async () => {
          txUpdate(patch);
          return [{ ...STORED, ...patch }];
        },
      }),
    }),
  }),
  execute: async () => ({ rows: [] }),
};

vi.mock('../../../db', () => ({
  db: {
    transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
    select: () => ({ from: () => ({ where: async () => [STORED] }) }),
  },
  getPool: () => ({ query: poolQuery, connect }),
}));

import cmcRouter from '../routes';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.tenantId = 101;
  req.tenantContext = { organizationId: 101 };
  req.user = { id: 4242, email: 'recorder@acme.test', role: 'editor', organizationId: 101 };
  next();
});
app.use('/api/cmc', cmcRouter);

beforeEach(() => {
  poolQuery.mockReset();
  txUpdate.mockReset();
  /* `projectOnEdit`'s read: the study exists and is already filed, so the edit
     proceeds. A harness that answered "no rows" would 404 every case and the
     400 below would prove nothing about ORDER. */
  poolQuery.mockImplementation(async (sql: string) => {
    if (/SELECT project_id FROM/.test(sql)) return { rows: [{ project_id: PROJECT }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('PUT /api/cmc/stability-studies/:id and a field the register does not record', () => {
  it('refuses 400 and names the field — the seeder’s measured case', async () => {
    const res = await request(app)
      .put('/api/cmc/stability-studies/5')
      .send({ shelfLifeClaim: '24 months at 25C/60%RH' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/does not record "shelfLifeClaim"/);
    expect(res.body.error).toMatch(/This register records:/);
  });

  it('writes nothing — the refusal is not a partial application', async () => {
    await request(app)
      .put('/api/cmc/stability-studies/5')
      .send({ shelfLife: '24 months at 25C/60%RH', shelfLifeClaim: '24 months at 25C/60%RH' });

    expect(txUpdate).not.toHaveBeenCalled();
  });

  it('refuses BEFORE reading the record, so a wrong field never depends on the row', async () => {
    await request(app).put('/api/cmc/stability-studies/5').send({ shelfLifeClaim: '24 months' });

    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('lets the same edit through once the field is spelled as the register records it', async () => {
    const res = await request(app)
      .put('/api/cmc/stability-studies/5')
      .send({ shelfLife: '24 months at 25C/60%RH', projectId: PROJECT });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(txUpdate).toHaveBeenCalledTimes(1);
    expect(txUpdate.mock.calls[0][0]).toMatchObject({ shelfLife: '24 months at 25C/60%RH' });
  });
});

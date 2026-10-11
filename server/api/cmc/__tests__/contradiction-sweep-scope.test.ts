/**
 * A contradiction sweep says what it compared, and the board can say when the
 * program was last swept (GA review 2026-10-05, plan item 5).
 *
 * "Nothing found" over empty registers read exactly like "nothing found" over
 * a full file, and an empty list from a program nobody swept read as "No open
 * contradictions". The sweep now returns the count of each register it read
 * and records itself as a provenance event; the list returns the last sweep.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../services/cmc/project-membership', () => ({ projectBelongsToTenant: async () => true }));
vi.mock('../cmc-signer', () => ({ refusedWithoutSigningAuthority: async () => false }));
vi.mock('../../../db', () => ({
  getPool: () => ({ query: mockQuery, connect: async () => ({ query: mockQuery, release: vi.fn() }) }),
}));
vi.mock('../../../routes/c2c/actions', () => ({ verifyReauth: vi.fn(), recordGovernedAction: vi.fn() }));
vi.mock('../../../services/governed-ana-execution.js', () => ({ buildCanonicalGovernedState: async () => ({ ok: true }) }));
vi.mock('../../../services/cmc/contradiction-tasks', () => ({ syncContradictionTasks: async () => ({ created: 0, existing: 0 }) }));

import router from '../module3OperatingSystemRoutes';

const PROGRAM = '5b0c7a1e-0000-4000-8000-000000000005';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.tenantId = 101;
  req.tenantContext = { organizationId: 101 };
  req.user = { id: 7, organizationId: 101 };
  req.userId = 7;
  next();
});
app.use('/api/cmc/module3-os', router);

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM quality_specifications')) return { rows: [{ materialName: 'BX-701' }, { materialName: 'BX-701 tablet' }] };
    if (sql.includes('FROM analytical_methods')) return { rows: [{ methodName: 'AM-001', validationStatus: 'validated' }] };
    if (sql.includes('FROM stability_studies')) return { rows: [{ studyName: 'ST-1', status: 'ongoing' }] };
    if (sql.includes('FROM cmc_batch_records')) return { rows: [{ batchNumber: 'B-1' }, { batchNumber: 'B-2' }, { batchNumber: 'B-3' }] };
    return { rows: [] };
  });
});

describe('the contradiction sweep reports its scope', () => {
  it('returns how many records of each register it compared', async () => {
    const res = await request(app).post(`/api/cmc/module3-os/contradictions/${PROGRAM}`).send({});
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.examined).toEqual({ specifications: 2, methods: 1, stability: 1, batches: 3, comparability: 0 });
  });

  it('records the sweep itself — when, by whom, over what — in the same transaction as the reconcile', async () => {
    await request(app).post(`/api/cmc/module3-os/contradictions/${PROGRAM}`).send({});
    const sqls = mockQuery.mock.calls.map((c) => String(c[0]));
    const insert = mockQuery.mock.calls.find((c) => /INSERT INTO cmc_provenance_events/.test(String(c[0])) && /contradiction_sweep/.test(String(c[0])));
    expect(insert, 'no sweep provenance event').toBeDefined();
    const params = insert![1] as unknown[];
    expect(JSON.parse(String(params[2]))).toMatchObject({ examined: { batches: 3 }, found: 0 });
    expect(params[3]).toBe('7');
    expect(sqls.indexOf(String(insert![0]))).toBeLessThan(sqls.lastIndexOf('COMMIT'));
  });

  it('the list carries the last sweep, and null for a program never swept', async () => {
    const never = await request(app).get(`/api/cmc/module3-os/contradictions/${PROGRAM}`);
    expect(never.body.meta).toEqual({ lastSweep: null });

    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("artifact_type = 'contradiction_sweep'")) {
        return { rows: [{ at: '2026-10-05T12:00:00.000Z', by: '7', payload: { examined: { specifications: 2 }, found: 0 } }] };
      }
      return { rows: [] };
    });
    const swept = await request(app).get(`/api/cmc/module3-os/contradictions/${PROGRAM}`);
    expect(swept.body.meta.lastSweep).toEqual({ at: '2026-10-05T12:00:00.000Z', by: '7', examined: { specifications: 2 }, found: 0 });
  });
});

/**
 * Every CMC register save reports whether it reached Module 3.
 *
 * ── The defect this pins against ─────────────────────────────────────────────
 * The analytical-method, process-validation, stability, QC, change-control,
 * drug-substance, drug-product and comparability routes, the batch record
 * routes and the specification routes all fired their canonical write-through
 * and forgot it: `writeThroughX(...).catch(observe)`. The write-through never
 * rejected — it swallowed its own errors into null — so the `.catch` never
 * ran, no metric was ever incremented, and the response claimed nothing either
 * way. A recorded method, batch or specification could silently never reach
 * the dossier.
 *
 * These tests run the REAL write-through against a pool whose register write
 * succeeds and whose canonical transaction fails, and assert what the five
 * newer registers already guaranteed: the response says `module3Linked: false`
 * with a warning, and the failure is metered.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';

const { inc, registerQuery, canonicalClient, connect } = vi.hoisted(() => {
  const canonicalClient = { query: vi.fn(), release: vi.fn() };
  return {
    inc: vi.fn(),
    registerQuery: vi.fn(),
    canonicalClient,
    connect: vi.fn(async () => canonicalClient),
  };
});

vi.mock('../../../metrics.js', () => ({ metrics: { concept2cureErrors: { inc } } }));

/* The register writes: Drizzle for routes.ts, raw pool.query for the batch and
   specification routes. The canonical write-through takes a CLIENT from the
   pool, so its transaction is the one that fails. */
let insertedRow: Record<string, unknown> = {};
vi.mock('../../../db', () => ({
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => [{ id: 11, ...v, ...insertedRow }],
      }),
    }),
  },
  getPool: () => ({ query: registerQuery, connect }),
}));

import cmcRouter from '../routes';
import batchRouter from '../batchRecordRoutes';
import specRouter from '../specificationRoutes';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.tenantId = 101;
  req.tenantContext = { organizationId: 101 };
  next();
});
app.use('/api/cmc/batch-records', batchRouter);
app.use('/api/cmc/specifications', specRouter);
app.use('/api/cmc', cmcRouter);

function canonicalWriteFails(message: string) {
  canonicalClient.query.mockImplementation(async (sql: string) => {
    if (sql === 'BEGIN' || sql === 'ROLLBACK' || sql === 'COMMIT') return { rows: [] };
    throw new Error(message);
  });
}

function canonicalWriteSucceeds() {
  canonicalClient.query.mockImplementation(async (sql: string) => {
    if (/INSERT INTO cmc_source_objects/.test(sql)) return { rows: [{ id: 'so-1', is_new: true }] };
    return { rows: [], rowCount: 0 };
  });
}

beforeEach(() => {
  inc.mockReset();
  registerQuery.mockReset();
  canonicalClient.query.mockReset();
  canonicalClient.release.mockReset();
  insertedRow = {};
  registerQuery.mockImplementation(async (sql: string) => {
    // The tenant check on a body-named project: the test program is the tenant's.
    if (/SELECT 1 AS present/.test(sql)) return { rows: [{ present: 1 }], rowCount: 1 };
    if (/INSERT INTO cmc_batch_records/.test(sql)) {
      return { rows: [{ id: 5, project_id: PROJECT, batch_number: 'B-001', product_name: 'BX-701', status: 'in-progress' }] };
    }
    if (/INSERT INTO quality_specifications/.test(sql)) {
      return { rows: [{ id: 9, project_id: PROJECT, material_type: 'drug_substance', material_name: 'BX-701', approval_status: 'draft' }] };
    }
    return { rows: [], rowCount: 0 };
  });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

const method = {
  methodCode: 'AM-001',
  title: 'Assay by HPLC',
  purpose: 'Assay',
  analyte: 'BX-701',
  matrix: 'Drug substance',
  technique: 'HPLC',
};

describe('an older register (POST /analytical-methods) reports the Module 3 link like the newer ones', () => {
  it('a failed canonical write: saved, module3Linked:false, a warning, and the failure metered', async () => {
    canonicalWriteFails('connection terminated unexpectedly');

    const res = await request(app).post('/api/cmc/analytical-methods').send({ ...method, projectId: PROJECT });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(11);
    expect(res.body.module3Linked).toBe(false);
    expect(res.body.module3Warning).toMatch(/did not complete/);
    expect(inc).toHaveBeenCalledWith({
      operation: 'cmc_write_through_analytical_method',
      error_type: 'propagation_failed',
    });
    /* The canonical transaction was rolled back and its client released — the
       register row is never rolled back. */
    expect(canonicalClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(canonicalClient.release).toHaveBeenCalled();
  });

  it('a successful canonical write: module3Linked:true, nothing metered', async () => {
    canonicalWriteSucceeds();

    const res = await request(app).post('/api/cmc/analytical-methods').send({ ...method, projectId: PROJECT });

    expect(res.status).toBe(200);
    expect(res.body.module3Linked).toBe(true);
    expect(res.body.module3Warning).toBeUndefined();
    expect(inc).not.toHaveBeenCalled();
  });

  it('no project on the request: saved to the register only, said so, nothing metered, no transaction opened', async () => {
    const res = await request(app).post('/api/cmc/analytical-methods').send(method);

    expect(res.status).toBe(200);
    expect(res.body.module3Linked).toBe(false);
    expect(res.body.module3Warning).toMatch(/No project is set/);
    expect(inc).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('POST /batch-records reports the Module 3 link', () => {
  it('a failed canonical write: 201, the batch, module3Linked:false, warning, metered under cmc_write_through_batch', async () => {
    canonicalWriteFails('relation "cmc_source_objects" does not exist');

    const res = await request(app)
      .post('/api/cmc/batch-records')
      .send({ projectId: PROJECT, batchNumber: 'B-001', productName: 'BX-701' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(5);
    expect(res.body.module3Linked).toBe(false);
    expect(res.body.module3Warning).toMatch(/did not complete/);
    expect(inc).toHaveBeenCalledWith({ operation: 'cmc_write_through_batch', error_type: 'propagation_failed' });
  });

  it('a successful canonical write: module3Linked:true', async () => {
    canonicalWriteSucceeds();
    const res = await request(app)
      .post('/api/cmc/batch-records')
      .send({ projectId: PROJECT, batchNumber: 'B-001', productName: 'BX-701' });
    expect(res.status).toBe(201);
    expect(res.body.module3Linked).toBe(true);
    expect(inc).not.toHaveBeenCalled();
  });
});

describe('POST /specifications reports the Module 3 link', () => {
  it('a failed canonical write: 201, the spec, module3Linked:false, warning, metered under cmc_write_through_specification', async () => {
    canonicalWriteFails('connection terminated unexpectedly');

    const res = await request(app)
      .post('/api/cmc/specifications')
      .send({ projectId: PROJECT, materialType: 'drug_substance', materialName: 'BX-701' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(9);
    expect(res.body.module3Linked).toBe(false);
    expect(res.body.module3Warning).toMatch(/did not complete/);
    expect(inc).toHaveBeenCalledWith({ operation: 'cmc_write_through_specification', error_type: 'propagation_failed' });
  });

  it('a successful canonical write: module3Linked:true', async () => {
    canonicalWriteSucceeds();
    const res = await request(app)
      .post('/api/cmc/specifications')
      .send({ projectId: PROJECT, materialType: 'drug_substance', materialName: 'BX-701' });
    expect(res.status).toBe(201);
    expect(res.body.module3Linked).toBe(true);
    expect(inc).not.toHaveBeenCalled();
  });
});

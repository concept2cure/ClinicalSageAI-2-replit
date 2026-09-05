/**
 * Artifact ↔ section mapping routes: the integrity the assemble gate depends on.
 *
 *   POST   /artifact-section-map           — one mapping per (artifact, section):
 *                                            a repeat answers the existing row,
 *                                            never a second row that would ship
 *                                            the document twice.
 *   DELETE /artifact-section-map/:mappingId — the removal that did not exist:
 *                                            tenant-scoped, governed (reason),
 *                                            clears a bundle assembled with the
 *                                            mapping in place.
 *
 * Both clear a stale bundle because the package's content changed. Drizzle,
 * pool and the ledger are mocked; the stub resolves awaited queries from a FIFO
 * in execution order, so each test states exactly what the database answered.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const recordGovernedActionFn = vi.fn();
vi.mock('../server/routes/c2c/actions', () => ({
  recordGovernedAction: (...a: unknown[]) => recordGovernedActionFn(...a),
}));

const { dbState } = vi.hoisted(() => ({
  dbState: {
    queue: [] as any[][],          // answers for awaited drizzle queries, in order
    inserted: [] as any[],         // values() passed to insert
    updates: [] as any[],          // metadata written under the package row lock
    deletes: 0,
    pkgMetadata: {} as Record<string, unknown>, // what the row lock reads
  },
}));

function makeDb() {
  const chain: any = {
    select() { return chain; },
    from() { return chain; },
    innerJoin() { return chain; },
    where() { return chain; },
    orderBy() { return chain; },
    returning() { return chain; },
    insert() { return chain; },
    values(v: any) { dbState.inserted.push(v); return chain; },
    update() { return chain; },
    set(v: any) { dbState.updates.push(v); return chain; },
    delete() { dbState.deletes += 1; return chain; },
    then(resolve: any, reject: any) {
      const next = dbState.queue.shift();
      return Promise.resolve(next ?? []).then(resolve, reject);
    },
  };
  return chain;
}

/** The pool client: serves the package row lock from dbState.pkgMetadata and
 *  captures each locked UPDATE's metadata. */
const clientQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
  if (/FOR UPDATE/.test(sql)) return { rows: [{ metadata: dbState.pkgMetadata }] };
  if (/^UPDATE c2c_submission_packages/.test(sql)) dbState.updates.push({ metadata: JSON.parse(String(params[1])) });
  return { rows: [] };
});
const connectFn = vi.fn(() => Promise.resolve({ query: clientQuery, release: vi.fn() }));
vi.mock('../server/db', () => ({
  get db() { return makeDb(); },
  pool: { connect: (...a: unknown[]) => connectFn(...a), query: vi.fn() },
}));

vi.mock('../server/submission-ops/policy-engine', () => ({ resolvePolicy: vi.fn(), resolveAllPolicies: vi.fn() }));
vi.mock('../server/submission-ops/readiness-engine', () => ({ computePackageReadiness: vi.fn() }));
vi.mock('../server/submission-ops/automation-runner', () => ({ runAutomationSweep: vi.fn() }));
vi.mock('../server/services/intelligence/index.js', () => ({ getProjectSignals: vi.fn(), analyzeCrossArtifactIntelligence: vi.fn() }));
vi.mock('../server/services/regulatory-correspondence/operating-layer', () => ({ readCanonicalDueSoonAndWorkload: vi.fn() }));
vi.mock('../server/src/services/ectd', () => ({ buildECTDZip: vi.fn() }));
vi.mock('../server/services/ectd/package-leaf-bytes', () => ({ packageLeafBytes: vi.fn() }));

import submissionOpsRouter from '../server/routes/submission-ops';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 777, organizationId: 99 };
    next();
  });
  app.use('/api/submission-ops', submissionOpsRouter);
  return app;
}

const BUNDLE = { path: '/bundles/old.zip', sha256: 'f'.repeat(64), sizeBytes: 9, format: 'ectd' };
const REASON = { reason: 'Artifact belongs in 3.2.P.1, not here' };

beforeEach(() => {
  dbState.queue = [];
  dbState.inserted = [];
  dbState.updates = [];
  dbState.deletes = 0;
  dbState.pkgMetadata = {};
  recordGovernedActionFn.mockReset();
  recordGovernedActionFn.mockResolvedValue({ actionId: 'act_x', auditId: 'aud_x', sha256Chain: 'c' });
  connectFn.mockClear();
  clientQuery.mockClear();
});

describe('DELETE /api/submission-ops/artifact-section-map/:mappingId', () => {
  const del = (id: string, body: Record<string, unknown> = REASON) =>
    request(makeApp()).delete(`/api/submission-ops/artifact-section-map/${id}`).send(body);

  it('removes the mapping, clears the bundle assembled with it, and records a governed action', async () => {
    dbState.queue = [
      [{ id: 31, artifactId: 7, sectionDbId: 12, packageDbId: 5 }], // tenant-scoped mapping lookup
      [{ id: 31 }],                                                  // delete … returning
    ];
    dbState.pkgMetadata = { regulatory: { applicationNumber: 'IND1' }, bundle: BUNDLE }; // read under the row lock
    const res = await del('31');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ deleted: true, mappingId: 31, staleBundleCleared: true, ledgerWriteFailed: false });
    expect(dbState.deletes).toBe(1);
    // The stale bundle is gone; unrelated metadata is kept.
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].metadata.bundle).toBeUndefined();
    expect(dbState.updates[0].metadata.regulatory.applicationNumber).toBe('IND1');
    // Governed: reason + what changed.
    expect(recordGovernedActionFn).toHaveBeenCalledTimes(1);
    const ledger = recordGovernedActionFn.mock.calls[0][1];
    expect(ledger).toMatchObject({ orgId: 99, userId: 777, target: 'submission:5', reason: REASON.reason });
    expect(ledger.payload).toMatchObject({ change: 'artifact-unmapped', mappingId: 31, artifactId: 7, sectionDbId: 12, staleBundleCleared: true });
    expect(clientQuery).toHaveBeenCalledWith('BEGIN');
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('leaves the package untouched when there was no bundle to clear', async () => {
    dbState.queue = [[{ id: 31, artifactId: 7, sectionDbId: 12, packageDbId: 5 }], [{ id: 31 }]];
    dbState.pkgMetadata = { foo: 'bar' };
    const res = await del('31');
    expect(res.status).toBe(200);
    expect(res.body.data.staleBundleCleared).toBe(false);
    expect(dbState.updates).toHaveLength(0);
  });

  it('REQUIRES a reason (governed change) and touches nothing without one', async () => {
    const res = await del('31', {});
    expect(res.status).toBe(400);
    expect(res.body.details.reason).toBeDefined();
    expect(dbState.deletes).toBe(0);
    expect(recordGovernedActionFn).not.toHaveBeenCalled();
  });

  it('404s for a mapping outside the tenant, and for a non-numeric or out-of-range id', async () => {
    dbState.queue = [[]];
    expect((await del('31')).status).toBe(404);
    expect((await del('not-a-number')).status).toBe(404);
    expect((await del('99999999999')).status).toBe(404);
    expect(dbState.deletes).toBe(0);
  });

  it('reports a ledger outage instead of pretending the removal was audited', async () => {
    dbState.queue = [[{ id: 31, artifactId: 7, sectionDbId: 12, packageDbId: 5 }], [{ id: 31 }]];
    recordGovernedActionFn.mockRejectedValueOnce(new Error('audit db down'));
    const res = await del('31');
    expect(res.status).toBe(200);
    expect(res.body.data.ledgerWriteFailed).toBe(true);
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
  });
});

describe('POST /api/submission-ops/artifact-section-map — one mapping per (artifact, section)', () => {
  const post = (body: Record<string, unknown>) =>
    request(makeApp()).post('/api/submission-ops/artifact-section-map').send(body);
  const artifactRow = [{ id: 7, projectId: 3 }];
  const sectionRow = [{ id: 12, packageDbId: 5 }];
  const pkgRow = [{ id: 5, projectId: 3 }];

  const MAP_REASON = { reason: 'Map the drug product description into 3.2.P.1' };

  it('REQUIRES a reason (governed change)', async () => {
    const res = await post({ artifactId: 7, sectionDbId: 12 });
    expect(res.status).toBe(400);
    expect(res.body.details.reason).toBeDefined();
    expect(dbState.inserted).toHaveLength(0);
  });

  it('answers a repeat mapping with the EXISTING row and inserts nothing', async () => {
    dbState.queue = [artifactRow, sectionRow, pkgRow, [{ id: 31, artifactId: 7, sectionDbId: 12 }]];
    const res = await post({ artifactId: 7, sectionDbId: 12, ...MAP_REASON });
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(res.body.data.id).toBe(31);
    expect(dbState.inserted).toHaveLength(0);
    expect(recordGovernedActionFn).not.toHaveBeenCalled(); // nothing changed
  });

  it('creates a new mapping, clears a bundle assembled before it, and records a governed action', async () => {
    dbState.queue = [
      artifactRow, sectionRow, pkgRow,
      [],                                                   // no existing mapping
      [{ id: 32, artifactId: 7, sectionDbId: 12 }],         // insert … returning
    ];
    dbState.pkgMetadata = { bundle: BUNDLE, foo: 'bar' };   // read under the row lock
    const res = await post({ artifactId: 7, sectionDbId: 12, documentFamily: 'cmc', ...MAP_REASON });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(32);
    expect(res.body.staleBundleCleared).toBe(true);
    expect(res.body.ledgerWriteFailed).toBe(false);
    expect(dbState.inserted).toHaveLength(1);
    expect(dbState.inserted[0]).toMatchObject({ orgId: 99, artifactId: 7, sectionDbId: 12, documentFamily: 'cmc' });
    expect(dbState.updates[0].metadata.bundle).toBeUndefined();
    expect(dbState.updates[0].metadata.foo).toBe('bar');
    const ledger = recordGovernedActionFn.mock.calls[0][1];
    expect(ledger).toMatchObject({ orgId: 99, userId: 777, target: 'submission:5', reason: MAP_REASON.reason });
    expect(ledger.payload).toMatchObject({ change: 'artifact-mapped', mappingId: 32, artifactId: 7, sectionDbId: 12, staleBundleCleared: true });
  });
});

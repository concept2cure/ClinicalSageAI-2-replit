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
    inserted: [] as any[],         // params of each INSERT issued inside the row-lock transaction
    updates: [] as any[],          // metadata written under the package row lock
    deletes: 0,                    // DELETEs issued inside the row-lock transaction
    pkgMetadata: {} as Record<string, unknown>, // what the row lock reads
    insertReturns: null as any[] | null, // rows the INSERT returns (null = one row from its params)
    deleteReturns: null as any[] | null, // rows the DELETE returns (null = the deleted id)
    failUpdate: false,                   // the locked UPDATE throws (a failure AFTER the row write)
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

/** The pool client: serves the package row lock from dbState.pkgMetadata,
 *  captures each locked UPDATE's metadata, and serves the mapping row's INSERT
 *  / DELETE — which happen INSIDE the lock's transaction so the row and the
 *  content-revision bump commit (or roll back) together. */
const clientQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
  if (/FOR UPDATE/.test(sql)) return { rows: [{ metadata: dbState.pkgMetadata }] };
  if (/^UPDATE c2c_submission_packages/.test(sql)) {
    if (dbState.failUpdate) throw new Error('simulated failure after the row write');
    dbState.updates.push({ metadata: JSON.parse(String(params[1])) });
    return { rows: [] };
  }
  if (/INSERT INTO c2c_artifact_section_map/.test(sql)) {
    dbState.inserted.push(params);
    return {
      rows: dbState.insertReturns ?? [{
        id: 32, org_id: params[0], artifact_id: params[1], section_db_id: params[2], document_family: params[3],
        owner_user_id: params[4], owner_role: params[5], owner_function: params[6], ownership_type: params[7],
        created_at: '2026-09-05T00:00:00.000Z', updated_at: null,
      }],
    };
  }
  if (/DELETE FROM c2c_artifact_section_map/.test(sql)) {
    dbState.deletes += 1;
    return { rows: dbState.deleteReturns ?? [{ id: params[0] }] };
  }
  return { rows: [] };
});
/** The order of statements inside the lock's transaction. */
const statementOrder = () => clientQuery.mock.calls.map((c) => String(c[0]));
const indexOf = (re: RegExp) => statementOrder().findIndex((s) => re.test(s));
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
  dbState.insertReturns = null;
  dbState.deleteReturns = null;
  dbState.failUpdate = false;
  recordGovernedActionFn.mockReset();
  recordGovernedActionFn.mockResolvedValue({ actionId: 'act_x', auditId: 'aud_x', sha256Chain: 'c' });
  connectFn.mockClear();
  clientQuery.mockClear();
});

describe('DELETE /api/submission-ops/artifact-section-map/:mappingId', () => {
  const del = (id: string, body: Record<string, unknown> = REASON) =>
    request(makeApp()).delete(`/api/submission-ops/artifact-section-map/${id}`).send(body);

  it('removes the mapping, clears the bundle assembled with it, and records a governed action — row and bump in ONE transaction, lock first', async () => {
    dbState.queue = [
      [{ id: 31, artifactId: 7, sectionDbId: 12, packageDbId: 5 }], // tenant-scoped mapping lookup
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
    // BEGIN → lock the package row → DELETE the mapping → write the bump → COMMIT.
    // Locking first serialises with an assembly's store; deleting inside the
    // transaction means a failure after the delete rolls the row back too.
    expect(indexOf(/^BEGIN$/)).toBeLessThan(indexOf(/FOR UPDATE/));
    expect(indexOf(/FOR UPDATE/)).toBeLessThan(indexOf(/DELETE FROM c2c_artifact_section_map/));
    expect(indexOf(/DELETE FROM c2c_artifact_section_map/)).toBeLessThan(indexOf(/^UPDATE c2c_submission_packages/));
    expect(indexOf(/^UPDATE c2c_submission_packages/)).toBeLessThan(indexOf(/^COMMIT$/));
  });

  it('bumps the content revision even when there is no bundle to clear, so an assembly in flight sees the change', async () => {
    // An assemble that read its content before this unmapping would otherwise
    // store a zip that still ships the artifact; its lock compares revisions.
    dbState.queue = [[{ id: 31, artifactId: 7, sectionDbId: 12, packageDbId: 5 }]];
    dbState.pkgMetadata = { foo: 'bar', contentRevision: 41 };
    const res = await del('31');
    expect(res.status).toBe(200);
    expect(res.body.data.staleBundleCleared).toBe(false);
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].metadata).toEqual({ foo: 'bar', contentRevision: 42 });
  });

  it('drops the preflight summary together with the bundle it described (an orphaned summary would be aggregated as current)', async () => {
    dbState.queue = [[{ id: 31, artifactId: 7, sectionDbId: 12, packageDbId: 5 }]];
    dbState.pkgMetadata = { foo: 'bar', bundle: BUNDLE, preflight: { bundleSha256: BUNDLE.sha256, errorCount: 0, blocking: false } };
    const res = await del('31');
    expect(res.status).toBe(200);
    expect(dbState.updates[0].metadata).toEqual({ foo: 'bar', contentRevision: 1 });
  });

  it('a failure AFTER the delete rolls the row back with it: 500, nothing committed, nothing recorded', async () => {
    dbState.queue = [[{ id: 31, artifactId: 7, sectionDbId: 12, packageDbId: 5 }]];
    dbState.pkgMetadata = { bundle: BUNDLE };
    dbState.failUpdate = true;
    const res = await del('31');
    expect(res.status).toBe(500);
    expect(dbState.deletes).toBe(1);                       // the DELETE ran inside the transaction…
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');  // …and was rolled back with the failed bump
    expect(clientQuery).not.toHaveBeenCalledWith('COMMIT');
    expect(recordGovernedActionFn).not.toHaveBeenCalled();
  });

  it('a mapping that vanished between the lookup and the delete is a 404 with nothing bumped', async () => {
    dbState.queue = [[{ id: 31, artifactId: 7, sectionDbId: 12, packageDbId: 5 }]];
    dbState.pkgMetadata = { bundle: BUNDLE };
    dbState.deleteReturns = [];
    const res = await del('31');
    expect(res.status).toBe(404);
    expect(dbState.updates).toHaveLength(0);
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(recordGovernedActionFn).not.toHaveBeenCalled();
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
    dbState.queue = [[{ id: 31, artifactId: 7, sectionDbId: 12, packageDbId: 5 }]];
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

  it('creates a new mapping, clears a bundle assembled before it, and records a governed action — row and bump in ONE transaction, lock first', async () => {
    dbState.queue = [
      artifactRow, sectionRow, pkgRow,
      [],                                                   // no existing mapping
    ];
    dbState.pkgMetadata = { bundle: BUNDLE, foo: 'bar' };   // read under the row lock
    const res = await post({ artifactId: 7, sectionDbId: 12, documentFamily: 'cmc', ...MAP_REASON });
    expect(res.status).toBe(201);
    // The row as the API has always returned it (camelCase), from the INSERT … RETURNING.
    expect(res.body.data).toMatchObject({ id: 32, orgId: 99, artifactId: 7, sectionDbId: 12, documentFamily: 'cmc', ownerUserId: 777 });
    expect(res.body.staleBundleCleared).toBe(true);
    // A package that never had a revision starts at 1 (never NaN).
    expect(dbState.updates.at(-1).metadata).toMatchObject({ foo: 'bar', contentRevision: 1 });
    expect(dbState.updates.at(-1).metadata.bundle).toBeUndefined();
    expect(res.body.ledgerWriteFailed).toBe(false);
    expect(dbState.inserted).toHaveLength(1);
    expect(dbState.inserted[0].slice(0, 4)).toEqual([99, 7, 12, 'cmc']);
    const ledger = recordGovernedActionFn.mock.calls[0][1];
    expect(ledger).toMatchObject({ orgId: 99, userId: 777, target: 'submission:5', reason: MAP_REASON.reason });
    expect(ledger.payload).toMatchObject({ change: 'artifact-mapped', mappingId: 32, artifactId: 7, sectionDbId: 12, staleBundleCleared: true });
    // BEGIN → lock the package row → INSERT the mapping → write the bump → COMMIT.
    expect(indexOf(/^BEGIN$/)).toBeLessThan(indexOf(/FOR UPDATE/));
    expect(indexOf(/FOR UPDATE/)).toBeLessThan(indexOf(/INSERT INTO c2c_artifact_section_map/));
    expect(indexOf(/INSERT INTO c2c_artifact_section_map/)).toBeLessThan(indexOf(/^UPDATE c2c_submission_packages/));
    expect(indexOf(/^UPDATE c2c_submission_packages/)).toBeLessThan(indexOf(/^COMMIT$/));
  });

  it('a failure AFTER the insert rolls the row back with it: 500, no half-recorded mapping, nothing in the ledger', async () => {
    // Two transactions used to leave the row committed with the bundle still
    // stored and the revision unchanged — and the operator's retry answered
    // "duplicate" without ever bumping.
    dbState.queue = [artifactRow, sectionRow, pkgRow, []];
    dbState.pkgMetadata = { bundle: BUNDLE };
    dbState.failUpdate = true;
    const res = await post({ artifactId: 7, sectionDbId: 12, ...MAP_REASON });
    expect(res.status).toBe(500);
    expect(dbState.inserted).toHaveLength(1);
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(clientQuery).not.toHaveBeenCalledWith('COMMIT');
    expect(dbState.updates).toHaveLength(0);
    expect(recordGovernedActionFn).not.toHaveBeenCalled();
  });

  it('a duplicate that races past the pre-check is answered as the existing mapping, and bumps nothing', async () => {
    dbState.queue = [
      artifactRow, sectionRow, pkgRow,
      [],                                                   // pre-check: nothing yet
      [{ id: 31, artifactId: 7, sectionDbId: 12 }],         // the row the conflict revealed
    ];
    dbState.pkgMetadata = { bundle: BUNDLE };
    dbState.insertReturns = [];                              // ON CONFLICT DO NOTHING: no row
    const res = await post({ artifactId: 7, sectionDbId: 12, ...MAP_REASON });
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(res.body.data.id).toBe(31);
    expect(dbState.updates).toHaveLength(0);                 // the bundle still reflects the package
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(recordGovernedActionFn).not.toHaveBeenCalled();
  });
});

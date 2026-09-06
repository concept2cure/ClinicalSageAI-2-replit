/**
 * The governed section routes: a package's section list is editable, and every
 * edit invalidates the bundle built from the old list.
 *
 * A section's key routes each leaf to its ICH module, its label becomes the
 * placeholder leaf's title, and its sort order decides the order the leaves
 * appear in the backbone — all three are covered by the content fingerprint.
 * Until these routes existed the list was fixed at package creation, so a
 * mistyped key could only be escaped by abandoning the package.
 *
 * Each case pins one half of the contract: the row write and the package's
 * content-change bump commit together, a no-op changes and records nothing,
 * and removing a section that still holds artifacts is refused rather than
 * silently cascading their mappings away.
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
    queue: [] as any[][],                        // answers for awaited drizzle queries, in order
    pkgMetadata: {} as Record<string, unknown>,  // what the row lock reads
    updates: [] as any[],                        // metadata written under the lock
    statements: [] as string[],                  // statements issued inside the lock
    inserted: [] as unknown[][],
    deleted: [] as unknown[][],
    deleteReturns: null as any[] | null,
    failWrite: false,
  },
}));

function makeDb() {
  const chain: any = {
    select() { return chain; },
    from() { return chain; },
    innerJoin() { return chain; },
    where() { return chain; },
    orderBy() { return chain; },
    then(resolve: any, reject: any) {
      const next = dbState.queue.shift();
      return Promise.resolve(next ?? []).then(resolve, reject);
    },
  };
  return chain;
}

const clientQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
  dbState.statements.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
  if (/FOR UPDATE/.test(sql)) return { rows: [{ metadata: dbState.pkgMetadata }] };
  if (/^UPDATE c2c_submission_packages/.test(sql)) {
    if (dbState.failWrite) throw new Error('lock write failed');
    dbState.updates.push({ metadata: JSON.parse(String(params[1])) });
    return { rows: [] };
  }
  if (/INSERT INTO c2c_package_sections/.test(sql)) {
    dbState.inserted.push(params);
    return { rows: [{ id: 77, section_id: params[0], section_key: params[3], section_label: params[4], sort_order: params[5] }] };
  }
  if (/UPDATE c2c_package_sections/.test(sql)) { dbState.inserted.push(params); return { rows: [] }; }
  if (/DELETE FROM c2c_package_sections/.test(sql)) {
    dbState.deleted.push(params);
    return { rows: dbState.deleteReturns ?? [{ id: params[0] }] };
  }
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
  app.use((req, _res, next) => { (req as any).user = { id: 777, organizationId: 99 }; next(); });
  app.use('/api/submission-ops', submissionOpsRouter);
  return app;
}

const PKG = [{ id: 5 }];
const SECTION = [{ id: 11, sectionId: 'sec_a', sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 0, packageDbId: 5, orgId: 99 }];
const BUNDLE = { path: '/bundles/old.zip', sha256: 'f'.repeat(64), sizeBytes: 9, format: 'ectd' };
const REASON = { reason: 'The section key was mistyped at package creation' };
const order = (re: RegExp) => dbState.statements.findIndex((s) => re.test(s));

beforeEach(() => {
  dbState.queue = [];
  dbState.pkgMetadata = {};
  dbState.updates = [];
  dbState.statements = [];
  dbState.inserted = [];
  dbState.deleted = [];
  dbState.deleteReturns = null;
  dbState.failWrite = false;
  recordGovernedActionFn.mockReset();
  recordGovernedActionFn.mockResolvedValue({ actionId: 'act_x', auditId: 'aud_x', sha256Chain: 'c' });
  connectFn.mockClear();
  clientQuery.mockClear();
});

describe('POST /api/submission-ops/packages/:packageId/sections', () => {
  const post = (body: Record<string, unknown>) =>
    request(makeApp()).post('/api/submission-ops/packages/5/sections').send(body);

  it('adds a section, clears the bundle the old list produced, and records a governed action — row and bump in ONE transaction', async () => {
    dbState.queue = [PKG];
    dbState.pkgMetadata = { bundle: BUNDLE, preflight: { bundleSha256: BUNDLE.sha256 }, foo: 'bar' };
    const res = await post({ sectionKey: '3.2.P.1', sectionLabel: 'Description and Composition', sortOrder: 2, ...REASON });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ staleBundleCleared: true, ledgerWriteFailed: false });
    expect(res.body.data).toMatchObject({ id: 77, sectionKey: '3.2.P.1' });
    // The stale bundle and its preflight summary are gone; the revision moved.
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].metadata).toEqual({ foo: 'bar', contentRevision: 1 });
    expect(dbState.inserted[0].slice(1, 6)).toEqual([99, 5, '3.2.P.1', 'Description and Composition', 2]);
    // BEGIN → lock → INSERT → bump → COMMIT.
    expect(order(/^BEGIN/)).toBeLessThan(order(/^SELECT metadata/));
    expect(order(/^SELECT metadata/)).toBeLessThan(order(/^INSERT INTO c2c_package_sections/));
    expect(order(/^INSERT INTO c2c_package_sections/)).toBeLessThan(order(/^UPDATE c2c_submission_packages/));
    expect(order(/^UPDATE c2c_submission_packages/)).toBeLessThan(order(/^COMMIT/));
    const ledger = recordGovernedActionFn.mock.calls[0][1];
    expect(ledger).toMatchObject({ orgId: 99, userId: 777, target: 'submission:5', reason: REASON.reason });
    expect(ledger.payload).toMatchObject({ change: 'section-added', sectionDbId: 77, sectionKey: '3.2.P.1', staleBundleCleared: true });
  });

  it('REQUIRES a reason and a key (governed change), and touches nothing without them', async () => {
    expect((await post({ sectionKey: '2.5', sectionLabel: 'x' })).status).toBe(400);
    expect((await post({ sectionLabel: 'x', ...REASON })).status).toBe(400);
    expect(dbState.inserted).toHaveLength(0);
    expect(recordGovernedActionFn).not.toHaveBeenCalled();
  });

  it('404s for a package outside the tenant', async () => {
    dbState.queue = [[]];
    expect((await post({ sectionKey: '2.5', sectionLabel: 'x', ...REASON })).status).toBe(404);
    expect(dbState.inserted).toHaveLength(0);
  });

  it('a failure AFTER the insert rolls the row back with it', async () => {
    dbState.queue = [PKG];
    dbState.failWrite = true;
    const res = await post({ sectionKey: '2.5', sectionLabel: 'x', ...REASON });
    expect(res.status).toBe(500);
    expect(dbState.inserted).toHaveLength(1);      // the INSERT ran inside the transaction…
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK'); // …and went back with the failed bump
    expect(recordGovernedActionFn).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/submission-ops/packages/:packageId/sections/:sectionId', () => {
  const patch = (body: Record<string, unknown>, section = '11') =>
    request(makeApp()).patch(`/api/submission-ops/packages/5/sections/${section}`).send(body);

  it('renames a section, invalidating the bundle placed by the OLD key', async () => {
    dbState.queue = [PKG, SECTION];
    dbState.pkgMetadata = { bundle: BUNDLE, contentRevision: 4 };
    const res = await patch({ sectionKey: '3.2.P.1', ...REASON });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ changed: true, staleBundleCleared: true });
    expect(res.body.data).toMatchObject({ id: 11, sectionKey: '3.2.P.1', sectionLabel: 'Clinical Overview', sortOrder: 0 });
    expect(dbState.updates[0].metadata).toEqual({ contentRevision: 5 });
    const ledger = recordGovernedActionFn.mock.calls[0][1];
    expect(ledger.payload).toMatchObject({
      change: 'section-updated',
      previous: { sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 0 },
      next: { sectionKey: '3.2.P.1', sectionLabel: 'Clinical Overview', sortOrder: 0 },
    });
  });

  it('a REORDER invalidates too — it changes the order the leaves appear in the backbone', async () => {
    dbState.queue = [PKG, SECTION];
    dbState.pkgMetadata = { bundle: BUNDLE };
    const res = await patch({ sortOrder: 3, ...REASON });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ changed: true, staleBundleCleared: true });
    expect(recordGovernedActionFn.mock.calls[0][1].payload.next).toMatchObject({ sortOrder: 3 });
  });

  it('a NO-OP changes nothing, invalidates nothing and records nothing', async () => {
    dbState.queue = [PKG, SECTION];
    dbState.pkgMetadata = { bundle: BUNDLE };
    const res = await patch({ sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 0, ...REASON });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ changed: false, staleBundleCleared: false });
    expect(dbState.updates).toHaveLength(0);
    expect(connectFn).not.toHaveBeenCalled();
    expect(recordGovernedActionFn).not.toHaveBeenCalled();
  });

  it('TRIMS a padded key rather than storing it — the key becomes a leaf path component — and a trimmed no-op is still a no-op', async () => {
    dbState.queue = [PKG, SECTION];
    dbState.pkgMetadata = { bundle: BUNDLE };
    // ' 2.5 ' is the section's existing key once trimmed: nothing changed.
    const noop = await patch({ sectionKey: '  2.5  ', ...REASON });
    expect(noop.status).toBe(200);
    expect(noop.body.changed).toBe(false);
    expect(dbState.updates).toHaveLength(0);

    dbState.queue = [PKG, SECTION];
    const real = await patch({ sectionKey: '  3.2.P.1  ', ...REASON });
    expect(real.status).toBe(200);
    expect(real.body.data.sectionKey).toBe('3.2.P.1');
    expect(recordGovernedActionFn.mock.calls[0][1].payload.next.sectionKey).toBe('3.2.P.1');
  });

  it('REFUSES an empty change and a missing reason, and 404s a section outside the package', async () => {
    expect((await patch({ ...REASON })).status).toBe(400);          // nothing to change
    expect((await patch({ sectionKey: '2.5' })).status).toBe(400);  // no reason
    dbState.queue = [PKG, []];
    expect((await patch({ sectionKey: '2.5', ...REASON })).status).toBe(404);
    expect(dbState.updates).toHaveLength(0);
  });
});

describe('DELETE /api/submission-ops/packages/:packageId/sections/:sectionId', () => {
  const del = (body: Record<string, unknown> = REASON, section = '11') =>
    request(makeApp()).delete(`/api/submission-ops/packages/5/sections/${section}`).send(body);

  it('REFUSES to remove a section that still holds artifacts — the cascade would unmap them with no record of its own', async () => {
    dbState.queue = [PKG, SECTION, [{ n: 2 }]];
    dbState.pkgMetadata = { bundle: BUNDLE };
    const res = await del();
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'SECTION_NOT_EMPTY', mappedCount: 2 });
    expect(res.body.error).toMatch(/unmap them first/);
    expect(dbState.deleted).toHaveLength(0);
    expect(dbState.updates).toHaveLength(0);
    expect(recordGovernedActionFn).not.toHaveBeenCalled();
  });

  it('removes an EMPTY section, invalidating the bundle that shipped its placeholder leaf', async () => {
    dbState.queue = [PKG, SECTION, [{ n: 0 }]];
    dbState.pkgMetadata = { bundle: BUNDLE, contentRevision: 1 };
    const res = await del();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ staleBundleCleared: true, ledgerWriteFailed: false });
    expect(res.body.data).toMatchObject({ deleted: true, sectionDbId: 11 });
    expect(dbState.deleted[0]).toEqual([11, 99]);
    expect(dbState.updates[0].metadata).toEqual({ contentRevision: 2 });
    expect(order(/^DELETE FROM c2c_package_sections/)).toBeLessThan(order(/^UPDATE c2c_submission_packages/));
    expect(recordGovernedActionFn.mock.calls[0][1].payload).toMatchObject({ change: 'section-removed', sectionDbId: 11, sectionKey: '2.5' });
  });

  it('a section that vanished between the check and the delete is a 404 with nothing bumped', async () => {
    dbState.queue = [PKG, SECTION, [{ n: 0 }]];
    dbState.pkgMetadata = { bundle: BUNDLE };
    dbState.deleteReturns = [];
    const res = await del();
    expect(res.status).toBe(404);
    expect(dbState.updates).toHaveLength(0);
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(recordGovernedActionFn).not.toHaveBeenCalled();
  });

  it('reports a ledger outage instead of pretending the removal was audited', async () => {
    dbState.queue = [PKG, SECTION, [{ n: 0 }]];
    dbState.pkgMetadata = { bundle: BUNDLE };
    recordGovernedActionFn.mockRejectedValueOnce(new Error('audit db down'));
    const res = await del();
    expect(res.status).toBe(200);
    expect(res.body.ledgerWriteFailed).toBe(true);
    expect(dbState.updates).toHaveLength(1); // the removal itself is not lost
  });
});

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
    /** The section row as the LOCKED read sees it — a test can make this differ
     *  from what the pre-lock lookup returned, which is the lost-update race. */
    lockedSection: null as null | { section_key: string; section_label: string; sort_order: number | null },
    /** Counts the locked guard reads, by table. */
    counts: {} as Record<string, number>,
    /** Runs on the locked section read: lets a test land a concurrent write
     *  INSIDE the lock's window, which is where the TOCTOU used to be. */
    onLock: null as null | (() => void),
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
  if (/FROM c2c_package_sections\s+WHERE id = \$1 AND package_db_id = \$2 FOR UPDATE/.test(sql)) {
    dbState.onLock?.();
    return { rows: dbState.lockedSection ? [dbState.lockedSection] : [] };
  }
  if (/FOR UPDATE/.test(sql)) return { rows: [{ metadata: dbState.pkgMetadata }] };
  const counted = sql.match(/count\(\*\)::int AS n FROM (\w+)/)?.[1];
  if (counted) return { rows: [{ n: dbState.counts[counted] ?? 0 }] };
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

function makeApp(role = 'admin') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { /* A role, because every write on this router is now role-gated. These harnesses
       attached none and still passed, which is exactly what they failed to notice. */
    (req as any).user = { id: 777, organizationId: 99, role };
    (req as any).userRole = role; next(); });
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
  dbState.lockedSection = { section_key: '2.5', section_label: 'Clinical Overview', sort_order: 0 };
  dbState.counts = {};
  dbState.onLock = null;
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
    // Knowing it is a no-op requires reading the row under the lock, so the
    // lock IS taken — and then rolled back, writing and recording nothing.
    expect(dbState.updates).toHaveLength(0);
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(clientQuery).not.toHaveBeenCalledWith('COMMIT');
    expect(recordGovernedActionFn).not.toHaveBeenCalled();
  });

  it('decides against the LOCKED row, never the one read before it: a rename that commits in between is not reverted', async () => {
    // The pre-lock lookup still shows '2.5'; by the time the row is locked a
    // concurrent governed rename has moved it to '3.2.P.1'. A label-only patch
    // must keep that key and report it as the previous value — deciding from
    // the stale read wrote '2.5' back and recorded that the key never moved.
    dbState.queue = [PKG, SECTION];
    dbState.pkgMetadata = { bundle: BUNDLE };
    dbState.lockedSection = { section_key: '3.2.P.1', section_label: 'Clinical Overview', sort_order: 0 };
    const res = await patch({ sectionLabel: 'Clinical Overview (rev 2)', ...REASON });
    expect(res.status).toBe(200);
    expect(res.body.data.sectionKey).toBe('3.2.P.1');
    const ledger = recordGovernedActionFn.mock.calls[0][1];
    expect(ledger.payload.previous.sectionKey).toBe('3.2.P.1');
    expect(ledger.payload.next.sectionKey).toBe('3.2.P.1');
    // The row written carries the concurrent key, not the stale one.
    expect(dbState.inserted.at(-1)).toEqual([11, '3.2.P.1', 'Clinical Overview (rev 2)', 0]);
  });

  it('a patch whose target value the LOCKED row already holds is a no-op, not a bundle-destroying write', async () => {
    dbState.queue = [PKG, SECTION];
    dbState.pkgMetadata = { bundle: BUNDLE };
    dbState.lockedSection = { section_key: '3.2.P.1', section_label: 'Clinical Overview', sort_order: 0 };
    const res = await patch({ sectionKey: '3.2.P.1', ...REASON });
    expect(res.body).toMatchObject({ changed: false, staleBundleCleared: false });
    expect(dbState.updates).toHaveLength(0);
    expect(recordGovernedActionFn).not.toHaveBeenCalled();
  });

  it('a section that vanished before the lock is a 404, not a write against nothing', async () => {
    dbState.queue = [PKG, SECTION];
    dbState.lockedSection = null;
    const res = await patch({ sectionKey: '3.2.P.1', ...REASON });
    expect(res.status).toBe(404);
    expect(dbState.updates).toHaveLength(0);
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
  });

  it('NULL and 0 are the same sort order, so setting 0 on a NULL row is a no-op', async () => {
    dbState.queue = [PKG, SECTION];
    dbState.lockedSection = { section_key: '2.5', section_label: 'Clinical Overview', sort_order: null };
    const res = await patch({ sortOrder: 0, ...REASON });
    expect(res.body).toMatchObject({ changed: false });
    expect(res.body.data.sortOrder).toBe(0);
    expect(dbState.updates).toHaveLength(0);
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
    dbState.queue = [PKG, SECTION];
    dbState.pkgMetadata = { bundle: BUNDLE };
    dbState.counts = { c2c_artifact_section_map: 2 };
    const res = await del();
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'SECTION_NOT_EMPTY', mappedCount: 2 });
    expect(res.body.error).toMatch(/remove them first/);
    expect(dbState.deleted).toHaveLength(0);
    expect(dbState.updates).toHaveLength(0);
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(recordGovernedActionFn).not.toHaveBeenCalled();
  });

  it('counts UNDER the lock: a mapping created after the request began is still refused, never cascaded away', async () => {
    // Counting before taking the lock let a mapping land in the window and be
    // destroyed by the cascade, with only a `section-removed` record for it.
    dbState.queue = [PKG, SECTION];
    dbState.pkgMetadata = { bundle: BUNDLE };
    dbState.onLock = () => { dbState.counts.c2c_artifact_section_map = 1; };
    const res = await del();
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'SECTION_NOT_EMPTY', mappedCount: 1 });
    expect(dbState.deleted).toHaveLength(0);
  });

  it('REFUSES a section a milestone still gates — that link cascades too, and is not an artifact mapping', async () => {
    dbState.queue = [PKG, SECTION];
    dbState.pkgMetadata = { bundle: BUNDLE };
    dbState.counts = { c2c_milestone_sections: 2 };
    const res = await del();
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'SECTION_NOT_EMPTY', mappedCount: 0, milestoneLinks: 2 });
    expect(res.body.error).toMatch(/2 milestone gate assignments/);
    expect(dbState.deleted).toHaveLength(0);
  });

  it('NAMES the collateral the cascade takes — derived readiness rows removed, blockers unlinked — instead of losing it', async () => {
    dbState.queue = [PKG, SECTION];
    dbState.pkgMetadata = { bundle: BUNDLE };
    dbState.counts = { c2c_readiness_snapshots: 3, c2c_blockers: 1 };
    const res = await del();
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ deleted: true, readinessSnapshotsRemoved: 3, blockersUnlinked: 1 });
    expect(recordGovernedActionFn.mock.calls[0][1].payload).toMatchObject({
      change: 'section-removed', readinessSnapshotsRemoved: 3, blockersUnlinked: 1,
    });
  });

  it('removes an EMPTY section, invalidating the bundle that shipped its placeholder leaf', async () => {
    dbState.queue = [PKG, SECTION];
    dbState.pkgMetadata = { bundle: BUNDLE, contentRevision: 1 };
    const res = await del();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ staleBundleCleared: true, ledgerWriteFailed: false });
    expect(res.body.data).toMatchObject({ deleted: true, sectionDbId: 11 });
    expect(dbState.deleted[0]).toEqual([11]);
    expect(dbState.updates[0].metadata).toEqual({ contentRevision: 2 });
    expect(order(/^DELETE FROM c2c_package_sections/)).toBeLessThan(order(/^UPDATE c2c_submission_packages/));
    expect(recordGovernedActionFn.mock.calls[0][1].payload).toMatchObject({ change: 'section-removed', sectionDbId: 11, sectionKey: '2.5' });
  });

  it('a section that vanished between the check and the delete is a 404 with nothing bumped', async () => {
    dbState.queue = [PKG, SECTION];
    dbState.pkgMetadata = { bundle: BUNDLE };
    dbState.deleteReturns = [];
    const res = await del();
    expect(res.status).toBe(404);
    expect(dbState.updates).toHaveLength(0);
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(recordGovernedActionFn).not.toHaveBeenCalled();
  });

  it('reports a ledger outage instead of pretending the removal was audited', async () => {
    dbState.queue = [PKG, SECTION];
    dbState.pkgMetadata = { bundle: BUNDLE };
    recordGovernedActionFn.mockRejectedValueOnce(new Error('audit db down'));
    const res = await del();
    expect(res.status).toBe(200);
    expect(res.body.ledgerWriteFailed).toBe(true);
    expect(dbState.updates).toHaveLength(1); // the removal itself is not lost
  });
});

/**
 * This router owns the submission PACKAGE — create it, put documents in it, set
 * the agency application number and applicant identity the regional Module 1
 * backbone is built from, publish it, and assemble the bundle shipped to FDA
 * ESG. Every mutating route was guarded by nothing but `getOrgId(req)`, which is
 * tenant scoping, not authorization: a read-only `viewer` could do all of it.
 *
 * Gating the gateway's /transmit alone would have left the last door on a
 * corridor with no others — a viewer still chose WHAT was sent and UNDER WHOSE
 * application number, and only the final click was checked.
 */
describe('submission-ops — role gate on every write', () => {
  const WRITES: Array<[string, string]> = [
    ['post', '/api/submission-ops/packages'],
    ['post', '/api/submission-ops/packages/5/sections'],
    ['patch', '/api/submission-ops/packages/5/sections/11'],
    ['delete', '/api/submission-ops/packages/5/sections/11'],
    ['post', '/api/submission-ops/artifact-section-map'],
    ['delete', '/api/submission-ops/artifact-section-map/3'],
    ['post', '/api/submission-ops/packages/5/milestones'],
    ['post', '/api/submission-ops/policies'],
    ['put', '/api/submission-ops/policies/1'],
    ['delete', '/api/submission-ops/policies/1'],
    ['patch', '/api/submission-ops/blockers/1'],
    ['post', '/api/submission-ops/automation/run'],
    ['post', '/api/submission-ops/packages/5/publish'],
    ['put', '/api/submission-ops/packages/5/regulatory-identifiers'],
    ['post', '/api/submission-ops/packages/5/assemble'],
  ];

  it.each(WRITES)('%s %s is refused for a read-only viewer', async (method, url) => {
    const res = await (request(makeApp('viewer')) as any)[method](url).send({});
    expect(res.status, JSON.stringify(res.body)).toBe(403);
  });

  it.each(WRITES)('%s %s is not refused for a member', async (method, url) => {
    const res = await (request(makeApp('member')) as any)[method](url).send({});
    expect(res.status, JSON.stringify(res.body)).not.toBe(403);
  });

  /* Deliberately open: these three write nothing. Two are computations shaped as
     POSTs, and the third is a reader's own receipt. Gating them would take a
     read away from the role that is supposed to have it. */
  it.each([
    ['post', '/api/submission-ops/policies/resolve'],
    ['post', '/api/submission-ops/packages/5/preflight'],
    ['post', '/api/submission-ops/digests/1/read'],
  ])('%s %s stays open to a viewer — it writes nothing', async (method, url) => {
    const res = await (request(makeApp('viewer')) as any)[method](url).send({});
    expect(res.status, JSON.stringify(res.body)).not.toBe(403);
  });
});

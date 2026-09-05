/**
 * PUT /api/submission-ops/packages/:packageId/regulatory-identifiers
 *
 * The assemble gate refuses to fabricate the application number / applicant
 * identity the Module 1 backbone carries (REGULATORY-IDENTIFIER-MISSING blocks
 * transmit). This route is the governed way to record them. Each refusal is
 * shown failing on the input it exists to catch: a traversal-shaped application
 * number, a control character in the applicant name, a missing reason, a
 * package outside the tenant. And a bundle assembled under OLD identifiers is
 * cleared when they change — but kept when the same values are re-recorded.
 *
 * Drizzle + pool + the ledger are mocked; the shared identifier contract
 * (server/services/ectd/regulatory-identifiers.ts) is the real module.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const recordGovernedActionFn = vi.fn();
vi.mock('../server/routes/c2c/actions', () => ({
  recordGovernedAction: (...a: unknown[]) => recordGovernedActionFn(...a),
}));

const { dbState } = vi.hoisted(() => ({
  dbState: { pkg: null as any, updateSet: null as any, selects: 0 },
}));

function makeDb() {
  const chain: any = {
    select() { return chain; },
    from() { return chain; },
    where() { return chain; },
    then(resolve: any) {
      dbState.selects += 1;
      return Promise.resolve(dbState.pkg ? [dbState.pkg] : []).then(resolve);
    },
    update() { return chain; },
    set(v: any) { dbState.updateSet = v; return chain; },
  };
  return chain;
}

const clientQuery = vi.fn().mockResolvedValue({ rows: [] });
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

const GOOD = {
  applicationNumber: 'IND123456',
  applicantId: 'DUNS-123456789',
  applicantName: 'Acme Biologics, Inc.',
  reason: 'Recording the IND number assigned by CDER',
};
const put = (body: Record<string, unknown>, packageId = 'pkg_locked') =>
  request(makeApp()).put(`/api/submission-ops/packages/${packageId}/regulatory-identifiers`).send(body);
const pkgWith = (metadata: Record<string, unknown> | null) => ({
  id: 5, packageId: 'pkg_locked', orgId: 99, status: 'locked', packageFamily: 'ind', metadata,
});
const ch = (cp: number) => String.fromCodePoint(cp);

beforeEach(() => {
  dbState.pkg = null;
  dbState.updateSet = null;
  dbState.selects = 0;
  recordGovernedActionFn.mockReset();
  recordGovernedActionFn.mockResolvedValue({ actionId: 'act_x', auditId: 'aud_x', sha256Chain: 'c' });
  connectFn.mockClear();
  clientQuery.mockClear();
});

describe('PUT /api/submission-ops/packages/:packageId/regulatory-identifiers', () => {
  it('REFUSES a traversal-shaped application number (it becomes a packager filename component)', async () => {
    dbState.pkg = pkgWith({});
    const res = await put({ ...GOOD, applicationNumber: '../../etc/x' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REGULATORY_IDENTIFIER_INVALID');
    expect(res.body.fields).toEqual(['applicationNumber']);
    expect(dbState.updateSet).toBeNull(); // nothing written
    expect(recordGovernedActionFn).not.toHaveBeenCalled();
  });

  it('REFUSES an EU procedure number with slashes and an applicant name with a control character', async () => {
    dbState.pkg = pkgWith({});
    const res = await put({ ...GOOD, applicationNumber: 'EMEA/H/C/001234', applicantName: `Acme${ch(0x01)}Bio` });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual(['applicationNumber', 'applicantName']);
  });

  it('REFUSES an applicant name the XML layer would strip or empty (C1 controls, noncharacters)', async () => {
    // These pass a C0-only control-char check but escapeXml strips them, so the
    // backbone would carry an altered or EMPTY <name> while the gate said usable.
    dbState.pkg = pkgWith({});
    // …and a lone surrogate, which the zip writer would rewrite to U+FFFD.
    for (const name of [ch(0x85), ch(0xfffe) + ch(0xffff), `Acme${ch(0x9f)}Bio`, `Acme${String.fromCharCode(0xd800)} Bio`]) {
      const res = await put({ ...GOOD, applicantName: name });
      expect(res.status, JSON.stringify(name)).toBe(400);
      expect(res.body.fields).toEqual(['applicantName']);
    }
  });

  it('REFUSES a missing reason (governed change)', async () => {
    dbState.pkg = pkgWith({});
    const { reason: _r, ...noReason } = GOOD;
    const res = await put(noReason);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details.reason).toBeDefined();
  });

  it('404s for a package outside the tenant', async () => {
    dbState.pkg = null;
    const res = await put(GOOD, 'pkg_other');
    expect(res.status).toBe(404);
    expect(dbState.updateSet).toBeNull();
  });

  it('records the identifiers, clears a bundle assembled under OLD identifiers, and writes a governed action', async () => {
    dbState.pkg = pkgWith({
      foo: 'bar',
      regulatory: { applicationNumber: 'IND000001', applicantId: 'DUNS-1', applicantName: 'Old Name' },
      bundle: { path: '/bundles/old.zip', sha256: 'f'.repeat(64), sizeBytes: 10, format: 'ectd' },
    });
    const res = await put(GOOD);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      packageId: 'pkg_locked', changed: true, staleBundleCleared: true, ledgerWriteFailed: false,
    });
    expect(res.body.data.regulatory).toMatchObject({
      applicationNumber: 'IND123456', applicantId: 'DUNS-123456789', applicantName: 'Acme Biologics, Inc.', recordedBy: 777,
    });
    // Persisted: identifiers recorded, unrelated keys kept, stale bundle GONE.
    expect(dbState.updateSet.metadata.foo).toBe('bar');
    expect(dbState.updateSet.metadata.regulatory.applicationNumber).toBe('IND123456');
    expect(dbState.updateSet.metadata.bundle).toBeUndefined();
    // Governed action carries the change and the caller's reason.
    expect(recordGovernedActionFn).toHaveBeenCalledTimes(1);
    const ledger = recordGovernedActionFn.mock.calls[0][1];
    expect(ledger).toMatchObject({ orgId: 99, userId: 777, target: 'submission:5', reason: GOOD.reason });
    expect(ledger.payload).toMatchObject({ change: 'regulatory-identifiers', applicationNumber: 'IND123456', staleBundleCleared: true });
    // from → to: the audit row can answer what the identifiers were changed FROM.
    expect(ledger.payload.previous).toEqual({ applicationNumber: 'IND000001', applicantId: 'DUNS-1', applicantName: 'Old Name' });
    expect(clientQuery).toHaveBeenCalledWith('BEGIN');
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('re-recording the SAME identifiers keeps an existing bundle (nothing about its backbone changed)', async () => {
    const bundle = { path: '/bundles/current.zip', sha256: 'a'.repeat(64), sizeBytes: 10, format: 'ectd' };
    dbState.pkg = pkgWith({
      regulatory: { applicationNumber: 'IND123456', applicantId: 'DUNS-123456789', applicantName: 'Acme Biologics, Inc.' },
      bundle,
    });
    const res = await put(GOOD);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ changed: false, staleBundleCleared: false });
    expect(dbState.updateSet.metadata.bundle).toEqual(bundle);
  });

  it('accepts the numeric row id as well as the pkg_ text id (the dispatch surface uses the numeric one)', async () => {
    dbState.pkg = pkgWith({});
    const res = await put(GOOD, '5');
    expect(res.status).toBe(200);
    expect(res.body.data.packageId).toBe('pkg_locked');
  });

  it('trims surrounding whitespace but never rewrites a value', async () => {
    dbState.pkg = pkgWith({});
    const res = await put({ ...GOOD, applicationNumber: '  IND123456  ' });
    expect(res.status).toBe(200);
    expect(dbState.updateSet.metadata.regulatory.applicationNumber).toBe('IND123456');
  });

  it('reports a ledger outage instead of pretending the change was audited', async () => {
    dbState.pkg = pkgWith({});
    recordGovernedActionFn.mockRejectedValueOnce(new Error('audit db down'));
    const res = await put(GOOD);
    expect(res.status).toBe(200);
    expect(res.body.data.ledgerWriteFailed).toBe(true);
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    // The identifiers themselves were still recorded (the write must not be lost).
    expect(dbState.updateSet.metadata.regulatory.applicationNumber).toBe('IND123456');
  });
});

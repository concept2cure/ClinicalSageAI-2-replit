/**
 * Integration tests for POST /api/submission-ops/packages/:packageId/preflight.
 *
 * Verifies the pre-flight validator layer: the stored internal structural
 * findings are reused (not recomputed), the agency validators report their
 * configuration status, and a `blocking` flag is derived from the combined
 * error count. No *_VALIDATOR_URL env is set, so the agency validators stay
 * unconfigured and NO network calls are made. Drizzle + pool are mocked so the
 * test does not touch a DB, disk, or AWS.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

/* ─── Mock the governed-action ledger so it is a no-op. ──────────────── */
vi.mock('../server/routes/c2c/actions', () => ({
  recordGovernedAction: vi.fn().mockResolvedValue({ actionId: 'act_x', auditId: 'aud_x', sha256Chain: 'c' }),
}));

/* ─── Mock the drizzle `db` query builder + the pg `pool`. ───────────── */
const { dbState } = vi.hoisted(() => ({
  dbState: {
    pkg: null as any,
  },
}));

function makeDb() {
  const chain: any = {
    select() { return chain; },
    from() { return chain; },
    innerJoin() { return chain; },
    where() { return chain; },
    orderBy() { return Promise.resolve([]); },
    then(resolve: any) {
      // package query: `const [pkg] = await db.select().from(...).where(...)`
      return Promise.resolve(dbState.pkg ? [dbState.pkg] : []).then(resolve);
    },
    update() { return chain; },
    set() { return chain; },
  };
  return chain;
}

vi.mock('../server/db', () => ({
  get db() { return makeDb(); },
  pool: { connect: vi.fn(), query: vi.fn() },
}));

// Avoid pulling heavy engine modules through the route's imports.
vi.mock('../server/submission-ops/policy-engine', () => ({ resolvePolicy: vi.fn(), resolveAllPolicies: vi.fn() }));
vi.mock('../server/submission-ops/readiness-engine', () => ({ computePackageReadiness: vi.fn() }));
vi.mock('../server/submission-ops/automation-runner', () => ({ runAutomationSweep: vi.fn() }));
vi.mock('../server/services/intelligence/index.js', () => ({ getProjectSignals: vi.fn(), analyzeCrossArtifactIntelligence: vi.fn() }));
vi.mock('../server/services/regulatory-correspondence/operating-layer', () => ({ readCanonicalDueSoonAndWorkload: vi.fn() }));

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

const fetchSpy = vi.fn();

beforeEach(() => {
  dbState.pkg = null;
  // Ensure no external validators are configured.
  delete process.env.FDA_VALIDATOR_URL;
  delete process.env.EMA_VALIDATOR_URL;
  delete process.env.PMDA_VALIDATOR_URL;
  // Trap any accidental network call.
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
});

describe('POST /api/submission-ops/packages/:packageId/preflight', () => {
  it('404s when the package is not in the tenant', async () => {
    dbState.pkg = null;
    const res = await request(makeApp()).post('/api/submission-ops/packages/pkg_missing/preflight').send({});
    expect(res.status).toBe(404);
  });

  it('409s when the package has no metadata.bundle', async () => {
    dbState.pkg = { id: 5, packageId: 'pkg_noassemble', orgId: 99, status: 'locked', packageFamily: 'ind', metadata: { foo: 'bar' } };
    const res = await request(makeApp()).post('/api/submission-ops/packages/pkg_noassemble/preflight').send({});
    expect(res.status).toBe(409);
    expect(res.body.gate).toBe('not_assembled');
  });

  it('returns 200 with internal findings and unconfigured agency validators (no network)', async () => {
    dbState.pkg = {
      id: 5,
      packageId: 'pkg_ok',
      orgId: 99,
      status: 'locked',
      packageFamily: 'ind',
      metadata: {
        bundle: {
          sha256: 'a'.repeat(64),
          sizeBytes: 1234,
          format: 'ectd',
          path: '/tmp/does-not-matter.zip',
          storage: { provider: 'local' },
          validation: {
            errorCount: 0,
            warningCount: 1,
            infoCount: 1,
            findings: [
              { severity: 'warning', ruleId: 'SECTION-EMPTY', message: 'Empty section', filePath: 'm3/x.pdf' },
              { severity: 'info', ruleId: 'SUMMARY', message: '1 leaf' },
            ],
          },
        },
      },
    };

    const res = await request(makeApp()).post('/api/submission-ops/packages/pkg_ok/preflight').send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.packageId).toBe('pkg_ok');
    expect(res.body.data.blocking).toBe(false);
    expect(res.body.data.bundle.sha256).toBe('a'.repeat(64));
    expect(res.body.data.bundle.format).toBe('ectd');

    const byId = Object.fromEntries(res.body.data.validators.map((v: any) => [v.id, v]));
    expect(byId.internal).toMatchObject({ configured: true, ran: true });
    expect(byId.internal.warningCount).toBe(1);
    expect(byId.fda_evalidator).toMatchObject({ configured: false, ran: false });
    expect(byId.ema_validator).toMatchObject({ configured: false, ran: false });
    expect(byId.pmda_precheck).toMatchObject({ configured: false, ran: false });

    // The stored structural warning is surfaced in the combined findings.
    expect(res.body.data.findings.some((f: any) => f.ruleId === 'SECTION-EMPTY')).toBe(true);
    expect(res.body.data.warningCount).toBe(1);

    // No network call was made (no external validators configured).
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('marks blocking:true when the stored validation has an error', async () => {
    dbState.pkg = {
      id: 6,
      packageId: 'pkg_err',
      orgId: 99,
      status: 'locked',
      packageFamily: 'ind',
      metadata: {
        bundle: {
          sha256: 'b'.repeat(64),
          sizeBytes: 10,
          format: 'ectd',
          path: '/tmp/x.zip',
          storage: { provider: 'local' },
          validation: {
            errorCount: 1,
            warningCount: 0,
            infoCount: 0,
            findings: [
              { severity: 'error', ruleId: 'LEAF-CORRUPT', message: 'Bad PDF', filePath: 'm1/us/x.pdf' },
            ],
          },
        },
      },
    };

    const res = await request(makeApp()).post('/api/submission-ops/packages/pkg_err/preflight').send({});
    expect(res.status).toBe(200);
    expect(res.body.data.blocking).toBe(true);
    expect(res.body.data.errorCount).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

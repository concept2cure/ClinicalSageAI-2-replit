/**
 * Integration tests for POST /api/submission-ops/packages/:packageId/preflight.
 *
 * Verifies the pre-flight validator layer: the stored internal structural
 * findings are reused (not recomputed), the agency validators report their
 * configuration status, a `blocking` flag is derived from the combined
 * error count, and the run summary is persisted under the package's
 * `metadata.preflight` JSONB (the source the CMC portfolio aggregates its
 * `preflight_critical` column from). No *_VALIDATOR_URL env is set, so the
 * agency validators stay unconfigured and NO network calls are made.
 * Drizzle + pool are mocked so the test does not touch a DB, disk, or AWS.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { fingerprintPackageContent, sha256Hex, type PackageContentRow } from '../server/services/ectd/package-content-fingerprint';

/* ─── Mock the governed-action ledger so it is a no-op. ──────────────── */
vi.mock('../server/routes/c2c/actions', () => ({
  recordGovernedAction: vi.fn().mockResolvedValue({ actionId: 'act_x', auditId: 'aud_x', sha256Chain: 'c' }),
}));

/* ─── Mock the drizzle `db` query builder + the pg `pool`. ───────────── */
const { dbState } = vi.hoisted(() => ({
  dbState: {
    pkg: null as any,
    // Every metadata write, tagged with the path it took: 'lock' (the package
    // row lock's UPDATE) or 'drizzle' (an unlocked db.update — must be none).
    updates: [] as Array<{ via: 'lock' | 'drizzle'; metadata: any }>,
    failUpdate: false,
    // The package's CURRENT content as the fingerprint reads it (pool query).
    contentRows: [] as PackageContentRow[],
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
    set(payload: any) {
      if (dbState.failUpdate) throw new Error('simulated metadata write failure');
      dbState.updates.push({ via: 'drizzle', metadata: payload.metadata });
      return chain;
    },
  };
  return chain;
}

/** The pool client: serves the package row lock (SELECT … FOR UPDATE) from the
 *  stubbed package AT LOCK TIME — so a test can change the row while a validator
 *  runs — and captures the metadata the locked UPDATE writes. */
const clientQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
  if (/FOR UPDATE/.test(sql)) return { rows: [{ metadata: dbState.pkg?.metadata ?? null }] };
  if (/^UPDATE c2c_submission_packages/.test(sql)) {
    if (dbState.failUpdate) throw new Error('simulated metadata write failure');
    dbState.updates.push({ via: 'lock', metadata: JSON.parse(String(params[1])) });
  }
  return { rows: [] };
});
const connectFn = vi.fn(() => Promise.resolve({ query: clientQuery, release: vi.fn() }));
/** pool.query serves the content-fingerprint read from dbState.contentRows. */
const poolQuery = vi.fn(async (sql: string, _params: unknown[] = []) => {
  if (/FROM c2c_package_sections/.test(sql)) {
    return {
      rows: dbState.contentRows.map((r) => ({
        section_db_id: r.sectionDbId, section_key: r.sectionKey, section_label: r.sectionLabel, artifact_db_id: r.artifactDbId,
        title: r.title, version: r.version, ctd_section: r.ctdSection, content_sha256: r.contentSha256,
      })),
    };
  }
  return { rows: [] };
});
vi.mock('../server/db', () => ({
  get db() { return makeDb(); },
  pool: { connect: (...a: unknown[]) => connectFn(...a), query: (...a: unknown[]) => poolQuery(...(a as [string, unknown[]])) },
}));

/* ─── A configurable agency validator: the real registry (its env gating is
   what the unconfigured cases exercise) with the HTTP call replaced, so a test
   can land a concurrent write while the validator "runs". ─────────────── */
const runHttpValidatorFn = vi.fn();
vi.mock('../server/services/submission-gateways/validator-registry', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  runHttpValidator: (...a: unknown[]) => runHttpValidatorFn(...a),
}));
vi.mock('../server/services/submission-bundle-storage', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  readBundleBytes: vi.fn().mockResolvedValue(Buffer.from('PK-ZIP', 'utf8')),
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
  dbState.updates = [];
  dbState.failUpdate = false;
  dbState.contentRows = CONTENT;
  connectFn.mockClear();
  poolQuery.mockClear();
  clientQuery.mockClear();
  runHttpValidatorFn.mockReset();
  // Ensure no external validators are configured.
  delete process.env.FDA_VALIDATOR_URL;
  delete process.env.EMA_VALIDATOR_URL;
  delete process.env.PMDA_VALIDATOR_URL;
  // Trap any accidental network call.
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
});

/** What the stored bundles below were built from; the package still holds it
 *  unless a test edits dbState.contentRows. */
const CONTENT: PackageContentRow[] = [
  { sectionDbId: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', artifactDbId: 1, title: 'Clinical overview', version: 1, ctdSection: null, contentSha256: sha256Hex('Clinical overview text') },
];
const CONTENT_FINGERPRINT = fingerprintPackageContent(CONTENT);
const IDS = { applicationNumber: 'IND123456', applicantId: 'DUNS-123456789', applicantName: 'Acme Biologics Inc' };
const BUNDLE = {
  sha256: 'e'.repeat(64), sizeBytes: 9, format: 'ectd', path: '/bundles/pkg-locked.zip', storage: { provider: 'local' },
  validation: { errorCount: 0, warningCount: 0, infoCount: 0, findings: [] },
  contentFingerprint: CONTENT_FINGERPRINT,
};
const pkgWith = (metadata: Record<string, unknown>) => ({
  id: 5, packageId: 'pkg_locked', orgId: 99, status: 'locked', packageFamily: 'ind', metadata,
});
const preflight = () => request(makeApp()).post('/api/submission-ops/packages/pkg_locked/preflight').send({});

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
          contentFingerprint: CONTENT_FINGERPRINT,
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

    // The run summary is persisted under metadata.preflight; the assemble
    // descriptor (metadata.bundle) is preserved by the spread. Written under
    // the package row lock, never by an unlocked update.
    expect(res.body.data.persisted).toBe(true);
    expect(dbState.updates.length).toBe(1);
    const persisted = dbState.updates[0];
    expect(persisted.via).toBe('lock');
    expect(persisted.metadata.bundle).toBeDefined();
    expect(persisted.metadata.preflight).toMatchObject({
      errorCount: 0,
      warningCount: 1,
      blocking: false,
      bundleSha256: 'a'.repeat(64),
      ranBy: 777,
    });
    expect(typeof persisted.metadata.preflight.ranAt).toBe('string');
    expect(persisted.metadata.preflight.validators.map((v: any) => v.id)).toEqual([
      'internal',
      'fda_evalidator',
      'ema_validator',
      'pmda_precheck',
      'content_integrity',
    ]);
    // The package still holds what the bundle was built from: assessed, clean.
    expect(byId.content_integrity).toMatchObject({ configured: true, ran: true, errorCount: 0, warningCount: 0 });
  });

  it('reports CONTENT DRIFT as a blocking finding when an artifact was edited after assembly — the same assessment transmit refuses on', async () => {
    dbState.pkg = pkgWith({ regulatory: IDS, bundle: BUNDLE });
    dbState.contentRows = CONTENT.map((r) => ({ ...r, contentSha256: sha256Hex('Clinical overview text, edited after assembly') }));
    const res = await preflight();
    expect(res.status).toBe(200);
    expect(res.body.data.blocking).toBe(true);
    expect(res.body.data.errorCount).toBe(1);
    const drift = res.body.data.findings.find((f: any) => f.ruleId === 'BUNDLE-CONTENT-DRIFT');
    expect(drift).toMatchObject({ severity: 'error' });
    expect(drift.message).toMatch(/content changed since this bundle was assembled/i);
    const byId = Object.fromEntries(res.body.data.validators.map((v: any) => [v.id, v]));
    expect(byId.content_integrity).toMatchObject({ configured: true, ran: true, errorCount: 1 });
    // The blocking outcome reaches the persisted summary the portfolio reads.
    expect(dbState.updates[0].metadata.preflight).toMatchObject({ blocking: true, errorCount: 1 });
    expect(dbState.updates[0].metadata.preflight.validators.find((v: any) => v.id === 'content_integrity').errorCount).toBe(1);
  });

  it('a bundle with NO content fingerprint is UNPROVEN: a warning where descriptor trust is relaxed, a blocking error where transmit would refuse it', async () => {
    const { contentFingerprint: _none, ...unfingerprinted } = BUNDLE;
    // Relaxed (this suite runs under NODE_ENV=test): assessed as unknown, not blocking, nothing read.
    dbState.pkg = pkgWith({ regulatory: IDS, bundle: unfingerprinted });
    let res = await preflight();
    expect(res.status).toBe(200);
    expect(res.body.data.blocking).toBe(false);
    let finding = res.body.data.findings.find((f: any) => f.ruleId === 'BUNDLE-CONTENT-UNPROVEN');
    expect(finding).toMatchObject({ severity: 'warning' });
    expect(finding.message).toMatch(/no content fingerprint/i);
    let byId = Object.fromEntries(res.body.data.validators.map((v: any) => [v.id, v]));
    expect(byId.content_integrity).toMatchObject({ ran: false, errorCount: 0, warningCount: 1 });
    expect(poolQuery.mock.calls.some((c) => /FROM c2c_package_sections/.test(String(c[0])))).toBe(false);

    // Enforced (production): the same bundle is a blocking error, as transmit refuses it.
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      dbState.updates = [];
      res = await preflight();
    } finally {
      if (saved === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved;
    }
    expect(res.status).toBe(200);
    expect(res.body.data.blocking).toBe(true);
    finding = res.body.data.findings.find((f: any) => f.ruleId === 'BUNDLE-CONTENT-UNPROVEN');
    expect(finding).toMatchObject({ severity: 'error' });
    byId = Object.fromEntries(res.body.data.validators.map((v: any) => [v.id, v]));
    expect(byId.content_integrity).toMatchObject({ ran: false, errorCount: 1 });
  });

  it('a content read that fails is an error, never a pass', async () => {
    dbState.pkg = pkgWith({ regulatory: IDS, bundle: BUNDLE });
    poolQuery.mockRejectedValueOnce(new Error('db down'));
    const res = await preflight();
    expect(res.status).toBe(200);
    expect(res.body.data.blocking).toBe(true);
    const byId = Object.fromEntries(res.body.data.validators.map((v: any) => [v.id, v]));
    expect(byId.content_integrity).toMatchObject({ ran: true, errorCount: 1 });
    expect(byId.content_integrity.error).toMatch(/db down/);
    expect(res.body.data.findings.some((f: any) => f.ruleId === 'VALIDATOR-ERROR' && /content integrity/i.test(f.message))).toBe(true);
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
          contentFingerprint: CONTENT_FINGERPRINT,
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

    // The blocking outcome is persisted for portfolio aggregation.
    expect(dbState.updates.length).toBe(1);
    expect(dbState.updates[0].metadata.preflight).toMatchObject({
      errorCount: 1,
      blocking: true,
    });
  });

  it('still returns the computed findings when the metadata persist fails', async () => {
    dbState.pkg = {
      id: 7,
      packageId: 'pkg_persistfail',
      orgId: 99,
      status: 'locked',
      packageFamily: 'ind',
      metadata: {
        bundle: {
          sha256: 'c'.repeat(64),
          contentFingerprint: CONTENT_FINGERPRINT,
          sizeBytes: 10,
          format: 'ectd',
          path: '/tmp/x.zip',
          storage: { provider: 'local' },
          validation: { errorCount: 0, warningCount: 0, infoCount: 0, findings: [] },
        },
      },
    };
    dbState.failUpdate = true;

    const res = await request(makeApp()).post('/api/submission-ops/packages/pkg_persistfail/preflight').send({});
    // A failed derived-cache write must not lose the run's results — and the
    // response says the summary was NOT persisted rather than implying it was.
    expect(res.status).toBe(200);
    expect(res.body.data.blocking).toBe(false);
    expect(res.body.data.persisted).toBe(false);
    expect(dbState.updates.length).toBe(0);
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
  });

  it('REFUSES to persist a run whose bundle was cleared or replaced meanwhile, and never writes its pre-run snapshot over the row', async () => {
    // A configured agency validator: its HTTP call is where a colleague's
    // PUT regulatory-identifiers lands — new application number, and the
    // bundle assembled under the old one cleared.
    process.env.FDA_VALIDATOR_URL = 'https://validator.example.invalid/run';
    dbState.pkg = pkgWith({ regulatory: IDS, bundle: BUNDLE });
    runHttpValidatorFn.mockImplementationOnce(async () => {
      dbState.pkg = pkgWith({ regulatory: { ...IDS, applicationNumber: 'IND999999' } });
      return [];
    });
    const res = await preflight();
    // The findings describe a bundle the package no longer has.
    expect(res.status).toBe(409);
    expect(res.body.gate).toBe('bundle_superseded');
    expect(res.body.evaluatedSha256).toBe(BUNDLE.sha256);
    // Nothing was written: the newer identifiers stand and the cleared
    // bundle is NOT put back as transmittable. The decision took the lock.
    expect(dbState.updates).toEqual([]);
    expect(clientQuery.mock.calls.some((c) => /FOR UPDATE/.test(String(c[0])))).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('cannot identify a bundle without a sha256: such a run is superseded, never stored against whatever is there now', async () => {
    process.env.FDA_VALIDATOR_URL = 'https://validator.example.invalid/run';
    const { sha256: _none, ...unidentified } = BUNDLE;
    dbState.pkg = pkgWith({ regulatory: IDS, bundle: { ...unidentified, path: '/bundles/a.zip' } });
    runHttpValidatorFn.mockImplementationOnce(async () => {
      // Replaced meanwhile by another sha-less descriptor with a different outcome.
      dbState.pkg = pkgWith({ regulatory: IDS, bundle: { ...unidentified, path: '/bundles/b.zip', validation: { errorCount: 4, warningCount: 0, infoCount: 0, findings: [] } } });
      return [];
    });
    const res = await preflight();
    expect(res.status).toBe(409);
    expect(res.body.gate).toBe('bundle_superseded');
    expect(dbState.updates).toEqual([]);
  });

  it('when the lock cannot be taken after the bundle was superseded, the findings are NOT returned as the package’s (409, not 200 persisted:false)', async () => {
    process.env.FDA_VALIDATOR_URL = 'https://validator.example.invalid/run';
    dbState.pkg = pkgWith({ regulatory: IDS, bundle: BUNDLE });
    runHttpValidatorFn.mockImplementationOnce(async () => {
      dbState.pkg = pkgWith({ regulatory: IDS }); // bundle cleared meanwhile
      return [];
    });
    connectFn.mockRejectedValueOnce(new Error('pool exhausted'));
    const res = await preflight();
    expect(res.status).toBe(409);
    expect(res.body.gate).toBe('bundle_superseded');
    expect(dbState.updates).toEqual([]);
  });

  it('persists against the LOCKED row: a change that landed while the validator ran is kept, not reverted', async () => {
    process.env.FDA_VALIDATOR_URL = 'https://validator.example.invalid/run';
    dbState.pkg = pkgWith({ regulatory: IDS, bundle: BUNDLE });
    runHttpValidatorFn.mockImplementationOnce(async () => {
      // Same bundle; a colleague added something else to the row meanwhile.
      dbState.pkg = pkgWith({ regulatory: IDS, bundle: BUNDLE, noteAddedMeanwhile: 'kept' });
      return [{ severity: 'warning', ruleId: 'FDA-1234', message: 'Agency warning' }];
    });
    const res = await preflight();
    expect(res.status).toBe(200);
    expect(res.body.data.persisted).toBe(true);
    expect(res.body.data.warningCount).toBe(1);
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].via).toBe('lock');
    expect(dbState.updates[0].metadata.noteAddedMeanwhile).toBe('kept');
    expect(dbState.updates[0].metadata.bundle).toEqual(BUNDLE);
    expect(dbState.updates[0].metadata.preflight.bundleSha256).toBe(BUNDLE.sha256);
  });
});

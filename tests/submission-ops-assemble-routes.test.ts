/**
 * Integration tests for POST /api/submission-ops/packages/:packageId/assemble.
 *
 * Verifies the bundle-assembly pipeline: a locked package's sections are turned
 * into eCTD leafs, a real zip is produced (mocked builder), the bundle is
 * persisted to disk (mocked fs), a bundle-level SHA-256 + size are computed, and
 * a `bundle` descriptor is written onto the package metadata. Drizzle + pool +
 * fs + the eCTD builder are mocked so the test does not touch a DB or disk.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

/* ─── Mock the eCTD zip builder: return a deterministic buffer. ──────── */
const buildECTDZipFn = vi.fn();
vi.mock('../server/src/services/ectd', () => ({
  buildECTDZip: (...args: unknown[]) => buildECTDZipFn(...args),
}));

/* ─── Mock fs (mkdir + writeFile are awaited via fs.promises). ───────── */
const writeFileFn = vi.fn().mockResolvedValue(undefined);
const mkdirFn = vi.fn().mockResolvedValue(undefined);
vi.mock('fs', () => ({
  promises: {
    mkdir: (...a: unknown[]) => mkdirFn(...a),
    writeFile: (...a: unknown[]) => writeFileFn(...a),
  },
}));

/* ─── Mock the governed-action ledger so it is a no-op. ──────────────── */
vi.mock('../server/routes/c2c/actions', () => ({
  recordGovernedAction: vi.fn().mockResolvedValue({ actionId: 'act_x', auditId: 'aud_x', sha256Chain: 'c' }),
}));

/* ─── Mock the drizzle `db` query builder + the pg `pool`. ───────────── */
const { dbState } = vi.hoisted(() => ({
  dbState: {
    pkg: null as any,
    sections: [] as any[],
    mappedByCall: [] as any[][], // FIFO list of artifact rows per section query
    updateSet: null as any,
  },
}));

// A thin chainable stub matching the subset of drizzle used by the route.
function makeDb() {
  let mode: 'pkg' | 'sections' | 'mapped' | null = null;
  const chain: any = {
    select(_fields?: any) {
      // Distinguish the artifact-mapping select (passes a field map) from the
      // bare select() used for package + sections.
      mode = _fields ? 'mapped' : null;
      return chain;
    },
    from(_t: any) {
      if (mode !== 'mapped') {
        // First bare from is the package query; the route resolves [pkg].
        mode = dbState._pkgResolved ? 'sections' : 'pkg';
      }
      return chain;
    },
    innerJoin() { return chain; },
    where() { return chain; },
    orderBy() {
      if (mode === 'mapped') {
        return Promise.resolve(dbState.mappedByCall.shift() ?? []);
      }
      // sections query resolves to the sections array.
      return Promise.resolve(dbState.sections);
    },
    then(resolve: any) {
      // package query: `const [pkg] = await db.select().from(...).where(...)`
      dbState._pkgResolved = true;
      return Promise.resolve(dbState.pkg ? [dbState.pkg] : []).then(resolve);
    },
    update() { return chain; },
    set(v: any) { dbState.updateSet = v; return chain; },
  };
  return chain;
}

const connectFn = vi.fn(() =>
  Promise.resolve({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  }),
);

vi.mock('../server/db', () => ({
  get db() { return makeDb(); },
  pool: { connect: (...a: unknown[]) => connectFn(...a), query: vi.fn() },
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

beforeEach(() => {
  buildECTDZipFn.mockReset();
  writeFileFn.mockClear();
  mkdirFn.mockClear();
  connectFn.mockClear();
  dbState.pkg = null;
  dbState.sections = [];
  dbState.mappedByCall = [];
  dbState.updateSet = null;
  (dbState as any)._pkgResolved = false;
  buildECTDZipFn.mockResolvedValue(Buffer.from('PK-ZIP-CONTENT', 'utf8'));
});

describe('POST /api/submission-ops/packages/:packageId/assemble', () => {
  it('404s when the package is not in the tenant', async () => {
    dbState.pkg = null;
    const res = await request(makeApp()).post('/api/submission-ops/packages/pkg_missing/assemble').send({});
    expect(res.status).toBe(404);
  });

  it('409s when the package is not locked', async () => {
    dbState.pkg = { id: 5, packageId: 'pkg_active', orgId: 99, status: 'active', packageFamily: 'ind', metadata: null };
    const res = await request(makeApp()).post('/api/submission-ops/packages/pkg_active/assemble').send({});
    expect(res.status).toBe(409);
    expect(res.body.gate).toBe('not_locked');
  });

  it('assembles, persists, and returns a bundle descriptor with a 64-hex sha256', async () => {
    dbState.pkg = { id: 5, packageId: 'pkg_locked', orgId: 99, status: 'locked', packageFamily: 'ind', metadata: { foo: 'bar' } };
    dbState.sections = [
      { id: 11, sectionKey: 'module1_admin', sectionLabel: 'Module 1 Admin', sortOrder: 0 },
      { id: 12, sectionKey: 'module3_cmc', sectionLabel: 'Module 3 CMC', sortOrder: 1 },
    ];
    // Section 11 has one mapped artifact; section 12 has none (empty leaf).
    dbState.mappedByCall = [
      [{ artifactDbId: 1, artifactId: 'artifact_a', title: 'Cover Letter', content: 'Real content here', version: 2 }],
      [],
    ];

    const res = await request(makeApp()).post('/api/submission-ops/packages/pkg_locked/assemble').send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.packageId).toBe('pkg_locked');
    expect(res.body.data.bundle.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.data.bundle.sizeBytes).toBe(Buffer.byteLength('PK-ZIP-CONTENT'));
    expect(res.body.data.bundle.format).toBe('ectd');
    expect(res.body.data.bundle.leafCount).toBe(2);

    // The builder received two leafs (one per section), region FDA derived from 'ind'.
    expect(buildECTDZipFn).toHaveBeenCalledTimes(1);
    const opts = buildECTDZipFn.mock.calls[0][0];
    expect(opts.region).toBe('FDA');
    expect(opts.leafs).toHaveLength(2);

    // Both leafs are real PDFs placed at ICH module paths (*.pdf).
    expect(opts.leafs[0].mediaType).toBe('application/pdf');
    expect(opts.leafs[0].path.endsWith('.pdf')).toBe(true);
    expect(opts.leafs[1].mediaType).toBe('application/pdf');
    expect(opts.leafs[1].path.endsWith('.pdf')).toBe(true);
    // The PDF magic bytes confirm a valid pdfkit render (not a text leaf).
    expect(opts.leafs[1].content.subarray(0, 5).toString('utf8')).toBe('%PDF-');

    // The zip was persisted to disk.
    expect(mkdirFn).toHaveBeenCalledTimes(1);
    expect(writeFileFn).toHaveBeenCalledTimes(1);

    // The descriptor was written onto package metadata, preserving existing keys.
    expect(dbState.updateSet.metadata.foo).toBe('bar');
    expect(dbState.updateSet.metadata.bundle.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(dbState.updateSet.metadata.bundle.leafCount).toBe(2);
  });
});

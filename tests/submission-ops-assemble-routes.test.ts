/**
 * Integration tests for POST /api/submission-ops/packages/:packageId/assemble.
 *
 * Verifies the bundle-assembly pipeline: a locked package's sections are turned
 * into eCTD leafs, a real zip is produced (mocked builder), the bundle is
 * persisted to disk (mocked fs), a bundle-level SHA-256 + size are computed, and
 * a `bundle` descriptor is written onto the package metadata. Drizzle + pool +
 * fs + the eCTD builder are mocked so the test does not touch a DB or disk.
 *
 * Every gate the eCTD branch adds is shown FAILING on the input it exists to
 * catch (repo rule: a check only ever seen passing has not been tested):
 * per-artifact placement, LEAF-UNPLACED, an unplaceable declared code,
 * LEAF-MODULE-DISAGREEMENT, REGULATORY-IDENTIFIER-MISSING, the sequence
 * charset (path traversal) and region/format consistency.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

/* ─── Mock the eCTD zip builder: return a deterministic buffer. ──────── */
const buildECTDZipFn = vi.fn();
vi.mock('../server/src/services/ectd', () => ({
  buildECTDZip: (...args: unknown[]) => buildECTDZipFn(...args),
}));

/* ─── Mock the CANONICAL packager: eCTD-format bundles are built by it, not by
   the legacy flat builder. Its real conformance (ICH <ectd:ectd> tree, regional
   M1, root index-md5) is proven in server/services/ectd/__tests__/. ───────── */
const packageLeafBytesFn = vi.fn();
vi.mock('../server/services/ectd/package-leaf-bytes', () => ({
  packageLeafBytes: (...args: unknown[]) => packageLeafBytesFn(...args),
}));

/* ─── Mock fs (mkdir + writeFile are awaited via fs.promises; the canonical
   path additionally uses mkdtemp/readFile/rm around the packager). ───────── */
const writeFileFn = vi.fn().mockResolvedValue(undefined);
const mkdirFn = vi.fn().mockResolvedValue(undefined);
const readFileFn = vi.fn().mockResolvedValue(Buffer.from('PK-ZIP-CONTENT', 'utf8'));
vi.mock('fs', () => ({
  promises: {
    mkdir: (...a: unknown[]) => mkdirFn(...a),
    writeFile: (...a: unknown[]) => writeFileFn(...a),
    mkdtemp: vi.fn().mockResolvedValue('/tmp/c2c-assemble-test'),
    readFile: (...a: unknown[]) => readFileFn(...a),
    rm: vi.fn().mockResolvedValue(undefined),
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

/** Real agency identifiers recorded on the package — without them the eCTD
 *  branch records a blocking REGULATORY-IDENTIFIER-MISSING finding. */
const REGULATORY = { applicationNumber: 'IND123456', applicantId: 'DUNS-123456789', applicantName: 'Acme Biologics Inc' };
const lockedPkg = (metadata: Record<string, unknown> = { foo: 'bar', regulatory: REGULATORY }) => ({
  id: 5, packageId: 'pkg_locked', orgId: 99, status: 'locked', packageFamily: 'ind', metadata,
});
const art = (n: string, ctdSection: string | null, id = 1) => ({
  artifactDbId: id, artifactId: `artifact_${n}`, title: `Artifact ${n}`, content: `Real content ${n}`, version: 1, ctdSection,
});
const post = (body: Record<string, unknown> = {}) =>
  request(makeApp()).post('/api/submission-ops/packages/pkg_locked/assemble').send(body);
/** Findings are PERSISTED on the descriptor (the surface the governed transmit
 *  gate reads); the API response carries only the counts. */
const findings = (res: any): Array<{ ruleId: string; severity: string; message: string }> => {
  if (res.status !== 200 || !dbState.updateSet?.metadata?.bundle?.validation?.findings) {
    throw new Error(`expected an assembled bundle, got HTTP ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return dbState.updateSet.metadata.bundle.validation.findings;
};

const PACKAGER_EVIDENCE = {
  submissionGrade: { pdfLeaves: 2, pdfaConverted: 2, notConverted: [] },
  dtdStatus: { selfContained: false, missing: ['ich-ectd-3-2.dtd'] },
  regionalBackbone: { region: 'fda', file: 'm1/us/us-regional.xml', regionConformant: true },
};

beforeEach(() => {
  buildECTDZipFn.mockReset();
  packageLeafBytesFn.mockReset();
  writeFileFn.mockClear();
  mkdirFn.mockClear();
  connectFn.mockClear();
  dbState.pkg = null;
  dbState.sections = [];
  dbState.mappedByCall = [];
  dbState.updateSet = null;
  (dbState as any)._pkgResolved = false;
  buildECTDZipFn.mockResolvedValue(Buffer.from('PK-ZIP-CONTENT', 'utf8'));
  // The canonical packager writes the bundle to disk; the route reads it back
  // (readFile is stubbed to the same deterministic bytes).
  packageLeafBytesFn.mockResolvedValue({
    path: '/tmp/c2c-assemble-test/pkg.zip',
    sha256: 'f'.repeat(64),
    sizeBytes: Buffer.byteLength('PK-ZIP-CONTENT'),
    format: 'ectd',
    ...PACKAGER_EVIDENCE,
  });
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

  it('assembles ONE LEAF PER ARTIFACT at each artifact\'s own CTD section, persists, and returns the descriptor', async () => {
    dbState.pkg = lockedPkg();
    dbState.sections = [
      { id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 },
      { id: 12, sectionKey: 'module3_cmc', sectionLabel: 'Module 3 CMC', sortOrder: 1 },
      { id: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 2 },
    ];
    dbState.mappedByCall = [
      [art('cover', null, 1)], // placed from the section key's Module 1 heading (1.2)
      // The CRITICAL case: two artifacts in ONE section placed at DIFFERENT CTD
      // sections. They must ship as two leaves — never merged under one code.
      [art('ds', '3.2.S.1', 2), art('dp', '3.2.P.1', 3)],
      [], // empty CTD-coded section -> a placeholder leaf at 2.5 (warning)
    ];

    const res = await post();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.packageId).toBe('pkg_locked');
    expect(res.body.data.bundle.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.data.bundle.sizeBytes).toBe(Buffer.byteLength('PK-ZIP-CONTENT'));
    expect(res.body.data.bundle.format).toBe('ectd');

    // No errors (identifiers recorded, everything placeable); the empty 2.5
    // placeholder yields a warning.
    expect(res.body.data.bundle.validation.errorCount).toBe(0);
    expect(res.body.data.bundle.validation.warningCount).toBeGreaterThanOrEqual(1);

    // Built by the CANONICAL packager — never by the legacy flat builder.
    expect(buildECTDZipFn).not.toHaveBeenCalled();
    expect(packageLeafBytesFn).toHaveBeenCalledTimes(1);
    const opts = packageLeafBytesFn.mock.calls[0][0];
    expect(opts.region).toBe('fda');
    expect(opts.sequence).toBe('0000');
    // Real identifiers reach the backbone — not an internal package id.
    expect(opts.applicationId).toBe('IND123456');
    expect(opts.sponsorId).toBe('DUNS-123456789');
    expect(opts.sponsorName).toBe('Acme Biologics Inc');
    // Four leaves, each at a PLACEABLE terminal heading; the drug-substance and
    // drug-product artifacts are separate leaves at their own sections.
    expect(opts.leaves.map((l: any) => l.ctdSection)).toEqual(['1.2', '3.2.S.1', '3.2.P.1', '2.5']);
    expect(opts.leaves[1].bytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    // leafCount describes what SHIPPED (4 leaves), not the section count (3).
    expect(res.body.data.bundle.leafCount).toBe(4);

    expect(mkdirFn).toHaveBeenCalledTimes(1);
    expect(writeFileFn).toHaveBeenCalledTimes(1);

    // The descriptor was written onto package metadata, preserving existing keys.
    const bundle = dbState.updateSet.metadata.bundle;
    expect(dbState.updateSet.metadata.foo).toBe('bar');
    expect(bundle.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(bundle.leafCount).toBe(4);
    expect(bundle.validation.errorCount).toBe(0);
    expect(Array.isArray(bundle.validation.findings)).toBe(true);
    expect(bundle.storage.provider).toBe('local');
    // The packager's own evidence is persisted for the pre-transmit gate.
    expect(bundle.submissionGrade).toEqual(PACKAGER_EVIDENCE.submissionGrade);
    expect(bundle.dtdStatus).toEqual(PACKAGER_EVIDENCE.dtdStatus);
    expect(bundle.regionalBackbone).toEqual(PACKAGER_EVIDENCE.regionalBackbone);
    expect(bundle.region).toBe('FDA');
  });

  it('FAILS CLOSED on an unplaceable section: LEAF-UNPLACED error, leaf excluded, counts match what shipped', async () => {
    dbState.pkg = lockedPkg();
    dbState.sections = [
      { id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 },
      { id: 12, sectionKey: 'misc-attachment', sectionLabel: 'Misc', sortOrder: 1 }, // nothing inferable
      { id: 13, sectionKey: 'module3_cmc', sectionLabel: 'Module 3 CMC', sortOrder: 2 }, // bare module: NOT a heading
    ];
    dbState.mappedByCall = [[art('cover', null)], [], []];

    const res = await post();
    expect(res.status).toBe(200);
    const unplaced = findings(res).filter((f) => f.ruleId === 'LEAF-UNPLACED');
    expect(unplaced).toHaveLength(2);
    expect(unplaced.every((f) => f.severity === 'error')).toBe(true);
    expect(unplaced[1].message).toMatch(/names Module 3, but a bare module is not a heading/);
    expect(res.body.data.bundle.validation.errorCount).toBe(2);
    // Only the placeable leaf shipped, and the descriptor says so.
    const opts = packageLeafBytesFn.mock.calls[0][0];
    expect(opts.leaves.map((l: any) => l.ctdSection)).toEqual(['1.2']);
    expect(res.body.data.bundle.leafCount).toBe(1);
  });

  it('REJECTS a declared code that is not a real heading (3.foo) instead of nesting it under a container', async () => {
    dbState.pkg = lockedPkg();
    dbState.sections = [{ id: 12, sectionKey: 'module3_cmc', sectionLabel: 'Module 3 CMC', sortOrder: 0 }];
    dbState.mappedByCall = [[art('bad', '3.foo', 1), art('good', '3.2.P.1', 2)]];

    const res = await post();
    const unplaced = findings(res).filter((f) => f.ruleId === 'LEAF-UNPLACED');
    expect(unplaced).toHaveLength(1);
    expect(unplaced[0].message).toMatch(/'3\.foo' is not a placeable ICH heading/);
    expect(res.body.data.bundle.validation.errorCount).toBe(1);
    expect(packageLeafBytesFn.mock.calls[0][0].leaves.map((l: any) => l.ctdSection)).toEqual(['3.2.P.1']);
  });

  it('SURFACES a module disagreement (CSR section, artifact filed under Module 3) instead of filing it silently', async () => {
    dbState.pkg = lockedPkg();
    dbState.sections = [{ id: 12, sectionKey: 'clinical-csr', sectionLabel: 'CSRs', sortOrder: 0 }];
    dbState.mappedByCall = [[art('stray', '3.2.S.4.2', 1)]];

    const res = await post();
    const dis = findings(res).filter((f) => f.ruleId === 'LEAF-MODULE-DISAGREEMENT');
    expect(dis).toHaveLength(1);
    expect(dis[0].severity).toBe('warning');
    expect(dis[0].message).toMatch(/filed at 3\.2\.S\.4\.2 \(Module 3\) but its section names Module 5/);
    // The explicit placement is kept as declared (a warning, not an override).
    expect(packageLeafBytesFn.mock.calls[0][0].leaves.map((l: any) => l.ctdSection)).toEqual(['3.2.S.4.2']);
    expect(res.body.data.bundle.validation.errorCount).toBe(0);
  });

  it('ships an artifact mapped twice (duplicate row, or into two sections) as ONE leaf and surfaces the duplicate mapping', async () => {
    dbState.pkg = lockedPkg();
    dbState.sections = [
      { id: 12, sectionKey: 'module3_cmc', sectionLabel: 'Module 3 CMC', sortOrder: 0 },
      { id: 14, sectionKey: '3.2.P.1', sectionLabel: 'Description', sortOrder: 1 },
    ];
    // Same artifactDbId 7 twice in one section (a duplicate map row) and again in another section.
    dbState.mappedByCall = [[art('dp', '3.2.P.1', 7), art('dp', '3.2.P.1', 7)], [art('dp', null, 7)]];

    const res = await post();
    expect(res.status).toBe(200);
    const dups = findings(res).filter((f) => f.ruleId === 'LEAF-DUPLICATE-MAPPING');
    expect(dups).toHaveLength(2);
    expect(dups.every((f) => f.severity === 'warning')).toBe(true);
    expect(dups[1].message).toMatch(/already ships as a leaf from Module 3 CMC \(module3_cmc\)/);
    expect(packageLeafBytesFn.mock.calls[0][0].leaves.map((l: any) => l.ctdSection)).toEqual(['3.2.P.1']);
    expect(res.body.data.bundle.leafCount).toBe(1);
    expect(res.body.data.bundle.validation.errorCount).toBe(0);
  });

  it('composes leaf file names inside the 64-character eCTD rule, keeping the artifact discriminator', async () => {
    dbState.pkg = lockedPkg();
    dbState.sections = [{ id: 12, sectionKey: 'module3_cmc_drug_substance_manufacturing_process_and_process_controls', sectionLabel: 'Manufacture', sortOrder: 0 }];
    dbState.mappedByCall = [[
      { ...art('a', '3.2.S.2.2', 1), artifactId: 'artifact_1725000000000_0123456789ab' },
      { ...art('b', '3.2.S.2.2', 2), artifactId: 'artifact_1725000000001_0123456789ab' }, // same random suffix -> tiebreaker
    ]];
    const res = await post();
    expect(res.status).toBe(200);
    const names: string[] = packageLeafBytesFn.mock.calls[0][0].leaves.map((l: any) => l.fileName);
    expect(names).toHaveLength(2);
    for (const n of names) {
      expect(n.length, n).toBeLessThanOrEqual(64);
      expect(n, n).toMatch(/^[a-z0-9][a-z0-9.-]{0,63}$/);
      expect(n, n).toMatch(/-0123456789ab(-2)?\.pdf$/);
    }
    expect(new Set(names).size).toBe(2);
  });

  it('BLOCKS when the package records no agency identifiers — never ships an internal id as the application number', async () => {
    dbState.pkg = lockedPkg({ foo: 'bar' }); // no metadata.regulatory
    dbState.sections = [{ id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 }];
    dbState.mappedByCall = [[art('cover', null)]];

    const res = await post();
    expect(res.status).toBe(200);
    const missing = findings(res).filter((f) => f.ruleId === 'REGULATORY-IDENTIFIER-MISSING');
    expect(missing).toHaveLength(1);
    expect(missing[0].severity).toBe('error');
    expect(missing[0].message).toMatch(/regulatory\.applicationNumber, regulatory\.applicantId, regulatory\.applicantName/);
    expect(res.body.data.bundle.validation.errorCount).toBe(1);
    const opts = packageLeafBytesFn.mock.calls[0][0];
    expect(opts.applicationId).toMatch(/^UNASSIGNED-/);
    expect(opts.applicationId).not.toBe('pkg_locked');
    expect(opts.sponsorId).toMatch(/^UNASSIGNED-/);
  });

  it('REJECTS a malformed application number (it becomes a filesystem path component)', async () => {
    dbState.pkg = lockedPkg({ regulatory: { ...REGULATORY, applicationNumber: '../../etc/x' } });
    dbState.sections = [{ id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 }];
    dbState.mappedByCall = [[art('cover', null)]];
    const res = await post();
    expect(findings(res).some((f) => f.ruleId === 'REGULATORY-IDENTIFIER-MISSING' && /applicationNumber/.test(f.message))).toBe(true);
    expect(packageLeafBytesFn.mock.calls[0][0].applicationId).toMatch(/^UNASSIGNED-/);
  });

  it('400s on a sequence that is not four digits (path-traversal vector) and never reaches the packager', async () => {
    dbState.pkg = lockedPkg();
    dbState.sections = [{ id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 }];
    dbState.mappedByCall = [[art('cover', null)]];
    const res = await post({ sequence: '/../../../../etc/x' });
    expect(res.status).toBe(400);
    expect(packageLeafBytesFn).not.toHaveBeenCalled();
    expect(writeFileFn).not.toHaveBeenCalled();
  });

  it('accepts a four-digit sequence and passes it through', async () => {
    dbState.pkg = lockedPkg();
    dbState.sections = [{ id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 }];
    dbState.mappedByCall = [[art('cover', null)]];
    const res = await post({ sequence: '0003' });
    expect(res.status).toBe(200);
    expect(packageLeafBytesFn.mock.calls[0][0].sequence).toBe('0003');
  });

  it('400s when region and format disagree (FDA + pmda_ectd)', async () => {
    dbState.pkg = lockedPkg();
    const res = await post({ region: 'FDA', format: 'pmda_ectd' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REGION_FORMAT_MISMATCH');
    expect(packageLeafBytesFn).not.toHaveBeenCalled();
  });

  it('400s a region override that contradicts a DEVICE family (510k is an FDA eSTAR; PMDA cannot be its region)', async () => {
    dbState.pkg = { ...lockedPkg(), packageFamily: '510k' };
    const res = await post({ region: 'PMDA' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REGION_FORMAT_MISMATCH');
    expect(res.body.error).toMatch(/estar is the FDA format/);
    expect(buildECTDZipFn).not.toHaveBeenCalled();
    expect(packageLeafBytesFn).not.toHaveBeenCalled();
  });

  it('a PMDA region override re-derives the format, and the descriptor records the format the packager BUILT', async () => {
    packageLeafBytesFn.mockResolvedValue({
      path: '/tmp/c2c-assemble-test/pkg.zip', sha256: 'f'.repeat(64),
      sizeBytes: Buffer.byteLength('PK-ZIP-CONTENT'), format: 'pmda_ectd', ...PACKAGER_EVIDENCE,
    });
    dbState.pkg = lockedPkg();
    dbState.sections = [{ id: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 0 }];
    dbState.mappedByCall = [[art('co', null)]];
    const res = await post({ region: 'PMDA' });
    expect(res.status).toBe(200);
    expect(packageLeafBytesFn.mock.calls[0][0].region).toBe('pmda');
    expect(res.body.data.bundle.format).toBe('pmda_ectd');
    expect(dbState.updateSet.metadata.bundle.format).toBe('pmda_ectd');
  });
});

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
import { createHash } from 'crypto';

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
    unlink: (...a: unknown[]) => unlinkFn(...a),
  },
}));
const unlinkFn = vi.fn().mockResolvedValue(undefined);

/* ─── Durable (S3) bundle storage: disabled by default, enabled per test. ── */
const { storageState } = vi.hoisted(() => ({ storageState: { enabled: false } }));
const putBundleFn = vi.fn().mockResolvedValue(undefined);
const deleteBundleFn = vi.fn().mockResolvedValue(undefined);
vi.mock('../server/services/submission-bundle-storage', () => ({
  isBundleStorageEnabled: () => storageState.enabled,
  bundleStorageBucket: () => 'test-bundles',
  bundleStorageKey: (packageId: string, sha256: string) => `submission-bundles/${packageId}/${sha256}.zip`,
  putBundle: (...a: unknown[]) => putBundleFn(...a),
  deleteBundle: (...a: unknown[]) => deleteBundleFn(...a),
  readBundleBytes: vi.fn(),
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
    sectionOrderBy: null as any,   // the ordering the sections query asked for
    mappedByCall: [] as any[][], // FIFO list of artifact rows per section query
    updateSet: null as any,
  },
}));

/** Row timestamps the real tables declare NOT NULL. Leaf PDFs are stamped from
 *  the content's own dates rather than the wall clock (services/ectd/leaf-pdf),
 *  so a double that omitted them would be modelling a row the database cannot
 *  hold — and would make every assembly fail. Fixed values, so two assemblies
 *  of the same fixture produce the same bytes, which is the point. */
const ROW_TIMES = { createdAt: new Date('2026-01-02T03:04:05Z'), updatedAt: new Date('2026-01-02T03:04:05Z') };
const withTimes = <T extends object>(rows: T[]): T[] => rows.map((r) => ({ ...ROW_TIMES, ...r }));

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
    orderBy(...order: any[]) {
      if (mode !== 'mapped') dbState.sectionOrderBy = order;
      if (mode === 'mapped') {
        // An entry may be a function: a concurrent change that lands DURING
        // the content read (it mutates dbState and returns the rows).
        const next = dbState.mappedByCall.shift();
        return Promise.resolve(withTimes(typeof next === 'function' ? next() : next ?? []));
      }
      // sections query resolves to the sections array.
      return Promise.resolve(withTimes(dbState.sections));
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

/** The pool client: serves the package row lock (SELECT … FOR UPDATE) from the
 *  stubbed package AT LOCK TIME and captures the metadata each locked UPDATE
 *  writes; BEGIN/COMMIT/ROLLBACK are recorded for the ledger assertions. */
const clientQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
  if (/FOR UPDATE/.test(sql)) return { rows: [{ metadata: dbState.pkg?.metadata ?? null }] };
  if (/^UPDATE c2c_submission_packages/.test(sql)) dbState.updateSet = { metadata: JSON.parse(String(params[1])) };
  return { rows: [] };
});
const connectFn = vi.fn(() => Promise.resolve({ query: clientQuery, release: vi.fn() }));

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
import { ValidationError as PackagerValidationError } from '../server/services/submission-gateways/types';
import { recordGovernedAction } from '../server/routes/c2c/actions';
import { fingerprintPackageContent, sha256Hex } from '../server/services/ectd/package-content-fingerprint';
import { asc } from 'drizzle-orm';
import { c2cPackageSections } from '../shared/schema';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    /* A role: every write on this router is role-gated. This harness attached
       none and still passed. */
    (req as any).user = { id: 777, organizationId: 99, role: 'admin' };
    (req as any).userRole = 'admin';
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
/** Assembly is a governed transition: the operator's reason is REQUIRED. */
const REASON = { reason: 'Assemble the locked package for agency transmit' };
const post = (body: Record<string, unknown> = {}) =>
  request(makeApp()).post('/api/submission-ops/packages/pkg_locked/assemble').send({ ...REASON, ...body });
/** Findings are PERSISTED on the descriptor (the surface the governed transmit
 *  gate reads); the API response carries only the counts. */
const findings = (res: any): Array<{ ruleId: string; severity: string; message: string }> => {
  if (res.status !== 200 || !dbState.updateSet?.metadata?.bundle?.validation?.findings) {
    throw new Error(`expected an assembled bundle, got HTTP ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return dbState.updateSet.metadata.bundle.validation.findings;
};

/** A sequence this package actually transmitted — the baseline a follow-up
 *  sequence diffs against. The key is the one the route COMPUTES for the cover
 *  letter the fixtures build (placement '1.2', leafFileName('cover-letter',
 *  'cover')); an md5 that is merely different from the rendered one, so this
 *  fixture is a `replace`. For an `unchanged` baseline use `filedFrom`. */
const FILED_0000 = {
  sequence: '0000', submissionType: 'original', sha256: 'a'.repeat(64), transmittalId: 1,
  filedAt: '2026-01-01T00:00:00.000Z',
  leaves: [{ ctdSection: '1.2', fileName: 'cover-letter-cover.pdf', href: 'm1/us/1-2/cover-letter-cover.pdf', md5: 'prior-md5' }],
};

const PACKAGER_EVIDENCE = {
  submissionGrade: { pdfLeaves: 2, pdfaConverted: 2, notConverted: [] },
  dtdStatus: { selfContained: false, missing: ['ich-ectd-3-2.dtd'] },
  regionalBackbone: { region: 'fda', file: 'm1/us/us-regional.xml', regionConformant: true },
};

beforeEach(() => {
  buildECTDZipFn.mockReset();
  packageLeafBytesFn.mockReset();
  vi.mocked(recordGovernedAction).mockClear();
  clientQuery.mockClear();
  unlinkFn.mockClear();
  storageState.enabled = false;
  putBundleFn.mockClear();
  deleteBundleFn.mockClear();
  writeFileFn.mockClear();
  mkdirFn.mockClear();
  connectFn.mockClear();
  dbState.pkg = null;
  dbState.sections = [];
  dbState.sectionOrderBy = null;
  dbState.mappedByCall = [];
  dbState.updateSet = null;
  (dbState as any)._pkgResolved = false;
  buildECTDZipFn.mockResolvedValue(Buffer.from('PK-ZIP-CONTENT', 'utf8'));
  // The canonical packager writes the bundle to disk; the route reads it back
  // (readFile is stubbed to the same deterministic bytes).
  // The manifest is derived from the leaves it is HANDED, exactly as the real
  // packager derives it (regional-packager: ctdSection/fileName/href/md5 + op).
  // A mock that returned a fixed object instead made the descriptor's manifest
  // — the inventory the next sequence diffs against — untestable: a route that
  // stored none at all passed this suite unchanged.
  packageLeafBytesFn.mockImplementation(async (opts: any) => ({
    path: '/tmp/c2c-assemble-test/pkg.zip',
    sha256: 'f'.repeat(64),
    sizeBytes: Buffer.byteLength('PK-ZIP-CONTENT'),
    format: 'ectd',
    leafManifest: (opts?.leaves ?? []).map((l: any) => ({
      ctdSection: l.ctdSection,
      fileName: l.fileName,
      href: `m${String(l.ctdSection).charAt(0)}/${String(l.ctdSection).replace(/\./g, '-')}/${l.fileName}`,
      md5: createHash('md5').update(l.bytes).digest('hex'),
      ...(l.operation ? { operation: l.operation } : {}),
      ...(l.title ? { title: l.title } : {}),
    })),
    ...PACKAGER_EVIDENCE,
  }));
});

/** The filed record a successful assemble + transmit would leave behind: the
 *  descriptor's own leaf manifest, round-tripped. Building the baseline from
 *  what the route ACTUALLY produced is the only way a follow-up case can
 *  exercise `replace` and `unchanged` — a hand-written key that the route can
 *  never compute silently exercises `new` and nothing else, which is what the
 *  earlier fixture did. */
const filedFrom = (sequence: string, submissionType = 'original') => ({
  sequence, submissionType, sha256: 'a'.repeat(64), transmittalId: 1,
  filedAt: '2026-01-01T00:00:00.000Z',
  leaves: dbState.updateSet.metadata.bundle.leafManifest as Array<Record<string, unknown>>,
});

describe('package identity: one id contract across the package API', () => {
  it('GET /packages/:packageId resolves the numeric row id as well as the pkg_ text id (tenant-scoped either way)', async () => {
    dbState.pkg = lockedPkg();
    dbState.sections = [{ id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 }];
    const byNumber = await request(makeApp()).get('/api/submission-ops/packages/5');
    expect(byNumber.status).toBe(200);
    expect(byNumber.body.data.packageId).toBe('pkg_locked');
    expect(byNumber.body.data.sections).toHaveLength(1);
    (dbState as any)._pkgResolved = false;
    const byText = await request(makeApp()).get('/api/submission-ops/packages/pkg_locked');
    expect(byText.status).toBe(200);
    expect(byText.body.data.packageId).toBe('pkg_locked');
  });
});

describe('POST /api/submission-ops/packages/:packageId/assemble', () => {
  it('404s when the package is not in the tenant', async () => {
    dbState.pkg = null;
    const res = await request(makeApp()).post('/api/submission-ops/packages/pkg_missing/assemble').send(REASON);
    expect(res.status).toBe(404);
  });

  it('409s when the package is not locked', async () => {
    dbState.pkg = { id: 5, packageId: 'pkg_active', orgId: 99, status: 'active', packageFamily: 'ind', metadata: null };
    const res = await request(makeApp()).post('/api/submission-ops/packages/pkg_active/assemble').send(REASON);
    expect(res.status).toBe(409);
    expect(res.body.gate).toBe('not_locked');
  });

  it('REQUIRES the operator’s reason — no placeholder is ever written into the audit row', async () => {
    dbState.pkg = lockedPkg();
    const res = await request(makeApp()).post('/api/submission-ops/packages/pkg_locked/assemble').send({});
    expect(res.status).toBe(400);
    expect(res.body.details.reason).toBeDefined();
    expect(packageLeafBytesFn).not.toHaveBeenCalled();
    expect(vi.mocked(recordGovernedAction)).not.toHaveBeenCalled();
  });

  it('assembles for Health Canada (the gate’s own remediation for a CA transmit)', async () => {
    dbState.pkg = lockedPkg();
    dbState.sections = [{ id: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 0 }];
    dbState.mappedByCall = [[art('co', null)]];
    const res = await post({ region: 'CA' });
    expect(res.status).toBe(200);
    expect(packageLeafBytesFn.mock.calls[0][0].region).toBe('ca');
    expect(res.body.data.bundle.format).toBe('ectd');
    expect(dbState.updateSet.metadata.bundle.region).toBe('CA');
  });

  it('REFUSES to store a bundle whose identifiers changed while it was being assembled (STALE_ASSEMBLY), and never reverts the newer metadata', async () => {
    dbState.pkg = lockedPkg();
    dbState.sections = [{ id: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 0 }];
    dbState.mappedByCall = [[art('co', null)]];
    // While the packager runs, another request records new identifiers.
    packageLeafBytesFn.mockImplementationOnce(async () => {
      dbState.pkg = lockedPkg({ foo: 'bar', regulatory: { ...REGULATORY, applicationNumber: 'IND999999' } });
      return { path: '/tmp/c2c-assemble-test/pkg.zip', sha256: 'f'.repeat(64), sizeBytes: 14, format: 'ectd', ...PACKAGER_EVIDENCE };
    });
    const res = await post();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STALE_ASSEMBLY');
    expect(dbState.updateSet).toBeNull(); // nothing written: the newer identifiers stand
    expect(packageLeafBytesFn.mock.calls[0][0].applicationId).toBe('IND123456'); // the backbone carried the OLD ones
    // The zip built with the old identifiers is removed, and the discard is recorded.
    expect(unlinkFn).toHaveBeenCalledTimes(1);
    expect(res.body.ledgerWriteFailed).toBe(false);
    const ledger = vi.mocked(recordGovernedAction).mock.calls.at(-1)![1] as any;
    expect(ledger.payload).toMatchObject({ change: 'assembly-discarded', cause: 'identifiers_changed' });
    // The decision was taken under the row lock, in a transaction.
    expect(clientQuery.mock.calls.some((c) => /FOR UPDATE/.test(String(c[0])))).toBe(true);
  });

  it('REFUSES to store a bundle whose CONTENT changed while it was being assembled: a mapping added or removed meanwhile bumps the package’s content revision', async () => {
    dbState.pkg = lockedPkg({ foo: 'bar', regulatory: REGULATORY, contentRevision: 3 });
    dbState.sections = [{ id: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 0 }];
    dbState.mappedByCall = [[art('co', null)]];
    // While the packager runs, a colleague maps another artifact. The mapping
    // route clears any stored bundle and bumps the revision; the zip being
    // built here does not contain that artifact, so it must not be stored.
    packageLeafBytesFn.mockImplementationOnce(async () => {
      dbState.pkg = lockedPkg({ foo: 'bar', regulatory: REGULATORY, contentRevision: 4 });
      return { path: '/tmp/c2c-assemble-test/pkg.zip', sha256: 'f'.repeat(64), sizeBytes: 14, format: 'ectd', ...PACKAGER_EVIDENCE };
    });
    const res = await post();
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'STALE_ASSEMBLY', gate: 'content_changed' });
    expect(dbState.updateSet).toBeNull();
    expect(unlinkFn).toHaveBeenCalledTimes(1);
    const ledger = vi.mocked(recordGovernedAction).mock.calls.at(-1)![1] as any;
    expect(ledger.payload).toMatchObject({ change: 'assembly-discarded', cause: 'content_changed' });
  });

  it('captures the revision BEFORE reading content: a mapping change that lands during the content read discards the zip too', async () => {
    // A route that captured the revision after its content read (or re-read
    // the package right before storing) would miss exactly this window.
    dbState.pkg = lockedPkg({ foo: 'bar', regulatory: REGULATORY, contentRevision: 3 });
    dbState.sections = [{ id: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 0 }];
    dbState.mappedByCall = [() => {
      dbState.pkg = lockedPkg({ foo: 'bar', regulatory: REGULATORY, contentRevision: 4 });
      return [art('co', null)];
    }];
    const res = await post();
    expect(res.status).toBe(409);
    expect(res.body.gate).toBe('content_changed');
    expect(dbState.updateSet).toBeNull();
    expect(unlinkFn).toHaveBeenCalledTimes(1);
  });

  it('stores the new bundle WITHOUT the previous bundle’s preflight summary (a summary that outlives its bundle is aggregated as current)', async () => {
    dbState.pkg = lockedPkg({ foo: 'bar', regulatory: REGULATORY, preflight: { bundleSha256: 'e'.repeat(64), errorCount: 2, blocking: true } });
    dbState.sections = [{ id: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 0 }];
    dbState.mappedByCall = [[art('co', null)]];
    const res = await post();
    expect(res.status).toBe(200);
    expect(dbState.updateSet.metadata.preflight).toBeUndefined();
    expect(dbState.updateSet.metadata.foo).toBe('bar');
  });

  it('a package that never recorded a content revision is protected too: the first mapping change during assembly discards the bundle', async () => {
    dbState.pkg = lockedPkg(); // no contentRevision yet (packages created before the revision existed)
    dbState.sections = [{ id: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 0 }];
    dbState.mappedByCall = [[art('co', null)]];
    packageLeafBytesFn.mockImplementationOnce(async () => {
      dbState.pkg = lockedPkg({ foo: 'bar', regulatory: REGULATORY, contentRevision: 1 });
      return { path: '/tmp/c2c-assemble-test/pkg.zip', sha256: 'f'.repeat(64), sizeBytes: 14, format: 'ectd', ...PACKAGER_EVIDENCE };
    });
    const res = await post();
    expect(res.status).toBe(409);
    expect(res.body.gate).toBe('content_changed');
    expect(dbState.updateSet).toBeNull();
  });

  it('records the CONTENT FINGERPRINT the bundle was built from (sections, mappings, declared placements, artifact content) so the transmit gate can prove the zip still reflects the package', async () => {
    dbState.pkg = lockedPkg();
    dbState.sections = [
      { id: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 2 },
      { id: 14, sectionKey: '3.2.P.1', sectionLabel: 'Description and Composition', sortOrder: 1 },
    ];
    const co = art('co', null, 1);
    dbState.mappedByCall = [[co], []]; // 3.2.P.1 has nothing mapped: a placeholder leaf, still part of the content
    const res = await post();
    expect(res.status).toBe(200);
    expect(dbState.updateSet.metadata.bundle.contentFingerprint).toBe(
      fingerprintPackageContent([
        { sectionDbId: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 2, artifactDbId: 1, title: co.title, version: 1, ctdSection: null, contentSha256: sha256Hex(co.content) },
        { sectionDbId: 14, sectionKey: '3.2.P.1', sectionLabel: 'Description and Composition', sortOrder: 1, artifactDbId: null, title: null, version: null, ctdSection: null, contentSha256: null },
      ]),
    );
  });

  it('walks the sections in a DETERMINISTIC order: the row id breaks a tie on sortOrder, so identical content cannot assemble to different bytes', async () => {
    // Without the tiebreaker two sections sharing a sortOrder come back in
    // whatever order Postgres chooses, and this loop decides both the leaf
    // order in the backbone and which of two colliding leaf names is suffixed.
    dbState.pkg = lockedPkg();
    dbState.sections = [{ id: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 0 }];
    dbState.mappedByCall = [[art('co', null)]];
    const res = await post();
    expect(res.status).toBe(200);
    expect(dbState.sectionOrderBy).toEqual([asc(c2cPackageSections.sortOrder), asc(c2cPackageSections.id)]);
  });

  it('records the content fingerprint for a DEVICE format too (eSTAR), where the leaf model differs', async () => {
    dbState.pkg = { ...lockedPkg(), packageFamily: '510k' };
    dbState.sections = [
      { id: 21, sectionKey: 'device-description', sectionLabel: 'Device Description', sortOrder: 3 },
      { id: 22, sectionKey: 'labeling', sectionLabel: 'Labeling', sortOrder: 4 },
    ];
    const dd = art('dd', null, 4);
    dbState.mappedByCall = [[dd], []];
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.body.data.bundle.format).toBe('estar');
    expect(dbState.updateSet.metadata.bundle.contentFingerprint).toBe(
      fingerprintPackageContent([
        { sectionDbId: 21, sectionKey: 'device-description', sectionLabel: 'Device Description', sortOrder: 3, artifactDbId: 4, title: dd.title, version: 1, ctdSection: null, contentSha256: sha256Hex(dd.content) },
        { sectionDbId: 22, sectionKey: 'labeling', sectionLabel: 'Labeling', sortOrder: 4, artifactDbId: null, title: null, version: null, ctdSection: null, contentSha256: null },
      ]),
    );
  });

  it('a discarded stale assembly removes its durable (S3) copy too, and says so', async () => {
    storageState.enabled = true;
    dbState.pkg = lockedPkg();
    dbState.sections = [{ id: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 0 }];
    dbState.mappedByCall = [[art('co', null)]];
    packageLeafBytesFn.mockImplementationOnce(async () => {
      dbState.pkg = lockedPkg({ foo: 'bar', regulatory: { ...REGULATORY, applicationNumber: 'IND999999' } });
      return { path: '/tmp/c2c-assemble-test/pkg.zip', sha256: 'f'.repeat(64), sizeBytes: 14, format: 'ectd', ...PACKAGER_EVIDENCE };
    });
    const res = await post();
    expect(res.status).toBe(409);
    expect(putBundleFn).toHaveBeenCalledTimes(1);
    const key = putBundleFn.mock.calls[0][0];
    expect(deleteBundleFn).toHaveBeenCalledWith(key);
    expect(res.body.durableCopyDeleted).toBe(true);
    expect(res.body.durableCopy).toBeNull();
    const ledger = vi.mocked(recordGovernedAction).mock.calls.at(-1)![1] as any;
    expect(ledger.payload).toMatchObject({ change: 'assembly-discarded', durableCopy: key, durableCopyDeleted: true });
  });

  it('merges the descriptor onto the package’s CURRENT metadata, not the pre-assembly snapshot', async () => {
    dbState.pkg = lockedPkg({ foo: 'bar', regulatory: REGULATORY });
    dbState.sections = [{ id: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 0 }];
    dbState.mappedByCall = [[art('co', null)]];
    // A concurrent, identifier-neutral change lands during packaging.
    packageLeafBytesFn.mockImplementationOnce(async () => {
      dbState.pkg = lockedPkg({ foo: 'bar', regulatory: REGULATORY, noteAddedMeanwhile: 'kept' });
      return { path: '/tmp/c2c-assemble-test/pkg.zip', sha256: 'f'.repeat(64), sizeBytes: 14, format: 'ectd', ...PACKAGER_EVIDENCE };
    });
    const res = await post();
    expect(res.status).toBe(200);
    expect(dbState.updateSet.metadata.noteAddedMeanwhile).toBe('kept');
    expect(dbState.updateSet.metadata.bundle.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('assembles ONE LEAF PER ARTIFACT at each artifact\'s own CTD section, persists, and returns the descriptor', async () => {
    dbState.pkg = lockedPkg();
    dbState.sections = [
      { id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 },
      { id: 12, sectionKey: 'module3_cmc', sectionLabel: 'Module 3 CMC', sortOrder: 0 },
      { id: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 0 },
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
      { id: 12, sectionKey: 'misc-attachment', sectionLabel: 'Misc', sortOrder: 0 }, // nothing inferable
      { id: 13, sectionKey: 'module3_cmc', sectionLabel: 'Module 3 CMC', sortOrder: 0 }, // bare module: NOT a heading
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
      { id: 14, sectionKey: '3.2.P.1', sectionLabel: 'Description', sortOrder: 0 },
    ];
    // Same artifactDbId 7 twice in one section (a duplicate map row) and again in another section.
    dbState.mappedByCall = [[art('dp', '3.2.P.1', 7), art('dp', '3.2.P.1', 7)], [art('dp', null, 7)]];

    const res = await post();
    expect(res.status).toBe(200);
    const dups = findings(res).filter((f) => f.ruleId === 'LEAF-DUPLICATE-MAPPING');
    expect(dups).toHaveLength(2);
    expect(dups.every((f) => f.severity === 'warning')).toBe(true);
    expect(dups[1].message).toMatch(/already ships as a leaf at 3\.2\.P\.1 from Module 3 CMC \(module3_cmc\)/);
    expect(packageLeafBytesFn.mock.calls[0][0].leaves.map((l: any) => l.ctdSection)).toEqual(['3.2.P.1']);
    expect(res.body.data.bundle.leafCount).toBe(1);
    expect(res.body.data.bundle.validation.errorCount).toBe(0);
  });

  it('the same document at two DIFFERENT sections (a reference cited from 4.3 and 5.4) is two leaves, not a duplicate', async () => {
    dbState.pkg = lockedPkg();
    dbState.sections = [
      { id: 41, sectionKey: '4.3', sectionLabel: 'Literature References (M4)', sortOrder: 0 },
      { id: 54, sectionKey: '5.4', sectionLabel: 'Literature References (M5)', sortOrder: 0 },
    ];
    dbState.mappedByCall = [[art('ref', null, 7)], [art('ref', null, 7)]];
    const res = await post();
    expect(res.status).toBe(200);
    expect(findings(res).some((f) => f.ruleId === 'LEAF-DUPLICATE-MAPPING')).toBe(false);
    expect(packageLeafBytesFn.mock.calls[0][0].leaves.map((l: any) => l.ctdSection)).toEqual(['4.3', '5.4']);
    expect(res.body.data.bundle.leafCount).toBe(2);
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

  it('accepts a four-digit sequence and passes it through, once there is a filing for it to follow', async () => {
    dbState.pkg = lockedPkg({
      foo: 'bar', regulatory: REGULATORY,
      filedSequences: [FILED_0000, { ...FILED_0000, sequence: '0002' }],
    });
    dbState.sections = [{ id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 }];
    dbState.mappedByCall = [[art('cover', null)]];
    const res = await post({ sequence: '0003', submissionType: 'Annual Report' });
    expect(res.status).toBe(200);
    const opts = packageLeafBytesFn.mock.calls[0][0];
    expect(opts.sequence).toBe('0003');
    // The backbone is told what is being filed — only 0000 is an original.
    expect(opts.submissionType).toBe('Annual Report');
    expect(opts.fda.submissionType).toBe('Annual Report');
  });

  it("REFUSES a submission type the region has no code for — 'amendment' reached the packager and 500'd", async () => {
    // The word an operator reaches for first is not an fdast term. It passed
    // every check on this route, rendered every leaf, and then threw inside the
    // FDA backbone builder as a bare INTERNAL_ERROR.
    dbState.pkg = lockedPkg({ foo: 'bar', regulatory: REGULATORY, filedSequences: [FILED_0000] });
    dbState.sections = [{ id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 }];
    dbState.mappedByCall = [[art('cover', null)]];
    const res = await post({ sequence: '0001', submissionType: 'amendment' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'SUBMISSION_TYPE_UNKNOWN', gate: 'sequence_lifecycle' });
    // It names terms that actually resolve, as a list the surface can offer.
    expect(res.body.acceptedSubmissionTypes).toContain('Efficacy Supplement');
    expect(res.body.error).toContain('Annual Report');
    expect(packageLeafBytesFn).not.toHaveBeenCalled();
  });

  it('names the accepted terms when a follow-up declares no submission type at all', async () => {
    dbState.pkg = lockedPkg({ foo: 'bar', regulatory: REGULATORY, filedSequences: [FILED_0000] });
    dbState.sections = [{ id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 }];
    dbState.mappedByCall = [[art('cover', null)]];
    const res = await post({ sequence: '0001' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SUBMISSION_TYPE_REQUIRED');
    expect(res.body.acceptedSubmissionTypes).toContain('Original Application');
    expect(res.body.error).not.toMatch(/amendment/);
  });

  it('a changed leaf reaches the PACKAGER as a replace, pointing at the sequence that holds the version it supersedes', async () => {
    // Without an operation on the leaf the packager refuses every sequence but
    // 0000; without modified-file the superseded version stays current at the
    // agency. Both are properties of what the packager is HANDED, so that is
    // what this asserts — a router that dropped either passed the old suite.
    dbState.pkg = lockedPkg({ regulatory: REGULATORY, filedSequences: [FILED_0000] });
    dbState.sections = [{ id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 }];
    dbState.mappedByCall = [[art('cover', null)]];
    const res = await post({ sequence: '0001', submissionType: 'Efficacy Supplement' });
    expect(res.status).toBe(200);
    const sent = packageLeafBytesFn.mock.calls[0][0].leaves;
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ ctdSection: '1.2', fileName: 'cover-letter-cover.pdf', operation: 'replace' });
    expect(sent[0].modifiedFile).toContain('0000');
    expect(res.body.data.bundle.lifecycle.summary).toMatchObject({ replace: 1, new: 0, unchanged: 0 });
  });

  it('a leaf byte-identical to the one on file is NOT handed to the packager — a sequence carries what changed', async () => {
    // The baseline is this route's own output, round-tripped, so "identical"
    // means identical in fact and not by construction. This is also the end to
    // end proof that leaf rendering is reproducible: a wall-clock timestamp in
    // the PDF makes every leaf differ from itself and this case fail.
    dbState.pkg = lockedPkg();
    dbState.sections = [
      { id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 },
      { id: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 1 },
    ];
    dbState.mappedByCall = [[art('cover', null)], [art('co', null, 2)]];
    expect((await post()).status).toBe(200);
    const filed = filedFrom('0000');
    expect(filed.leaves).toHaveLength(2);

    // Second sequence: the cover letter is edited, the clinical overview is not.
    packageLeafBytesFn.mockClear();
    (dbState as any)._pkgResolved = false;
    dbState.pkg = lockedPkg({ regulatory: REGULATORY, filedSequences: [filed] });
    dbState.sections = [
      { id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 },
      { id: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 1 },
    ];
    dbState.mappedByCall = [
      [{ ...art('cover', null), content: 'Real content cover, revised' }],
      [art('co', null, 2)],
    ];
    const res = await post({ sequence: '0001', submissionType: 'Efficacy Supplement' });
    expect(res.status).toBe(200);
    const sent = packageLeafBytesFn.mock.calls[0][0].leaves;
    expect(sent.map((l: any) => l.fileName)).toEqual(['cover-letter-cover.pdf']);
    expect(sent[0].operation).toBe('replace');
    expect(res.body.data.bundle.lifecycle).toMatchObject({
      summary: { replace: 1, unchanged: 1, new: 0 }, omittedCount: 1,
    });
  });

  it('the descriptor and its validation describe the leaves that SHIPPED, not the ones the drop removed', async () => {
    // The drop rebuilt only the packager's leaf list. leafCount, the empty
    // section list and validateEctdLeafs all still ran over the pre-drop set,
    // so the stored descriptor claimed leaves the zip does not contain — and
    // the transmit gate blocked on findings about them.
    dbState.pkg = lockedPkg();
    dbState.sections = [
      { id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 },
      { id: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 1 },
      { id: 14, sectionKey: '3.2.P.1', sectionLabel: 'Description', sortOrder: 2 }, // no artifact → placeholder
    ];
    dbState.mappedByCall = [[art('cover', null)], [art('co', null, 2)], []];
    expect((await post()).status).toBe(200);
    expect(dbState.updateSet.metadata.bundle.leafCount).toBe(3);
    expect(dbState.updateSet.metadata.bundle.emptyLeafCount).toBe(1);
    const filed = filedFrom('0000');

    // 0001: only the cover letter changed. The other two are byte-identical.
    packageLeafBytesFn.mockClear();
    (dbState as any)._pkgResolved = false;
    dbState.pkg = lockedPkg({ regulatory: REGULATORY, filedSequences: [filed] });
    dbState.sections = [
      { id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 },
      { id: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 1 },
      { id: 14, sectionKey: '3.2.P.1', sectionLabel: 'Description', sortOrder: 2 },
    ];
    dbState.mappedByCall = [[{ ...art('cover', null), content: 'revised' }], [art('co', null, 2)], []];
    const res = await post({ sequence: '0001', submissionType: 'Efficacy Supplement' });
    expect(res.status).toBe(200);
    const stored = dbState.updateSet.metadata.bundle;
    expect(stored.leafCount).toBe(1);                 // one leaf is in the zip
    expect(stored.leafManifest).toHaveLength(1);
    expect(res.body.data.bundle.leafCount).toBe(1);
    // The unshipped placeholder is not an empty section OF THIS SEQUENCE.
    expect(stored.emptyLeafCount).toBe(0);
    // And nothing validation says names a leaf that is not in the bundle.
    for (const f of stored.validation.findings as Array<{ message: string }>) {
      expect(f.message, f.message).not.toMatch(/2-5|3-2-p-1/);
    }
  });

  it('REFUSES a follow-up in which nothing changed rather than storing a leafless bundle as transmittable', async () => {
    dbState.pkg = lockedPkg();
    dbState.sections = [{ id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 }];
    dbState.mappedByCall = [[art('cover', null)]];
    expect((await post()).status).toBe(200);
    const filed = filedFrom('0000');
    const before = dbState.updateSet.metadata.bundle;

    packageLeafBytesFn.mockClear();
    (dbState as any)._pkgResolved = false;
    dbState.pkg = lockedPkg({ regulatory: REGULATORY, filedSequences: [filed] });
    dbState.sections = [{ id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 }];
    dbState.mappedByCall = [[art('cover', null)]];
    const res = await post({ sequence: '0001', submissionType: 'Efficacy Supplement' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'NOTHING_TO_FILE', gate: 'sequence_lifecycle' });
    expect(packageLeafBytesFn).not.toHaveBeenCalled();
    // The bundle already on the package is untouched — a refusal is not a discard.
    expect(dbState.updateSet.metadata.bundle).toEqual(before);
  });

  it('REFUSES a gap and a backfill: a sequence out of order is diffed against filings made after it', async () => {
    const filedTwo = [FILED_0000, { ...FILED_0000, sequence: '0001' }];
    for (const [sequence, expected] of [['0005', /the next is 0002/], ['0001', /already been transmitted/]] as const) {
      (dbState as any)._pkgResolved = false;
      dbState.pkg = lockedPkg({ foo: 'bar', regulatory: REGULATORY, filedSequences: filedTwo });
      dbState.sections = [{ id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 }];
      dbState.mappedByCall = [[art('cover', null)]];
      const res = await post({ sequence, submissionType: 'Efficacy Supplement' });
      expect(res.status, sequence).toBe(409);
      expect(res.body.error, sequence).toMatch(expected);
    }
  });

  it('stores the leaf manifest on the descriptor — the inventory the NEXT sequence diffs against', async () => {
    dbState.pkg = lockedPkg();
    dbState.sections = [{ id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 }];
    dbState.mappedByCall = [[art('cover', null)]];
    expect((await post()).status).toBe(200);
    const manifest = dbState.updateSet.metadata.bundle.leafManifest;
    expect(manifest).toHaveLength(1);
    expect(manifest[0]).toMatchObject({ ctdSection: '1.2', fileName: 'cover-letter-cover.pdf', operation: 'new' });
    expect(manifest[0].md5).toMatch(/^[0-9a-f]{32}$/);
  });

  it('assembling does NOT file the sequence: only a successful transmit puts a leaf on file', async () => {
    // If assemble wrote the filed history, a bundle that was built and never
    // sent would become the baseline the next sequence diffs against, and the
    // sequence number would be consumed by an assembly nobody transmitted.
    dbState.pkg = lockedPkg();
    dbState.sections = [{ id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 }];
    dbState.mappedByCall = [[art('cover', null)]];
    expect((await post()).status).toBe(200);
    expect(dbState.updateSet.metadata.filedSequences).toBeUndefined();
  });

  it('assembles the same content to the same bytes twice — the lifecycle diff and the signed digest both depend on it', async () => {
    const setup = () => {
      (dbState as any)._pkgResolved = false;
      dbState.pkg = lockedPkg();
      dbState.sections = [{ id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 }];
      dbState.mappedByCall = [[art('cover', null)]];
    };
    setup();
    expect((await post()).status).toBe(200);
    const first = packageLeafBytesFn.mock.calls[0][0].leaves.map((l: any) => l.bytes.toString('base64'));
    packageLeafBytesFn.mockClear();
    await new Promise((r) => setTimeout(r, 1100)); // cross the second boundary
    setup();
    expect((await post()).status).toBe(200);
    expect(packageLeafBytesFn.mock.calls[0][0].leaves.map((l: any) => l.bytes.toString('base64'))).toEqual(first);
  }, 20_000);

  it('REFUSES a follow-up sequence on a package that has transmitted nothing — an assembled-but-unsent bundle is not on file', async () => {
    dbState.pkg = lockedPkg();
    dbState.sections = [{ id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 }];
    dbState.mappedByCall = [[art('cover', null)]];
    const res = await post({ sequence: '0003', submissionType: 'Annual Report' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'NO_PRIOR_SEQUENCE', gate: 'sequence_lifecycle' });
    expect(packageLeafBytesFn).not.toHaveBeenCalled();
  });

  it('400s when region and format disagree (FDA + pmda_ectd)', async () => {
    dbState.pkg = lockedPkg();
    const res = await post({ region: 'FDA', format: 'pmda_ectd' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REGION_FORMAT_MISMATCH');
    expect(packageLeafBytesFn).not.toHaveBeenCalled();
  });

  it('a packager REFUSAL answers 422 with its findings persisted and clears the stale bundle — never a bare 500 with an old zip left transmittable', async () => {
    dbState.pkg = lockedPkg({
      regulatory: REGULATORY,
      bundle: { path: '/bundles/old.zip', sha256: 'e'.repeat(64), sizeBytes: 9, format: 'ectd' },
    });
    dbState.sections = [{ id: 11, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0 }];
    dbState.mappedByCall = [[art('cover', null)]];
    packageLeafBytesFn.mockRejectedValueOnce(
      new PackagerValidationError('Refusing to package: 1 leaf could not be placed', [{ ruleId: 'LEAF-DROPPED', message: 'cover.pdf has no heading' }]),
    );

    const res = await post();
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PACKAGER_REFUSED');
    expect(res.body.staleBundleCleared).toBe(true);
    expect(res.body.ledgerWriteFailed).toBe(false);
    // Clearing a transmittable bundle is a mutation of regulated content: it is recorded.
    const ledger = vi.mocked(recordGovernedAction).mock.calls.at(-1)![1] as any;
    expect(ledger).toMatchObject({ orgId: 99, userId: 777, target: 'submission:5', reason: REASON.reason });
    expect(ledger.payload).toMatchObject({ change: 'assembly-refused', staleBundleCleared: true });
    const refused = res.body.validation.findings.filter((f: any) => f.ruleId === 'PACKAGER-REFUSED');
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ severity: 'error', message: 'cover.pdf has no heading' });
    expect(res.body.validation.errorCount).toBeGreaterThanOrEqual(1);
    // Nothing was written as a bundle, the OLD descriptor is gone, and the refusal is on the package.
    expect(writeFileFn).not.toHaveBeenCalled();
    expect(dbState.updateSet.metadata.bundle).toBeUndefined();
    expect(dbState.updateSet.metadata.assemblyRefusal.validation.findings.some((f: any) => f.ruleId === 'PACKAGER-REFUSED')).toBe(true);
    expect(dbState.updateSet.metadata.regulatory).toEqual(REGULATORY); // unrelated metadata kept
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

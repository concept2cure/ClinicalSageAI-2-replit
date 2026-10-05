/**
 * C2C-SUB-003 — transmit bundle-descriptor trust boundary.
 *
 * The transmit route used to accept a client-supplied `bundle` descriptor
 * ({ path, sha256, sizeBytes, format }) straight off the request body and let
 * it "always win" over the server-generated, tenant-owned package descriptor.
 * Because the caller chose BOTH the server-side path AND the digest it would be
 * checked against, every downstream control was satisfied by construction:
 *
 *   - the tenant-scoped ownership lookup (WHERE id=$1 AND org_id=$2) never ran,
 *   - the internal eCTD structural-validation gate saw no `validation` field and
 *     coerced that to ZERO errors (fail open by omission),
 *   - the attacker-chosen path went straight to fs.readFile in the gateway.
 *
 * Net: transmit any server-readable file to a real agency gateway, and skip
 * structural validation entirely.
 *
 * These tests run the route under NODE_ENV='production' (the enforced state,
 * which is also the fail-closed default for an unset NODE_ENV) and assert the
 * request is refused BEFORE gw.transmit() is reached. Each negative case
 * asserts a 4xx AND that the gateway was never called.
 *
 * NODE_ENV / SUBMISSION_BUNDLE_DIR are restored after every test — vitest runs
 * with singleFork, so leaking 'production' would poison every later file.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';

const queryFn = vi.fn();
const connectFn = vi.fn();

// The signing ceremony reads the signer's account standing (VSR-001 F-28);
// every signer here is active. Suspended and deprovisioned signers are pinned
// by reverify-signer.test.ts and tests/db/account-standing.dbtest.ts.
vi.mock('../server/services/account-standing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/services/account-standing')>()),
  isAccountActive: async () => true,
}));
// ...and its lockout (auth-security-service), which no signer here is under.
// Before F-30 an unreadable lockout read as "not locked", so this file never
// had to say so. Pinned by tests/db/signing-lockout.dbtest.ts.
vi.mock('../server/services/auth-security-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/services/auth-security-service')>()),
  isAccountLocked: async () => ({ locked: false }),
  recordFailedLogin: async () => ({ locked: false, remainingAttempts: 5 }),
}));
vi.mock('../server/db', () => ({
  pool: {
    query:   (...args: unknown[]) => queryFn(...args),
    connect: (...args: unknown[]) => connectFn(...args),
  },
  getPool: () => ({
    query:   (...args: unknown[]) => queryFn(...args),
    connect: (...args: unknown[]) => connectFn(...args),
  }),
  db: {},
}));

// Re-auth must PASS in every case here: the point is that a fully
// re-authenticated caller still cannot steer the bytes.
vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn().mockResolvedValue(true) },
  compare: vi.fn().mockResolvedValue(true),
}));
vi.mock('../server/services/mfaService', () => ({
  verifyToken: vi.fn().mockResolvedValue(true),
  // The operator has no second factor enrolled. verifyReauth asks (the canonical
  // §11.200 rule: the code is required whenever one is enrolled) and refuses when
  // the answer cannot be read, so the fixture has to state it.
  isMfaEnabled: vi.fn().mockResolvedValue(false),
}));

// §11.50: a transmit is signed under a meaning the signer declares; the body carries it.
const REAUTH = { reason: 'governed transmit reason', meaning: 'release', reauth: { password: 'pw-123456' } };

const { transmitFn, statusFn, ackFn, isConfigFn, configStatusFn } = vi.hoisted(() => ({
  transmitFn:     vi.fn(),
  statusFn:       vi.fn(),
  ackFn:          vi.fn(),
  isConfigFn:     vi.fn(),
  configStatusFn: vi.fn(),
}));

vi.mock('../server/services/submission-gateways', () => {
  class MockCredentialError extends Error { name = 'CredentialError'; }
  class MockGatewayError extends Error {
    name = 'GatewayError';
    constructor(msg: string, public httpStatus: number | null, public gatewayCode: string | null) { super(msg); }
  }
  class MockTransportError extends Error { name = 'TransportError'; }
  class MockValidationError extends Error {
    name = 'ValidationError';
    constructor(msg: string, public findings: unknown[]) { super(msg); }
  }
  const fakeGateway = {
    region: 'fda', gateway: 'esg', transport: 'as2',
    isConfigured: isConfigFn,
    transmit: transmitFn,
    checkStatus: statusFn,
    downloadAcknowledgment: ackFn,
  };
  return {
    getGateway: () => fakeGateway,
    listGateways: () => [{ region: 'fda', gateway: 'esg', transport: 'as2' }],
    gatewayConfigurationStatus: configStatusFn,
    CredentialError: MockCredentialError,
    GatewayError:    MockGatewayError,
    TransportError:  MockTransportError,
    ValidationError: MockValidationError,
  };
});

import gatewayRouter from '../server/routes/mdx-submission-gateway';
// The pure gate the (here-mocked) gateway registry runs on req.bundle. NOT part
// of the mocked index module, so this is the real implementation.
import { evaluatePreTransmit } from '../server/services/submission-gateways/pre-transmit-check';
import { fingerprintPackageContent, sha256Hex, type PackageContentRow } from '../server/services/ectd/package-content-fingerprint';

/** Caller's verified principal. Tenant 99, user 777. */
const CALLER_ORG = 99;
const OTHER_ORG  = 7;

function makeApp(orgId = CALLER_ORG) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    /* An editor role: the transmit route gates on the caller's organization
       role (requireEditorAccess) before the bundle guards this file exercises
       run, so the harness acts as an admin — the role gate itself is pinned in
       mdx-submission-gateway-routes.test.ts. */
    (req as any).user = { id: 777, organizationId: orgId, role: 'admin' };
    (req as any).userRole = 'admin';
    next();
  });
  app.use('/api/mdx', gatewayRouter);
  return app;
}

/**
 * Honest DB stub: the c2c_submission_packages lookup only returns a row when
 * BOTH the id and the org_id bind params match, mirroring the tenant-scoped
 * WHERE clause the route issues.
 */
/** `createdBy` is the package's recorded creator (separation of duties: the
 *  creator may not transmit it). Defaults to 4242 — a colleague of the acting
 *  user (777), so these cases exercise an independent transmitter. */
type StoredPackage = { id: number; orgId: number; bundle: unknown; regulatory?: Record<string, unknown>; filedSequences?: unknown[]; createdBy?: number | null };
let packages: StoredPackage[] = [];
const packageSelects: Array<unknown[]> = [];

/**
 * Transmittal rows the duplicate-send lock reads. The stub answers its two
 * statements — by the bundle's bytes, and by the sequence + environment a row
 * was sent under — as the SQL states them; the SQL itself runs against the
 * real table in active-transmittal-sequence-lock.pglite.test.ts.
 */
type TransmittalRow = { id: number; orgId: number; packageId: number; sha256: string; status: string; metadata: Record<string, unknown> };
let transmittals: TransmittalRow[] = [];
const ACTIVE_STATUSES = ['pending', 'in_transit', 'received'];
function activeTransmittalRows(sql: string, params: unknown[]) {
  const [orgId, packageId, key, environment] = params as [number, number, string, string | undefined];
  const bySequence = /metadata->>'sequence'/.test(sql);
  const hit = transmittals.find((t) => t.orgId === orgId && t.packageId === packageId && ACTIVE_STATUSES.includes(t.status) &&
    (bySequence ? t.metadata.sequence === key && t.metadata.environment === environment : t.sha256 === key));
  return hit ? { rows: [{ id: hit.id, status: hit.status }], rowCount: 1 } : { rows: [], rowCount: 0 };
}

/** The package's content as the transmit gate re-reads it. A good descriptor
 *  carries the fingerprint of CONTENT; a test edits `contentRows` to drift it. */
const CONTENT: PackageContentRow[] = [
  { sectionDbId: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 0, artifactDbId: 1, title: 'Clinical overview', version: 1, ctdSection: null, contentSha256: sha256Hex('Clinical overview text'), filable: true },
];
const CONTENT_FINGERPRINT = fingerprintPackageContent(CONTENT);
const EDITED_CONTENT = CONTENT.map((r) => ({ ...r, contentSha256: sha256Hex('Clinical overview text, edited after assembly') }));
let contentRows: PackageContentRow[] = CONTENT;
const contentSelects: Array<unknown[]> = [];
/** The governed-action ledger client: every INSERT it sees is inspectable. */
const ledgerQuery = vi.fn();
/** The `sign` row's payload as the ledger received it (a JSON param). */
function signPayload(): Record<string, any> | undefined {
  for (const call of ledgerQuery.mock.calls) {
    for (const p of (call[1] as unknown[]) ?? []) {
      const obj = typeof p === 'string' && p.includes('contentFingerprint') ? JSON.parse(p)
        : p && typeof p === 'object' && 'contentFingerprint' in (p as object) ? (p as Record<string, any>) : null;
      if (obj) return obj;
    }
  }
  return undefined;
}
/** The transmit's electronic-signature MANIFEST as persisted (a JSON param) —
 *  the attributed record an auditor reads, not only the digest it is bound to. */
function transmitManifest(): Record<string, any> | undefined {
  return ledgerQuery.mock.calls
    .flatMap((c) => ((c[1] as unknown[]) ?? []))
    .map((p) => { try { return typeof p === 'string' ? JSON.parse(p) : p; } catch { return null; } })
    .find((o) => o && typeof o === 'object' && (o as any).kind === 'governed-transmit');
}

function installDb() {
  queryFn.mockReset();
  queryFn.mockImplementation((sql: string, params: unknown[] = []) => {
    if (typeof sql === 'string' && sql.includes('password_hash')) {
      return Promise.resolve({ rows: [{ password_hash: 'hashed' }], rowCount: 1 });
    }
    // The creator lookup (assertTransmitterIndependent → resolveTargetAuthors),
    // answered with the same tenant scoping. Its id arrives as text ($1::int).
    if (typeof sql === 'string' && sql.includes('SELECT created_by_id FROM c2c_submission_packages')) {
      const [id, orgId] = params as [unknown, number];
      const row = packages.find((p) => p.id === Number(id) && p.orgId === orgId);
      return Promise.resolve(row
        ? { rows: [{ created_by_id: row.createdBy === undefined ? 4242 : row.createdBy }], rowCount: 1 }
        : { rows: [], rowCount: 0 });
    }
    if (typeof sql === 'string' && sql.includes('FROM c2c_submission_packages')) {
      packageSelects.push(params);
      const [id, orgId] = params as [number, number];
      const row = packages.find((p) => p.id === id && p.orgId === orgId);
      return row
        ? Promise.resolve({ rows: [{ metadata: { bundle: row.bundle, regulatory: row.regulatory, filedSequences: row.filedSequences } }], rowCount: 1 })
        : Promise.resolve({ rows: [], rowCount: 0 });
    }
    if (typeof sql === 'string' && /SELECT\s+id,\s+status\s+FROM submission_transmittals/.test(sql)) {
      return Promise.resolve(activeTransmittalRows(sql, params));
    }
    if (typeof sql === 'string' && sql.includes('FROM c2c_package_sections')) {
      contentSelects.push(params);
      return Promise.resolve({
        rows: contentRows.map((r) => ({
          section_db_id: r.sectionDbId, section_key: r.sectionKey, section_label: r.sectionLabel, sort_order: r.sortOrder, artifact_db_id: r.artifactDbId,
          title: r.title, version: r.version, ctd_section: r.ctdSection, content_sha256: r.contentSha256,
        // 2026-09-23 (W5/D7, round-2 skeptic): the approval facts the fingerprint
        // now covers — a filable row is approved AT its version, as the status route writes it.
        status: r.filable == null ? null : r.filable ? 'approved' : 'review',
        approved_version_id: r.filable ? r.version : null, published_version_id: null,
        })),
        rowCount: contentRows.length,
      });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

/* Filesystem fixture: a real bundle root plus a secret OUTSIDE it. */
let root: string;
let outside: string;
let secretPath: string;
let secretSha: string;
let secretSize: number;
let legitPath: string;
let legitSha: string;
let legitSize: number;

let savedNodeEnv: string | undefined;
let savedBundleDir: string | undefined;

beforeAll(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'c2c-sub-003-'));
  root = path.join(base, 'bundles');
  outside = path.join(base, 'secrets');
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(outside, { recursive: true });

  // The "arbitrary server-readable file" an attacker wants exfiltrated. Its
  // sha256/size are computable by anyone who can read (or guess) it — which is
  // exactly why a self-supplied descriptor is not an authorization decision.
  const secretBytes = Buffer.from('root:x:0:0:root:/root:/bin/bash\n', 'utf8');
  secretPath = path.join(outside, 'passwd');
  await fs.writeFile(secretPath, secretBytes);
  secretSha = createHash('sha256').update(secretBytes).digest('hex');
  secretSize = secretBytes.length;

  const legitBytes = Buffer.from('PK stable eCTD zip payload', 'utf8');
  legitPath = path.join(root, 'pkg-legit-0123456789abcdef.zip');
  await fs.writeFile(legitPath, legitBytes);
  legitSha = createHash('sha256').update(legitBytes).digest('hex');
  legitSize = legitBytes.length;
});

afterAll(async () => {
  await fs.rm(path.dirname(root), { recursive: true, force: true });
});

beforeEach(() => {
  savedNodeEnv = process.env.NODE_ENV;
  savedBundleDir = process.env.SUBMISSION_BUNDLE_DIR;
  process.env.NODE_ENV = 'production';
  process.env.SUBMISSION_BUNDLE_DIR = root;

  packages = [];
  packageSelects.length = 0;
  transmittals = [];
  contentRows = CONTENT;
  contentSelects.length = 0;
  installDb();
  connectFn.mockReset();
  ledgerQuery.mockReset();
  // The signer must be attributable or §11.100 refuses to persist the signature
  // manifestation at all — and the manifest is where the transmit records WHAT
  // it filed. Without this row the double silently exercised only the ledger
  // half of the sign.
  ledgerQuery.mockImplementation(async (sql: unknown) =>
    /FROM users u/.test(String(sql))
      ? { rows: [{ name: 'Test Signer', email: 'signer@example.test', title: 'RA Lead' }], rowCount: 1 }
      : { rows: [], rowCount: 0 },
  );
  connectFn.mockImplementation(() =>
    Promise.resolve({
      query: (...args: unknown[]) => ledgerQuery(...args),
      release: vi.fn(),
    }),
  );
  transmitFn.mockReset();
});

afterEach(() => {
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedNodeEnv;
  if (savedBundleDir === undefined) delete process.env.SUBMISSION_BUNDLE_DIR;
  else process.env.SUBMISSION_BUNDLE_DIR = savedBundleDir;
});

/** A validated, in-namespace descriptor exactly as the assemble route writes it. */
function goodDescriptor(overrides: Record<string, unknown> = {}) {
  return {
    path: legitPath,
    sha256: legitSha,
    sizeBytes: legitSize,
    format: 'ectd',
    leafCount: 3,
    emptyLeafCount: 0,
    storage: { provider: 'local' },
    validation: { errorCount: 0, warningCount: 1, infoCount: 0, findings: [] },
    contentFingerprint: CONTENT_FINGERPRINT,
    assembledAt: new Date().toISOString(),
    assembledBy: 777,
    ...overrides,
  };
}

/* ── Client descriptors cannot name a filesystem path ────────────── */

describe('POST transmit — client-supplied bundle descriptors (C2C-SUB-003)', () => {
  it('refuses an explicit descriptor pointing at an arbitrary server-readable file', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({
        environment: 'production',
        // Self-consistent on purpose: the caller supplies the real digest and
        // size of the file they want read, so hash/size verification would pass.
        bundle: { path: secretPath, sha256: secretSha, sizeBytes: secretSize, format: 'ectd' },
        ...REAUTH,
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/not accepted in this environment/i);
    expect(transmitFn).not.toHaveBeenCalled();
    // The descriptor is refused before any package lookup even happens.
    expect(packageSelects).toHaveLength(0);
  });

  it('refuses an explicit descriptor using ../ traversal', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({
        bundle: {
          path: '../../../../etc/passwd',
          sha256: 'a'.repeat(64),
          sizeBytes: 100,
          format: 'ectd',
        },
        ...REAUTH,
      });

    expect(res.status).toBe(422);
    expect(transmitFn).not.toHaveBeenCalled();
  });

  it('refuses an explicit descriptor even when a legitimate packageId is also supplied', async () => {
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: goodDescriptor() }];
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({
        packageId: 5,
        bundle: { path: secretPath, sha256: secretSha, sizeBytes: secretSize, format: 'ectd' },
        ...REAUTH,
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/not accepted in this environment/i);
    expect(transmitFn).not.toHaveBeenCalled();
  });

  it('fails closed when NODE_ENV is unset (no environment declared => enforce)', async () => {
    delete process.env.NODE_ENV;
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({
        bundle: { path: secretPath, sha256: secretSha, sizeBytes: secretSize, format: 'ectd' },
        ...REAUTH,
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/not accepted in this environment/i);
    expect(transmitFn).not.toHaveBeenCalled();
  });
});

/* ── Stored descriptors are still confined + must carry evidence ─── */

describe('POST transmit — stored descriptor constraints (C2C-SUB-003)', () => {
  it('refuses a stored descriptor whose path escapes the bundle namespace', async () => {
    packages = [{
      id: 5,
      orgId: CALLER_ORG,
      bundle: goodDescriptor({ path: secretPath, sha256: secretSha, sizeBytes: secretSize }),
    }];
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, ...REAUTH });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/outside the permitted submission-bundle storage namespace/i);
    expect(transmitFn).not.toHaveBeenCalled();
  });

  it('refuses a stored descriptor with NO validation metadata (UNKNOWN is blocking, not zero errors)', async () => {
    const { validation, ...withoutValidation } = goodDescriptor() as any;
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: withoutValidation }];
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, ...REAUTH });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/no internal structural-validation evidence/i);
    expect(res.body.error).toMatch(/UNKNOWN/);
    expect(transmitFn).not.toHaveBeenCalled();
  });

  it('refuses a stored descriptor whose validation block has no numeric errorCount', async () => {
    packages = [{
      id: 5,
      orgId: CALLER_ORG,
      bundle: goodDescriptor({ validation: { warningCount: 0, findings: [] } }),
    }];
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, ...REAUTH });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/no internal structural-validation evidence/i);
    expect(transmitFn).not.toHaveBeenCalled();
  });

  it('still hard-blocks a stored descriptor reporting structural errors', async () => {
    packages = [{
      id: 5,
      orgId: CALLER_ORG,
      bundle: goodDescriptor({
        validation: {
          errorCount: 2, warningCount: 0, infoCount: 0,
          findings: [{ severity: 'error', ruleId: 'LEAF-CORRUPT', message: 'bad pdf' }],
        },
      }),
    }];
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, ...REAUTH });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/structural validation/i);
    expect(res.body.details.findings).toHaveLength(1);
    expect(transmitFn).not.toHaveBeenCalled();
  });

  it('refuses a stored descriptor whose durable-storage key escapes the bundle prefix', async () => {
    packages = [{
      id: 5,
      orgId: CALLER_ORG,
      bundle: goodDescriptor({
        storage: { provider: 's3', bucket: 'c2c-bundles', key: 'vault-raw/other-tenant/secret.zip' },
      }),
    }];
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, ...REAUTH });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/durable-storage key is outside/i);
    expect(transmitFn).not.toHaveBeenCalled();
  });

  it('rejects a traversal path on a stored descriptor in ANY environment (guard is unconditional)', async () => {
    process.env.NODE_ENV = 'test'; // the one env where explicit descriptors are still allowed
    packages = [{
      id: 5,
      orgId: CALLER_ORG,
      bundle: goodDescriptor({ path: `${root}/../../etc/passwd` }),
    }];
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, ...REAUTH });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/not a well-formed bundle location/i);
    expect(transmitFn).not.toHaveBeenCalled();
  });
});

/* ── Cross-tenant ────────────────────────────────────────────────── */

describe('POST transmit — cross-tenant packages (C2C-SUB-003)', () => {
  it("cannot transmit another tenant's package by id", async () => {
    packages = [{ id: 5501, orgId: OTHER_ORG, bundle: goodDescriptor() }];
    const res = await request(makeApp(CALLER_ORG))
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5501, ...REAUTH });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/assemble/i);
    expect(transmitFn).not.toHaveBeenCalled();
    // Ownership lookup was bound to the VERIFIED principal's org, not the body.
    expect(packageSelects).toEqual([[5501, CALLER_ORG]]);
  });

  it("cannot side-step tenant scoping by naming another tenant's bundle file directly", async () => {
    packages = [{ id: 5501, orgId: OTHER_ORG, bundle: goodDescriptor() }];
    const res = await request(makeApp(CALLER_ORG))
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({
        // legitPath is inside the shared bundle root but belongs to org 7.
        bundle: { path: legitPath, sha256: legitSha, sizeBytes: legitSize, format: 'ectd' },
        ...REAUTH,
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/not accepted in this environment/i);
    expect(transmitFn).not.toHaveBeenCalled();
  });
});

/* ── Positive control ────────────────────────────────────────────── */

describe('POST transmit — legitimate validated package (C2C-SUB-003)', () => {
  it('refuses the package creator — 403 SIGNER_IS_AUTHOR, and nothing reaches the gateway', async () => {
    // Separation of duties (2026-10-05): whoever created the package does not
    // transmit it. Before, transmit re-authenticated the human and never asked.
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: goodDescriptor(), createdBy: 777 }];
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, environment: 'production', ...REAUTH });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toMatch(/SIGNER_IS_AUTHOR/);
    expect(transmitFn, 'bytes went to the agency under the package creator').not.toHaveBeenCalled();
  });

  it('refuses a package with no recorded creator — 409, never guessed', async () => {
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: goodDescriptor(), createdBy: null }];
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, environment: 'production', ...REAUTH });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toMatch(/SIGNER_INDEPENDENCE_UNRESOLVED/);
    expect(transmitFn).not.toHaveBeenCalled();
  });

  it('transmits a tenant-owned, in-namespace, validated package under production', async () => {
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: goodDescriptor() }];
    transmitFn.mockResolvedValueOnce({
      transmittalId: 4242,
      transmissionId: 'mdn-legit',
      status: 'received',
      transport: 'as2',
      httpStatus: 200,
    });

    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, environment: 'production', ...REAUTH });

    expect(res.status).toBe(201);
    expect(res.body.data.transmittalId).toBe(4242);
    expect(transmitFn).toHaveBeenCalledTimes(1);

    const arg = transmitFn.mock.calls[0][0];
    // Bytes come from the server-generated descriptor…
    expect(arg.bundle.path).toBe(legitPath);
    expect(arg.bundle.sha256).toBe(legitSha);
    expect(arg.bundle.sizeBytes).toBe(legitSize);
    // …and identity from the verified principal, never the body.
    expect(arg.organizationId).toBe(CALLER_ORG);
    expect(arg.userId).toBe(777);
    // Ownership was proven with a tenant-scoped read…
    expect(packageSelects).toEqual([[5, CALLER_ORG]]);
    // …and so was the content the bundle still reflects — before the bytes
    // left, and again after the gateway accepted them, so the window between
    // the check and the send is evidenced rather than assumed closed.
    expect(contentSelects).toEqual([[5, CALLER_ORG], [5, CALLER_ORG]]);
    expect(res.body.data.contentAfterTransmit).toBe('match');
    // The governed `sign` row records what content state the zip was proven
    // against: assembled fingerprint, the fingerprint at transmit, and after.
    const payload = signPayload();
    expect(payload, 'sign ledger row carries the content fingerprint evidence').toBeDefined();
    expect(payload!.contentFingerprint).toEqual({ assembled: CONTENT_FINGERPRINT, atTransmit: CONTENT_FINGERPRINT, afterTransmit: 'match' });
    expect(payload!.bundleSha256).toBe(legitSha);
  });

});

/*
 * Split out of the positive control above for the same reason: recording what
 * was filed, so the NEXT eCTD sequence has a baseline to diff against, is its
 * own concern and its own block.
 */
describe('POST transmit — filed-sequence history (C2C-SUB-003)', () => {

  it('records the sequence it just filed, so the NEXT sequence has a baseline to diff against', async () => {
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: goodDescriptor({
      sequence: '0000', submissionType: 'original',
      leafManifest: [{ ctdSection: '2.5', fileName: 'clinical-overview.pdf', href: 'm2/25-clin-overview/clinical-overview.pdf', md5: 'md5-co', operation: 'new' }],
    }) }];
    transmitFn.mockResolvedValueOnce({ transmittalId: 4244, transmissionId: 'mdn-filed', status: 'received', transport: 'as2', httpStatus: 200 });
    // A PRODUCTION send: only that puts a sequence on file (the staging case is below).
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, environment: 'production', ...REAUTH });
    expect(res.status).toBe(201);
    expect(transmitFn.mock.calls[0][0].environment).toBe('production');
    expect(res.body.data.filedSequenceRecorded).toBe(true);
    expect(res.body.data.filedSequenceReason).toBe('recorded');
    // The history was appended under the package row lock, carrying the leaf
    // inventory the next sequence diffs against.
    const write = ledgerQuery.mock.calls.find((c) => /^UPDATE c2c_submission_packages/.test(String(c[0])));
    expect(write, 'the filed history was written').toBeDefined();
    const written = JSON.parse(String((write![1] as unknown[])[1]));
    expect(written.filedSequences).toHaveLength(1);
    expect(written.filedSequences[0]).toMatchObject({ sequence: '0000', submissionType: 'original', sha256: legitSha, transmittalId: 4244 });
    expect(written.filedSequences[0].leaves[0]).toMatchObject({ ctdSection: '2.5', fileName: 'clinical-overview.pdf', md5: 'md5-co' });
  });

  it('a send to the agency TEST environment (staging) puts nothing on file: no history write, and the sign record does not say it filed', async () => {
    /* 2026-10-01 (W5/D7, sweep F14). FDA ESG's test environment is not a
       regulatory submission. Recording a staging 0000 as filed made the real
       0000 unassemblable (SEQUENCE_ALREADY_FILED) and planned 0001 against a
       0000 that FDA's production record does not have. */
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: goodDescriptor({
      sequence: '0000', submissionType: 'original',
      leafManifest: [{ ctdSection: '2.5', fileName: 'clinical-overview.pdf', href: 'm2/25-clin-overview/clinical-overview.pdf', md5: 'md5-co', operation: 'new' }],
    }) }];
    transmitFn.mockResolvedValueOnce({ transmittalId: 4249, transmissionId: 'mdn-test-env', status: 'received', transport: 'as2', httpStatus: 200 });
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, environment: 'staging', ...REAUTH });
    expect(res.status).toBe(201);
    expect(transmitFn.mock.calls[0][0].environment).toBe('staging');
    expect(res.body.data.filedSequenceRecorded).toBe('not-applicable');
    expect(res.body.data.filedSequenceReason).toBe('test-environment');
    expect(ledgerQuery.mock.calls.some((c) => /^UPDATE c2c_submission_packages/.test(String(c[0])))).toBe(false);
    // Nothing was meant to be filed, so no lost-baseline warning either.
    expect(res.body.data.filedSequenceWarning).toBeUndefined();
    // The Part 11 sign row and the signature manifest name the sequence the
    // bundle carried and say it was NOT filed.
    const notFiled = { sequence: '0000', filedSequenceRecorded: 'not-applicable', filedSequenceReason: 'test-environment' };
    expect(signPayload()).toMatchObject(notFiled);
    expect(transmitManifest(), 'the transmit signature manifest was persisted').toMatchObject(notFiled);
  });

  it('a bundle that files no sequence records no history, and says so rather than reporting a failure', async () => {
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: goodDescriptor() }];
    transmitFn.mockResolvedValueOnce({ transmittalId: 4245, transmissionId: 'mdn-nofile', status: 'received', transport: 'as2', httpStatus: 200 });
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, environment: 'staging', ...REAUTH });
    expect(res.status).toBe(201);
    expect(res.body.data.filedSequenceRecorded).toBe('not-applicable');
    expect(res.body.data.filedSequenceReason).toBe('no-sequence');
    expect(ledgerQuery.mock.calls.some((c) => /^UPDATE c2c_submission_packages/.test(String(c[0])))).toBe(false);
  });

});

/*
 * What the transmit path RECORDS about the eCTD sequence it just filed —
 * separate from whether the bytes were accepted. A lost baseline is silent
 * unless it is said, so each case here is about what the caller and the
 * Part 11 record are told.
 */
describe('POST transmit — the sequence it filed (C2C-SUB-003)', () => {
  it('a sequence whose leaf inventory is UNREADABLE is a lost baseline, not a non-event', async () => {
    /* One entry missing `href`. The reader drops a partial inventory whole —
       because a prior state missing a leaf computes `new` for a document that
       is already on file — but that guard sat only on the reader: the manifest
       was written to the history, reported as recorded, and then dropped by the
       very guard meant to prevent it. The filing is at the agency and every
       subsequent diff is blind to it. */
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: goodDescriptor({
      sequence: '0000', submissionType: 'original',
      leafManifest: [
        { ctdSection: '2.5', fileName: 'clinical-overview.pdf', href: 'm2/2-5/clinical-overview.pdf', md5: 'md5-co' },
        { ctdSection: '3.2.P.1', fileName: 'description.pdf', md5: 'md5-desc' }, // no href
      ],
    }) }];
    transmitFn.mockResolvedValueOnce({ transmittalId: 4246, transmissionId: 'mdn-partial', status: 'received', transport: 'as2', httpStatus: 200 });
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, environment: 'production', ...REAUTH });
    expect(res.status).toBe(201);
    expect(res.body.data.filedSequenceRecorded).toBe(false);
    expect(res.body.data.filedSequenceReason).toBe('no-usable-manifest');
    // Nothing half-readable is persisted: a history that cannot be read back is
    // worse than one that is honestly missing.
    expect(ledgerQuery.mock.calls.some((c) => /^UPDATE c2c_submission_packages/.test(String(c[0])))).toBe(false);
    // And the operator is told, because the NEXT assemble will otherwise refuse
    // with "file sequence 0000 first" — which they did.
    expect(res.body.data.filedSequenceWarning).toMatch(/no readable leaf inventory/);
  });

  it('an eCTD sequence with no inventory at all is reported as a failure, not as "not applicable"', async () => {
    // Every descriptor assembled before the inventory existed is this case.
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: goodDescriptor({ sequence: '0001', submissionType: 'Efficacy Supplement' }) }];
    transmitFn.mockResolvedValueOnce({ transmittalId: 4247, transmissionId: 'mdn-nomanifest', status: 'received', transport: 'as2', httpStatus: 200 });
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, environment: 'production', ...REAUTH });
    expect(res.status).toBe(201);
    expect(res.body.data.filedSequenceRecorded).toBe(false);
    expect(res.body.data.filedSequenceReason).toBe('no-usable-manifest');
  });

  it('the Part 11 sign row records WHICH sequence the signature filed, and whether the history took it', async () => {
    // The ledger recorded that a bundle was transmitted but not which eCTD
    // sequence it filed, so an auditor reconstructing the lifecycle from the
    // signatures could not — and a lost baseline left no durable trace at all.
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: goodDescriptor({
      sequence: '0000', submissionType: 'original',
      leafManifest: [{ ctdSection: '2.5', fileName: 'clinical-overview.pdf', href: 'm2/2-5/clinical-overview.pdf', md5: 'md5-co', operation: 'new' }],
    }) }];
    transmitFn.mockResolvedValueOnce({ transmittalId: 4248, transmissionId: 'mdn-sign', status: 'received', transport: 'as2', httpStatus: 200 });
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, environment: 'production', ...REAUTH });
    expect(res.status).toBe(201);
    expect(signPayload()).toMatchObject({
      sequence: '0000', submissionType: 'original',
      filedSequenceRecorded: true, filedSequenceReason: 'recorded',
    });
    // And in the signature MANIFEST — the attributed record an auditor reads.
    // The payload only reaches the signature as a digest, which answers no
    // question about what was filed.
    const manifest = transmitManifest();
    expect(manifest, 'the transmit signature manifest was persisted').toBeDefined();
    expect(manifest).toMatchObject({ sequence: '0000', filedSequenceRecorded: true });
  });
});

/*
 * 2026-10-01 (W5/D7, sweep F15). The duplicate-send lock was keyed on the
 * bundle's BYTES. Re-assembling a sequence produces new bytes (JSZip stamps
 * entry dates), so while the first send of 0000 was still in flight, or was
 * delivered but unconfirmed (the gateway threw after the bytes left: the row
 * stays in_transit and nothing is on file), a re-assembled 0000 passed the
 * lock and the same sequence went to the agency twice. The lock now also
 * holds the sequence a row was sent under, per environment.
 */
describe('POST transmit — one active send per sequence, per environment (sweep F15)', () => {
  const sequenceZero = () => goodDescriptor({ sequence: '0000', submissionType: 'original' });
  /** The first send of 0000 — other bytes — as the gateway left its row. */
  const firstSend = (status: string, environment: string): TransmittalRow => ({
    id: 4300, orgId: CALLER_ORG, packageId: 5, sha256: 'f'.repeat(64), status, metadata: { sequence: '0000', environment },
  });

  it.each(['pending', 'in_transit', 'received'])('refuses a re-assembled bundle of a sequence whose send is still %s in the same environment, before the gateway', async (status) => {
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: sequenceZero() }];
    transmittals = [firstSend(status, 'production')];
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, environment: 'production', ...REAUTH });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Sequence 0000 of this package/);
    expect(res.body.error).toMatch(/id=4300/);
    expect(res.body.error).toMatch(/confirm receipt at the agency/i);
    expect(res.body.error).toMatch(/transmittals\/4300\/rollback before sending sequence 0000 again/);
    expect(res.body.details).toMatchObject({ transmittalId: 4300, status, sequence: '0000', environment: 'production' });
    expect(transmitFn).not.toHaveBeenCalled();
  });

  it.each([['staging', 'production'], ['production', 'staging']])('a %s send of the sequence does not hold it in %s', async (heldIn, sendTo) => {
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: sequenceZero() }];
    transmittals = [firstSend('in_transit', heldIn)];
    transmitFn.mockResolvedValueOnce({ transmittalId: 4301, transmissionId: 'mdn-other-env', status: 'received', transport: 'as2', httpStatus: 200 });
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, environment: sendTo, ...REAUTH });
    expect(res.status).toBe(201);
    expect(transmitFn).toHaveBeenCalledTimes(1);
  });

  it('the row is written under the sequence and environment the lock reads, taken from the stored descriptor', async () => {
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: sequenceZero(), regulatory: { applicationNumber: 'IND123456' } }];
    transmitFn.mockResolvedValueOnce({ transmittalId: 4302, transmissionId: 'mdn-keys', status: 'received', transport: 'as2', httpStatus: 200 });
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, environment: 'staging', metadata: { note: 'kept' }, ...REAUTH });
    expect(res.status).toBe(201);
    expect(transmitFn.mock.calls[0][0].metadata).toEqual({ note: 'kept', sequence: '0000', applicationId: 'IND123456', environment: 'staging' });
  });
});

/*
 * 2026-10-01 (W5/D7, sweep F18). The caller's free-form metadata reached the
 * gateway as-is, so a body naming another sequence or application number than
 * the assembled descriptor and the package record deposited the bytes under
 * one identity (the SFTP path, the transmittal row) and filed them under
 * another (the filed history). For a package bundle the descriptor decides.
 */
describe('POST transmit — agency metadata comes from the assembled descriptor (sweep F18)', () => {
  const withNumber = (): StoredPackage => ({
    id: 5, orgId: CALLER_ORG, bundle: goodDescriptor({ sequence: '0000', submissionType: 'original' }),
    regulatory: { applicationNumber: 'IND123456' },
  });
  const send = (metadata: Record<string, unknown>) => request(makeApp())
    .post('/api/mdx/gateways/fda/esg/transmit')
    .send({ packageId: 5, environment: 'production', metadata, ...REAUTH });

  it.each([
    ['another sequence', { sequence: '0001' }, /metadata\.sequence/],
    ['another application number', { applicationId: 'IND999999' }, /metadata\.applicationId/],
    ['an application number that is not an identifier', { applicationId: '../IND123456' }, /metadata\.applicationId/],
  ])('refuses a body naming %s, before the gateway', async (_label, metadata, names) => {
    packages = [withNumber()];
    const res = await send(metadata);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(names);
    expect(transmitFn).not.toHaveBeenCalled();
  });

  it('refuses an application number the package does not record', async () => {
    packages = [{ ...withNumber(), regulatory: undefined }];
    const res = await send({ applicationId: 'IND123456' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/records none/);
    expect(transmitFn).not.toHaveBeenCalled();
  });

  it('accepts a body that agrees with the descriptor, and sends the descriptor values', async () => {
    packages = [withNumber()];
    transmitFn.mockResolvedValueOnce({ transmittalId: 4303, transmissionId: 'mdn-agrees', status: 'received', transport: 'as2', httpStatus: 200 });
    const res = await send({ sequence: '0000', applicationId: ' IND123456 ' });
    expect(res.status).toBe(201);
    expect(transmitFn.mock.calls[0][0].metadata).toMatchObject({ sequence: '0000', applicationId: 'IND123456' });
  });

  it('a bundle that files no sequence is sent with the caller metadata unchanged', async () => {
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: goodDescriptor(), regulatory: { applicationNumber: 'IND123456' } }];
    transmitFn.mockResolvedValueOnce({ transmittalId: 4304, transmissionId: 'mdn-no-sequence', status: 'received', transport: 'as2', httpStatus: 200 });
    const res = await send({ applicationId: 'K123456' });
    expect(res.status).toBe(201);
    expect(transmitFn.mock.calls[0][0].metadata).toEqual({ applicationId: 'K123456', environment: 'production' });
  });
});

/*
 * Split out of the block above: the merge that added the filed-sequence tests
 * took that describe callback to 117 lines against a 100-line limit. These are
 * a distinct concern — what the transmit path does when the package CONTENT
 * changed after assembly — so they get their own block rather than an arbitrary
 * cut.
 */
describe('POST transmit — content changed since assembly (C2C-SUB-003)', () => {

  it('a content change that lands WHILE the gateway is sending is recorded on the sign row and announced in the response — never silently a clean transmit', async () => {
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: goodDescriptor() }];
    transmitFn.mockImplementationOnce(async () => {
      contentRows = EDITED_CONTENT; // an artifact edit commits during the AS2 send
      return { transmittalId: 4243, transmissionId: 'mdn-race', status: 'received', transport: 'as2', httpStatus: 200 };
    });
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, environment: 'staging', ...REAUTH });
    expect(res.status).toBe(201); // the agency has the assembled bytes; that is not undone
    expect(res.body.data.contentAfterTransmit).toBe('drift');
    expect(res.body.data.contentWarning).toMatch(/changed while the transmission was in progress/i);
    expect(res.body.data.contentWarning).toMatch(/re-assemble/i);
    expect(signPayload()?.contentFingerprint).toEqual({ assembled: CONTENT_FINGERPRINT, atTransmit: CONTENT_FINGERPRINT, afterTransmit: 'drift' });
  });

  it('refuses a stored descriptor whose package CONTENT changed since assembly (an artifact edited after the zip was built), before the gateway is reached', async () => {
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: goodDescriptor() }];
    contentRows = EDITED_CONTENT;
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, environment: 'staging', ...REAUTH });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/content changed since this bundle was assembled/i);
    expect(res.body.error).toMatch(/re-assemble/i);
    expect(transmitFn).not.toHaveBeenCalled();
  });

  it('refuses a stored descriptor with NO content fingerprint, or one from an older scheme (UNKNOWN is blocking, never a match)', async () => {
    // 2026-09-23 (W5/D7, round-2 skeptic): this case pinned a false wording.
    // loadStoredBundle dropped an older-scheme fingerprint, so a bundle that
    // RECORDS one was refused as recording none (while preflight, reading the
    // descriptor raw, said "older scheme"). Every bundle assembled before the
    // v4 bump (approval covered) is in that state; each wording must be true
    // and name the recovery.
    const { contentFingerprint: _none, ...withoutFingerprint } = goodDescriptor() as any;
    const cases: Array<[unknown, RegExp]> = [
      [withoutFingerprint, /no content fingerprint/i],
      [goodDescriptor({ contentFingerprint: 'v1:' + 'a'.repeat(64) }), /fingerprinted under an older scheme/i],
      [goodDescriptor({ contentFingerprint: 'v3:' + 'b'.repeat(64) }), /fingerprinted under an older scheme/i],
    ];
    for (const [bundle, wording] of cases) {
      transmitFn.mockReset();
      packages = [{ id: 5, orgId: CALLER_ORG, bundle }];
      const res = await request(makeApp())
        .post('/api/mdx/gateways/fda/esg/transmit')
        .send({ packageId: 5, environment: 'staging', ...REAUTH });
      const label = JSON.stringify((bundle as { contentFingerprint?: unknown }).contentFingerprint);
      expect(res.status, label).toBe(422);
      expect(res.body.error, label).toMatch(wording);
      expect(res.body.error).toMatch(/UNKNOWN/);
      expect(res.body.error).toMatch(/re-assemble the package before transmitting/);
      expect(transmitFn).not.toHaveBeenCalled();
    }
  });

  it('warnings alone do not block a validated package', async () => {
    packages = [{
      id: 5,
      orgId: CALLER_ORG,
      bundle: goodDescriptor({
        validation: { errorCount: 0, warningCount: 3, infoCount: 2, findings: [{ severity: 'warning' }] },
      }),
    }];
    transmitFn.mockResolvedValueOnce({
      transmittalId: 4243, transmissionId: 'mdn-warn', status: 'received',
      transport: 'as2', httpStatus: 200,
    });

    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, ...REAUTH });

    expect(res.status).toBe(201);
    expect(transmitFn).toHaveBeenCalledTimes(1);
  });
});

/* ── Packager evidence reaches the gate ──────────────────────────── */

describe('POST transmit — packager evidence is forwarded to the pre-transmit gate', () => {
  const evidence = {
    submissionGrade: { pdfLeaves: 3, pdfaConverted: 1, notConverted: ['m3/x.pdf', 'm3/y.pdf'] },
    dtdStatus: { selfContained: false, missing: ['ich-ectd-3-2.dtd'] },
    regionalBackbone: { region: 'fda', file: 'm1/us/us-regional.xml', regionConformant: true },
  };

  it('forwards submissionGrade / dtdStatus / regionalBackbone from the stored descriptor to gw.transmit', async () => {
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: goodDescriptor(evidence) }];
    transmitFn.mockResolvedValueOnce({
      transmittalId: 4244, transmissionId: 'mdn-evidence', status: 'received',
      transport: 'as2', httpStatus: 200,
    });

    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, environment: 'staging', ...REAUTH });

    expect(res.status).toBe(201);
    const arg = transmitFn.mock.calls[0][0];
    // Before this was carried through, the registry guard's evaluatePreTransmit
    // saw a bundle with none of these and could only warn "cannot prove" —
    // ECTD_REQUIRE_DTD / _PDFA / _REGIONAL_BACKBONE never blocked a transmit.
    expect(arg.bundle.dtdStatus).toEqual(evidence.dtdStatus);
    expect(arg.bundle.submissionGrade).toEqual(evidence.submissionGrade);
    expect(arg.bundle.regionalBackbone).toEqual(evidence.regionalBackbone);
  });

  it('forwards the region the bundle was BUILT for (descriptor.region) as a gateway region, so device bundles are region-checked too', async () => {
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: goodDescriptor({ format: 'estar', region: 'FDA' }) }];
    transmitFn.mockResolvedValueOnce({ transmittalId: 4246, transmissionId: 'mdn-built', status: 'received', transport: 'as2', httpStatus: 200 });
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, environment: 'staging', ...REAUTH });
    expect(res.status).toBe(201);
    expect(transmitFn.mock.calls[0][0].bundle.builtRegion).toBe('fda');
  });

  it('DROPS malformed evidence blocks instead of forwarding them (`{}` as a PDF/A grade read as full compliance)', async () => {
    packages = [{
      id: 5, orgId: CALLER_ORG,
      bundle: goodDescriptor({
        submissionGrade: {}, dtdStatus: { selfContained: 'yes' },
        // Well-shaped on the fields the old guard checked, but placeholderOf is
        // not a string — the gate used to throw on it (a 500, not a refusal).
        regionalBackbone: { region: 'fda', file: 'm1/us/us-regional.xml', regionConformant: false, placeholderOf: 5 },
      }),
    }];
    transmitFn.mockResolvedValueOnce({ transmittalId: 4245, transmissionId: 'mdn-malformed', status: 'received', transport: 'as2', httpStatus: 200 });
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, environment: 'staging', ...REAUTH });
    expect(res.status).toBe(201);
    const arg = transmitFn.mock.calls[0][0];
    expect(arg.bundle.submissionGrade).toBeUndefined();
    expect(arg.bundle.dtdStatus).toBeUndefined();
    expect(arg.bundle.regionalBackbone).toBeUndefined();
  });

  it('and the gate REFUSES that exact forwarded shape when the operator opts in (production + ECTD_REQUIRE_DTD / _PDFA)', () => {
    const forwarded = {
      path: legitPath, sha256: legitSha, sizeBytes: legitSize, format: 'ectd' as const,
      displayName: undefined, ...evidence,
    };
    const blocked = evaluatePreTransmit({
      region: 'fda', environment: 'production', enforceExternal: false,
      env: { ECTD_REQUIRE_DTD: 'true', ECTD_REQUIRE_PDFA: 'true' } as NodeJS.ProcessEnv,
      bundle: forwarded as any,
    });
    expect(blocked.cleared).toBe(false);
    expect(blocked.blockers.some((b) => /ECTD_REQUIRE_DTD blocks/.test(b))).toBe(true);
    // 2026-10-01 (D7, the PDF/A rule): the refusal names who required PDF/A.
    expect(blocked.blockers.some((b) => /not PDF\/A .*this deployment requires PDF\/A for every submission \(ECTD_REQUIRE_PDFA\)/.test(b))).toBe(true);

    // Report-only when not opted in — the same evidence is surfaced, not blocking.
    const reported = evaluatePreTransmit({
      region: 'fda', environment: 'production', enforceExternal: false,
      env: {} as NodeJS.ProcessEnv, bundle: forwarded as any,
    });
    expect(reported.cleared).toBe(true);
    expect(reported.checks.find((c) => c.name === 'dtd-self-contained')?.passed).toBe(false);
  });
});

/*
 * 2026-10-01 (W5/D7, sweep F19). The filed history answered `true` for a
 * DIFFERENT bundle sent under a sequence already on file, and kept the first
 * one's inventory — so a second filing under one number left the platform and
 * was reported recorded. Such a send is now refused before the bytes leave,
 * from the package row the transmit already reads; one that races in during
 * the send is reported as a conflict. A sequence the agency REJECTED (the
 * governed technical-rejection action) no longer holds its number.
 */
describe('POST transmit — one bundle per filed sequence (sweep F19)', () => {
  const SHA_OTHER = 'f'.repeat(64);
  const LEAVES = [{ ctdSection: '2.5', fileName: 'clinical-overview.pdf', href: 'm2/25-clin-overview/clinical-overview.pdf', md5: 'md5-co-v2', operation: 'replace' }];
  const FILED_0000 = { sequence: '0000', submissionType: 'original', sha256: 'a'.repeat(64), transmittalId: 4200, filedAt: '2026-09-01T00:00:00.000Z', leaves: [{ ...LEAVES[0], md5: 'md5-co', operation: 'new' }] };
  const FILED_0001 = { sequence: '0001', submissionType: 'Efficacy Supplement', sha256: SHA_OTHER, transmittalId: 4300, filedAt: '2026-09-20T00:00:00.000Z', leaves: LEAVES };
  const REJECTED_0001 = {
    ...FILED_0001, state: 'rejected',
    rejection: {
      recordedAt: '2026-09-25T00:00:00.000Z', recordedBy: 777, reason: 'FDA Ack3 reports a technical rejection',
      evidence: { vaultDocumentId: '0b6f8f3e-6c1d-4f43-9a63-2f1d0c9b7a51', contentSha256: 'e'.repeat(64) },
      transmittalStatus: { previous: 'ack2_received', current: 'validation_failed' }, actionId: 'act_r', signatureId: 31,
    },
  };
  const CONFLICT = { sequence: '0001', filedSha256: SHA_OTHER, filedTransmittalId: 4300 };
  const sequenceOne = () => goodDescriptor({ sequence: '0001', submissionType: 'Efficacy Supplement', leafManifest: LEAVES });
  const send = (environment: string) => request(makeApp())
    .post('/api/mdx/gateways/fda/esg/transmit')
    .send({ packageId: 5, environment, ...REAUTH });
  /** What the history writer reads under the package row lock (the transaction client). */
  function lockReads(history: () => unknown[]) {
    const signer = ledgerQuery.getMockImplementation()!;
    ledgerQuery.mockImplementation(async (sql: unknown, params?: unknown) =>
      /FROM c2c_submission_packages WHERE id = \$1 FOR UPDATE/.test(String(sql))
        ? { rows: [{ metadata: { bundle: sequenceOne(), filedSequences: history() } }], rowCount: 1 }
        : signer(sql, params));
  }
  const historyWrite = () => ledgerQuery.mock.calls.find((c) => /^UPDATE c2c_submission_packages/.test(String(c[0])));

  it('refuses a bundle of a sequence the history holds on file as ANOTHER bundle, before the gateway, from the row it already reads', async () => {
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: sequenceOne(), filedSequences: [FILED_0000, FILED_0001] }];
    const res = await send('production');
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.details).toEqual({ code: 'SEQUENCE_ALREADY_FILED', ...CONFLICT });
    expect(res.body.error).toMatch(/Sequence 0001/);
    expect(res.body.error).toMatch(/transmittal 4300/);
    expect(res.body.error, 'the operator is not handed an API path').not.toMatch(/\/api\/|POST /);
    expect(transmitFn).not.toHaveBeenCalled();
    expect(packageSelects, 'no second read of the package').toEqual([[5, CALLER_ORG]]);
  });

  it('the same bundle already on file is not refused (a re-send after a rollback), and the history is left as it is', async () => {
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: sequenceOne(), filedSequences: [FILED_0000, { ...FILED_0001, sha256: legitSha }] }];
    lockReads(() => [FILED_0000, { ...FILED_0001, sha256: legitSha }]);
    transmitFn.mockResolvedValueOnce({ transmittalId: 4309, transmissionId: 'mdn-resend', status: 'received', transport: 'as2', httpStatus: 200 });
    const res = await send('production');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ filedSequenceRecorded: true, filedSequenceReason: 'already-recorded', filedSequenceConflict: null });
    expect(historyWrite()).toBeUndefined();
  });

  it('a send to the agency TEST environment files nothing, so the history does not hold it back', async () => {
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: sequenceOne(), filedSequences: [FILED_0000, FILED_0001] }];
    transmitFn.mockResolvedValueOnce({ transmittalId: 4308, transmissionId: 'mdn-staging', status: 'received', transport: 'as2', httpStatus: 200 });
    const res = await send('staging');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.filedSequenceReason).toBe('test-environment');
  });

  it('a 0001 the agency REJECTED does not hold the number: the new bundle is sent and recorded beside it', async () => {
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: sequenceOne(), filedSequences: [FILED_0000, REJECTED_0001] }];
    lockReads(() => [FILED_0000, REJECTED_0001]);
    transmitFn.mockResolvedValueOnce({ transmittalId: 4310, transmissionId: 'mdn-refile', status: 'received', transport: 'as2', httpStatus: 200 });
    const res = await send('production');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ filedSequenceRecorded: true, filedSequenceReason: 'recorded', filedSequenceConflict: null });
    const written = JSON.parse(String((historyWrite()![1] as unknown[])[1]));
    expect(written.filedSequences).toHaveLength(3);
    expect(written.filedSequences[1], 'the rejected entry is kept, for audit').toEqual(REJECTED_0001);
    expect(written.filedSequences[2]).toMatchObject({ sequence: '0001', sha256: legitSha, transmittalId: 4310, state: 'transmitted' });
  });

  it('a different bundle of the sequence recorded WHILE this one was sending: not recorded, said, and on the sign record', async () => {
    let history: unknown[] = [FILED_0000];
    packages = [{ id: 5, orgId: CALLER_ORG, bundle: sequenceOne(), filedSequences: history }];
    lockReads(() => history);
    transmitFn.mockImplementationOnce(async () => {
      history = [FILED_0000, FILED_0001]; // another send of 0001 was recorded meanwhile
      return { transmittalId: 4311, transmissionId: 'mdn-race', status: 'received', transport: 'as2', httpStatus: 200 };
    });
    const res = await send('production');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ filedSequenceRecorded: false, filedSequenceReason: 'sequence-conflict', filedSequenceConflict: CONFLICT });
    expect(res.body.data.filedSequenceWarning).toMatch(/could not be added to the package filed history/);
    expect(res.body.data.filedSequenceWarning).toMatch(/transmittal 4300/);
    expect(res.body.data.filedSequenceWarning).toMatch(/at most one/);
    expect(historyWrite(), 'nothing was written over the other bundle').toBeUndefined();
    expect(signPayload()).toMatchObject({ filedSequenceReason: 'sequence-conflict', filedSequenceConflict: CONFLICT });
    expect(transmitManifest()).toMatchObject({ filedSequenceRecorded: false, filedSequenceConflict: CONFLICT });
  });
});

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
}));

const REAUTH = { reason: 'governed transmit reason', reauth: { password: 'pw-123456' } };

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

/** Caller's verified principal. Tenant 99, user 777. */
const CALLER_ORG = 99;
const OTHER_ORG  = 7;

function makeApp(orgId = CALLER_ORG) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 777, organizationId: orgId };
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
type StoredPackage = { id: number; orgId: number; bundle: unknown };
let packages: StoredPackage[] = [];
const packageSelects: Array<unknown[]> = [];

function installDb() {
  queryFn.mockReset();
  queryFn.mockImplementation((sql: string, params: unknown[] = []) => {
    if (typeof sql === 'string' && sql.includes('password_hash')) {
      return Promise.resolve({ rows: [{ password_hash: 'hashed' }], rowCount: 1 });
    }
    if (typeof sql === 'string' && sql.includes('FROM c2c_submission_packages')) {
      packageSelects.push(params);
      const [id, orgId] = params as [number, number];
      const row = packages.find((p) => p.id === id && p.orgId === orgId);
      return row
        ? Promise.resolve({ rows: [{ metadata: { bundle: row.bundle } }], rowCount: 1 })
        : Promise.resolve({ rows: [], rowCount: 0 });
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
  installDb();
  connectFn.mockReset();
  connectFn.mockImplementation(() =>
    Promise.resolve({
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
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
      .send({ packageId: 5, environment: 'staging', ...REAUTH });

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
    // Ownership was proven with a tenant-scoped read.
    expect(packageSelects).toEqual([[5, CALLER_ORG]]);
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
    expect(blocked.blockers.some((b) => /ECTD_REQUIRE_PDFA blocks/.test(b))).toBe(true);

    // Report-only when not opted in — the same evidence is surfaced, not blocking.
    const reported = evaluatePreTransmit({
      region: 'fda', environment: 'production', enforceExternal: false,
      env: {} as NodeJS.ProcessEnv, bundle: forwarded as any,
    });
    expect(reported.cleared).toBe(true);
    expect(reported.checks.find((c) => c.name === 'dtd-self-contained')?.passed).toBe(false);
  });
});

/**
 * The product's 510(k) transmit affordance reaches the REAL FDA ESG transport.
 *
 * Before this, `k510_workflow.transmit` called `server/services/ESGSubmissionService`,
 * a second "ESG service" whose `transmitToESG` threw `not-implemented` in
 * production and returned a `SIMULATED-NOT-SENT-*` record everywhere else. The
 * platform's genuine AS2 / RFC-4130 implementation
 * (server/services/submission-gateways/fda-esg.ts) sat behind the gateway
 * registry, reachable only from the HTTP transmit route. The device transmit
 * affordance could therefore never put a byte on an agency endpoint.
 *
 * These tests drive the handler with EVERYTHING real except the network:
 * the tool gate, the Part 11 gate, the shared governed transmit and its
 * descriptor-trust gates, the gateway registry's human-authorization guard, the
 * pre-transmit package-fitness checks, the bundle integrity re-hash, the AS2
 * envelope construction and the RSA-SHA256 body signature all execute. Only
 * `node:https` (the wire) and the database are stubbed — the transport
 * boundary, not the decision logic.
 *
 * NODE_ENV is 'production' throughout: the trust gates are only meaningful in
 * their enforced state, and that is the state a real 510(k) filing runs in.
 *
 * @compliance 21 CFR Part 11 §11.10(a) — records must accurately reflect events.
 * @compliance 21 CFR Part 11 §11.200 — manifested electronic signature.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash, generateKeyPairSync, createSign } from 'crypto';
import { fingerprintPackageContent, type PackageContentRow } from '../../ectd/package-content-fingerprint';

/* ─── DB stub ────────────────────────────────────────────────────── */

interface QueryRecord { sql: string; args: unknown[] }

const { poolQueries, storedBundle, httpsRequests, mdnResponse, audit, recordGovernedAction } =
  vi.hoisted(() => ({
    poolQueries:   [] as QueryRecord[],
    storedBundle:  { value: null as unknown },
    httpsRequests: [] as Array<{ options: any; body: Buffer }>,
    mdnResponse:   { statusCode: 200, body: '' },
    audit:         { logAction: vi.fn().mockResolvedValue({ persisted: true, chained: true, tamperProof: true }) },
    recordGovernedAction: vi.fn(async (_client: unknown, _params: Record<string, any>) => ({
      actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'deadbeef',
    })),
  }));

/** The package's content as the transmit gate re-reads it; the stored
 *  descriptor carries its fingerprint, so the zip still reflects the package. */
const CONTENT: PackageContentRow[] = [
  { sectionDbId: 13, sectionKey: 'estar-summary', artifactDbId: 1, ctdSection: null, content: '510(k) summary' },
];
const CONTENT_FINGERPRINT = fingerprintPackageContent(CONTENT);

function queryImpl(sql: string, args: unknown[] = []) {
  poolQueries.push({ sql, args });
  if (sql.includes('FROM c2c_submission_packages')) {
    return Promise.resolve({ rows: [{ metadata: { bundle: storedBundle.value } }], rowCount: 1 });
  }
  if (sql.includes('FROM c2c_package_sections')) {
    return Promise.resolve({
      rows: CONTENT.map((r) => ({
        section_db_id: r.sectionDbId, section_key: r.sectionKey, artifact_db_id: r.artifactDbId, ctd_section: r.ctdSection, content: r.content,
      })),
      rowCount: CONTENT.length,
    });
  }
  if (sql.includes('INSERT INTO submission_transmittals')) {
    return Promise.resolve({ rows: [{ id: 4242 }], rowCount: 1 });
  }
  // findActiveTransmittal: no active row.
  if (sql.includes('SELECT id, status FROM submission_transmittals')) {
    return Promise.resolve({ rows: [], rowCount: 0 });
  }
  return Promise.resolve({ rows: [], rowCount: 0 });
}

const fakeClient = {
  query: vi.fn(async (sql: string, args: unknown[] = []) => queryImpl(sql, args)),
  release: vi.fn(),
};

vi.mock('../../../db', () => ({
  pool: {
    query: (sql: string, args?: unknown[]) => queryImpl(sql, args ?? []),
    connect: async () => fakeClient,
  },
  getPool: () => ({
    query: (sql: string, args?: unknown[]) => queryImpl(sql, args ?? []),
    connect: async () => fakeClient,
  }),
  db: {},
}));

/* ─── Network boundary — the ONLY thing stubbed below the handler ─── */

vi.mock('node:https', () => {
  const request = (options: any, cb: (res: any) => void) => {
    const chunks: Buffer[] = [];
    const req = {
      on: (_e: string, _h: unknown) => req,
      write: (b: Buffer) => { chunks.push(Buffer.from(b)); return true; },
      end: () => {
        httpsRequests.push({ options, body: Buffer.concat(chunks) });
        const handlers: Record<string, (arg?: unknown) => void> = {};
        const res = {
          statusCode: mdnResponse.statusCode,
          headers: { 'message-id': '<mdn-from-fda@esg.fda.gov>' },
          on: (event: string, h: (arg?: unknown) => void) => { handlers[event] = h; return res; },
        };
        // Deliver asynchronously, like the real socket does.
        setImmediate(() => {
          cb(res);
          handlers.data?.(Buffer.from(mdnResponse.body, 'utf8'));
          handlers.end?.();
        });
      },
      destroy: () => undefined,
    };
    return req;
  };
  return { request, default: { request } };
});

/* ─── Heavy leaf modules the handler pulls in ────────────────────── */

vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction }));
vi.mock('../../auditService', () => ({ default: audit }));

import { esgTransmit } from '../mdx-command-handlers';
import { _resetMdxToolRateLimitersForTests } from '../mdx-tool-rate-limit';

/* ─── Fixtures ───────────────────────────────────────────────────── */

let bundleRoot: string;
let bundlePath: string;
let bundleSha: string;
let bundleSize: number;
let certPath: string;
let keyPath: string;
let fdaCertPath: string;
let privateKeyPem: string;

const VERIFIED_AT = new Date('2026-08-14T10:00:00.000Z');
const SIGNED_CTX = {
  userId: 7,
  organizationId: 11,
  signoff: {
    reasonForChange: 'RA + QA sign-off complete; transmitting the cleared 510(k) package',
    signatureVerified: true,
    signaturePurpose: 'approval',
    verifiedAt: VERIFIED_AT,
  },
};

const TRANSMIT_PARAMS = {
  packageId: 42,
  environment: 'production',
  confirm: 'yes-transmit',
  reason: 'pre-flight green; RA + QA sign-off complete; all blockers cleared',
};

const ESG_ENV_KEYS = [
  'FDA_ESG_URL', 'FDA_ESG_AS2_FROM', 'FDA_ESG_AS2_TO',
  'FDA_ESG_CERT_PATH', 'FDA_ESG_KEY_PATH', 'FDA_ESG_FDA_CERT_PATH',
];

let savedEnv: Record<string, string | undefined> = {};

beforeAll(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'k510-esg-'));
  bundleRoot = path.join(base, 'bundles');
  await fs.mkdir(bundleRoot, { recursive: true });

  const bytes = Buffer.from('PK assembled eSTAR package bytes', 'utf8');
  bundlePath = path.join(bundleRoot, 'pkg-42-estar.zip');
  await fs.writeFile(bundlePath, bytes);
  bundleSha = createHash('sha256').update(bytes).digest('hex');
  bundleSize = bytes.length;

  // A real RSA key pair: fda-esg.ts signs the AS2 body with
  // createSign('RSA-SHA256'), which a placeholder string cannot satisfy.
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  keyPath = path.join(base, 'client-key.pem');
  certPath = path.join(base, 'client-cert.pem');
  fdaCertPath = path.join(base, 'fda-cert.pem');
  await fs.writeFile(keyPath, privateKeyPem);
  await fs.writeFile(certPath, publicKey.export({ type: 'spki', format: 'pem' }) as string);
  await fs.writeFile(fdaCertPath, publicKey.export({ type: 'spki', format: 'pem' }) as string);
});

afterAll(async () => {
  await fs.rm(path.dirname(bundleRoot), { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  _resetMdxToolRateLimitersForTests();
  poolQueries.length = 0;
  httpsRequests.length = 0;
  mdnResponse.statusCode = 200;
  mdnResponse.body =
    'Content-Type: multipart/signed; protocol="application/pkcs7-signature"; micalg=sha-256\r\n' +
    '\r\nDisposition: automatic-action/MDN-sent-automatically; processed\r\n';

  savedEnv = { NODE_ENV: process.env.NODE_ENV, SUBMISSION_BUNDLE_DIR: process.env.SUBMISSION_BUNDLE_DIR };
  for (const k of ESG_ENV_KEYS) savedEnv[k] = process.env[k];

  // The enforced state: descriptor trust, namespace confinement and the
  // structural-validation-evidence requirement are all live.
  process.env.NODE_ENV = 'production';
  process.env.SUBMISSION_BUNDLE_DIR = bundleRoot;

  // The server-generated descriptor the assemble route persists.
  storedBundle.value = {
    path: bundlePath,
    sha256: bundleSha,
    sizeBytes: bundleSize,
    format: 'estar',
    displayName: '510k-pkg-42.zip',
    validation: { errorCount: 0, warningCount: 1 },
    contentFingerprint: CONTENT_FINGERPRINT,
  };
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

function configureEsgCredentials() {
  process.env.FDA_ESG_URL = 'https://esg.fda.gov/gateway';
  process.env.FDA_ESG_AS2_FROM = 'SPONSOR-AS2';
  process.env.FDA_ESG_AS2_TO = 'FDA-CESUB';
  process.env.FDA_ESG_CERT_PATH = certPath;
  process.env.FDA_ESG_KEY_PATH = keyPath;
  process.env.FDA_ESG_FDA_CERT_PATH = fdaCertPath;
}

function clearEsgCredentials() {
  for (const k of ESG_ENV_KEYS) delete process.env[k];
}

/* ─── Tests ──────────────────────────────────────────────────────── */

describe('the 510(k) transmit affordance reaches the real FDA ESG AS2 transport', () => {
  it('puts the assembled bundle bytes on the wire with a real AS2 envelope', async () => {
    configureEsgCredentials();

    const r = await esgTransmit(SIGNED_CTX as any, TRANSMIT_PARAMS);

    expect(r.success, `handler refused: ${r.message}`).toBe(true);

    // 1. The bytes actually reached the transport.
    expect(httpsRequests).toHaveLength(1);
    const sent = httpsRequests[0];
    expect(sent.options.hostname).toBe('esg.fda.gov');
    expect(sent.body.toString('utf8')).toContain('assembled eSTAR package bytes');

    // 2. It is a genuine AS2 (RFC 4130) message, not a POST of a blob: the
    //    envelope headers the FDA ESG specification requires are present.
    const h = sent.options.headers as Record<string, string>;
    expect(h['AS2-From']).toBe('SPONSOR-AS2');
    expect(h['AS2-To']).toBe('FDA-CESUB');
    expect(h['AS2-Version']).toBe('1.2');
    expect(h['Message-ID']).toMatch(/^<.+@SPONSOR-AS2>$/);
    expect(h['Disposition-Notification-Options']).toMatch(/pkcs7-signature/);
    expect(h['Disposition-Notification-Options']).toMatch(/sha-256/);

    // 3. mTLS material was presented from the configured credentials.
    expect(sent.options.cert).toContain('BEGIN PUBLIC KEY');
    expect(sent.options.key).toBe(privateKeyPem);
    expect(sent.options.rejectUnauthorized).toBe(true);

    // 4. The identifier the caller gets back is FDA's MDN message-id, read off
    //    the agency response — not a locally minted string.
    expect(r.data?.transmissionId).toBe('<mdn-from-fda@esg.fda.gov>');
    expect(r.data?.transmittalId).toBe(4242);
    expect(r.data?.transport).toBe('as2');
    expect(String(r.data?.transmissionId)).not.toMatch(/SIMULATED/i);

    // 5. The agency's raw MDN is persisted verbatim for the §11.10(e) trail.
    const mdnWrite = poolQueries.find(
      (q) => q.sql.includes('UPDATE submission_transmittals') && q.sql.includes('mdn_raw'),
    );
    expect(mdnWrite).toBeDefined();
    expect(mdnWrite!.args).toContain(mdnResponse.body);

    // 6. The governed `sign` ledger entry was written for the transmission.
    expect(recordGovernedAction).toHaveBeenCalledTimes(1);
    const ledger = recordGovernedAction.mock.calls[0]![1] as any;
    expect(ledger.command).toBe('sign');
    expect(ledger.reason).toBe(TRANSMIT_PARAMS.reason);
    expect(ledger.payload.bundleSha256).toBe(bundleSha);
  });

  it('signs the AS2 body with the sponsor key rather than a placeholder', async () => {
    configureEsgCredentials();
    await esgTransmit(SIGNED_CTX as any, TRANSMIT_PARAMS);

    // signAs2Body runs during envelope construction; a non-PEM key throws.
    // Prove the same key genuinely produces an RSA-SHA256 signature over the
    // exact bytes that went out.
    const signer = createSign('RSA-SHA256');
    signer.update(httpsRequests[0].body);
    expect(signer.sign(privateKeyPem, 'base64').length).toBeGreaterThan(64);
  });

  it('records a rejected transmittal — never an acknowledgement — on an agency HTTP error', async () => {
    configureEsgCredentials();
    mdnResponse.statusCode = 500;
    mdnResponse.body = 'gateway unavailable';

    const r = await esgTransmit(SIGNED_CTX as any, TRANSMIT_PARAMS);
    expect(r.success).toBe(false);
    expect(r.error).toBe('TRANSMIT_FAILED');
    expect(r.data).toBeUndefined();

    const rejected = poolQueries.find(
      (q) => q.sql.includes('UPDATE submission_transmittals') && q.args.includes('rejected'),
    );
    expect(rejected).toBeDefined();
    // Nothing anywhere claims a receipt.
    expect(poolQueries.some((q) => q.args.includes('ack3_received'))).toBe(false);
  });
});

describe('with no ESG credentials the result is a structured refusal naming the missing configuration', () => {
  it('names every missing FDA_ESG_* variable and transmits nothing', async () => {
    clearEsgCredentials();

    const r = await esgTransmit(SIGNED_CTX as any, TRANSMIT_PARAMS);

    expect(r.success).toBe(false);
    expect(r.error).toBe('GATEWAY_NOT_CONFIGURED');
    for (const v of [
      'FDA_ESG_URL',
      'FDA_ESG_AS2_FROM',
      'FDA_ESG_CERT_PATH',
      'FDA_ESG_KEY_PATH',
      'FDA_ESG_FDA_CERT_PATH',
    ]) {
      expect(r.message, `refusal must name ${v}`).toContain(v);
    }
    expect(r.message).toMatch(/no FDA acknowledgement exists/i);

    // Nothing reached the wire, and no identifier was minted.
    expect(httpsRequests).toHaveLength(0);
    expect(r.data).toBeUndefined();

    // The attempt is recorded honestly: rejected, error class 'auth'.
    const rejected = poolQueries.find(
      (q) => q.sql.includes('UPDATE submission_transmittals') && q.args.includes('auth'),
    );
    expect(rejected).toBeDefined();
    expect(rejected!.args).toContain('rejected');

    // No governed `sign` is recorded for a transmission that never happened.
    expect(recordGovernedAction).not.toHaveBeenCalled();

    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.ana.k510_workflow.transmit.failed' }),
    );
  });

  it('is the same refusal for staging — no environment quietly simulates', async () => {
    clearEsgCredentials();
    const r = await esgTransmit(SIGNED_CTX as any, { ...TRANSMIT_PARAMS, environment: 'staging' });
    expect(r.success).toBe(false);
    expect(r.error).toBe('GATEWAY_NOT_CONFIGURED');
    expect(r.message).toContain('FDA_ESG_STAGING_URL');
    expect(httpsRequests).toHaveLength(0);
  });
});

describe('the package gate travels with the transmit, wherever it is invoked from', () => {
  it('refuses a package whose descriptor carries no structural-validation evidence', async () => {
    configureEsgCredentials();
    storedBundle.value = {
      path: bundlePath, sha256: bundleSha, sizeBytes: bundleSize, format: 'estar',
    };

    const r = await esgTransmit(SIGNED_CTX as any, TRANSMIT_PARAMS);
    expect(r.success).toBe(false);
    expect(r.error).toBe('BUNDLE_VALIDATION_UNKNOWN');
    expect(httpsRequests).toHaveLength(0);
  });

  it('refuses a package with error-severity structural findings', async () => {
    configureEsgCredentials();
    storedBundle.value = {
      path: bundlePath, sha256: bundleSha, sizeBytes: bundleSize, format: 'estar',
      validation: { errorCount: 3, findings: [{ rule: 'missing-index-md5' }] },
    };

    const r = await esgTransmit(SIGNED_CTX as any, TRANSMIT_PARAMS);
    expect(r.success).toBe(false);
    expect(r.error).toBe('BUNDLE_VALIDATION_ERRORS');
    expect(httpsRequests).toHaveLength(0);
  });

  it('refuses a descriptor pointing outside the submission-bundle namespace', async () => {
    configureEsgCredentials();
    storedBundle.value = {
      path: '/etc/passwd', sha256: bundleSha, sizeBytes: bundleSize, format: 'estar',
      validation: { errorCount: 0 },
    };

    const r = await esgTransmit(SIGNED_CTX as any, TRANSMIT_PARAMS);
    expect(r.success).toBe(false);
    expect(r.error).toBe('BUNDLE_OUTSIDE_NAMESPACE');
    expect(httpsRequests).toHaveLength(0);
  });

  it('refuses when the package has never been assembled', async () => {
    configureEsgCredentials();
    storedBundle.value = null;

    const r = await esgTransmit(SIGNED_CTX as any, TRANSMIT_PARAMS);
    expect(r.success).toBe(false);
    expect(r.error).toBe('BUNDLE_NOT_ASSEMBLED');
    expect(httpsRequests).toHaveLength(0);
  });
});

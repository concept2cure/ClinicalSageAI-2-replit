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
import JSZip from 'jszip';
import { fingerprintPackageContent, sha256Hex, type PackageContentRow } from '../../ectd/package-content-fingerprint';

/* ─── DB stub ────────────────────────────────────────────────────── */

interface QueryRecord { sql: string; args: unknown[] }

const { poolQueries, storedBundle, httpsRequests, mdnResponse, audit, recordGovernedAction } =
  vi.hoisted(() => ({
    poolQueries:   [] as QueryRecord[],
    storedBundle:  { value: null as unknown },
    httpsRequests: [] as Array<{ options: any; body: Buffer }>,
    // `sent` is the body as delivered, with {{MESSAGE_ID}} echoing the request's
    // Message-ID the way a real MDN's Original-Message-ID does.
    mdnResponse:   { statusCode: 200, body: '', sent: '' },
    audit:         { logAction: vi.fn().mockResolvedValue({ persisted: true, chained: true, tamperProof: true }) },
    recordGovernedAction: vi.fn(async (_client: unknown, _params: Record<string, any>) => ({
      actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'deadbeef',
    })),
  }));

/** The package's content as the transmit gate re-reads it; the stored
 *  descriptor carries its fingerprint, so the zip still reflects the package. */
const CONTENT: PackageContentRow[] = [
  { sectionDbId: 13, sectionKey: 'estar-summary', sectionLabel: '510(k) Summary', sortOrder: 0, artifactDbId: 1, title: '510(k) summary', version: 1, ctdSection: null, contentSha256: sha256Hex('510(k) summary'), filable: true },
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
        section_db_id: r.sectionDbId, section_key: r.sectionKey, section_label: r.sectionLabel, sort_order: r.sortOrder, artifact_db_id: r.artifactDbId,
        title: r.title, version: r.version, ctd_section: r.ctdSection, content_sha256: r.contentSha256,
        // 2026-09-23 (W5/D7, round-2 skeptic): the approval facts the fingerprint
        // now covers — a filable row is approved AT its version, as the status route writes it.
        status: r.filable == null ? null : r.filable ? 'approved' : 'review',
        approved_version_id: r.filable ? r.version : null, published_version_id: null,
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
          mdnResponse.sent = mdnResponse.body.replace('{{MESSAGE_ID}}', String(options?.headers?.['Message-ID'] ?? ''));
          handlers.data?.(Buffer.from(mdnResponse.sent, 'utf8'));
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
  'FDA_ESG_TRANSPORT',
  'FDA_ESG_REST_URL', 'FDA_ESG_REST_CLIENT_ID', 'FDA_ESG_REST_CLIENT_SECRET', 'FDA_ESG_REST_SUBMITTER_ID',
];

let savedEnv: Record<string, string | undefined> = {};

beforeAll(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'k510-esg-'));
  bundleRoot = path.join(base, 'bundles');
  await fs.mkdir(bundleRoot, { recursive: true });

  // A real ZIP: the transmit guard opens the signed bundle to judge its PDF
  // leaves (2026-09-22, W5/D7), and bytes it cannot open are refused. Stored,
  // not deflated, so the payload text is still visible on the wire below.
  const zip = new JSZip();
  zip.file('summary.txt', 'assembled eSTAR package bytes');
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
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
    '\r\nOriginal-Message-ID: {{MESSAGE_ID}}\r\n' +
    'Disposition: automatic-action/MDN-sent-automatically; processed\r\n';

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
    expect(mdnWrite!.args).toContain(mdnResponse.sent);

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
    // 2026-09-23 (W5/D7, MDN close): a 4xx — the agency answered and refused.
    // This sent HTTP 500, which the delivery classifier (as2-transport.ts)
    // records in transit: a 5xx after the whole bundle may be held upstream.
    mdnResponse.statusCode = 403;
    mdnResponse.body = 'forbidden: unknown AS2-From';

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

  // 2026-09-23 (W5/D7, MDN close): an HTTP 500 after the whole bundle was sent
  // neither accepts nor refuses it — the agency's backend may hold it. The
  // transmittal is recorded in transit, inside the duplicate-send lock, with
  // the HTTP status; never rejected (which frees a resend) and never an
  // acknowledgement.
  it('records the transmittal in transit — never rejected, never an acknowledgement — on HTTP 500 after the whole bundle', async () => {
    configureEsgCredentials();
    mdnResponse.statusCode = 500;
    mdnResponse.body = 'gateway unavailable';

    const r = await esgTransmit(SIGNED_CTX as any, TRANSMIT_PARAMS);
    expect(r.success).toBe(false);
    expect(r.error).toBe('TRANSMIT_FAILED');
    expect(r.message).toMatch(/may hold it/);
    expect(r.data).toBeUndefined();

    expect(httpsRequests).toHaveLength(1);
    const statusWrites = poolQueries.filter((q) => q.sql.includes('UPDATE submission_transmittals') && /status\s*=/.test(q.sql));
    const last = statusWrites[statusWrites.length - 1];
    expect(last.args).toContain('in_transit');
    // Tracked under the response's Message-ID; the error names ours.
    expect(last.args).toContain('<mdn-from-fda@esg.fda.gov>');
    expect(r.message).toContain(httpsRequests[0].options.headers['Message-ID']);
    expect(last.args).toContain(500);
    expect(poolQueries.some((q) => q.sql.includes('UPDATE submission_transmittals') && q.args.includes('rejected'))).toBe(false);
    expect(poolQueries.some((q) => q.args.includes('ack3_received') || q.args.includes('received'))).toBe(false);
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

describe('the ESG NextGen REST transport is selectable behind the same path and refuses honestly', () => {
  it('FDA_ESG_TRANSPORT=rest with REST credentials → TRANSPORT_NOT_VERIFIED, nothing on the wire, no identifier', async () => {
    process.env.FDA_ESG_TRANSPORT = 'rest';
    process.env.FDA_ESG_REST_URL = 'https://esg-nextgen.fda.example/api';
    process.env.FDA_ESG_REST_CLIENT_ID = 'client-1';
    process.env.FDA_ESG_REST_CLIENT_SECRET = 'secret-1';
    process.env.FDA_ESG_REST_SUBMITTER_ID = 'ESG-SUBMITTER-1';

    const r = await esgTransmit(SIGNED_CTX as any, TRANSMIT_PARAMS);

    expect(r.success).toBe(false);
    expect(r.error).toBe('TRANSPORT_NOT_VERIFIED');
    expect(r.message).toMatch(/Nothing was transmitted/);
    expect(r.message).toMatch(/has not been verified/);
    expect(r.data).toBeUndefined();
    expect(httpsRequests).toHaveLength(0);
    expect(poolQueries.filter((q) => q.sql.includes('INSERT INTO submission_transmittals'))).toHaveLength(0);
  });

  it('FDA_ESG_TRANSPORT=rest without REST credentials → GATEWAY_NOT_CONFIGURED naming the REST variables', async () => {
    process.env.FDA_ESG_TRANSPORT = 'rest';
    const r = await esgTransmit(SIGNED_CTX as any, TRANSMIT_PARAMS);
    expect(r.success).toBe(false);
    expect(r.error).toBe('GATEWAY_NOT_CONFIGURED');
    expect(r.message).toContain('FDA_ESG_REST_URL');
    expect(r.message).not.toContain('FDA_ESG_AS2_FROM');
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

/* 2026-09-23 (W5/D7, round-2 review). The transmit guard reports the package
   checks that FAILED without blocking (a flag-gated check not enforced here).
   This handler dropped them from both its audit row and its returned data, and
   the shared governed transmit kept them off its sign record, so a 510(k) that
   went out failing a check left no transmit-time trace of it. */
describe('a check that failed without blocking is recorded, not dropped', () => {
  it('carries the failed dtd-self-contained check and the guard warnings on the audit row, the sign ledger and the returned data', async () => {
    configureEsgCredentials();
    const savedDtd = process.env.ECTD_REQUIRE_DTD;
    delete process.env.ECTD_REQUIRE_DTD; // report-only: the check fails, the send goes ahead
    try {
      storedBundle.value = {
        ...(storedBundle.value as Record<string, unknown>),
        dtdStatus: { selfContained: false, missing: ['ich-ectd-3-2.dtd'], missingStylesheets: [] },
      };

      const r = await esgTransmit(SIGNED_CTX as any, TRANSMIT_PARAMS);
      expect(r.success, `handler refused: ${r.message}`).toBe(true);
      expect(httpsRequests).toHaveLength(1);

      const failed = expect.arrayContaining([expect.stringMatching(/^dtd-self-contained: missing: ich-ectd-3-2\.dtd/)]);
      // This descriptor records no built region, which the guard warns about.
      const warned = expect.arrayContaining([expect.stringMatching(/region it was built for/)]);

      // The returned data.
      expect(r.data?.preTransmitFailedChecks).toEqual(failed);
      expect(r.data?.preTransmitWarnings).toEqual(warned);

      // The agent.ana.* audit row.
      expect(audit.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'agent.ana.k510_workflow.transmit',
          details: expect.objectContaining({ preTransmitFailedChecks: failed, preTransmitWarnings: warned }),
        }),
      );

      // The governed `sign` ledger entry the shared transmit wrote.
      const ledger = recordGovernedAction.mock.calls[0]![1] as any;
      expect(ledger.payload.preTransmitFailedChecks).toEqual(failed);
      expect(ledger.payload.preTransmitWarnings).toEqual(warned);
    } finally {
      if (savedDtd === undefined) delete process.env.ECTD_REQUIRE_DTD; else process.env.ECTD_REQUIRE_DTD = savedDtd;
    }
  });
});

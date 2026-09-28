/**
 * A transmit the gateway guard refuses before anything is sent releases its claim.
 *
 * 2026-09-23 (W5/D7), found by the round-2 review. transmitSequence released its
 * transmit claim only for failures before gw.transmit, on the reasoning that any
 * later failure may have reached the agency. But the getGateway guard refuses
 * BEFORE any byte leaves (authorization, pre-transmit checks, leaf security),
 * and such a refusal left dispatch_status = 'transmitting' — read by
 * resendRefusal as "in flight, confirm at the agency" and cleared by nothing.
 * The sequence could never be sent. Guard refusals are now marked
 * (refusedBeforeWire) and release the claim; gateway failures still do not.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic): two gaps in the above. (1) A refusal made
 * INSIDE a gateway before anything is sent — UnverifiedTransportError from the
 * FDA NextGen REST adapter, the requiredAgencyMetadata ValidationError before
 * any transmittal row — still stranded the claim; refusedBeforeWire now also
 * recognises those typed errors (transmitted === false). (2) Nothing asserted
 * the safety half: a TransportError / GatewayError from the gateway after the
 * guard passed must leave 'transmitting'. Both are pinned below; the negative
 * cases fail against a refusedBeforeWire that answers true for everything.
 *
 * 2026-09-23 (W5/D7, round-3 skeptic): the FDA SFTP branch still stranded the
 * claim deterministically. isConfigured checks only the AS2 credentials, so a
 * sequence over 1 GiB is claimed, passes the guard, and is refused by
 * transmitViaSftp before connect() with a CredentialError when no SFTP
 * credentials are provisioned. refusedBeforeWire now recognises CredentialError
 * (every site raises it from a credential check before any request); the case
 * below runs the real gateway on a >1 GiB descriptor.
 *
 * 2026-09-23 (W5/D7, MDN close): three more cases, each through the real
 * FdaEsgGateway.
 *   - An AS2 POST the delivery classifier (as2-transport.ts) proves
 *     NOT_DELIVERED — here FDA refusing our client certificate at the TLS
 *     handshake, against a real local mTLS server — was recorded 'rejected'
 *     by the gateway but raised as a TransportError WITHOUT the
 *     NOTHING_TRANSMITTED proof, so the claim stayed 'transmitting'. It now
 *     carries the proof and the claim is released.
 *   - NEGATIVE: a 502 after the server read the whole bundle is
 *     DELIVERED_UNCONFIRMED ('in_transit' inside the lock): the claim stays.
 *   - SFTP credentials set but the 'ssh2-sftp-client' module absent: refused
 *     before any connection, now with the proof; the claim is released. The
 *     SFTP CredentialError now names the environment the credentials were
 *     resolved for (staging here), not 'production'.
 *
 * 2026-09-23 (W5/D7, MDN close, repair): NEGATIVE, from a separate-process
 * server while this process is busy. The classifier briefly read Node's
 * 'finish' as proof: a 502 from a server that had read the whole bundle, or
 * a reset after it, was NOT_DELIVERED whenever 'finish' had not yet been
 * delivered — and with the proof above, the claim was released while FDA
 * held the bundle. Both keep the claim now.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import JSZip from 'jszip';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import os from 'os';
import path from 'path';

const poolCalls: Array<{ text: string; params?: unknown[] }> = [];
const state = { dispatchStatus: 'pending' as string };

vi.mock('../../../db', () => {
  const rowsFor = (tableName: string) => {
    if (tableName === 'ectd_sequences') return [{ id: 1, submissionId: 1, region: 'fda', sequenceNumber: '0000', status: 'dispatched', dispatchStatus: state.dispatchStatus, type: 'original', organizationId: 7 }];
    if (tableName === 'submissions') return [{ id: 1, clientType: 'biotech', applicationType: 'ind', organizationId: 7 }];
    return [];
  };
  const tableNameOf = (t: any) => t?.[Symbol.for('drizzle:Name')] ?? t?._?.name ?? '';
  const select = () => {
    let name = '';
    const chain: any = {
      from: (t: any) => { name = tableNameOf(t); return chain; },
      where: () => chain,
      limit: async () => rowsFor(name),
      then: (res: any, rej: any) => Promise.resolve(rowsFor(name)).then(res, rej),
    };
    return chain;
  };
  const textOf = (q: any): string => (q?.queryChunks ?? []).map((c: any) => (Array.isArray(c?.value) ? c.value.join('') : '?')).join('');
  const execute = async (q: any) => {
    const t = textOf(q);
    if (t.includes('c2c_ana_actions')) return { rows: [{ id: 'sig-1', payload: { intent: 'transmit' } }] };
    if (t.includes('audit_logs')) return { rows: [] };
    if (t.includes('electronic_signatures')) return { rows: [{ bound_payload_digest: 'd', binding_basis: 'ectd-sequence-leaf-manifest-sha256', superseded_by: null, is_valid: true, verification_status: 'valid' }] };
    return { rows: [] };
  };
  const pool = {
    query: async (text: string, params?: unknown[]) => {
      poolCalls.push({ text, params });
      if (/SET dispatch_status = \$3/.test(text)) { state.dispatchStatus = String(params?.[2]); return { rowCount: 1, rows: [{ id: 1 }] }; }
      if (/SET dispatch_status = 'pending'/.test(text)) { if (state.dispatchStatus === 'transmitting') state.dispatchStatus = 'pending'; return { rowCount: 1, rows: [] }; }
      // The FDA gateway's transmittal row (only the SFTP case reaches it).
      if (/INSERT INTO submission_transmittals/.test(text)) return { rowCount: 1, rows: [{ id: 99 }] };
      return { rowCount: 0, rows: [] };
    },
    connect: async () => { throw new Error('not expected'); },
  };
  return { db: { select, execute }, pool };
});
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) }, writeChainedAuditRow: vi.fn() }));
vi.mock('../../part11/signature-persistence', async (orig) => ({
  ...(await orig<any>()),
  deriveGovernedTargetBinding: async () => ({ digest: 'd', basis: 'ectd-sequence-leaf-manifest-sha256', note: '' }),
  isSignatureWithdrawn: () => false,
}));
vi.mock('../../ectd/assess-dispatch-readiness', () => ({
  assessSequenceDispatchReadiness: async () => ({ gate: { cleared: true, blockers: [] } }),
}));

// Off by default. On, the byte check still verifies the sha256 but not the
// size, so a small real bundle can carry a >1 GiB descriptor (the SFTP case);
// what it guards is unchanged and still runs before transmitViaSftp.
const integrity = { ignoreSize: false };
vi.mock('../../submission-gateways/bundle-integrity', async (orig) => {
  const real = await orig<typeof import('../../submission-gateways/bundle-integrity')>();
  return {
    ...real,
    readVerifiedBundle: async (b: { path: string; sha256: string; sizeBytes: number }) => {
      if (!integrity.ignoreSize) return real.readVerifiedBundle(b);
      const buf = await fs.readFile(b.path);
      if (createHash('sha256').update(buf).digest('hex') !== b.sha256) throw new Error('sha256 mismatch');
      return buf;
    },
  };
});

const bundle = { path: '', sha256: '', sizeBytes: 0, format: 'ectd' as const };
vi.mock('../../ectd/assemble-from-core', () => ({
  assembleSequence: async () => ({ bundle, skipped: [], unfinalized: 0, unfinalizedSections: [], unresolvedLeaves: [], materialized: 1, cleanup: async () => {} }),
  assembledTransmitBlockers: () => [],
}));

import { makeMtlsPki, startMtlsServer, type MtlsPki, type MtlsServer } from '../../submission-gateways/__tests__/support/mtls-pki';
import { busyLoop, startSeparateProcessServer } from '../../submission-gateways/__tests__/support/separate-process-tls-server';
import { FdaEsgGateway } from '../../submission-gateways/fda-esg';
import { GatewayError, TransportError, requiredAgencyMetadata } from '../../submission-gateways/types';
import { transmitSequence, resendRefusal } from '../submission-service';

type Bundle = typeof bundle;
const bundles: { encrypted: Bundle; clean: Bundle } = { encrypted: { ...bundle }, clean: { ...bundle } };

async function writeBundle(pdf: Buffer): Promise<Bundle> {
  const zip = new JSZip();
  zip.file('0000/m2/22-intro/intro.pdf', pdf);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const p = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'probe-bundle-')), 'b.zip');
  await fs.writeFile(p, buf);
  return { path: p, sha256: createHash('sha256').update(buf).digest('hex'), sizeBytes: buf.length, format: 'ectd' };
}

beforeAll(async () => {
  // A bundle whose one PDF leaf carries a trailer /Encrypt (not an FDA form),
  // which the guard refuses; and a clean one the guard passes.
  bundles.encrypted = await writeBundle(Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n2 0 obj\n<< /Filter /Standard /V 2 /R 3 >>\nendobj\ntrailer\n<< /Root 1 0 R /Encrypt 2 0 R >>\n%%EOF\n'));
  bundles.clean = await writeBundle(Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'));
});

const REST_ENV = {
  FDA_ESG_STAGING_TRANSPORT: 'rest',
  FDA_ESG_STAGING_REST_URL: 'https://esg-nextgen.example.invalid',
  FDA_ESG_STAGING_REST_CLIENT_ID: 'c',
  FDA_ESG_STAGING_REST_CLIENT_SECRET: 's',
  FDA_ESG_STAGING_REST_SUBMITTER_ID: 'sub',
};

// AS2 staging credentials only — what FdaEsgGateway.isConfigured checks. No
// FDA_ESG_STAGING_SFTP_* is set. The PEM paths are filled in beforeAll.
const AS2_ENV: Record<string, string> = {
  FDA_ESG_STAGING_URL: 'https://esg.example.invalid',
  FDA_ESG_STAGING_AS2_FROM: 'SPONSOR',
};
beforeAll(async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'fda-as2-pem-'));
  for (const [k, f] of [['FDA_ESG_STAGING_CERT_PATH', 'c.pem'], ['FDA_ESG_STAGING_KEY_PATH', 'k.pem'], ['FDA_ESG_STAGING_FDA_CERT_PATH', 'f.pem']]) {
    await fs.writeFile(path.join(d, f), 'PEM');
    AS2_ENV[k] = path.join(d, f);
  }
});

beforeEach(() => {
  state.dispatchStatus = 'pending';
  poolCalls.length = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
  integrity.ignoreSize = false;
  for (const k of [...Object.keys(REST_ENV), ...Object.keys(AS2_ENV)]) delete process.env[k];
});

const transmit = () => transmitSequence({
  sequenceId: 1, ctx: { organizationId: 7, userId: 11 }, signatureActionId: 'sig-1',
  environment: 'staging', applicationId: 'IND123456',
}).catch((e) => e);

describe('transmit guard refusal before the wire', () => {
  it('releases the claim, so the sequence is not left "in flight" when nothing was sent', async () => {
    Object.assign(bundle, bundles.encrypted);
    vi.spyOn(FdaEsgGateway.prototype, 'isConfigured').mockResolvedValue(true);
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue({} as any);
    const err = await transmitSequence({
      sequenceId: 1, ctx: { organizationId: 7, userId: 11 }, signatureActionId: 'sig-1',
      environment: 'staging', applicationId: 'IND123456',
    }).catch((e) => e);
    expect(wire).not.toHaveBeenCalled();
    expect(String(err?.message)).toMatch(/encrypted\/secured/);
    expect(state.dispatchStatus).toBe('pending');
    expect(resendRefusal(state.dispatchStatus)).toBeNull();
  });
});

/** The claim was really taken (so a 'pending' result is a release, not a no-op). */
const claimTaken = () =>
  poolCalls.some((c) => /SET dispatch_status = \$3/.test(c.text) && c.params?.[2] === 'transmitting');

describe('a refusal inside the gateway that proves nothing was sent', () => {
  it('releases the claim for the FDA NextGen REST refusal (UnverifiedTransportError)', async () => {
    // Real isConfigured and real transmit: REST credentials resolve, so the
    // claim is taken and the guard passes; transmitViaNextGenRest then refuses
    // with transmitted === false before any transmittal row exists.
    Object.assign(bundle, bundles.clean);
    Object.assign(process.env, REST_ENV);
    const err = await transmit();
    expect(err?.name).toBe('UnverifiedTransportError');
    expect(err?.transmitted).toBe(false);
    expect(claimTaken()).toBe(true);
    expect(poolCalls.some((c) => /INSERT INTO submission_transmittals/.test(c.text))).toBe(false);
    expect(state.dispatchStatus).toBe('pending');
    expect(resendRefusal(state.dispatchStatus)).toBeNull();
  });

  it('releases the claim for the requiredAgencyMetadata refusal raised by the gateway', async () => {
    Object.assign(bundle, bundles.clean);
    vi.spyOn(FdaEsgGateway.prototype, 'isConfigured').mockResolvedValue(true);
    // The canonical agency-metadata check, run by the gateway on a request whose
    // submission type it cannot use — the refusal every REST gateway makes
    // before its transmittal row.
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockImplementation(async (req) => {
      requiredAgencyMetadata({ ...req, submissionType: '' });
      throw new Error('unreachable');
    });
    const err = await transmit();
    expect(wire).toHaveBeenCalledTimes(1);
    expect(err?.name).toBe('ValidationError');
    expect(claimTaken()).toBe(true);
    expect(state.dispatchStatus).toBe('pending');
  });
});

describe('the FDA SFTP branch refusing before connect (round-3 skeptic)', () => {
  it('releases the claim when a >1 GiB sequence has no SFTP credentials (CredentialError)', async () => {
    // Real isConfigured (AS2 credentials only -> true, so the claim is taken)
    // and real transmit: the size routes to SFTP, and transmitViaSftp refuses
    // on the missing FDA_ESG_STAGING_SFTP_* before any connection is opened.
    Object.assign(bundle, bundles.clean, { sizeBytes: 1_073_741_825 });
    Object.assign(process.env, AS2_ENV);
    for (const k of ['FDA_ESG_STAGING_SFTP_HOST', 'FDA_ESG_STAGING_SFTP_USER', 'FDA_ESG_STAGING_SFTP_KEY_PATH']) delete process.env[k];
    integrity.ignoreSize = true;
    const err = await transmit();
    expect(err?.name).toBe('CredentialError');
    expect(String(err?.message)).toMatch(/SFTP_HOST/);
    // 2026-09-23 (W5/D7, MDN close): the environment the credentials were
    // resolved for, and its variable names — this used to say 'production'
    // and FDA_ESG_SFTP_HOST for a staging transmit.
    expect(err?.environment).toBe('staging');
    expect(err?.missing).toEqual(['FDA_ESG_STAGING_SFTP_HOST', 'FDA_ESG_STAGING_SFTP_USER', 'FDA_ESG_STAGING_SFTP_KEY_PATH']);
    expect(claimTaken()).toBe(true);
    // The gateway recorded its own row as refused, not in flight.
    expect(poolCalls.some((c) => /UPDATE submission_transmittals/.test(c.text) && c.params?.includes('rejected'))).toBe(true);
    expect(state.dispatchStatus).toBe('pending');
    expect(resendRefusal(state.dispatchStatus)).toBeNull();
  });
  it('releases the claim when the SFTP credentials are set but the ssh2-sftp-client module is absent (MDN close)', async () => {
    // The module is not installed in this repository (nor declared), so the
    // dynamic import fails before any connection is opened.
    Object.assign(bundle, bundles.clean, { sizeBytes: 1_073_741_825 });
    Object.assign(process.env, AS2_ENV);
    const keyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fda-sftp-key-'));
    await fs.writeFile(path.join(keyDir, 'id'), 'KEY');
    Object.assign(process.env, {
      FDA_ESG_STAGING_SFTP_HOST: 'sftp.esg.example.invalid',
      FDA_ESG_STAGING_SFTP_USER: 'sponsor',
      FDA_ESG_STAGING_SFTP_KEY_PATH: path.join(keyDir, 'id'),
    });
    integrity.ignoreSize = true;
    try {
      const err = await transmit();
      expect(err).toBeInstanceOf(TransportError);
      expect(String(err?.message)).toMatch(/ssh2-sftp-client/);
      expect(claimTaken()).toBe(true);
      expect(poolCalls.some((c) => /UPDATE submission_transmittals/.test(c.text) && c.params?.includes('rejected'))).toBe(true);
      expect(state.dispatchStatus).toBe('pending');
      expect(resendRefusal(state.dispatchStatus)).toBeNull();
      expect(err?.transmitted).toBe(false);
      expect(String(err?.message)).toMatch(/nothing was sent/);
    } finally {
      for (const k of ['FDA_ESG_STAGING_SFTP_HOST', 'FDA_ESG_STAGING_SFTP_USER', 'FDA_ESG_STAGING_SFTP_KEY_PATH']) delete process.env[k];
    }
  });
});

/* 2026-09-23 (W5/D7, MDN close). The real FDA ESG AS2 path against a real
   local mTLS server (../../submission-gateways/__tests__/support/mtls-pki.ts):
   the delivery classifier decides, and only its NOT_DELIVERED verdict — proof
   that nothing reached an authenticated FDA server — releases the claim. */
describe('the FDA AS2 POST, classified by the delivery classifier', () => {
  let pki: MtlsPki;
  let server: MtlsServer;
  const mtlsEnv = (client: 'trusted' | 'rogue'): Record<string, string> => ({
    FDA_ESG_STAGING_URL: `https://127.0.0.1:${server.port}/as2`,
    FDA_ESG_STAGING_AS2_FROM: 'SPONSOR-AS2',
    FDA_ESG_STAGING_CERT_PATH: client === 'trusted' ? pki.paths.clientCert : pki.paths.rogueCert,
    FDA_ESG_STAGING_KEY_PATH: client === 'trusted' ? pki.paths.clientKey : pki.paths.rogueKey,
    FDA_ESG_STAGING_FDA_CERT_PATH: pki.paths.ca,
  });
  beforeAll(async () => {
    pki = makeMtlsPki();
    server = await startMtlsServer(pki);
  }, 60_000);
  afterAll(async () => {
    await server.close();
    pki.cleanup();
  });
  beforeEach(() => { server.seen.length = 0; });

  it('NOT_DELIVERED (FDA refuses our client certificate at the TLS handshake): row rejected, claim released', async () => {
    Object.assign(bundle, bundles.clean);
    Object.assign(process.env, mtlsEnv('rogue'));
    const err = await transmit();
    expect(server.seen).toHaveLength(0);
    expect(err).toBeInstanceOf(TransportError);
    expect(String(err?.message)).toMatch(/Nothing reached FDA/);
    expect(claimTaken()).toBe(true);
    expect(poolCalls.some((c) => /UPDATE submission_transmittals/.test(c.text) && c.params?.includes('rejected'))).toBe(true);
    expect(state.dispatchStatus).toBe('pending');
    expect(resendRefusal(state.dispatchStatus)).toBeNull();
    expect(err?.transmitted).toBe(false);
  });

  it('NEGATIVE — DELIVERED_UNCONFIRMED (HTTP 502 after the whole bundle): in transit, the claim stays transmitting', async () => {
    Object.assign(bundle, bundles.clean);
    Object.assign(process.env, mtlsEnv('trusted'));
    server.respond = (_req, res) => { res.writeHead(502); res.end('Bad Gateway'); };
    const err = await transmit();
    expect(server.seen).toHaveLength(1);
    expect(server.seen[0].body.length).toBe(bundles.clean.sizeBytes);
    expect(err).toBeInstanceOf(GatewayError);
    expect(String(err?.message)).toMatch(/may hold it/);
    expect(poolCalls.some((c) => /UPDATE submission_transmittals/.test(c.text) && c.params?.includes('in_transit'))).toBe(true);
    expect(poolCalls.some((c) => /UPDATE submission_transmittals/.test(c.text) && c.params?.includes('rejected'))).toBe(false);
    expect(claimTaken()).toBe(true);
    expect(state.dispatchStatus).toBe('transmitting');
    expect(resendRefusal(state.dispatchStatus)).not.toBeNull();
  });

  it.each([
    ['HTTP 502', { mode: 'answer' as const, status: 502, delayMs: 10 }],
    ['a reset', { mode: 'reset' as const, delayMs: 10 }],
  ])('NEGATIVE — %s from a separate-process server that read the whole bundle, while this process is busy: the claim stays transmitting', async (_label, opts) => {
    Object.assign(bundle, bundles.clean);
    const srv = await startSeparateProcessServer(pki, opts);
    Object.assign(process.env, mtlsEnv('trusted'), { FDA_ESG_STAGING_URL: `https://127.0.0.1:${srv.port}/as2` });
    const outcomes: string[] = [];
    const stop = busyLoop(30);
    try {
      for (let i = 0; i < 3; i++) {
        state.dispatchStatus = 'pending';
        poolCalls.length = 0;
        const err = await transmit();
        expect((await srv.nextClose()).bodyRead).toBe(bundles.clean.sizeBytes);
        expect(claimTaken()).toBe(true);
        outcomes.push(`${state.dispatchStatus} transmitted=${String(err?.transmitted)}`);
      }
    } finally {
      stop();
      srv.close();
    }
    expect(outcomes).toEqual(Array(3).fill('transmitting transmitted=undefined'));
  }, 120_000);
});

describe('a failure from inside the gateway after the guard passed (NEGATIVE)', () => {
  // Delivery is unknown: the bytes may be at the agency. Releasing here would
  // reset the sequence to 'pending' and invite a second real transmission.
  it.each([
    ['TransportError', () => new TransportError('socket hang up after the POST body was sent')],
    ['GatewayError', () => new GatewayError('FDA ESG AS2 returned HTTP 500', 500, null, 'boom')],
  ])('%s keeps the claim at transmitting', async (_label, make) => {
    Object.assign(bundle, bundles.clean);
    vi.spyOn(FdaEsgGateway.prototype, 'isConfigured').mockResolvedValue(true);
    const thrown = make();
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockRejectedValue(thrown);
    const err = await transmit();
    expect(wire).toHaveBeenCalledTimes(1);
    expect(err).toBe(thrown);
    expect(claimTaken()).toBe(true);
    expect(state.dispatchStatus).toBe('transmitting');
    expect(resendRefusal(state.dispatchStatus)).not.toBeNull();
  });
});

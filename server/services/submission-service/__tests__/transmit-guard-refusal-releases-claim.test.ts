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
 * 2026-09-23 (W5/D7, round-3 skeptic): the FDA SFTP branch stranded the claim
 * for a sequence over 1 GiB (a CredentialError before connect()); refusedBefore-
 * Wire learned to recognise CredentialError. 2026-11-09 (P-93): an FDA package
 * over 1 GiB is out of scope for launch. Transmit's own package re-check refuses
 * it on the bytes it assembled, before the guard, the archive or the gateway, and
 * releases the claim; the case that replaced the SFTP ones pins that.
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
 *
 * 2026-09-23 (W5/D7, MDN close, repair): NEGATIVE, from a separate-process
 * server while this process is busy. The classifier briefly read Node's
 * 'finish' as proof: a 502 from a server that had read the whole bundle, or
 * a reset after it, was NOT_DELIVERED whenever 'finish' had not yet been
 * delivered — and with the proof above, the claim was released while FDA
 * held the bundle. Both keep the claim now.
 *
 * F1 (row D7, 2026-11-01): a send to the agency's TEST environment is not a
 * filing, so nothing the test environment holds is a held send. The NEGATIVE
 * cases above are production sends (FDA_ESG_*): a production failure after the
 * wire keeps the claim, as it always did (founder decision P-92 will settle such
 * a hold by a signed act). Each has a staging copy (FDA_ESG_STAGING_*) in which
 * the same failure releases the claim and voids the signature it was given, so
 * that signature, given for a test send, never files the sequence.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import JSZip from 'jszip';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import os from 'os';
import path from 'path';

const poolCalls: Array<{ text: string; params?: unknown[] }> = [];
const recordedIdentity = () => ({ programId: 'p-1', applicationNumber: '123456', applicantName: 'Concept2Cure Therapeutics',
  applicantSponsorId: '22222222-2222-4222-8222-222222222222', applicantId: '123456789',
  contact: { name: 'Regulatory Contact', phone: '+1 617 555 0100', email: 'regulatory@example.test' } });
const state = { dispatchStatus: 'pending' as string, signatureActionId: null as string | null, attemptId: null as string | null, signatureSpent: false, spendAfterLock: false, signatureVoided: false,
  /** The environment the signature names: the send's own unless a case says otherwise (F1, row D7). */
  signedEnvironment: 'staging' as 'staging' | 'production' };

vi.mock('../../../db', () => {
  const rowsFor = (tableName: string) => {
    if (tableName === 'ectd_sequences') return [{ id: 1, submissionId: 1, region: 'fda', sequenceNumber: '0000', status: 'dispatched', dispatchStatus: state.dispatchStatus, type: 'original', organizationId: 7 }];
    if (tableName === 'submissions') return [{ id: 1, clientType: 'biotech', applicationType: 'ind', organizationId: 7, programId: 'p-1' }];
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
    // The signature names the environment of the send it was given for (F1, row D7, 2026-11-08).
    if (t.includes('c2c_ana_actions')) return { rows: [{ id: 'sig-1', payload: { intent: 'transmit', meaning: 'release', environment: state.signedEnvironment } }] };
    if (t.includes('audit_logs')) return { rows: state.signatureSpent ? [{ action: 'ECTD_TRANSMITTED' }] : [] };
    if (t.includes('electronic_signatures')) return { rows: [{ bound_payload_digest: 'd', binding_basis: 'ectd-sequence-leaf-manifest-sha256', superseded_by: null, is_valid: true, verification_status: 'valid' }] };
    return { rows: [] };
  };
  const applyDispatchMutation = (text: string, params?: unknown[]) => {
    if (/SET dispatch_status = \$3/.test(text)) { state.dispatchStatus = String(params?.[2]); state.signatureActionId = String(params?.[3]); state.attemptId = String(params?.[4]); return { rowCount: 1, rows: [{ id: 1 }] }; }
    if (/SET dispatch_status = 'pending'/.test(text)) {
      if (state.dispatchStatus === 'transmitting' && state.signatureActionId === params?.[3] && state.attemptId === params?.[4]) { state.dispatchStatus = 'pending'; state.signatureActionId = null; state.attemptId = null; }
      return { rowCount: 1, rows: [] };
    }
    return undefined;
  };
  const pool = {
    query: async (text: string, params?: unknown[]) => {
      poolCalls.push({ text, params });
      if (/FROM ectd_sequences.*FOR UPDATE/.test(text)) {
        if (state.spendAfterLock) state.signatureSpent = true;
        return { rowCount: 1, rows: [{ id: 1, submission_id: 1 }] };
      }
      if (/FROM submissions/.test(text)) return { rowCount: 1, rows: [{ program_id: 'p-1', primary_region: 'fda' }] };
      if (/FROM audit_logs/.test(text)) return { rows: state.signatureSpent ? [{ action: 'ECTD_TRANSMITTED' }] : [] };
      const mutation = applyDispatchMutation(text, params);
      if (mutation) return mutation;
      // A refused step's signature taken out of force (voidSignatureForRefusedAct, P-23).
      if (/UPDATE electronic_signatures/.test(text)) { state.signatureVoided = true; return { rowCount: 1, rows: [{ id: 5 }] }; }
      // New AS2 proof metadata commits before the network; this fixture is not
      // an intentional missing-row/persistence-failure scenario.
      if (/UPDATE submission_transmittals SET metadata = jsonb_set/.test(text)) return { rowCount: 1, rows: [{ id: 99 }] };
      // The FDA gateway's transmittal row (the AS2 cases reach it).
      if (/INSERT INTO submission_transmittals/.test(text)) return { rowCount: 1, rows: [{ id: 99 }] };
      // What the package names, from the record (package-identity.ts, QA j6).
      // The project's home market is FDA's (P-44): a package names the number only for a market it resolves.
      if (/LEFT JOIN ind_sponsors/.test(text)) return { rows: [{ organization_name: 'Concept2Cure Therapeutics', application_number: '123456', primary_agency: 'FDA',
        applicant_sponsor_id: '22222222-2222-4222-8222-222222222222', sponsor_id: '22222222-2222-4222-8222-222222222222',
        sponsor_name: 'Concept2Cure Therapeutics', duns: '123456789', contact_name: 'Regulatory Contact', contact_phone: '+1 617 555 0100', contact_email: 'regulatory@example.test' }] };
      if (/FROM organizations/.test(text)) return { rowCount: 1, rows: [{ name: 'Concept2Cure Therapeutics' }] };
      if (/FROM regulatory_programs/.test(text)) return { rowCount: 1, rows: [{ application_number: '123456' }] };
      return { rowCount: 0, rows: [] };
    },
    connect: async () => ({
      query: (query: string | { text: string }, params?: unknown[]) => pool.query(typeof query === 'string' ? query : query.text, params),
      release: () => undefined,
    }),
  };
  return { db: { select, execute }, pool };
});
// The guarded transmit keeps the sent package before the wire (sent-package-archive.ts), in memory here,
// counting what it stores so a refusal before the guard can show nothing was kept.
const archived = { puts: 0 };
vi.mock('../../storage', async () => {
  const { storageModule } = await import('../../submission-gateways/__tests__/sent-package-storage-stub');
  const provider = storageModule.getStorageProvider();
  return {
    getStorageProvider: () => ({
      ...provider,
      put: async (o: { bytes: Buffer }) => { archived.puts += 1; return provider.put(o); },
    }),
  };
});
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) }, writeChainedAuditRow: vi.fn() }));
vi.mock('../../part11/signature-persistence', async (orig) => ({
  ...(await orig<any>()),
  deriveGovernedTargetBinding: async () => ({ digest: 'd', basis: 'ectd-sequence-leaf-manifest-sha256', note: '', recordedPackageIdentity: { version: 1, identity: recordedIdentity() } }),
  isSignatureWithdrawn: () => false,
}));
vi.mock('../../ectd/assess-dispatch-readiness', () => ({
  assessSequenceDispatchReadiness: async () => ({ gate: { cleared: true, blockers: [] } }),
}));

// The leaf manifest every assembled bundle carries (regional-packager.ts packageEctdSubmission
// always sets it); a sequence transmit without one is refused by the guard before these cases.
const LEAF_MANIFEST = [{ ctdSection: '2.2', fileName: 'intro.pdf', href: '0000/m2/22-intro/intro.pdf', md5: '0'.repeat(32), operation: 'new' }];
const bundle = { path: '', sha256: '', sizeBytes: 0, format: 'ectd' as const, leafManifest: LEAF_MANIFEST };
vi.mock('../../ectd/assemble-from-core', () => ({
  assembleSequence: async (args: { recordedPackageIdentity?: unknown }) => ({ bundle, recordedPackageIdentity: args.recordedPackageIdentity, skipped: [], unfinalized: 0, unfinalizedSections: [], unresolvedLeaves: [], materialized: 1, cleanup: async () => {} }),
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
  return { path: p, sha256: createHash('sha256').update(buf).digest('hex'), sizeBytes: buf.length, format: 'ectd', leafManifest: LEAF_MANIFEST };
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

// AS2 staging credentials — what FdaEsgGateway.isConfigured checks. The PEM paths are filled in beforeAll.
const AS2_ENV: Record<string, string> = {
  FDA_ESG_STAGING_URL: 'https://esg.example.invalid',
  FDA_ESG_STAGING_AS2_FROM: 'SPONSOR',
  // FDA's AS2 identifier has no default (2026-10-01, W5/D7, sweep F16).
  FDA_ESG_STAGING_AS2_TO: 'FDA-AS2-ID-TEST',
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
  state.signatureActionId = null;
  state.attemptId = null;
  state.signatureSpent = false;
  state.spendAfterLock = false;
  state.signatureVoided = false;
  poolCalls.length = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
  archived.puts = 0;
  for (const k of [...Object.keys(REST_ENV), ...Object.keys(AS2_ENV), 'FDA_ESG_STAGING_TLS_CA_PATH']) delete process.env[k];
  for (const k of Object.keys(process.env)) if (/^FDA_ESG_(?!STAGING_)/.test(k)) delete process.env[k];
});

const transmit = (environment: 'staging' | 'production' = 'staging') => {
  state.signedEnvironment = environment;
  return transmitSequence({
    sequenceId: 1, ctx: { organizationId: 7, userId: 11 }, signatureActionId: 'sig-1',
    environment, applicationId: '123456',
  }).catch((e) => e);
};
/** What a person is told when a test send failed after the wire. */
const TEST_SEND_RELEASED = /agency's test environment, which files nothing/;

describe('transmit guard refusal before the wire', () => {
  it('refuses a signature consumed by verified receipt settlement before taking another claim', async () => {
    state.signatureSpent = true;
    vi.spyOn(FdaEsgGateway.prototype, 'isConfigured').mockResolvedValue(true);
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue({} as any);
    const error = await transmit();
    expect(error).toMatchObject({ code: 'GOVERNED_REQUIRED' });
    expect(String(error.message)).toContain('already authorized a governed transition');
    expect(poolCalls.some((c) => /SET dispatch_status = \$3/.test(c.text))).toBe(false);
    expect(wire).not.toHaveBeenCalled();
  });

  it('rechecks the canonical spent ledger after acquiring the sequence lock, before claiming or sending', async () => {
    state.spendAfterLock = true;
    vi.spyOn(FdaEsgGateway.prototype, 'isConfigured').mockResolvedValue(true);
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue({} as any);
    const error = await transmit();
    expect(error).toMatchObject({ code: 'GOVERNED_REQUIRED' });
    expect(String(error.message)).toContain('already used or voided');
    const lock = poolCalls.findIndex((c) => /FROM ectd_sequences.*FOR UPDATE/.test(c.text));
    const freshLedger = poolCalls.findIndex((c) => /FROM audit_logs/.test(c.text));
    expect(lock).toBeGreaterThan(-1);
    expect(freshLedger).toBeGreaterThan(lock);
    expect(poolCalls.some((c) => /SET dispatch_status = \$3/.test(c.text))).toBe(false);
    expect(wire).not.toHaveBeenCalled();
  });

  it('releases the claim, so the sequence is not left "in flight" when nothing was sent', async () => {
    Object.assign(bundle, bundles.encrypted);
    vi.spyOn(FdaEsgGateway.prototype, 'isConfigured').mockResolvedValue(true);
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue({} as any);
    const err = await transmitSequence({
      sequenceId: 1, ctx: { organizationId: 7, userId: 11 }, signatureActionId: 'sig-1',
      environment: 'staging', applicationId: '123456',
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

describe('an FDA package over 1 GiB is refused at the act, on the bytes it assembled (P-93, site c)', () => {
  it('refuses with DISPATCH_BLOCKED before the guard, the archive or the gateway, and releases the claim', async () => {
    // The input the retired SFTP cases used: a configured AS2 route, a claim
    // taken, and a package of 1 GiB and one byte. Transmit's package re-check
    // reads the size itself; nothing downstream is reached.
    Object.assign(bundle, bundles.clean, { sizeBytes: 1_073_741_825 });
    Object.assign(process.env, AS2_ENV);
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit');
    const err = await transmit();
    expect(err?.code).toBe('DISPATCH_BLOCKED');
    expect(String(err?.message)).toBe('Transmit blocked — the package is just over 1 GiB (1,073,741,825 bytes), and at ' +
      'launch Concept2Cure sends packages of up to 1 GiB to FDA. Nothing was sent. The signature given for this transmit is ' +
      'now void; sign again for a new attempt.');
    // A refused step takes its signature out of force (P-23).
    expect(state.signatureVoided).toBe(true);
    expect(claimTaken()).toBe(true);
    expect(state.dispatchStatus).toBe('pending');
    expect(resendRefusal(state.dispatchStatus)).toBeNull();
    expect(wire).not.toHaveBeenCalled();
    expect(archived.puts).toBe(0);
    expect(poolCalls.some((c) => /INSERT INTO submission_transmittals/.test(c.text))).toBe(false);
  });
});

/* 2026-09-23 (W5/D7, MDN close). The real FDA ESG AS2 path against a real
   local mTLS server (../../submission-gateways/__tests__/support/mtls-pki.ts):
   the delivery classifier decides, and only its NOT_DELIVERED verdict — proof
   that nothing reached an authenticated FDA server — releases the claim. */
describe('the FDA AS2 POST, classified by the delivery classifier', () => {
  let pki: MtlsPki;
  let server: MtlsServer;
  /** The FDA ESG AS2 credentials for one environment: FDA_ESG_STAGING_* for staging, FDA_ESG_* for production. */
  const mtlsEnv = (client: 'trusted' | 'rogue', environment: 'staging' | 'production' = 'staging', url = `https://127.0.0.1:${server.port}/as2`): Record<string, string> => {
    const p = environment === 'production' ? 'FDA_ESG_' : 'FDA_ESG_STAGING_';
    return {
      [`${p}URL`]: url,
      [`${p}AS2_FROM`]: 'SPONSOR-AS2',
      [`${p}AS2_TO`]: 'FDA-AS2-ID-TEST',
      [`${p}CERT_PATH`]: client === 'trusted' ? pki.paths.clientCert : pki.paths.rogueCert,
      [`${p}KEY_PATH`]: client === 'trusted' ? pki.paths.clientKey : pki.paths.rogueKey,
      [`${p}FDA_CERT_PATH`]: pki.paths.ca,
      // TLS trust and the recipient's AS2 encryption certificate are independent.
      [`${p}TLS_CA_PATH`]: pki.paths.ca,
    };
  };
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

  it('NEGATIVE — DELIVERED_UNCONFIRMED (HTTP 502 after the whole bundle) on a production send: in transit, the claim stays transmitting', async () => {
    Object.assign(bundle, bundles.clean);
    Object.assign(process.env, mtlsEnv('trusted', 'production'));
    server.respond = (_req, res) => { res.writeHead(502); res.end('Bad Gateway'); };
    const err = await transmit('production');
    expect(server.seen).toHaveLength(1);
    // The network body is the real encrypted CMS entity, not the plaintext ZIP.
    expect(server.seen[0].body.length).toBeGreaterThan(bundles.clean.sizeBytes);
    expect(server.seen[0].body.length).toBe(Number(server.seen[0].headers['content-length']));
    expect(server.seen[0].headers['content-type']).toContain('application/pkcs7-mime');
    expect(err).toBeInstanceOf(GatewayError);
    expect(String(err?.message)).toMatch(/may hold it/);
    expect(poolCalls.some((c) => /UPDATE submission_transmittals/.test(c.text) && c.params?.includes('in_transit'))).toBe(true);
    expect(poolCalls.some((c) => /UPDATE submission_transmittals/.test(c.text) && c.params?.includes('rejected'))).toBe(false);
    expect(claimTaken()).toBe(true);
    expect(state.dispatchStatus).toBe('transmitting');
    expect(resendRefusal(state.dispatchStatus)).not.toBeNull();
    expect(state.signatureVoided, 'a production send that may be at FDA voided its signature').toBe(false);
  });

  it('the same failure on a send to the TEST environment: the claim is released and its signature voided (F1)', async () => {
    Object.assign(bundle, bundles.clean);
    Object.assign(process.env, mtlsEnv('trusted', 'staging'));
    server.respond = (_req, res) => { res.writeHead(502); res.end('Bad Gateway'); };
    const err = await transmit('staging');
    expect(server.seen).toHaveLength(1);
    expect(err).toBeInstanceOf(GatewayError);
    expect(claimTaken()).toBe(true);
    expect(state.dispatchStatus, 'a failed test send held the sequence').toBe('pending');
    expect(resendRefusal(state.dispatchStatus)).toBeNull();
    expect(state.signatureVoided, 'the test send signature stayed able to file the sequence').toBe(true);
    expect(String(err?.message)).toMatch(/may hold it/);
    expect(String(err?.message)).toMatch(TEST_SEND_RELEASED);
  });

  // Each environment separately: what a production send must keep, a test send releases.
  it.each([
    ['HTTP 502', 'production', 'transmitting transmitted=undefined voided=false', { mode: 'answer' as const, status: 502, delayMs: 10 }],
    ['a reset', 'production', 'transmitting transmitted=undefined voided=false', { mode: 'reset' as const, delayMs: 10 }],
    ['HTTP 502', 'staging', 'pending transmitted=undefined voided=true', { mode: 'answer' as const, status: 502, delayMs: 10 }],
    ['a reset', 'staging', 'pending transmitted=undefined voided=true', { mode: 'reset' as const, delayMs: 10 }],
  ] as const)('NEGATIVE — %s on a %s send from a separate-process server that read the whole bundle, while this process is busy: %s', async (_label, environment, expected, opts) => {
    Object.assign(bundle, bundles.clean);
    const srv = await startSeparateProcessServer(pki, opts);
    Object.assign(process.env, mtlsEnv('trusted', environment, `https://127.0.0.1:${srv.port}/as2`));
    const outcomes: string[] = [];
    const stop = busyLoop(30);
    try {
      for (let i = 0; i < 3; i++) {
        state.dispatchStatus = 'pending';
        state.signatureVoided = false;
        poolCalls.length = 0;
        const err = await transmit(environment);
        const received = await srv.nextClose();
        expect(received.bodyRead).toBe(received.contentLength);
        expect(received.contentLength).toBeGreaterThan(bundles.clean.sizeBytes);
        expect(claimTaken()).toBe(true);
        outcomes.push(`${state.dispatchStatus} transmitted=${String(err?.transmitted)} voided=${String(state.signatureVoided)}`);
      }
    } finally {
      stop();
      srv.close();
    }
    expect(outcomes).toEqual(Array(3).fill(expected));
  }, 120_000);
});

describe('a failure from inside the gateway after the guard passed (NEGATIVE)', () => {
  // Delivery is unknown: the bytes may be at the agency. Releasing here would
  // reset the sequence to 'pending' and invite a second real transmission.
  it.each([
    ['TransportError', () => new TransportError('socket hang up after the POST body was sent')],
    ['GatewayError', () => new GatewayError('FDA ESG AS2 returned HTTP 500', 500, null, 'boom')],
  ])('%s on a production send keeps the claim at transmitting', async (_label, make) => {
    Object.assign(bundle, bundles.clean);
    vi.spyOn(FdaEsgGateway.prototype, 'isConfigured').mockResolvedValue(true);
    const thrown = make();
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockRejectedValue(thrown);
    const err = await transmit('production');
    expect(wire).toHaveBeenCalledTimes(1);
    expect(err).toBe(thrown);
    expect(claimTaken()).toBe(true);
    expect(state.dispatchStatus).toBe('transmitting');
    expect(resendRefusal(state.dispatchStatus)).not.toBeNull();
    expect(state.signatureVoided).toBe(false);
  });

  // F1 (row D7): the agency's test environment holds no filing, so the same
  // failure there releases the claim, after voiding the signature it was given.
  it.each([
    ['TransportError', () => new TransportError('socket hang up after the POST body was sent')],
    ['GatewayError', () => new GatewayError('FDA ESG AS2 returned HTTP 500', 500, null, 'boom')],
  ])('%s on a send to the test environment releases the claim and voids its signature', async (_label, make) => {
    Object.assign(bundle, bundles.clean);
    vi.spyOn(FdaEsgGateway.prototype, 'isConfigured').mockResolvedValue(true);
    const thrown = make();
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockRejectedValue(thrown);
    const err = await transmit('staging');
    expect(wire).toHaveBeenCalledTimes(1);
    expect(err).toBe(thrown);
    expect(claimTaken()).toBe(true);
    expect(state.dispatchStatus, 'a failed test send held the sequence').toBe('pending');
    expect(resendRefusal(state.dispatchStatus)).toBeNull();
    expect(state.signatureVoided).toBe(true);
    // Voided before it was released: the release is the last write of the attempt.
    const voidAt = poolCalls.findIndex((c) => /UPDATE electronic_signatures/.test(c.text));
    const releaseAt = poolCalls.findIndex((c) => /SET dispatch_status = 'pending'/.test(c.text));
    expect(voidAt).toBeGreaterThan(-1);
    expect(releaseAt).toBeGreaterThan(voidAt);
    expect(String(err?.message)).toMatch(TEST_SEND_RELEASED);
  });
});

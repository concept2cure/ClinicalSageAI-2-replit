/**
 * refusedBeforeWire — which transmit failures prove nothing reached the agency.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic). transmitSequence releases its transmit
 * claim only when refusedBeforeWire(err) is true; every other failure leaves the
 * sequence 'transmitting' for a human, because bytes may be at the agency. Two
 * defects in the rule, both pinned here:
 *
 *  1. It recognised only the getGateway guard's own refusals. A refusal made
 *     INSIDE a gateway before anything is sent — UnverifiedTransportError from
 *     the FDA NextGen REST adapter (which declares transmitted === false), the
 *     ValidationError requiredAgencyMetadata raises before any transmittal row —
 *     stranded a never-sent sequence at 'transmitting'.
 *  2. Nothing tested the safety half: an error from impl.transmit AFTER the
 *     guard passed must NOT be read as pre-wire, or a post-wire failure resets
 *     the sequence to 'pending' and invites a second real transmission.
 *
 * The recognition is typed, not duck-typed: only the declared error classes
 * carrying a literal `transmitted === false` count; an arbitrary Error with such
 * a property does not.
 *
 * 2026-09-23 (W5/D7, round-3 skeptic): two more pre-wire refusals stranded the
 * claim. (3) CredentialError — raised only by credential checks before any
 * request, including transmitViaSftp's check on a >1 GiB FDA sequence, which
 * isConfigured (AS2 only) does not see — is now recognised by class; the
 * source pin below fails when a new site appears, so each is audited. (4) A
 * TransportError can now carry NOTHING_TRANSMITTED, for the SFTP client-module
 * refusal that runs before connect(); without the proof it still proves
 * nothing.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import JSZip from 'jszip';
import { promises as fs, readFileSync, readdirSync, statSync } from 'fs';
import { createHash } from 'crypto';
import os from 'os';
import path from 'path';

import { getGateway, refusedBeforeWire } from '../index';
import { FdaEsgGateway } from '../fda-esg';
import { MhraGateway } from '../mhra-gateway';
import { RequestSentTransportError } from '../as2-transport';
import { submissionBundleRoot } from '../bundle-namespace';
import {
  CredentialError, GatewayError, NOTHING_TRANSMITTED, TransportError, UnverifiedTransportError, ValidationError,
  requiredAgencyMetadata,
  type GatewayTransmitRequest,
} from '../types';

const bundle = { path: '', sha256: '', sizeBytes: 0, format: 'ectd' as const };

beforeAll(async () => {
  // A clean (unencrypted) PDF leaf, so the getGateway guard passes and the
  // failure under test comes from the gateway implementation.
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
  const zip = new JSZip();
  zip.file('0000/m2/22-intro/intro.pdf', pdf);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const p = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'rbw-bundle-')), 'b.zip');
  await fs.writeFile(p, buf);
  Object.assign(bundle, { path: p, sha256: createHash('sha256').update(buf).digest('hex'), sizeBytes: buf.length });
});

const REST_ENV = {
  FDA_ESG_STAGING_TRANSPORT: 'rest',
  FDA_ESG_STAGING_REST_URL: 'https://esg-nextgen.example.invalid',
  FDA_ESG_STAGING_REST_CLIENT_ID: 'c',
  FDA_ESG_STAGING_REST_CLIENT_SECRET: 's',
  FDA_ESG_STAGING_REST_SUBMITTER_ID: 'sub',
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const k of Object.keys(REST_ENV)) delete process.env[k];
});

function request(overrides: Partial<GatewayTransmitRequest> = {}): GatewayTransmitRequest {
  return {
    organizationId: 7,
    userId: 11,
    programId: null,
    packageId: null,
    bundle,
    environment: 'staging',
    submissionType: 'original',
    metadata: { applicationId: 'IND123456', sequence: '0000', environment: 'staging' },
    authorization: { kind: 'governed-signature', signatureActionId: 'sig-1', actorUserId: 11 },
    ...overrides,
  } as GatewayTransmitRequest;
}

async function failureOf(p: Promise<unknown>): Promise<unknown> {
  return p.then(() => { throw new Error('expected the transmit to reject'); }, (e) => e);
}

describe('refusedBeforeWire — the guard refuses before the gateway', () => {
  it('is true for a guard refusal, and the gateway is never called', async () => {
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit');
    const err = await failureOf(getGateway('fda', 'esg').transmit(request({ authorization: undefined as never })));
    expect((err as Error).name).toBe('TransmitAuthorizationError');
    expect(wire).not.toHaveBeenCalled();
    expect(refusedBeforeWire(err)).toBe(true);
  });
});

describe('refusedBeforeWire — failures from inside the gateway after the guard passed', () => {
  // The safety half: delivery is unknown, so none of these may release a claim.
  it.each([
    ['TransportError', () => new TransportError('socket hang up after the POST body was sent')],
    ['GatewayError', () => new GatewayError('FDA ESG AS2 returned HTTP 500', 500, null, 'boom')],
    ['a plain Error', () => new Error('unexpected')],
    ['an unmarked ValidationError', () => new ValidationError('agency rejected the metadata', [])],
  ])('is false for %s raised by impl.transmit', async (_label, make) => {
    const thrown = make();
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockRejectedValue(thrown);
    const err = await failureOf(getGateway('fda', 'esg').transmit(request()));
    expect(wire).toHaveBeenCalledTimes(1);
    expect(err).toBe(thrown);
    expect(refusedBeforeWire(err)).toBe(false);
  });

  it('is false for an arbitrary error that merely carries transmitted === false (typed, not duck-typed)', async () => {
    const thrown = Object.assign(new Error('claims nothing was sent'), { transmitted: false as const });
    vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockRejectedValue(thrown);
    const err = await failureOf(getGateway('fda', 'esg').transmit(request()));
    expect(refusedBeforeWire(err)).toBe(false);
    expect(refusedBeforeWire({ transmitted: false })).toBe(false);
  });
});

describe('refusedBeforeWire — refusals inside a gateway that PROVE nothing was sent', () => {
  it('is true for the FDA NextGen REST refusal (UnverifiedTransportError, transmitted === false)', async () => {
    Object.assign(process.env, REST_ENV);
    const err = await failureOf(getGateway('fda', 'esg').transmit(request()));
    expect(err).toBeInstanceOf(UnverifiedTransportError);
    expect((err as UnverifiedTransportError).transmitted).toBe(false);
    expect(refusedBeforeWire(err)).toBe(true);
  });

  it('is true for the requiredAgencyMetadata refusal raised before the transmittal row', async () => {
    // Spied, not mocked: the real MHRA transmit runs, and requiredAgencyMetadata
    // is its first act — before insertTransmittal and before any socket.
    const wire = vi.spyOn(MhraGateway.prototype, 'transmit');
    const err = await failureOf(getGateway('uk', 'mhra_gateway').transmit(request({ metadata: { applicationId: 'PL12345' } })));
    expect(wire).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(ValidationError);
    expect(String((err as Error).message)).toMatch(/four-digit eCTD sequence number/);
    expect(refusedBeforeWire(err)).toBe(true);
  });

  it('requiredAgencyMetadata marks both of its refusals, and only those', () => {
    const noSeq = (() => { try { requiredAgencyMetadata(request({ metadata: {} })); } catch (e) { return e; } })();
    const noType = (() => { try { requiredAgencyMetadata(request({ submissionType: '' })); } catch (e) { return e; } })();
    expect((noSeq as ValidationError).transmitted).toBe(false);
    expect((noType as ValidationError).transmitted).toBe(false);
    expect(new ValidationError('x', []).transmitted).toBeUndefined();
  });
});

const dbCalls: string[] = [];
vi.mock('../../../db', () => ({
  db: {},
  pool: {
    query: async (text: string) => {
      dbCalls.push(text.replace(/\s+/g, ' ').trim());
      return /INSERT INTO submission_transmittals/.test(text) ? { rowCount: 1, rows: [{ id: 41 }] } : { rowCount: 1, rows: [] };
    },
  },
}));

describe('refusedBeforeWire — CredentialError and the proof-carrying TransportError (round-3 skeptic)', () => {
  it('is true for a CredentialError raised by a gateway\'s credential check (real MHRA transmit, no credentials)', async () => {
    for (const k of ['MHRA_STAGING_URL', 'MHRA_STAGING_API_KEY', 'MHRA_STAGING_ORG_ID']) delete process.env[k];
    dbCalls.length = 0;
    const err = await failureOf(getGateway('uk', 'mhra_gateway').transmit(request({ metadata: { applicationId: 'PL12345', sequence: '0000' } })));
    expect(err).toBeInstanceOf(CredentialError);
    // The gateway recorded its own row as refused before any request.
    expect(dbCalls.some((t) => /UPDATE submission_transmittals/.test(t))).toBe(true);
    expect(refusedBeforeWire(err)).toBe(true);
    expect(refusedBeforeWire(new CredentialError('fda', 'esg', 'staging', ['FDA_ESG_STAGING_SFTP_HOST']))).toBe(true);
  });

  it('is true for a TransportError only when its throw site passed NOTHING_TRANSMITTED', () => {
    expect(refusedBeforeWire(new TransportError('client module unavailable; nothing was sent', undefined, NOTHING_TRANSMITTED))).toBe(true);
    expect(new TransportError('x', undefined, NOTHING_TRANSMITTED).transmitted).toBe(false);
    expect(new TransportError('socket hang up').transmitted).toBeUndefined();
    expect(refusedBeforeWire(new TransportError('socket hang up', new Error('ECONNRESET')))).toBe(false);
    // The AS2 "whole request was sent" subclass cannot carry the proof.
    expect(refusedBeforeWire(new RequestSentTransportError('ESG AS2 POST: socket hang up', new Error('ECONNRESET')))).toBe(false);
  });

  // Recognising CredentialError by class is sound only while every site raises
  // it from a credential check made before any request. This pins the audited
  // set (2026-09-23): a new site fails here until someone confirms it cannot
  // run after bytes left, and records it.
  it('every `new CredentialError(` in server/ is at an audited pre-request site', () => {
    const AUDITED: Record<string, number> = {
      'server/services/submission-gateways/anvisa-gateway.ts': 1,
      'server/services/submission-gateways/cdsco-sugam-gateway.ts': 1,
      'server/services/submission-gateways/ema-cesp.ts': 2,
      // loadFdaCredentials, resolveFdaEsgTransport, loadFdaRestCredentials,
      // and transmitViaSftp's check before the client module loads or connects.
      'server/services/submission-gateways/fda-esg.ts': 4,
      'server/services/submission-gateways/health-canada-gateway.ts': 1,
      'server/services/submission-gateways/hsa-prism-gateway.ts': 1,
      'server/services/submission-gateways/mfds-gateway.ts': 1,
      'server/services/submission-gateways/mhra-gateway.ts': 1,
      'server/services/submission-gateways/nmpa-gateway.ts': 1,
      'server/services/submission-gateways/pmda-gateway.ts': 1,
      'server/services/submission-gateways/swissmedic-egateway.ts': 1,
      'server/services/submission-gateways/tga-ebs-gateway.ts': 1,
    };
    const repo = path.resolve(__dirname, '../../../..');
    const found: Record<string, number> = {};
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const abs = path.join(dir, name);
        if (statSync(abs).isDirectory()) {
          if (name !== '__tests__' && name !== 'node_modules') walk(abs);
        } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const n = (readFileSync(abs, 'utf8').match(/new CredentialError\(/g) ?? []).length;
          if (n > 0) found[path.relative(repo, abs).split(path.sep).join('/')] = n;
        }
      }
    };
    walk(path.join(repo, 'server'));
    expect(found).toEqual(AUDITED);
  });
});

describe('test setup keeps staged bundles out of the repository', () => {
  // 2026-09-23 (W5/D7, round-2 skeptic): assembleSequence stages under
  // <bundle root>/staging, and with SUBMISSION_BUNDLE_DIR unset the root is
  // <cwd>/uploads/submission-bundles — tests that never reached cleanup() left
  // packages in the repository's own uploads/. tests/setup.ts now points the
  // root at a temp directory.
  it('resolves the bundle root outside the working tree', () => {
    const root = submissionBundleRoot();
    expect(root.startsWith(path.resolve(process.cwd()) + path.sep)).toBe(false);
    expect(root.startsWith(path.resolve(os.tmpdir()))).toBe(true);
  });
});

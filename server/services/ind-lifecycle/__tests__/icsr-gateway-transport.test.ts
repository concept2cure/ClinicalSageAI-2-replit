/**
 * Fail-closed tests for the ICSR gateway transport adapter.
 *
 * `transmitIcsr` must NOT fabricate an agency acknowledgement. It:
 *   - refuses a message the readiness gate marks not-ready (any environment);
 *   - in production with no configured gateway, THROWS (never fakes an ACK);
 *   - outside production returns an explicitly `simulated` receipt with a
 *     deterministic timestamp sourced from an injectable clock;
 *   - with a gateway CONFIGURED, makes the real call over the shared AS2
 *     transport (or HTTPS Basic) and reports `transmitted` ONLY when the
 *     agency endpoint accepted — every other outcome is a typed error and an
 *     audited refusal (runbook B7; W5 2026-09-20). Only `node:https` is
 *     stubbed: envelope construction, body signing and MDN interpretation run.
 *
 * Mirrors server/services/__tests__/fdaIntegrationService.failclosed.test.ts
 * (set/restore NODE_ENV + env vars, deterministic asserted output).
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateKeyPairSync, createVerify } from 'crypto';

/* ─── Network boundary — the ONLY thing stubbed ───────────────────── */

const { httpsRequests, wire } = vi.hoisted(() => ({
  httpsRequests: [] as Array<{ options: any; body: Buffer }>,
  wire: {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    /** When set, the socket errors instead of answering. */
    error: null as string | null,
  },
}));

vi.mock('node:https', () => {
  const request = (options: any, cb: (res: any) => void) => {
    const chunks: Buffer[] = [];
    const listeners: Record<string, (arg?: unknown) => void> = {};
    const req = {
      on: (event: string, h: (arg?: unknown) => void) => { listeners[event] = h; return req; },
      write: (b: Buffer) => { chunks.push(Buffer.from(b)); return true; },
      end: () => {
        httpsRequests.push({ options, body: Buffer.concat(chunks) });
        if (wire.error) {
          globalThis.setImmediate(() => listeners.error?.(new Error(wire.error!)));
          return;
        }
        const handlers: Record<string, (arg?: unknown) => void> = {};
        const res = {
          statusCode: wire.statusCode,
          headers: { ...wire.headers },
          on: (event: string, h: (arg?: unknown) => void) => { handlers[event] = h; return res; },
        };
        globalThis.setImmediate(() => {
          cb(res);
          handlers.data?.(Buffer.from(wire.body, 'utf8'));
          handlers.end?.();
        });
      },
      destroy: () => undefined,
    };
    return req;
  };
  return { request, default: { request } };
});

import {
  transmitIcsr,
  resolveGatewayConfig,
  resolveProtocol,
  IcsrNotReadyError,
  IcsrGatewayNotConfiguredError,
  IcsrGatewayTransmitError,
} from '../icsr-gateway-transport';
import type { IcsrTransmissionResult } from '../e2b-icsr-message';

const ORIGINAL_ENV = process.env.NODE_ENV;
const GATEWAY_ENV = [
  'ICSR_GATEWAY_URL',
  'ICSR_GATEWAY_USERNAME',
  'ICSR_GATEWAY_PASSWORD',
  'ICSR_GATEWAY_CERT_PATH',
  'ICSR_GATEWAY_KEY_PATH',
  'ICSR_GATEWAY_AGENCY_CERT_PATH',
  'ICSR_GATEWAY_AS2_TO',
  'ICSR_GATEWAY_PROTOCOL',
] as const;
const ORIGINAL_GATEWAY: Record<string, string | undefined> = {};

// Fixed clock so the simulated receipt timestamp is deterministic.
const FIXED_MS = Date.parse('2026-06-15T00:00:00.000Z');
const fixedClock = () => FIXED_MS;

function readyMessage(overrides: Partial<IcsrTransmissionResult> = {}): IcsrTransmissionResult {
  return {
    message:
      '<?xml version="1.0" encoding="UTF-8"?>\n<ichicsrMessage>' +
      '<M.1.1>MSG-2026-0001</M.1.1></ichicsrMessage>',
    transmitReady: true,
    gaps: [],
    gateway: 'FDA_FAERS',
    receiverId: 'ZZFDA',
    ...overrides,
  };
}

function notReadyMessage(): IcsrTransmissionResult {
  return readyMessage({
    transmitReady: false,
    gaps: [{ id: 'G.k.2.2', label: 'Suspect product name' }],
  });
}

describe('ICSR gateway transport fail-closed', () => {
  beforeEach(() => {
    for (const key of GATEWAY_ENV) {
      ORIGINAL_GATEWAY[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
    for (const key of GATEWAY_ENV) {
      if (ORIGINAL_GATEWAY[key] === undefined) delete process.env[key];
      else process.env[key] = ORIGINAL_GATEWAY[key];
    }
  });

  it('refuses to transmit a not-ready message (readiness gating) in any env', async () => {
    process.env.NODE_ENV = 'test';
    const audit = vi.fn();
    await expect(
      transmitIcsr(notReadyMessage(), { now: fixedClock, audit }),
    ).rejects.toBeInstanceOf(IcsrNotReadyError);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'refused', reason: 'not-ready', action: 'icsr_transmit' }),
    );
  });

  it('refuses a not-ready message even in production', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      transmitIcsr(notReadyMessage(), { now: fixedClock }),
    ).rejects.toBeInstanceOf(IcsrNotReadyError);
  });

  it('throws in production with no gateway configured (never fakes an ACK)', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      transmitIcsr(readyMessage(), { now: fixedClock }),
    ).rejects.toBeInstanceOf(IcsrGatewayNotConfiguredError);
  });

  it('audits a production refusal as not-configured', async () => {
    process.env.NODE_ENV = 'production';
    const audit = vi.fn();
    await expect(transmitIcsr(readyMessage(), { now: fixedClock, audit })).rejects.toThrow();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'refused', reason: 'not-configured' }),
    );
  });

  it('returns a deterministic simulated receipt outside production', async () => {
    process.env.NODE_ENV = 'test';
    const audit = vi.fn();
    const receipt = await transmitIcsr(readyMessage(), { now: fixedClock, audit });

    expect(receipt.simulated).toBe(true);
    expect(receipt.status).toBe('simulated');
    expect(receipt.gateway).toBe('FDA_FAERS');
    expect(receipt.receiverId).toBe('ZZFDA');
    expect(receipt.messageId).toBe('MSG-2026-0001');
    expect(receipt.receiptId).toBe('SIMULATED-MSG-2026-0001');
    expect(receipt.timestamp).toBe('2026-06-15T00:00:00.000Z');
    expect(receipt.message).toMatch(/SIMULATED/i);

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'simulated', action: 'icsr_transmit' }),
    );
  });

  it('does not use Date.now() for the asserted timestamp (injectable clock)', async () => {
    process.env.NODE_ENV = 'test';
    const spy = vi.spyOn(Date, 'now');
    const receipt = await transmitIcsr(readyMessage(), { now: fixedClock });
    expect(receipt.timestamp).toBe('2026-06-15T00:00:00.000Z');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('with a gateway configured, no longer refuses as not-implemented: the real call is attempted', async () => {
    process.env.NODE_ENV = 'test';
    process.env.ICSR_GATEWAY_URL = 'https://gateway.example/icsr';
    process.env.ICSR_GATEWAY_USERNAME = 'SPONSOR';
    process.env.ICSR_GATEWAY_PASSWORD = 'secret';
    wire.headers = { 'x-receipt-id': 'RCPT-1' };
    const receipt = await transmitIcsr(readyMessage(), { now: fixedClock });
    expect(receipt.status).toBe('transmitted');
    expect(httpsRequests).toHaveLength(1);
  });
});

/* ─── Real transport: AS2 over mTLS via the shared as2-transport module ─── */

let certPath: string;
let keyPath: string;
let agencyCertPath: string;
let publicKeyPem: string;
let tmpBase: string;

beforeAll(async () => {
  tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'icsr-as2-'));
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  keyPath = path.join(tmpBase, 'client-key.pem');
  certPath = path.join(tmpBase, 'client-cert.pem');
  agencyCertPath = path.join(tmpBase, 'agency-cert.pem');
  await fs.writeFile(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }) as string);
  await fs.writeFile(certPath, publicKeyPem);
  await fs.writeFile(agencyCertPath, publicKeyPem);
});

afterAll(async () => {
  await fs.rm(tmpBase, { recursive: true, force: true });
});

function as2Config() {
  return {
    url: 'https://esg.fda.example/as2',
    username: 'SPONSOR-AS2',
    certPath,
    keyPath,
    agencyCertPath,
    as2To: 'FDA-CESUB',
  };
}

const ACCEPTING_MDN =
  'Content-Type: multipart/signed; protocol="application/pkcs7-signature"; micalg=sha-256\r\n' +
  '\r\nDisposition: automatic-action/MDN-sent-automatically; processed\r\n';

describe('ICSR gateway transport — AS2 (configured gateway attempts the real transport)', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    httpsRequests.length = 0;
    wire.statusCode = 200;
    wire.headers = { 'message-id': '<mdn-1@esg.fda.example>' };
    wire.body = ACCEPTING_MDN;
    wire.error = null;
  });

  it('puts the E2B message on the wire as a signed AS2 envelope and reports transmitted only on an accepting MDN', async () => {
    const audit = vi.fn();
    const receipt = await transmitIcsr(readyMessage(), { now: fixedClock, audit, config: as2Config() });

    expect(receipt.simulated).toBe(false);
    expect(receipt.status).toBe('transmitted');
    expect(receipt.protocol).toBe('as2');
    expect(receipt.receiptId).toBe('<mdn-1@esg.fda.example>');
    expect(receipt.timestamp).toBe('2026-06-15T00:00:00.000Z');
    expect(receipt.agencyResponseRaw).toBe(ACCEPTING_MDN);
    expect(receipt.message).toMatch(/not the E2B acknowledgement/i);

    expect(httpsRequests).toHaveLength(1);
    const { options, body } = httpsRequests[0];
    expect(options.hostname).toBe('esg.fda.example');
    expect(options.path).toBe('/as2');
    expect(options.method).toBe('POST');
    expect(options.rejectUnauthorized).toBe(true);
    expect(options.cert).toBe(publicKeyPem);
    expect(options.ca).toBe(publicKeyPem);
    expect(options.headers['AS2-From']).toBe('SPONSOR-AS2');
    expect(options.headers['AS2-To']).toBe('FDA-CESUB');
    expect(options.headers['Message-ID']).toMatch(/^<[0-9a-f-]{36}@SPONSOR-AS2>$/);
    expect(options.headers['Content-Type']).toMatch(/application\/xml/);
    expect(options.headers['Content-Disposition']).toContain('MSG-2026-0001.xml');
    // The bytes on the wire are the built ICSR message, unaltered.
    expect(body.toString('utf8')).toBe(readyMessage().message);

    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'transmitted', action: 'icsr_transmit' }));
  });

  it('signs the body with the sponsor key (a real RSA-SHA256 signature, verifiable with the public key)', async () => {
    // The envelope carries no signature header today (see the PKCS#7 gap in
    // as2-transport.ts), so the proof is that signing with the configured key
    // does not throw and the module signs the exact bytes it posts.
    const { signAs2Body } = await import('../../submission-gateways/as2-transport');
    const privateKeyPem = await fs.readFile(keyPath, 'utf8');
    const body = Buffer.from(readyMessage().message, 'utf8');
    const sig = signAs2Body(body, privateKeyPem);
    const v = createVerify('RSA-SHA256'); v.update(body);
    expect(v.verify(publicKeyPem, sig, 'base64')).toBe(true);
  });

  it('refuses — typed, audited — when the agency answers non-2xx', async () => {
    wire.statusCode = 403; wire.body = 'Forbidden: unknown AS2-From';
    const audit = vi.fn();
    const err = await transmitIcsr(readyMessage(), { now: fixedClock, audit, config: as2Config() }).catch((e) => e);
    expect(err).toBeInstanceOf(IcsrGatewayTransmitError);
    expect(err.stage).toBe('gateway-rejected');
    expect(err.httpStatus).toBe(403);
    expect(err.transmitted).toBe(false);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'refused', reason: 'gateway-rejected' }));
  });

  it('refuses a 2xx whose MDN rejects the message — a 200 is not an acceptance', async () => {
    wire.body = 'Disposition: automatic-action/MDN-sent-automatically; processed/error: unexpected-processing-error\r\n';
    const err = await transmitIcsr(readyMessage(), { now: fixedClock, config: as2Config() }).catch((e) => e);
    expect(err).toBeInstanceOf(IcsrGatewayTransmitError);
    expect(err.message).toMatch(/MDN did not accept/);
  });

  it('refuses a 2xx whose MDN acknowledges a different message', async () => {
    wire.body = 'Disposition: automatic-action/MDN-sent-automatically; processed\r\nOriginal-Message-ID: <someone-else@x>\r\n';
    const err = await transmitIcsr(readyMessage(), { now: fixedClock, config: as2Config() }).catch((e) => e);
    expect(err).toBeInstanceOf(IcsrGatewayTransmitError);
    expect(err.message).toMatch(/different message/);
  });

  it('refuses a 2xx with no MDN disposition at all', async () => {
    wire.body = '';
    const err = await transmitIcsr(readyMessage(), { now: fixedClock, config: as2Config() }).catch((e) => e);
    expect(err).toBeInstanceOf(IcsrGatewayTransmitError);
    expect(err.message).toMatch(/no MDN disposition/);
  });

  it('surfaces a socket failure as a transport-stage refusal, audited', async () => {
    wire.error = 'ECONNRESET';
    const audit = vi.fn();
    const err = await transmitIcsr(readyMessage(), { now: fixedClock, audit, config: as2Config() }).catch((e) => e);
    expect(err).toBeInstanceOf(IcsrGatewayTransmitError);
    expect(err.stage).toBe('transport');
    expect(err.message).toMatch(/ECONNRESET/);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'refused', reason: 'transport' }));
  });

  it('with an AS2 config missing its key or agency AS2 id, refuses BEFORE any network call and names the variables', async () => {
    const audit = vi.fn();
    const err = await transmitIcsr(readyMessage(), {
      now: fixedClock, audit,
      config: { url: 'https://esg.fda.example/as2', username: 'SPONSOR-AS2', certPath },
    }).catch((e) => e);
    expect(err).toBeInstanceOf(IcsrGatewayNotConfiguredError);
    expect(err.missing).toEqual(['ICSR_GATEWAY_KEY_PATH', 'ICSR_GATEWAY_AS2_TO']);
    expect(httpsRequests).toHaveLength(0);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'refused', reason: 'not-configured' }));
  });
});

describe('ICSR gateway transport — HTTPS Basic upload', () => {
  const httpsConfig = { url: 'https://pv-gateway.example/upload', username: 'acct', password: 'pw' };

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    httpsRequests.length = 0;
    wire.statusCode = 202;
    wire.headers = { 'x-receipt-id': 'RCPT-77' };
    wire.body = '{"accepted":true}';
    wire.error = null;
  });

  it('is selected when only a password is configured, sends Basic auth, and reports the gateway receipt id', async () => {
    expect(resolveProtocol(httpsConfig)).toBe('https');
    const receipt = await transmitIcsr(readyMessage(), { now: fixedClock, config: httpsConfig });
    expect(receipt.status).toBe('transmitted');
    expect(receipt.simulated).toBe(false);
    expect(receipt.protocol).toBe('https');
    expect(receipt.receiptId).toBe('RCPT-77');
    const { options, body } = httpsRequests[0];
    expect(options.headers.Authorization).toBe(`Basic ${Buffer.from('acct:pw').toString('base64')}`);
    expect(options.cert).toBeUndefined();
    expect(body.toString('utf8')).toBe(readyMessage().message);
  });

  it('refuses a 2xx that carries no receipt identifier — delivery it cannot cite is not recorded', async () => {
    wire.headers = {};
    const err = await transmitIcsr(readyMessage(), { now: fixedClock, config: httpsConfig }).catch((e) => e);
    expect(err).toBeInstanceOf(IcsrGatewayTransmitError);
    expect(err.stage).toBe('receipt-unproven');
  });

  it('refuses a non-2xx', async () => {
    wire.statusCode = 401; wire.body = 'bad credentials';
    const err = await transmitIcsr(readyMessage(), { now: fixedClock, config: httpsConfig }).catch((e) => e);
    expect(err).toBeInstanceOf(IcsrGatewayTransmitError);
    expect(err.httpStatus).toBe(401);
  });

  it('a password config with no username refuses before the wire and names the variable', async () => {
    const err = await transmitIcsr(readyMessage(), { now: fixedClock, config: { url: 'https://x/y', password: 'pw' } }).catch((e) => e);
    expect(err).toBeInstanceOf(IcsrGatewayNotConfiguredError);
    expect(err.missing).toEqual(['ICSR_GATEWAY_USERNAME']);
    expect(httpsRequests).toHaveLength(0);
  });
});

describe('resolveGatewayConfig', () => {
  beforeEach(() => {
    for (const key of GATEWAY_ENV) {
      ORIGINAL_GATEWAY[key] = process.env[key];
      delete process.env[key];
    }
  });
  afterEach(() => {
    for (const key of GATEWAY_ENV) {
      if (ORIGINAL_GATEWAY[key] === undefined) delete process.env[key];
      else process.env[key] = ORIGINAL_GATEWAY[key];
    }
  });

  it('returns null when no URL is set', () => {
    expect(resolveGatewayConfig()).toBeNull();
  });

  it('returns null when a URL is set but no credentials', () => {
    process.env.ICSR_GATEWAY_URL = 'https://gateway.example/icsr';
    expect(resolveGatewayConfig()).toBeNull();
  });

  it('returns config when URL + password are present', () => {
    process.env.ICSR_GATEWAY_URL = 'https://gateway.example/icsr';
    process.env.ICSR_GATEWAY_PASSWORD = 'secret';
    expect(resolveGatewayConfig()).toEqual({
      url: 'https://gateway.example/icsr',
      username: undefined,
      password: 'secret',
      certPath: undefined,
    });
  });

  it('returns config when URL + cert path are present', () => {
    process.env.ICSR_GATEWAY_URL = 'https://gateway.example/icsr';
    process.env.ICSR_GATEWAY_CERT_PATH = '/etc/certs/icsr.pem';
    expect(resolveGatewayConfig()).toEqual({
      url: 'https://gateway.example/icsr',
      username: undefined,
      password: undefined,
      certPath: '/etc/certs/icsr.pem',
    });
    expect(resolveProtocol(resolveGatewayConfig()!)).toBe('as2');
  });

  it('carries the AS2 identity variables and an explicit protocol override', () => {
    process.env.ICSR_GATEWAY_URL = 'https://gateway.example/icsr';
    process.env.ICSR_GATEWAY_USERNAME = 'SPONSOR-AS2';
    process.env.ICSR_GATEWAY_CERT_PATH = '/etc/certs/icsr.pem';
    process.env.ICSR_GATEWAY_KEY_PATH = '/etc/certs/icsr-key.pem';
    process.env.ICSR_GATEWAY_AGENCY_CERT_PATH = '/etc/certs/fda.pem';
    process.env.ICSR_GATEWAY_AS2_TO = 'FDA-CESUB';
    process.env.ICSR_GATEWAY_PROTOCOL = 'AS2';
    expect(resolveGatewayConfig()).toEqual({
      url: 'https://gateway.example/icsr',
      username: 'SPONSOR-AS2',
      password: undefined,
      certPath: '/etc/certs/icsr.pem',
      keyPath: '/etc/certs/icsr-key.pem',
      agencyCertPath: '/etc/certs/fda.pem',
      as2To: 'FDA-CESUB',
      protocol: 'as2',
    });
  });

  it('ignores an unrecognised protocol value rather than guessing a third transport', () => {
    process.env.ICSR_GATEWAY_URL = 'https://gateway.example/icsr';
    process.env.ICSR_GATEWAY_PASSWORD = 'secret';
    process.env.ICSR_GATEWAY_PROTOCOL = 'sftp';
    expect(resolveGatewayConfig()?.protocol).toBeUndefined();
  });
});

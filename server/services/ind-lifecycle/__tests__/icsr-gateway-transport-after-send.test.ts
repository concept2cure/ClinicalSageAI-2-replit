/**
 * ICSR gateway transport — outcomes the agency may hold are never "NOT
 * transmitted".
 *
 * 2026-09-23 (W5/D7, round-3 review, third pass). Split from
 * icsr-gateway-transport.test.ts (which is at the max-lines limit) with its
 * own network stub, because this stub also emits Node's request 'finish':
 *   - a socket timeout or reset AFTER the whole message had been written was
 *     stage 'transport' ("ICSR was NOT transmitted"), although the agency may
 *     hold it; it is 'receipt-unproven' now, on the AS2 and HTTPS paths alike.
 *     A failure before the message left in full is still 'transport';
 *   - `processed/x-no-errors` was an explicit refusal ('gateway-rejected'),
 *     through a substring match on 'error', and `processed: error` (a
 *     description with no modifier) was 'transmitted'. Both are
 *     'receipt-unproven'.
 * Only node:https is stubbed; envelope, signing, httpsPost and MDN
 * interpretation run.
 *
 * 2026-09-23 (W5/D7, MDN final pass): "after the whole message was written"
 * now needs an authenticated connection, not Node's 'finish' alone (see
 * httpsPost in as2-transport.ts): the stub hands httpsPost a TLS socket that
 * completes the handshake (TLS 1.2 unless the mode says 1.3) before 'finish'.
 * New modes pin the TLS 1.3 gate: a reset inside the client-auth settle
 * window, and a peer alert refusing us after the write, are 'transport'; a
 * local decryption failure after the write (the server's answer arrived) is
 * 'receipt-unproven' (MDN final pass, repair); a server
 * that sends no session ticket but keeps the connection open past the window
 * is authenticated. The real-socket counterparts are in
 * icsr-delivery-outcome.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateKeyPairSync } from 'crypto';

const { wire } = vi.hoisted(() => ({
  wire: {
    /** respond: answer 200 with `body`; the others fail the socket. */
    mode: 'respond' as
      | 'respond' | 'timeout-after-write' | 'reset-after-write' | 'refused-before-write'
      | 'tls13-reset-in-settle-window' | 'tls13-no-ticket-timeout' | 'tls-alert-after-write'
      | 'tls-decrypt-failure-after-write',
    headers: {} as Record<string, string>,
    body: '',
  },
}));

vi.mock('node:https', async () => {
  const { EventEmitter } = await import('node:events');
  const request = (options: { headers: Record<string, string> }, cb: (res: unknown) => void) => {
    const listeners: Record<string, Array<(arg?: unknown) => void>> = {};
    const emit = (evt: string, arg?: unknown) => { for (const h of listeners[evt] ?? []) h(arg); };
    const tls13 = wire.mode.startsWith('tls13');
    /** A TLS socket that completes the handshake; TLS 1.3 sends no session ticket here. */
    const socket = Object.assign(new EventEmitter(), {
      destroyed: false, cork: () => undefined, uncork: () => undefined,
      getProtocol: () => (tls13 ? 'TLSv1.3' : 'TLSv1.2'),
    });
    const req = {
      on: (evt: string, h: (arg?: unknown) => void) => { (listeners[evt] ??= []).push(h); return req; },
      write: () => true,
      destroy: () => undefined,
      end: () => {
        globalThis.setImmediate(() => {
          if (wire.mode === 'refused-before-write') { emit('error', new Error('connect ECONNREFUSED')); return; }
          emit('socket', socket);
          socket.emit('secureConnect');
          if (wire.mode === 'tls13-reset-in-settle-window') {
            emit('finish');
            emit('error', Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }));
            return;
          }
          if (wire.mode === 'tls13-no-ticket-timeout') {
            globalThis.setTimeout(() => { emit('finish'); emit('timeout'); }, 120);
            return;
          }
          emit('finish');
          if (wire.mode === 'tls-alert-after-write') {
            emit('error', Object.assign(new Error('write EPROTO ssl/tls alert bad record mac'), { code: 'EPROTO' }));
            return;
          }
          if (wire.mode === 'tls-decrypt-failure-after-write') {
            emit('error', Object.assign(
              new Error('C0:error:0A000119:SSL routines:tls_get_more_records:decryption failed or bad record mac'),
              { code: 'ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC' },
            ));
            return;
          }
          if (wire.mode === 'timeout-after-write') { emit('timeout'); return; }
          if (wire.mode === 'reset-after-write') { emit('error', new Error('socket hang up ECONNRESET')); return; }
          const handlers: Record<string, (arg?: unknown) => void> = {};
          const res = {
            statusCode: 200,
            headers: { ...wire.headers },
            on: (evt: string, h: (arg?: unknown) => void) => { handlers[evt] = h; return res; },
          };
          cb(res);
          handlers.data?.(Buffer.from(wire.body.replace('{{MESSAGE_ID}}', String(options.headers['Message-ID'] ?? '')), 'utf8'));
          handlers.end?.();
        });
      },
    };
    return req;
  };
  return { request, default: { request } };
});

import { transmitIcsr, IcsrGatewayTransmitError, type IcsrGatewayConfig } from '../icsr-gateway-transport';
import type { IcsrTransmissionResult } from '../e2b-icsr-message';

const FIXED_MS = Date.parse('2026-06-15T00:00:00.000Z');
const message = (): IcsrTransmissionResult => ({
  message: '<?xml version="1.0" encoding="UTF-8"?>\n<ichicsrMessage><M.1.1>MSG-2026-0001</M.1.1></ichicsrMessage>',
  transmitReady: true, gaps: [], gateway: 'FDA_FAERS', receiverId: 'ZZFDA',
});

let tmpBase: string;
let as2Config: () => IcsrGatewayConfig;
const httpsConfig: IcsrGatewayConfig = { url: 'https://pv-gateway.example/upload', username: 'acct', password: 'pw' };

beforeAll(async () => {
  tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'icsr-after-send-'));
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyPath = path.join(tmpBase, 'key.pem');
  const certPath = path.join(tmpBase, 'cert.pem');
  await fs.writeFile(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }) as string);
  await fs.writeFile(certPath, publicKey.export({ type: 'spki', format: 'pem' }) as string);
  as2Config = () => ({ url: 'https://esg.fda.example/as2', username: 'SPONSOR-AS2', certPath, keyPath, as2To: 'FDA-CESUB' });
});

afterAll(async () => {
  await fs.rm(tmpBase, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.NODE_ENV = 'production';
  wire.mode = 'respond';
  wire.headers = { 'message-id': '<mdn-1@esg.fda.example>' };
  wire.body = '';
});

const attempt = (config: IcsrGatewayConfig, audit = vi.fn()) =>
  transmitIcsr(message(), { now: () => FIXED_MS, audit, config }).catch((e) => e);

describe('ICSR — a socket failure after the whole message was written', () => {
  it.each([
    ['AS2', 'timeout-after-write' as const, /timeout/],
    ['AS2', 'reset-after-write' as const, /ECONNRESET/],
    ['HTTPS', 'timeout-after-write' as const, /timeout/],
  ])('%s, %s: receipt-unproven, audited, never "NOT transmitted"', async (protocol, mode, cause) => {
    wire.mode = mode;
    const audit = vi.fn();
    const err = await attempt(protocol === 'AS2' ? as2Config() : httpsConfig, audit);
    expect(err).toBeInstanceOf(IcsrGatewayTransmitError);
    expect(err.stage).toBe('receipt-unproven');
    expect(err.message).toMatch(cause);
    expect(err.message).not.toMatch(/NOT transmitted/);
    expect(err.message).toMatch(/may hold it/);
    expect(err.message).toMatch(/before any resend/);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'refused', reason: 'receipt-unproven' }));
  });

  it.each([['AS2'], ['HTTPS']])('%s: a connection refused before the message was written is still transport, "NOT transmitted"', async (protocol) => {
    wire.mode = 'refused-before-write';
    const err = await attempt(protocol === 'AS2' ? as2Config() : httpsConfig);
    expect(err.stage).toBe('transport');
    expect(err.message).toMatch(/NOT transmitted/);
  });
});

describe('ICSR — the client-authentication gate (MDN final pass)', () => {
  it('TLS 1.3: a reset inside the settle window (a certificate refusal) is transport, "NOT transmitted"', async () => {
    wire.mode = 'tls13-reset-in-settle-window';
    const err = await attempt(as2Config());
    expect(err.stage).toBe('transport');
    expect(err.message).toMatch(/NOT transmitted/);
    expect(err.message).not.toMatch(/may hold it/);
  });

  it('a peer alert refusing our bytes after the write, with no response parsed, is transport', async () => {
    wire.mode = 'tls-alert-after-write';
    const err = await attempt(as2Config());
    expect(err.stage).toBe('transport');
  });

  // 2026-09-23 (MDN final pass, repair): a record from the server that this
  // client fails to decrypt is the server's answer arriving — it was classed
  // with handshake failures ('transport'), freeing a resend of a report the
  // agency had read in full. Real-socket counterpart: icsr-delivery-outcome.
  it('a local decryption failure after an authenticated write is receipt-unproven — the server sent bytes', async () => {
    wire.mode = 'tls-decrypt-failure-after-write';
    const err = await attempt(as2Config());
    expect(err.stage).toBe('receipt-unproven');
    expect(err.message).not.toMatch(/NOT transmitted/);
  });

  it('TLS 1.3 with no session ticket: once the settle window passes with the connection open, a timeout is DELIVERED_UNCONFIRMED', async () => {
    wire.mode = 'tls13-no-ticket-timeout';
    const { httpsPost, RequestSentTransportError } = await import('../../submission-gateways/as2-transport');
    const err = await httpsPost({
      endpoint: 'https://esg.fda.example/as2', headers: { 'Message-ID': '<m@x>' }, body: Buffer.from('x'), tls13SettleMs: 30,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RequestSentTransportError);
  });
});

describe('ICSR — dispositions the third pass reclassified', () => {
  it.each([
    ['processed/x-no-errors'],
    ['processed/x-failover-used'],
    ['processed: error'],
  ])('an MDN with %s naming our message is receipt-unproven — neither gateway-rejected nor transmitted', async (d) => {
    wire.body = `Original-Message-ID: {{MESSAGE_ID}}\r\nDisposition: automatic-action/MDN-sent-automatically; ${d}\r\n`;
    const err = await attempt(as2Config());
    expect(err).toBeInstanceOf(IcsrGatewayTransmitError);
    expect(err.stage).toBe('receipt-unproven');
  });

  it('processed/error: decryption-failed naming our message is still gateway-rejected', async () => {
    wire.body = 'Original-Message-ID: {{MESSAGE_ID}}\r\nDisposition: automatic-action/MDN-sent-automatically; processed/error: decryption-failed\r\n';
    expect((await attempt(as2Config())).stage).toBe('gateway-rejected');
  });
});

/**
 * FDA ESG AS2 over REAL sockets: one attempt, one outcome — NOT_DELIVERED,
 * DELIVERED_UNCONFIRMED, RECEIVED or REFUSED_BY_AGENCY — decided by the single
 * classifier in ../as2-transport.ts, and the transmittal status each one leaves.
 *
 * 2026-09-23 (W5/D7, MDN final pass): new. The previous pass classed every
 * failure after Node's request 'finish' as "the recipient may hold it". Under
 * TLS 1.3 the client finishes its handshake BEFORE the server has checked the
 * client certificate, so an agency that refused our certificate left the
 * transmittal 'in_transit' — inside the duplicate-send lock — although the
 * agency's application never saw a byte. A 5xx, which an intermediary or the
 * agency's backend may have answered while holding the bundle, was 'rejected'.
 *
 * Only the pool, the credential files (read through fs.promises.readFile) and
 * the bundle reader are stubbed. node:https is real on both ends: a local
 * server that requires a client certificate signed by a throwaway CA
 * (./support/mtls-pki.ts).
 *
 * 2026-09-23 (W5/D7, MDN close): a 5xx or 3xx the endpoint sent BEFORE the
 * whole request was handed to the socket was DELIVERED_UNCONFIRMED ('in
 * transit', inside the lock) — the agency could not hold a bundle it never
 * received, and the sequence was locked until someone confirmed at FDA that
 * nothing had arrived. httpsPost now records whether Node's 'finish' had fired
 * when the response head was parsed (As2Response.requestWrittenBeforeAnswer);
 * such an answer before 'finish' is NOT_DELIVERED. The cases below send a
 * 32 MiB body to a server that answers on the head without reading it.
 *
 * 2026-09-23 (W5/D7, MDN close, repair): WITHDRAWN. The order of Node's
 * 'finish' against the answer is not evidence of what the server holds: over
 * TLS the callback that emits 'finish' runs one or more loop iterations after
 * the bytes reached the kernel, so a 502 from a separate-process server that
 * had read the whole body was classed NOT_DELIVERED — and, with the proof
 * that verdict now carries, released the sequence claim — on most attempts,
 * and on every attempt while this process was busy. The same flaw classed a
 * reset after the whole body NOT_DELIVERED (requestReachedServer used
 * 'finish' as its boundary). Every answer that is neither 2xx nor 4xx is
 * DELIVERED_UNCONFIRMED again, and a failure is held once the server has
 * accepted this client and the request was released to the socket, whatever
 * 'finish' says. The separate-process cases below pin both.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { MtlsPki, MtlsServer } from './support/mtls-pki';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'as2-delivery-outcome-secret-padded-to-32-chars!!';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.FDA_ESG_AS2_FROM = 'SPONSOR-AS2';
  process.env.FDA_ESG_CERT_PATH = '/virtual/fda-client-cert.pem';
  process.env.FDA_ESG_KEY_PATH = '/virtual/fda-client-key.pem';
  process.env.FDA_ESG_FDA_CERT_PATH = '/virtual/fda-trust-anchor.pem';
});

interface QueryRecord { sql: string; args: unknown[] }

const { queries, creds } = vi.hoisted(() => ({
  queries: [] as QueryRecord[],
  /** What the credential paths read as; set per test. */
  creds: { cert: '', key: '', ca: '' },
}));

vi.mock('../../../db', () => ({
  pool: {
    query: vi.fn(async (sql: string, args: unknown[] = []) => {
      queries.push({ sql, args });
      if (/INSERT INTO submission_transmittals/i.test(sql)) return { rows: [{ id: 5151 }], rowCount: 1 };
      return { rows: [], rowCount: /UPDATE/i.test(sql) ? 1 : 0 };
    }),
  },
}));

vi.mock('fs', async (orig) => {
  const actual = await (orig as () => Promise<typeof import('fs')>)();
  const virtual: Record<string, () => string> = {
    '/virtual/fda-client-cert.pem': () => creds.cert,
    '/virtual/fda-client-key.pem': () => creds.key,
    '/virtual/fda-trust-anchor.pem': () => creds.ca,
  };
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn(async (p: string, enc?: 'utf8') =>
        virtual[p] ? virtual[p]() : actual.promises.readFile(p, enc)),
    },
  };
});

const BUNDLE = Buffer.alloc(64 * 1024, 0x5a);
/** What readVerifiedBundle returns; the early-answer cases swap in 32 MiB. */
const bundleBytes = { value: BUNDLE };
vi.mock('../bundle-integrity', () => ({ readVerifiedBundle: vi.fn(async () => bundleBytes.value) }));

import { makeMtlsPki, startMtlsServer, startTcpProxy, type TcpProxy } from './support/mtls-pki';
import { busyLoop, startSeparateProcessServer } from './support/separate-process-tls-server';
import { FdaEsgGateway } from '../fda-esg';
import {
  RequestSentTransportError, classifyAs2Delivery, httpsPost, peerRefusalAlert, requestReachedServer, TLS13_CLIENT_AUTH_SETTLE_MS,
} from '../as2-transport';
import { GatewayError, TransportError } from '../types';

let pki: MtlsPki;
let server: MtlsServer;

beforeAll(async () => {
  pki = makeMtlsPki();
  server = await startMtlsServer(pki);
  process.env.FDA_ESG_URL = `https://127.0.0.1:${server.port}/as2`;
});
afterAll(async () => {
  await server.close();
  pki.cleanup();
});
beforeEach(() => {
  queries.length = 0;
  server.seen.length = 0;
  server.answerOnHead = null;
  server.answeredOnHead.length = 0;
  bundleBytes.value = BUNDLE;
  server.setMaxVersion('TLSv1.3');
  creds.cert = pki.clientCertPem;
  creds.key = pki.clientKeyPem;
  creds.ca = pki.caPem;
  server.respond = (req, res) => {
    const mid = String(req.headers['message-id']);
    res.writeHead(200, { 'Content-Type': 'multipart/report; report-type=disposition-notification; boundary="b1"', 'Message-ID': '<mdn-1@FDA-CESUB>' });
    res.end(`--b1\r\nContent-Type: text/plain\r\n\r\nMDN for ${mid}\r\n--b1\r\nContent-Type: message/disposition-notification\r\n\r\n` +
      `Original-Message-ID: ${mid}\r\nDisposition: automatic-action/MDN-sent-automatically; processed\r\n--b1--\r\n`);
  };
});

const REQUEST = () => ({
  organizationId: 7, userId: 11, programId: null, packageId: 99,
  bundle: { path: '/tmp/bundle.zip', sha256: 'a'.repeat(64), sizeBytes: BUNDLE.length, format: 'ectd' as const },
  environment: 'production' as const,
  submissionType: 'original',
  fda: { applicationType: 'nda' },
  metadata: { applicationId: 'IND123456', sequence: '0001', environment: 'production' },
  authorization: { kind: 'governed-http' as const, actorUserId: 11, reason: 'AS2 delivery-outcome suite', reauthVerifiedAt: new Date() },
});

/** The last UPDATE that set a status, as {column: value}. */
function lastStatusWrite(): Record<string, unknown> {
  const writes = queries.filter((q) => /UPDATE submission_transmittals/i.test(q.sql) && /status\s*=/.test(q.sql));
  const q = writes[writes.length - 1];
  const out: Record<string, unknown> = {};
  for (const m of q.sql.matchAll(/(\w+)\s*=\s*\$(\d+)/g)) out[m[1]] = q.args[Number(m[2]) - 1];
  return out;
}

const transmit = () => new FdaEsgGateway().transmit(REQUEST()).catch((e: unknown) => e);

describe('FDA ESG — control over a real mTLS connection', () => {
  it('a trusted client certificate and an accepting MDN for our message is received', async () => {
    const out = await new FdaEsgGateway().transmit(REQUEST());
    expect(out.status).toBe('received');
    expect(server.seen).toHaveLength(1);
    expect(server.seen[0].body.length).toBe(BUNDLE.length);
    expect(lastStatusWrite().status).toBe('received');
  });
});

describe('FDA ESG — the agency refuses our client certificate at the TLS handshake: NOT_DELIVERED', () => {
  it.each(['TLSv1.3', 'TLSv1.2'] as const)('%s: rejected (transport), nothing reached the application, never in transit', async (version) => {
    server.setMaxVersion(version);
    creds.cert = pki.rogueCertPem;
    creds.key = pki.rogueKeyPem;
    const err = await transmit();
    expect(server.seen).toHaveLength(0);
    expect(err).toBeInstanceOf(TransportError);
    expect(err).not.toBeInstanceOf(RequestSentTransportError);
    expect((err as Error).message).not.toMatch(/may hold it/);
    expect((err as Error).message).toMatch(/Nothing reached FDA/);
    const last = lastStatusWrite();
    expect(last.status).toBe('rejected');
    expect(last.error_class).toBe('transport');
    expect(String(last.error_message)).toMatch(/Nothing reached FDA/);
  });
});

describe('FDA ESG — HTTP 5xx after the whole bundle: DELIVERED_UNCONFIRMED, held in the lock', () => {
  it.each([500, 502, 503, 504])('HTTP %i: in transit with our AS2 Message-ID, http_status, the body kept, confirm before any resend', async (code) => {
    server.respond = (_req, res) => { res.writeHead(code, { 'Content-Type': 'text/plain' }); res.end(`upstream said ${code}`); };
    const err = await transmit();
    expect(server.seen).toHaveLength(1);
    expect(server.seen[0].body.length).toBe(BUNDLE.length);
    expect(err).toBeInstanceOf(GatewayError);
    expect((err as Error).message).toMatch(/may hold it/);
    expect((err as Error).message).toMatch(/before any resend/);
    const last = lastStatusWrite();
    expect(last.status).toBe('in_transit');
    expect(last.http_status).toBe(code);
    expect(last.transmission_id).toBe(server.seen[0].headers['message-id']);
    expect(last.mdn_raw).toBe(`upstream said ${code}`);
  });
});

/* 2026-09-23 (W5/D7, MDN close). A front end with no healthy upstream, or a
   redirect, answers on the request head and never reads the body.
   2026-09-23 (MDN close, repair): these were NOT_DELIVERED ('rejected', the
   claim released) on the strength of Node's 'finish' not having fired —
   which is not evidence (see the separate-process cases below). The client
   cannot tell this server from one that read everything, so the attempt is
   held in the lock; the rest of the body is still not sent. */
describe('FDA ESG — a 5xx/3xx answered on the request head: held in transit (the client cannot prove the server lacks the body)', () => {
  const BIG = 32 * 1024 * 1024;

  it.each([503, 302])('HTTP %i on the request head, body never read: in transit, never "Nothing reached FDA"', async (code) => {
    bundleBytes.value = Buffer.alloc(BIG, 0x41);
    server.answerOnHead = (res) => {
      res.writeHead(code, { 'Content-Type': 'text/plain', Connection: 'close', ...(code === 302 ? { Location: 'https://elsewhere.invalid/as2' } : {}) });
      res.end(code === 503 ? 'Service Unavailable: no healthy upstream' : 'moved');
    };
    const started = Date.now();
    const err = await transmit();
    expect(Date.now() - started).toBeLessThan(10_000);
    await new Promise((r) => setTimeout(r, 100));
    // The server answered on the head: the application read 0 body bytes and
    // the HTTP layer never had the whole body.
    expect(server.seen).toHaveLength(0);
    expect(server.answeredOnHead).toHaveLength(1);
    expect(server.answeredOnHead[0].bodyBytesReadByApplication).toBe(0);
    expect(server.answeredOnHead[0].completeAtClose).toBe(false);
    expect(server.answeredOnHead[0].socketBytesReadAtClose).toBeLessThan(BIG);
    expect(err).toBeInstanceOf(GatewayError);
    expect(err).not.toBeInstanceOf(TransportError);
    expect((err as Error).message).toMatch(/may hold it/);
    expect((err as Error).message).not.toMatch(/Nothing reached FDA/);
    const last = lastStatusWrite();
    expect(last.status).toBe('in_transit');
    expect(last.http_status).toBe(code);
  }, 30_000);

  it('httpsPost settles once on an early answer; the request error the stop raises is neither unhandled nor a second settlement', async () => {
    server.answerOnHead = (res) => { res.writeHead(503, { Connection: 'close' }); res.end('no healthy upstream'); };
    const stray: unknown[] = [];
    const onStray = (e: unknown) => { stray.push(e); };
    process.on('unhandledRejection', onStray);
    process.on('uncaughtException', onStray);
    try {
      let settlements = 0;
      const p = httpsPost({
        endpoint: `https://127.0.0.1:${server.port}/as2`, headers: { 'Message-ID': '<early@SPONSOR>' },
        body: Buffer.alloc(BIG, 0x42), clientCertPem: pki.clientCertPem, clientKeyPem: pki.clientKeyPem,
        agencyCertPem: pki.caPem, timeoutMs: 5_000,
      });
      p.then(() => { settlements++; }, () => { settlements++; });
      const res = await p;
      expect(res.httpStatus).toBe(503);
      await new Promise((r) => setTimeout(r, 300));
      expect(settlements).toBe(1);
      expect(stray).toEqual([]);
      expect(server.answeredOnHead[0].completeAtClose).toBe(false);
    } finally {
      process.off('unhandledRejection', onStray);
      process.off('uncaughtException', onStray);
    }
  }, 30_000);

  it('an early 503 from a server that keeps reading: the rest of the body is not sent; the attempt is still held', async () => {
    // The answer is written straight to the socket and the body is then read
    // on. The client stops sending (RFC 9112 §9.5) — hygiene, not proof: the
    // verdict stays DELIVERED_UNCONFIRMED.
    bundleBytes.value = Buffer.alloc(BIG, 0x44);
    server.answerOnHead = (_res, req) => {
      req.socket.write('HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/plain\r\nContent-Length: 19\r\n\r\nno healthy upstream');
      req.resume();
    };
    const err = await transmit();
    for (let i = 0; i < 100 && server.answeredOnHead[0]?.completeAtClose == null; i++) await new Promise((r) => setTimeout(r, 50));
    expect(server.answeredOnHead[0].completeAtClose).toBe(false);
    expect(server.answeredOnHead[0].bodyBytesReadByApplication).toBeLessThan(BIG);
    expect((err as Error).message).toMatch(/may hold it/);
    expect(lastStatusWrite().status).toBe('in_transit');
  }, 30_000);

  it('a 503 status sent early, but the answer ended only after the server read the whole body — in transit', async () => {
    bundleBytes.value = Buffer.alloc(BIG, 0x45);
    server.answerOnHead = (res, req) => {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.flushHeaders();
      req.resume();
      req.on('end', () => res.end('no healthy upstream'));
    };
    const err = await transmit();
    await new Promise((r) => setTimeout(r, 100));
    expect(server.answeredOnHead[0].bodyBytesReadByApplication).toBe(BIG);
    expect((err as Error).message).toMatch(/may hold it/);
    expect(lastStatusWrite().status).toBe('in_transit');
  }, 30_000);

  it('a 503 after the server read the whole 32 MiB body is in transit', async () => {
    bundleBytes.value = Buffer.alloc(BIG, 0x43);
    server.respond = (_req, res) => { res.writeHead(503, { 'Content-Type': 'text/plain' }); res.end('upstream said 503'); };
    const err = await transmit();
    expect(server.seen).toHaveLength(1);
    expect(server.seen[0].body.length).toBe(BIG);
    expect((err as Error).message).toMatch(/may hold it/);
    expect(lastStatusWrite().status).toBe('in_transit');
  }, 30_000);
});

describe('FDA ESG — HTTP 4xx: the agency answered and refused, REFUSED_BY_AGENCY', () => {
  it.each([400, 401, 403, 404, 405, 409, 411, 413, 415, 422])('HTTP %i: rejected (gateway), never in transit', async (code) => {
    server.respond = (_req, res) => { res.writeHead(code); res.end(`refused ${code}`); };
    const err = await transmit();
    expect(err).toBeInstanceOf(GatewayError);
    expect((err as Error).message).not.toMatch(/may hold it/);
    const last = lastStatusWrite();
    expect(last.status).toBe('rejected');
    expect(last.error_class).toBe('gateway');
    expect(last.http_status).toBe(code);
  });
});

describe('FDA ESG — an authenticated server that took the whole bundle and then failed: DELIVERED_UNCONFIRMED', () => {
  it.each(['TLSv1.3', 'TLSv1.2'] as const)('%s: the server resets after reading the whole body — in transit, never rejected', async (version) => {
    server.setMaxVersion(version);
    server.respond = (_req, res) => { res.socket?.destroy(); };
    const err = await transmit();
    expect(server.seen).toHaveLength(1);
    expect(server.seen[0].body.length).toBe(BUNDLE.length);
    expect((err as Error).message).toMatch(/may hold it/);
    const last = lastStatusWrite();
    expect(last.status).toBe('in_transit');
    expect(last.transmission_id).toBe(server.seen[0].headers['message-id']);
  });

  it('200 headers and part of the MDN, then a reset: settles promptly as in transit (no hang)', async () => {
    server.respond = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'multipart/report; boundary="b1"', 'Content-Length': '4000' });
      res.write('--b1\r\nContent-Type: message/disposition-notification\r\n\r\nOriginal-Message-ID: <x');
      setTimeout(() => res.socket?.destroy(), 20);
    };
    const started = Date.now();
    const err = await transmit();
    expect(Date.now() - started).toBeLessThan(5_000);
    expect((err as Error).message).toMatch(/may hold it/);
    expect(lastStatusWrite().status).toBe('in_transit');
  }, 15_000);
});

describe('classifyAs2Delivery / peerRefusalAlert — the rule itself', () => {
  const response = (httpStatus: number, body = '') => ({ ok: true as const, response: { httpStatus, headers: {}, body: Buffer.from(body) } });

  it.each([301, 302, 307, 100])('HTTP %i neither accepts nor refuses: DELIVERED_UNCONFIRMED with our id', (code) => {
    const out = classifyAs2Delivery(response(code), '<ours@SPONSOR>');
    expect(out.kind).toBe('DELIVERED_UNCONFIRMED');
    expect(out.kind === 'DELIVERED_UNCONFIRMED' && out.trackingId).toBe('<ours@SPONSOR>');
  });

  /* 2026-09-23 (W5/D7, MDN close, repair): an answer that is neither 2xx
     nor 4xx is DELIVERED_UNCONFIRMED whenever it came. A response that
     carries a "written before the answer" flag (the withdrawn
     requestWrittenBeforeAnswer) changes nothing: the order of Node's 'finish'
     against the answer is not evidence of what the server holds. */
  it.each([500, 502, 503, 504, 302, 307])('HTTP %i is DELIVERED_UNCONFIRMED whatever a timing flag on the response says', (code) => {
    for (const flag of [false, true, undefined]) {
      const response = { httpStatus: code, headers: {}, body: Buffer.from('x'), requestWrittenBeforeAnswer: flag };
      expect(classifyAs2Delivery({ ok: true, response }, '<ours@SPONSOR>').kind).toBe('DELIVERED_UNCONFIRMED');
    }
  });

  it('a RequestSentTransportError is DELIVERED_UNCONFIRMED; any other thrown error is NOT_DELIVERED', () => {
    expect(classifyAs2Delivery({ ok: false, error: new RequestSentTransportError('x timeout') }, '<m@x>').kind).toBe('DELIVERED_UNCONFIRMED');
    expect(classifyAs2Delivery({ ok: false, error: new TransportError('connect ECONNREFUSED') }, '<m@x>').kind).toBe('NOT_DELIVERED');
    expect(classifyAs2Delivery({ ok: false, error: new TypeError('Invalid URL') }, '<m@x>').kind).toBe('NOT_DELIVERED');
  });

  /* 2026-09-23 (MDN final pass, repair): isTlsFailure ("any TLS-shaped
     error") is gone — it counted a record from the server failing our
     decryption as a handshake refusal. peerRefusalAlert recognises only an
     alert the server SENT that refuses us or our bytes. */
  it.each([
    ['ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED', 'x', 'certificate required'],
    ['ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE', 'x', 'bad certificate'],
    ['EPROTO', 'write EPROTO C0:error:0A000418:SSL routines:ssl3_read_bytes:tlsv1 alert unknown ca:../ssl/record/rec_layer_s3.c:1605:SSL alert number 48', 'unknown ca'],
  ])('%s / %s is the peer refusal alert "%s"', (code, message, description) => {
    expect(peerRefusalAlert(Object.assign(new Error(message), { code }))).toBe(description);
  });

  it.each([
    ['ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC', 'SSL routines:tls_get_more_records:decryption failed or bad record mac'],
    ['ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR', 'tlsv1 alert internal error'],
    ['ECONNRESET', 'socket hang up'],
    ['ETIMEDOUT', 'read ETIMEDOUT'],
    ['CERT_HAS_EXPIRED', 'certificate has expired'],
  ])('%s (%s) is not a peer refusal alert', (code, message) => {
    expect(peerRefusalAlert(Object.assign(new Error(message), { code }))).toBeNull();
  });
});

/* 2026-09-23 (W5/D7, MDN final pass, repair). Conditions loopback never
   produces, through a TCP proxy (./support/mtls-pki.ts startTcpProxy):
   - a response record the client fails to decrypt, after an authenticated
     agency read the whole bundle and answered. The server's bytes arrived;
     it was classed NOT_DELIVERED ('rejected', "Nothing reached FDA") because
     the error is TLS-shaped and no HTTP header had been parsed;
   - a client-certificate refusal that arrives a WAN round trip after our
     TLS 1.3 Finished. Only a settle window longer than that round trip keeps
     the request unwritten; with a 5 ms window it was DELIVERED_UNCONFIRMED. */
describe('FDA ESG — through a proxy: corrupted answers and WAN latency', () => {
  let proxy: TcpProxy | null = null;
  const viaProxy = async (opts: Parameters<typeof startTcpProxy>[1]) => {
    proxy = await startTcpProxy(server.port, opts);
    process.env.FDA_ESG_URL = `https://127.0.0.1:${proxy.port}/as2`;
  };
  afterEach(async () => {
    await proxy?.close();
    proxy = null;
    process.env.FDA_ESG_URL = `https://127.0.0.1:${server.port}/as2`;
  });

  it.each(['TLSv1.3', 'TLSv1.2'] as const)(
    '%s: the agency read the whole bundle and answered; its answer fails decryption — in transit, never "Nothing reached FDA"',
    async (version) => {
      server.setMaxVersion(version);
      await viaProxy({ corrupt: () => server.seen.length > 0 });
      const err = await transmit();
      expect(server.seen).toHaveLength(1);
      expect(server.seen[0].body.length).toBe(BUNDLE.length);
      expect((err as Error).message).toMatch(/may hold it/);
      expect((err as Error).message).not.toMatch(/Nothing reached FDA/);
      const last = lastStatusWrite();
      expect(last.status).toBe('in_transit');
      expect(last.transmission_id).toBe(server.seen[0].headers['message-id']);
    },
  );

  it.each(['TLSv1.3', 'TLSv1.2'] as const)(
    '%s: 200 headers arrive, then the MDN record fails decryption — in transit',
    async (version) => {
      server.setMaxVersion(version);
      let corrupting = false;
      server.respond = (req, res) => {
        res.writeHead(200, { 'Content-Type': 'message/disposition-notification' });
        res.flushHeaders();
        setTimeout(() => {
          corrupting = true;
          res.end(`Original-Message-ID: ${String(req.headers['message-id'])}\r\nDisposition: automatic-action/MDN-sent-automatically; processed\r\n`);
        }, 150);
      };
      await viaProxy({ corrupt: () => corrupting });
      const err = await transmit();
      expect(server.seen).toHaveLength(1);
      expect((err as Error).message).toMatch(/may hold it/);
      expect(lastStatusWrite().status).toBe('in_transit');
    },
  );

  it('TLS 1.3: a client-certificate refusal 60 ms away (each way) — rejected, nothing written, never in transit', async () => {
    creds.cert = pki.rogueCertPem;
    creds.key = pki.rogueKeyPem;
    await viaProxy({ delayMs: 60 });
    const err = await transmit();
    expect(server.seen).toHaveLength(0);
    expect(err).toBeInstanceOf(TransportError);
    expect(err).not.toBeInstanceOf(RequestSentTransportError);
    expect((err as Error).message).toMatch(/Nothing reached FDA/);
    const last = lastStatusWrite();
    expect(last.status).toBe('rejected');
    expect(last.error_class).toBe('transport');
  });

  it('control: a trusted certificate 60 ms away (each way) is received — the session ticket, not the window, releases the request', async () => {
    await viaProxy({ delayMs: 60 });
    const started = Date.now();
    const out = await new FdaEsgGateway().transmit(REQUEST());
    expect(out.status).toBe('received');
    expect(Date.now() - started).toBeLessThan(TLS13_CLIENT_AUTH_SETTLE_MS);
  });

  it('the TLS 1.3 settle window is at least 1 s — longer than any realistic round trip to the agency', () => {
    expect(TLS13_CLIENT_AUTH_SETTLE_MS).toBeGreaterThanOrEqual(1_000);
  });
});

/* 2026-09-23 (W5/D7, MDN close, repair). A server in a SEPARATE process
   (./support/separate-process-tls-server.ts) reads the head and the whole
   body, then answers 502 or resets, 10 ms later; this process is busy (a
   30 ms spin every millisecond), as a loaded server is. Node's 'finish' for a
   request the server has read in full had then not fired when the answer or
   the reset arrived, and the withdrawn rules classed both NOT_DELIVERED —
   "Nothing reached FDA", the row 'rejected' and, with the proof that verdict
   carries, the sequence claim released — while the server held every byte.
   Six attempts each (2 KB and 1 MiB bodies): every one must be held. */
describe('a separate-process server that read the whole body, answered while this process is busy', () => {
  const ATTEMPTS = [2_000, 2_000, 2_000, 1_048_576, 1_048_576, 1_048_576];
  const post = (port: number, size: number) => httpsPost({
    endpoint: `https://127.0.0.1:${port}/as2`,
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size), 'Message-ID': '<busy@SPONSOR>' },
    body: Buffer.alloc(size, 0x61), clientCertPem: pki.clientCertPem, clientKeyPem: pki.clientKeyPem,
    agencyCertPem: pki.caPem, timeoutMs: 20_000,
  });

  it('HTTP 502 right after the whole body: DELIVERED_UNCONFIRMED on every attempt', async () => {
    const srv = await startSeparateProcessServer(pki, { mode: 'answer', status: 502, delayMs: 10 });
    const stop = busyLoop(30);
    const kinds: string[] = [];
    try {
      for (const size of ATTEMPTS) {
        const outcome = classifyAs2Delivery(await post(srv.port, size).then(
          (response) => ({ ok: true as const, response }), (error: unknown) => ({ ok: false as const, error })), '<busy@SPONSOR>');
        const seen = await srv.nextClose();
        expect(seen.bodyRead).toBe(size);
        kinds.push(outcome.kind);
      }
    } finally {
      stop();
      srv.close();
    }
    expect(kinds).toEqual(ATTEMPTS.map(() => 'DELIVERED_UNCONFIRMED'));
  }, 120_000);

  it('a reset right after the whole body: RequestSentTransportError (DELIVERED_UNCONFIRMED) on every attempt', async () => {
    const srv = await startSeparateProcessServer(pki, { mode: 'reset', delayMs: 10 });
    const stop = busyLoop(30);
    const errors: string[] = [];
    try {
      for (const size of ATTEMPTS) {
        const err = await post(srv.port, size).then(() => null, (e: unknown) => e);
        const seen = await srv.nextClose();
        expect(seen.bodyRead).toBe(size);
        errors.push(`${(err as Error | null)?.name} ${classifyAs2Delivery({ ok: false, error: err }, '<busy@SPONSOR>').kind}`);
      }
    } finally {
      stop();
      srv.close();
    }
    expect(errors).toEqual(ATTEMPTS.map(() => 'RequestSentTransportError DELIVERED_UNCONFIRMED'));
  }, 120_000);

  it('through FdaEsgGateway: a 502 after the whole bundle is in transit, never rejected, never proof that nothing was sent', async () => {
    const srv = await startSeparateProcessServer(pki, { mode: 'answer', status: 502, delayMs: 10 });
    process.env.FDA_ESG_URL = `https://127.0.0.1:${srv.port}/as2`;
    const stop = busyLoop(30);
    const seenStatus: string[] = [];
    try {
      for (let i = 0; i < 3; i++) {
        queries.length = 0;
        const err = await transmit();
        expect((await srv.nextClose()).bodyRead).toBe(BUNDLE.length);
        expect((err as { transmitted?: unknown }).transmitted).not.toBe(false);
        expect((err as Error).message).not.toMatch(/Nothing reached FDA/);
        seenStatus.push(String(lastStatusWrite().status));
      }
    } finally {
      stop();
      srv.close();
      process.env.FDA_ESG_URL = `https://127.0.0.1:${server.port}/as2`;
    }
    expect(seenStatus).toEqual(['in_transit', 'in_transit', 'in_transit']);
  }, 120_000);
});

describe('requestReachedServer — when a failed attempt may be held by the recipient', () => {
  const alert = (text: string, code?: string) =>
    Object.assign(new Error(`C0:error:0A000412:SSL routines:ssl3_read_bytes:${text}:../ssl/record/rec_layer_s3.c:1605:SSL alert number 42`), code ? { code } : {});
  const decryptFailure = Object.assign(
    new Error('C0:error:0A000119:SSL routines:tls_get_more_records:decryption failed or bad record mac'),
    { code: 'ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC' },
  );
  const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
  const all = { authenticated: true, answered: false };

  it('nothing before the server accepted this client (the request still corked, not a byte written) is held', () => {
    expect(requestReachedServer({ ...all, authenticated: false, cause: reset })).toBe(false);
    expect(requestReachedServer({ ...all, authenticated: false, cause: alert('tlsv13 alert certificate required') })).toBe(false);
  });

  /* 2026-09-23 (W5/D7, MDN close, repair): 'finish' is no longer a boundary.
     Its callback can run after the server has read the whole body (see the
     separate-process cases), so "not finished" proved nothing. */
  it('after an authenticated write, a reset, a timeout or a local decryption failure (the server sent bytes) is held — whether or not Node had fired finish', () => {
    expect(requestReachedServer({ ...all, cause: reset })).toBe(true);
    expect(requestReachedServer({ ...all, cause: undefined })).toBe(true);
    expect(requestReachedServer({ ...all, cause: decryptFailure })).toBe(true);
    expect(requestReachedServer({ ...all, cause: Object.assign(new Error('Provider routines:ossl_gcm_stream_update:cipher operation failed'), { code: 'ERR_SSL_CIPHER_OPERATION_FAILED' }) })).toBe(true);
  });

  it.each([
    ['sslv3 alert bad certificate', 'ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE'],
    ['tlsv13 alert certificate required', 'ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED'],
    ['tlsv1 alert unknown ca', 'ERR_SSL_TLSV1_ALERT_UNKNOWN_CA'],
    ['tlsv1 alert access denied', undefined],
    ['ssl/tls alert handshake failure', undefined],
    ['sslv3 alert bad record mac', 'EPROTO'],
  ])('after an authenticated write with no answer, the peer alert "%s" refused us or our bytes: not held', (text, code) => {
    expect(requestReachedServer({ ...all, cause: alert(text, code) })).toBe(false);
  });

  it('a peer alert that refuses nothing ("internal error") after an authenticated write is held', () => {
    expect(requestReachedServer({ ...all, cause: alert('tlsv1 alert internal error', 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR') })).toBe(true);
  });

  it('once any response has been parsed, every failure is held — even a peer alert', () => {
    expect(requestReachedServer({ ...all, answered: true, cause: alert('sslv3 alert bad certificate', 'ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE') })).toBe(true);
    expect(requestReachedServer({ ...all, authenticated: false, answered: true, cause: alert('tlsv1 alert unknown ca') })).toBe(true);
  });
});

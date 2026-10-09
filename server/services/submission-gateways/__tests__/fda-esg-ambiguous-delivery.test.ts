/**
 * FDA ESG AS2 — a send FDA may hold is never recorded 'rejected'.
 *
 * 2026-09-23 (W5/D7, round-3 review, third pass). The MDN fix classified a 2xx
 * by whether FDA may hold the bytes, but every OTHER failure after the bytes
 * left still went through transmit's catch and was written 'rejected' —
 * outside findActiveTransmittal and sub_trans_active_lock_idx, so the governed
 * spine allowed an immediate second send of a bundle FDA may hold:
 *   - the whole AS2 body was written and the socket then timed out (the 60 s
 *     idle timeout while FDA computes a synchronous MDN over up to 1 GB) or
 *     was reset before the MDN arrived — a TransportError, written 'rejected';
 *   - the POST returned an accepting (or unconfirmed) MDN and the database
 *     write that records it failed — the catch-all wrote 'rejected'.
 * Each is pinned below as held inside the lock ('in_transit'), with the AS2
 * Message-ID as the transmission id and an error that forbids a blind resend.
 * A failure before the request was written in full is still 'rejected'.
 *
 * Only node:https, the pool, fs and the bundle reader are stubbed; httpsPost's
 * own 'finish' / 'timeout' / 'error' handling runs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'fda-esg-ambiguous-delivery-secret-padded-to-32-chars';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.FDA_ESG_URL = 'https://esg.fda.gov';
  process.env.FDA_ESG_AS2_FROM = 'SPONSOR-AS2';
  process.env.FDA_ESG_CERT_PATH = '/tmp/fda-cert.pem';
  process.env.FDA_ESG_KEY_PATH = '/tmp/fda-key.pem';
  process.env.FDA_ESG_FDA_CERT_PATH = '/tmp/fda-pub.pem';
});

interface QueryRecord { sql: string; args: unknown[]; failed: boolean }

const { queries, wire, TEST_KEY } = vi.hoisted(() => {
  const { generateKeyPairSync } = require('node:crypto');
  return {
    queries: [] as QueryRecord[],
    wire: {
      /** respond: answer with `mdn`; the others fail the socket. */
      mode: 'respond' as 'respond' | 'timeout-after-write' | 'reset-after-write' | 'refused-before-write',
      mdn: '',
      sentMessageId: '',
      /** An UPDATE this predicate matches throws, as a dropped connection would. */
      failUpdate: null as ((sql: string, args: unknown[]) => boolean) | null,
    },
    TEST_KEY: generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    }).privateKey as string,
  };
});

vi.mock('../../../db', () => ({
  pool: {
    query: vi.fn(async (sql: string, args: unknown[] = []) => {
      const failed = /UPDATE submission_transmittals/i.test(sql) && !!wire.failUpdate?.(sql, args);
      queries.push({ sql, args, failed });
      if (failed) throw new Error('Connection terminated unexpectedly');
      if (/INSERT INTO submission_transmittals/i.test(sql)) return { rows: [{ id: 4242 }], rowCount: 1 };
      return { rows: [], rowCount: /UPDATE/i.test(sql) ? 1 : 0 };
    }),
  },
}));

vi.mock('fs', async (orig) => {
  const actual = await (orig as () => Promise<typeof import('fs')>)();
  return { ...actual, promises: { ...actual.promises, readFile: vi.fn(async () => TEST_KEY) } };
});

vi.mock('../bundle-integrity', () => ({ readVerifiedBundle: vi.fn(async () => Buffer.from('zip-bytes')) }));

vi.mock('node:https', async () => {
  const { EventEmitter } = await import('node:events');
  return { request: (opts: { headers: Record<string, string> }, cb: (res: unknown) => void) => {
    wire.sentMessageId = opts.headers['Message-ID'];
    const handlers: Record<string, Array<(arg?: unknown) => void>> = {};
    const emit = (evt: string, arg?: unknown) => { for (const h of handlers[evt] ?? []) h(arg); };
    // 2026-09-23 (W5/D7, MDN final pass): a TLS 1.2 socket whose handshake
    // completes — the server accepted our client certificate — before the
    // write. httpsPost classes a failure after 'finish' as "may hold it" only
    // on such a connection; the TLS-refusal cases run over real sockets in
    // as2-delivery-outcome.test.ts.
    const socket = Object.assign(new EventEmitter(), {
      destroyed: false, cork: () => undefined, uncork: () => undefined, getProtocol: () => 'TLSv1.2',
    });
    const req = {
      on: (evt: string, h: (arg?: unknown) => void) => { (handlers[evt] ??= []).push(h); return req; },
      write: () => true,
      destroy: () => undefined,
      end: () => {
        globalThis.setImmediate(() => {
          if (wire.mode === 'refused-before-write') {
            emit('error', Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:443'), { code: 'ECONNREFUSED' }));
            return;
          }
          emit('socket', socket);
          socket.emit('secureConnect');
          // Node emits 'finish' once the whole request has been handed to the network.
          emit('finish');
          if (wire.mode === 'timeout-after-write') { emit('timeout'); return; }
          if (wire.mode === 'reset-after-write') { emit('error', Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })); return; }
          const resHandlers: Record<string, (arg?: unknown) => void> = {};
          const res = {
            statusCode: 200,
            headers: { 'message-id': '<mdn-msg-id@FDA-CESUB>' },
            on: (evt: string, h: (arg?: unknown) => void) => { resHandlers[evt] = h; return res; },
          };
          cb(res);
          resHandlers.data?.(Buffer.from(wire.mdn.replace('{{MESSAGE_ID}}', wire.sentMessageId), 'utf8'));
          resHandlers.end?.();
        });
      },
    };
    return req;
  } };
});

import { FdaEsgGateway, findActiveTransmittal } from '../fda-esg';

const REQUEST = () => ({
  organizationId: 7, userId: 11, programId: null, packageId: 99,
  bundle: { path: '/tmp/bundle.zip', sha256: 'a'.repeat(64), sizeBytes: 1024, format: 'ectd' as const },
  environment: 'production' as const,
  submissionType: 'original',
  fda: { applicationType: 'nda' },
  metadata: { applicationId: 'IND123456', sequence: '0001', environment: 'production' },
  authorization: {
    kind: 'governed-http' as const, actorUserId: 11,
    reason: 'FDA ESG ambiguous-delivery suite', reauthVerifiedAt: new Date(),
  },
});

const mdnFor = (disposition: string) =>
  '------=_Part_FDA_MDN\r\nContent-Type: message/disposition-notification\r\n\r\n' +
  'Reporting-UA: FDA-CESUB\r\nOriginal-Message-ID: {{MESSAGE_ID}}\r\n' +
  `Disposition: automatic-action/MDN-sent-automatically; ${disposition}\r\n------=_Part_FDA_MDN--\r\n`;

const statusWrites = () => queries.filter((q) => /UPDATE submission_transmittals/i.test(q.sql) && /status\s*=/.test(q.sql));
const statusOf = (q: QueryRecord) => q.args[Number(q.sql.match(/status = \$(\d+)/)![1]) - 1] as string;

/** The statuses the duplicate-send lock holds, read from its query and its index. */
async function lockStatuses(): Promise<{ query: string[]; index: string[] }> {
  const before = queries.length;
  await findActiveTransmittal({ organizationId: 7, packageId: 99, bundleSha256: 'a'.repeat(64) });
  const sql = queries.slice(before).find((q) => /SELECT\s+id,\s+status\s+FROM submission_transmittals/i.test(q.sql))!.sql;
  const indexSql = readFileSync(
    new URL('../../../../migrations/20260629_submission_transmittals_active_lock.sql', import.meta.url), 'utf8',
  );
  const list = (s: string) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  return { query: list(sql.match(/status IN \(([^)]*)\)/)![1]), index: list(indexSql.match(/WHERE status IN \(([^)]*)\)/)![1]) };
}

/**
 * No status write recorded 'rejected' (attempted or not), the last status that
 * landed is one the lock holds, and the caller is told FDA may hold the bundle.
 */
async function expectHeldInLock(err: unknown): Promise<string> {
  expect(err).toBeInstanceOf(Error);
  const message = (err as Error).message;
  expect(statusWrites().filter((q) => statusOf(q) === 'rejected')).toEqual([]);
  expect(statusWrites().filter((q) => statusOf(q) === 'received' && !q.failed)).toEqual([]);
  expect(message).toMatch(/may hold it/);
  expect(message).toMatch(/before any resend/);
  const landed = statusWrites().filter((q) => !q.failed);
  const last = statusOf(landed[landed.length - 1]);
  const lock = await lockStatuses();
  expect(lock.query).toContain(last);
  expect(lock.index).toContain(last);
  return last;
}

beforeEach(() => {
  queries.length = 0;
  wire.mode = 'respond';
  wire.mdn = mdnFor('processed');
  wire.sentMessageId = '';
  wire.failUpdate = null;
});

describe('FDA ESG AS2 — a failure after the whole request was written keeps the send inside the lock', () => {
  it.each([
    ['the socket times out after the whole body was written (no synchronous MDN yet)', 'timeout-after-write' as const, /timeout/],
    ['the connection is reset after the whole body was written', 'reset-after-write' as const, /socket hang up/],
  ])('%s: in transit, with our AS2 Message-ID as the transmission id — never rejected', async (_label, mode, cause) => {
    wire.mode = mode;
    const err = await new FdaEsgGateway().transmit(REQUEST()).catch((e) => e);
    expect(await expectHeldInLock(err)).toBe('in_transit');
    expect(err.message).toMatch(cause);
    const last = statusWrites().filter((q) => !q.failed).pop()!;
    expect(last.sql).toMatch(/transmission_id\s*=/);
    expect(last.args).toContain(wire.sentMessageId);
    expect(last.args).toContain(err.message);
  });

  it('a connection refused before the request was written is still a rejection (nothing reached FDA)', async () => {
    wire.mode = 'refused-before-write';
    const err = await new FdaEsgGateway().transmit(REQUEST()).catch((e) => e);
    expect(err.message).toMatch(/ECONNREFUSED/);
    expect(err.message).not.toMatch(/may hold it/);
    const last = statusWrites().pop()!;
    expect(statusOf(last)).toBe('rejected');
    expect(last.args).toContain('transport');
  });
});

describe('FDA ESG AS2 — a database failure after FDA answered never records a rejection', () => {
  it('an accepting MDN whose "received" write fails stays in transit inside the lock', async () => {
    wire.failUpdate = (_sql, args) => args.includes('received');
    const err = await new FdaEsgGateway().transmit(REQUEST()).catch((e) => e);
    expect(await expectHeldInLock(err)).toBe('in_transit');
    expect(err.message).toMatch(/Connection terminated/);
  });

  it('an unconfirmed MDN whose "in_transit" write fails keeps the in_transit written before the send', async () => {
    wire.mdn = mdnFor('processed/superseded');
    // Every post-MDN write fails (the one recording the MDN and the fallback);
    // the pre-send write carries no mdn_raw and lands.
    wire.failUpdate = (sql) => /mdn_raw\s*=/.test(sql) || /error_message\s*=/.test(sql);
    const err = await new FdaEsgGateway().transmit(REQUEST()).catch((e) => e);
    expect(await expectHeldInLock(err)).toBe('in_transit');
  });

  it('an explicit refusal naming our message whose write fails is still a rejection', async () => {
    wire.mdn = mdnFor('failed/failure: sender-unauthorized');
    let calls = 0;
    wire.failUpdate = (_sql, args) => args.includes('rejected') && calls++ === 0;
    await new FdaEsgGateway().transmit(REQUEST()).catch((e) => e);
    const last = statusWrites().filter((q) => !q.failed).pop()!;
    expect(statusOf(last)).toBe('rejected');
  });
});

describe('FDA ESG AS2 — dispositions the third pass reclassified, end to end', () => {
  it.each([
    ['processed/x-no-errors'],
    ['processed/x-failover-used'],
    ['processed: error'],
  ])('%s naming our message is in transit inside the lock — neither rejected nor received', async (d) => {
    wire.mdn = mdnFor(d);
    const err = await new FdaEsgGateway().transmit(REQUEST()).catch((e) => e);
    expect(await expectHeldInLock(err)).toBe('in_transit');
  });
});

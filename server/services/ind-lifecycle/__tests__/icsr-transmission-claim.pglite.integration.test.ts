/**
 * ICSR transmit — the row is claimed BEFORE the send, against real SQL.
 *
 * 2026-09-23 (W5/D7, MDN final pass, repair): new. transmitIcsrTransmission
 * read status 'prepared' and only wrote a status once the agency attempt had
 * ended, up to the AS2 timeout later. A second transmit of the same row in that
 * window — a double submit, or a retry after the platform's own proxy timed out
 * a slow synchronous MDN — still read 'prepared' and posted the same safety
 * report to FAERS again. The row is now claimed with a conditional UPDATE
 * (prepared → transmitting) before any byte is sent; only NOT_DELIVERED and
 * REFUSED_BY_AGENCY return it to 'prepared'.
 *
 * The drizzle db is in-process PGlite with the IND tables (server/db/
 * pglite-harness.ts), so the claim's `WHERE status = 'prepared'` is real SQL.
 * node:https is real on both ends (a local mTLS server, ../../submission-
 * gateways/__tests__/support/mtls-pki.ts). Only the audit writer is stubbed.
 *
 * 2026-09-23 (W5/D7, MDN close): two clauses of the claim had no test. When
 * the agency may hold the report but the status write that records it fails
 * — the 'transmitted' UPDATE after a real accepting MDN, or the
 * 'transmission_unconfirmed' UPDATE after a 502 — the row must stay
 * 'transmitting' (claimed before the send) and a second transmit must post
 * nothing. The failure is a PGlite trigger that RAISEs only on the target
 * status, so every other write (the claim, a release) is real.
 *
 * 2026-09-23 (W5/D7, MDN close, repair): a 502 or a reset from a
 * separate-process server that had read the whole report, while this process
 * is busy, was NOT_DELIVERED — the classifier read "Node's 'finish' had not
 * fired yet" as proof — and the row went back to 'prepared' for a second
 * FAERS send. Pinned below: 'transmission_unconfirmed' every time.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';
import type { MtlsPki, MtlsServer } from '../../submission-gateways/__tests__/support/mtls-pki';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../audit/audit-write-outcome', () => ({
  recordAuditRow: vi.fn(async () => ({ persisted: true })),
}));

import { makeMtlsPki, startMtlsServer } from '../../submission-gateways/__tests__/support/mtls-pki';
import { busyLoop, startSeparateProcessServer } from '../../submission-gateways/__tests__/support/separate-process-tls-server';
import type { IcsrGatewayConfig } from '../icsr-gateway-transport';
import { transmitIcsrTransmission, IcsrTransmissionError } from '../ind-icsr-transmission-persistence';

const ORG = 7;
const ctx = { organizationId: ORG, userId: 11 };
const MESSAGE = '<?xml version="1.0" encoding="UTF-8"?>\n<ichicsrMessage><M.1.1>MSG-2026-0042</M.1.1></ichicsrMessage>';

let harness: IndPgliteDb;
let pki: MtlsPki;
let server: MtlsServer;
let rowId: string;

const as2Config = (client: 'trusted' | 'rogue' = 'trusted'): IcsrGatewayConfig => ({
  url: `https://127.0.0.1:${server.port}/as2`,
  username: 'SPONSOR-AS2',
  certPath: client === 'trusted' ? pki.paths.clientCert : pki.paths.rogueCert,
  keyPath: client === 'trusted' ? pki.paths.clientKey : pki.paths.rogueKey,
  agencyCertPath: pki.paths.ca,
  as2To: 'FDA-FAERS',
  protocol: 'as2',
});

const statusOf = async (): Promise<{ status: string; transport_receipt_id: string | null }> => {
  const r = await harness.pglite.query<{ status: string; transport_receipt_id: string | null }>(
    'SELECT status, transport_receipt_id FROM ind_icsr_transmissions WHERE id = $1', [rowId]);
  return r.rows[0];
};

const transmit = (config: IcsrGatewayConfig) => transmitIcsrTransmission(rowId, ctx, { config }).catch((e: unknown) => e);

const acceptingMdn: MtlsServer['respond'] = (req, res) => {
  res.writeHead(200, { 'Content-Type': 'message/disposition-notification', 'Message-ID': '<mdn-icsr@FDA>' });
  res.end(`Original-Message-ID: ${String(req.headers['message-id'])}\r\nDisposition: automatic-action/MDN-sent-automatically; processed\r\n`);
};

beforeAll(async () => {
  harness = await createIndPgliteDb();
  holder.db = harness.db;
  pki = makeMtlsPki();
  server = await startMtlsServer(pki);
}, 60_000);
afterAll(async () => {
  await server.close();
  pki.cleanup();
  await harness.close();
});
beforeEach(async () => {
  server.seen.length = 0;
  server.respond = acceptingMdn;
  await harness.pglite.exec('DELETE FROM ind_icsr_transmissions');
  const r = await harness.pglite.query<{ id: string }>(
    `INSERT INTO ind_icsr_transmissions
       (organization_id, submission_id, adverse_event_id, gateway, message_number, sender_id, receiver_id, status, transmit_ready, message)
     VALUES ($1, 3, 'AE-1', 'FDA_FAERS', 'MSG-2026-0042', 'SPONSOR', 'ZZFDA', 'prepared', true, $2) RETURNING id`,
    [ORG, MESSAGE],
  );
  rowId = r.rows[0].id;
});

describe('ICSR transmit — one send per prepared row, however many transmits race for it', () => {
  it('two simultaneous transmits: exactly one POST reaches the agency; the other is refused INVALID_STATE', async () => {
    server.respond = (_req, res) => { setTimeout(() => { res.writeHead(504); res.end('Gateway Timeout'); }, 300); };
    const [a, b] = await Promise.all([transmit(as2Config()), transmit(as2Config())]);
    expect(server.seen).toHaveLength(1);
    const codes = [a, b].map((e) => (e as IcsrTransmissionError).code).sort();
    expect(codes).toEqual(['INVALID_STATE', 'TRANSMISSION_UNCONFIRMED']);
    const row = await statusOf();
    expect(row.status).toBe('transmission_unconfirmed');
    expect(row.transport_receipt_id).toBe(server.seen[0].headers['message-id']);
  });

  it('a second transmit while the first awaits the agency reads "transmitting", sends nothing and says a send is in progress', async () => {
    server.respond = (_req, res) => { setTimeout(() => { res.writeHead(504); res.end('Gateway Timeout'); }, 400); };
    const first = transmit(as2Config());
    await new Promise((r) => setTimeout(r, 150));
    expect((await statusOf()).status).toBe('transmitting');
    const second = await transmit(as2Config());
    expect((second as IcsrTransmissionError).code).toBe('INVALID_STATE');
    expect((second as Error).message).toMatch(/in progress/i);
    expect((second as Error).message).toMatch(/not sent again/i);
    expect(((await first) as IcsrTransmissionError).code).toBe('TRANSMISSION_UNCONFIRMED');
    expect(server.seen).toHaveLength(1);
  });

  it('a received transmit leaves the row transmitted with the MDN id', async () => {
    const out = await transmitIcsrTransmission(rowId, ctx, { config: as2Config() });
    expect(out.status).toBe('transmitted');
    expect((await statusOf()).status).toBe('transmitted');
  });
});

describe('ICSR transmit — the claim is released only when the agency cannot hold the report', () => {
  it('NOT_DELIVERED (client certificate refused): back to prepared, and a later transmit is sent', async () => {
    const refused = await transmit(as2Config('rogue'));
    expect(server.seen).toHaveLength(0);
    expect((refused as IcsrTransmissionError).code).toBe('GATEWAY_TRANSMIT_FAILED');
    expect((refused as Error).message).toMatch(/remains 'prepared'/);
    expect((await statusOf()).status).toBe('prepared');

    const out = await transmitIcsrTransmission(rowId, ctx, { config: as2Config() });
    expect(out.status).toBe('transmitted');
    expect(server.seen).toHaveLength(1);
  });

  it('REFUSED_BY_AGENCY (HTTP 403): back to prepared', async () => {
    server.respond = (_req, res) => { res.writeHead(403); res.end('forbidden'); };
    const err = await transmit(as2Config());
    expect((err as IcsrTransmissionError).code).toBe('GATEWAY_TRANSMIT_FAILED');
    expect((await statusOf()).status).toBe('prepared');
  });

  it('DELIVERED_UNCONFIRMED (HTTP 502): transmission_unconfirmed, never back to prepared', async () => {
    server.respond = (_req, res) => { res.writeHead(502); res.end('Bad Gateway'); };
    const err = await transmit(as2Config());
    expect((err as IcsrTransmissionError).code).toBe('TRANSMISSION_UNCONFIRMED');
    expect((await statusOf()).status).toBe('transmission_unconfirmed');
  });

  it.each([
    ['HTTP 502', { mode: 'answer' as const, status: 502, delayMs: 10 }],
    ['a reset', { mode: 'reset' as const, delayMs: 10 }],
  ])('%s from a separate-process server that read the whole report, while this process is busy: transmission_unconfirmed, never prepared', async (_label, opts) => {
    const srv = await startSeparateProcessServer(pki, opts);
    const outcomes: string[] = [];
    const stop = busyLoop(30);
    try {
      for (let i = 0; i < 3; i++) {
        await harness.pglite.query(`UPDATE ind_icsr_transmissions SET status = 'prepared' WHERE id = $1`, [rowId]);
        const err = await transmit({ ...as2Config(), url: `https://127.0.0.1:${srv.port}/as2` });
        const seen = await srv.nextClose();
        expect(seen.contentLength).toBeGreaterThan(0);
        expect(seen.bodyRead).toBe(seen.contentLength);
        outcomes.push(`${(err as IcsrTransmissionError).code} ${(await statusOf()).status}`);
      }
    } finally {
      stop();
      srv.close();
    }
    expect(outcomes).toEqual(Array(3).fill('TRANSMISSION_UNCONFIRMED transmission_unconfirmed'));
  }, 120_000);
});

/** Make every UPDATE that sets `status` to `target` fail, as a lost connection would. */
async function failStatusWrites(target: string): Promise<void> {
  await harness.pglite.exec(`
    CREATE OR REPLACE FUNCTION test_fail_status_write() RETURNS trigger AS $$
    BEGIN
      IF NEW.status = '${target}' THEN
        RAISE EXCEPTION 'simulated failure writing status %', NEW.status;
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS test_fail_status_write ON ind_icsr_transmissions;
    CREATE TRIGGER test_fail_status_write BEFORE UPDATE ON ind_icsr_transmissions
      FOR EACH ROW EXECUTE FUNCTION test_fail_status_write();`);
}

describe('ICSR transmit — the agency may hold the report but recording it fails: the row stays locked (MDN close)', () => {
  afterEach(async () => {
    await harness.pglite.exec('DROP TRIGGER IF EXISTS test_fail_status_write ON ind_icsr_transmissions');
  });

  it("a real accepting MDN whose 'transmitted' UPDATE fails: row 'transmitting', and a second transmit posts nothing", async () => {
    await failStatusWrites('transmitted');
    const first = await transmit(as2Config());
    expect(server.seen).toHaveLength(1);
    // drizzle wraps the driver error ("Failed query: update …"); the trigger's
    // RAISE is its cause.
    const cause = (first as Error & { cause?: unknown }).cause;
    expect(`${(first as Error).message} ${cause instanceof Error ? cause.message : ''}`).toMatch(/simulated failure writing status transmitted/);
    expect((await statusOf()).status).toBe('transmitting');

    const second = await transmit(as2Config());
    expect((second as IcsrTransmissionError).code).toBe('INVALID_STATE');
    expect(server.seen).toHaveLength(1);
    expect((await statusOf()).status).toBe('transmitting');
  });

  it("DELIVERED_UNCONFIRMED (HTTP 502) whose 'transmission_unconfirmed' UPDATE fails: row 'transmitting', and a second transmit posts nothing", async () => {
    await failStatusWrites('transmission_unconfirmed');
    server.respond = (_req, res) => { res.writeHead(502); res.end('Bad Gateway'); };
    const first = await transmit(as2Config());
    expect(server.seen).toHaveLength(1);
    expect((first as IcsrTransmissionError).code).toBe('TRANSMISSION_UNCONFIRMED');
    expect((first as Error).message).toMatch(/stays 'transmitting'/);
    expect((await statusOf()).status).toBe('transmitting');

    const second = await transmit(as2Config());
    expect((second as IcsrTransmissionError).code).toBe('INVALID_STATE');
    expect(server.seen).toHaveLength(1);
    expect((await statusOf()).status).toBe('transmitting');
  });
});

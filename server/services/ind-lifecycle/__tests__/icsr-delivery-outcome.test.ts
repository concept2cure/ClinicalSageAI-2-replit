/**
 * E2B(R3) ICSR over REAL sockets: the transport stage each delivery outcome
 * maps to, and what the persistence layer records for it.
 *
 * 2026-09-23 (W5/D7, MDN final pass): new. The ICSR transport shares the one
 * AS2 delivery classifier in submission-gateways/as2-transport.ts with FDA
 * ESG:
 *   NOT_DELIVERED         → stage 'transport'          (row stays 'prepared')
 *   DELIVERED_UNCONFIRMED → stage 'receipt-unproven'   (row 'transmission_unconfirmed', locked)
 *   REFUSED_BY_AGENCY     → stage 'gateway-rejected'   (row stays 'prepared')
 *   RECEIVED              → 'transmitted'
 * Before this pass a TLS 1.3 client-certificate refusal was 'receipt-unproven'
 * (the agency never saw a byte), every 5xx was 'gateway-rejected' (a gateway
 * or backend may hold the report), and a 'receipt-unproven' outcome left the
 * row 'prepared', so the next transmit sent the same safety report again.
 *
 * node:https is real on both ends (./support/mtls-pki.ts builds a throwaway
 * CA). Only the drizzle db (an in-memory row) and the audit writer are stubbed.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MtlsPki, MtlsServer } from '../../submission-gateways/__tests__/support/mtls-pki';

const { store, auditRows } = vi.hoisted(() => ({
  store: { row: null as Record<string, unknown> | null, updates: [] as Record<string, unknown>[] },
  auditRows: [] as Array<{ action: string; details?: Record<string, unknown> }>,
}));

vi.mock('../../../db', () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => Promise.resolve(store.row ? [{ ...store.row }] : []),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            // The pre-send claim is `… SET status='transmitting' WHERE … AND
            // status='prepared'`: it matches nothing unless the row is prepared.
            if (patch.status === 'transmitting' && store.row?.status !== 'prepared') return [];
            store.updates.push(patch);
            store.row = { ...store.row, ...patch };
            return [{ ...store.row }];
          },
        }),
      }),
    }),
  };
  return { db: chain, pool: { query: async () => ({ rows: [], rowCount: 0 }) } };
});

vi.mock('../../audit/audit-write-outcome', () => ({
  recordAuditRow: vi.fn(async (row: { action: string; details?: Record<string, unknown> }) => {
    auditRows.push(row);
    return { persisted: true };
  }),
}));

import { makeMtlsPki, startMtlsServer, startTcpProxy } from '../../submission-gateways/__tests__/support/mtls-pki';
import { transmitIcsr, IcsrGatewayTransmitError, type IcsrGatewayConfig } from '../icsr-gateway-transport';
import type { IcsrTransmissionResult } from '../e2b-icsr-message';
import {
  transmitIcsrTransmission,
  recordIcsrAcknowledgment,
  IcsrTransmissionError,
} from '../ind-icsr-transmission-persistence';

const MESSAGE = '<?xml version="1.0" encoding="UTF-8"?>\n<ichicsrMessage><M.1.1>MSG-2026-0001</M.1.1></ichicsrMessage>';
const built = (): IcsrTransmissionResult => ({ message: MESSAGE, transmitReady: true, gaps: [], gateway: 'FDA_FAERS', receiverId: 'ZZFDA' });

let pki: MtlsPki;
let server: MtlsServer;

const as2Config = (client: 'trusted' | 'rogue' = 'trusted'): IcsrGatewayConfig => ({
  url: `https://127.0.0.1:${server.port}/as2`,
  username: 'SPONSOR-AS2',
  certPath: client === 'trusted' ? pki.paths.clientCert : pki.paths.rogueCert,
  keyPath: client === 'trusted' ? pki.paths.clientKey : pki.paths.rogueKey,
  agencyCertPath: pki.paths.ca,
  as2To: 'FDA-FAERS',
  protocol: 'as2',
});

beforeAll(async () => {
  pki = makeMtlsPki();
  server = await startMtlsServer(pki);
});
afterAll(async () => {
  await server.close();
  pki.cleanup();
});
beforeEach(() => {
  server.seen.length = 0;
  server.setMaxVersion('TLSv1.3');
  store.updates.length = 0;
  auditRows.length = 0;
  store.row = {
    id: 'tx-1', organizationId: 7, submissionId: 3, status: 'prepared', transmitReady: true, gaps: [],
    gateway: 'FDA_FAERS', receiverId: 'ZZFDA', messageNumber: 'MSG-2026-0001', message: MESSAGE,
    transportReceiptId: null, transmittedAt: null, errors: [],
  };
  server.respond = (req, res) => {
    const mid = String(req.headers['message-id']);
    res.writeHead(200, { 'Content-Type': 'message/disposition-notification', 'Message-ID': '<mdn-icsr@FDA>' });
    res.end(`Original-Message-ID: ${mid}\r\nDisposition: automatic-action/MDN-sent-automatically; processed\r\n`);
  };
});

const attempt = (config: IcsrGatewayConfig) =>
  transmitIcsr(built(), { config, now: () => Date.parse('2026-09-23T00:00:00.000Z') }).catch((e: unknown) => e);

describe('ICSR AS2 — the agency refuses our client certificate: NOT_DELIVERED, stage transport', () => {
  it.each(['TLSv1.3', 'TLSv1.2'] as const)('%s: transport, NOT transmitted, nothing reached the application', async (version) => {
    server.setMaxVersion(version);
    const err = await attempt(as2Config('rogue'));
    expect(server.seen).toHaveLength(0);
    expect(err).toBeInstanceOf(IcsrGatewayTransmitError);
    expect((err as IcsrGatewayTransmitError).stage).toBe('transport');
    expect((err as Error).message).toMatch(/NOT transmitted/);
    expect((err as Error).message).not.toMatch(/may hold it/);
  });

  it('control: a trusted certificate and an accepting MDN is transmitted', async () => {
    const out = await transmitIcsr(built(), { config: as2Config() });
    expect(out.status).toBe('transmitted');
    expect(server.seen).toHaveLength(1);
  });
});

describe('ICSR AS2 — an authenticated gateway read the whole message and reset: DELIVERED_UNCONFIRMED', () => {
  /* A small ICSR is read in full before the client has processed the TLS 1.3
     session ticket; written straight after the handshake, the reset looked
     exactly like a certificate refusal. httpsPost holds the request until the
     server has accepted the client, so this is receipt-unproven. */
  it.each(['TLSv1.3', 'TLSv1.2'] as const)('%s: receipt-unproven, never transport', async (version) => {
    server.setMaxVersion(version);
    server.respond = (_req, res) => { res.socket?.destroy(); };
    const err = await attempt(as2Config());
    expect(server.seen).toHaveLength(1);
    expect(server.seen[0].body.toString('utf8')).toBe(MESSAGE);
    expect((err as IcsrGatewayTransmitError).stage).toBe('receipt-unproven');
    expect((err as IcsrGatewayTransmitError).transportMessageId).toBe(server.seen[0].headers['message-id']);
    expect((err as Error).message).toMatch(/may hold it/);
  });
});

describe('ICSR AS2 — HTTP status classes', () => {
  it.each([500, 502, 503, 504])('HTTP %i after the whole message: receipt-unproven, confirm before any resend', async (code) => {
    server.respond = (_req, res) => { res.writeHead(code); res.end(`upstream ${code}`); };
    const err = await attempt(as2Config());
    expect(server.seen).toHaveLength(1);
    expect((err as IcsrGatewayTransmitError).stage).toBe('receipt-unproven');
    expect((err as IcsrGatewayTransmitError).httpStatus).toBe(code);
    expect((err as IcsrGatewayTransmitError).transportMessageId).toBe(server.seen[0].headers['message-id']);
    expect((err as Error).message).not.toMatch(/NOT transmitted/);
    expect((err as Error).message).toMatch(/before any resend/);
  });

  it.each([400, 401, 403, 404, 413, 422])('HTTP %i: gateway-rejected', async (code) => {
    server.respond = (_req, res) => { res.writeHead(code); res.end(`refused ${code}`); };
    const err = await attempt(as2Config());
    expect((err as IcsrGatewayTransmitError).stage).toBe('gateway-rejected');
    expect((err as IcsrGatewayTransmitError).httpStatus).toBe(code);
  });
});

describe('ICSR persistence — a receipt-unproven outcome locks the row', () => {
  it('records transmission_unconfirmed with the agency response and our AS2 Message-ID; a second transmit sends nothing; the ACK is accepted', async () => {
    server.respond = (_req, res) => { res.writeHead(504); res.end('Gateway Timeout from the agency edge'); };
    const ctx = { organizationId: 7, userId: 11 };

    const first = await transmitIcsrTransmission('tx-1', ctx, { config: as2Config() }).catch((e: unknown) => e);
    expect(server.seen).toHaveLength(1);
    const sentId = String(server.seen[0].headers['message-id']);
    expect(first).toBeInstanceOf(IcsrTransmissionError);
    const e1 = first as IcsrTransmissionError;
    expect(e1.code).toBe('TRANSMISSION_UNCONFIRMED');
    expect(e1.message).not.toMatch(/NOT transmitted/);
    expect(e1.message).not.toMatch(/remains 'prepared'/);
    expect(e1.details.transmitted).not.toBe(false);
    expect(store.row!.status).toBe('transmission_unconfirmed');
    expect(store.row!.transportReceiptId).toBe(sentId);
    expect(JSON.stringify(store.row!.errors)).toContain('Gateway Timeout from the agency edge');
    expect(auditRows.map((a) => a.action)).toContain('IND_ICSR_TRANSMISSION_UNCONFIRMED');

    const second = await transmitIcsrTransmission('tx-1', ctx, { config: as2Config() }).catch((e: unknown) => e);
    expect(server.seen).toHaveLength(1); // zero further HTTPS requests
    expect((second as IcsrTransmissionError).code).toBe('INVALID_STATE');
    expect((second as Error).message).toMatch(/confirm/i);
    expect((second as Error).message).toMatch(/acknowledgement/i);
    expect((second as Error).message).toMatch(/release/i);

    const ack = await recordIcsrAcknowledgment(
      'tx-1',
      '<ichicsrAck><messagenumb>MSG-2026-0001</messagenumb><transmissionacknowledgmentcode>AA</transmissionacknowledgmentcode></ichicsrAck>',
      ctx,
    );
    expect(ack.status).toBe('acknowledged');
  });

  it('a TLS certificate refusal returns the row to prepared (nothing reached the agency)', async () => {
    const err = await transmitIcsrTransmission('tx-1', { organizationId: 7, userId: 11 }, { config: as2Config('rogue') }).catch((e: unknown) => e);
    expect(server.seen).toHaveLength(0);
    expect((err as IcsrTransmissionError).code).toBe('GATEWAY_TRANSMIT_FAILED');
    expect((err as IcsrTransmissionError).details.transmitted).toBe(false);
    expect(store.row!.status).toBe('prepared');
    // 2026-09-23 (MDN final pass, repair): claimed 'transmitting' before the
    // send, released to 'prepared' when nothing was delivered.
    expect(store.updates.map((u) => u.status)).toEqual(['transmitting', 'prepared']);
  });
});

/* 2026-09-23 (W5/D7, MDN final pass, repair): through a TCP proxy. A gateway
   that read the whole ICSR and answered, whose answer the client then fails to
   decrypt, may hold the report — it was stage 'transport' ("NOT transmitted"),
   which frees a resend. A certificate refusal a WAN round trip away is still
   'transport' with nothing written, with the default settle window. */
describe('ICSR AS2 — through a proxy: corrupted answers and WAN latency', () => {
  it.each(['TLSv1.3', 'TLSv1.2'] as const)('%s: whole ICSR read, the answer fails decryption — receipt-unproven', async (version) => {
    server.setMaxVersion(version);
    const proxy = await startTcpProxy(server.port, { corrupt: () => server.seen.length > 0 });
    try {
      const err = await attempt({ ...as2Config(), url: `https://127.0.0.1:${proxy.port}/as2` });
      expect(server.seen).toHaveLength(1);
      expect(server.seen[0].body.toString('utf8')).toBe(MESSAGE);
      expect((err as IcsrGatewayTransmitError).stage).toBe('receipt-unproven');
      expect((err as Error).message).not.toMatch(/NOT transmitted/);
    } finally {
      await proxy.close();
    }
  });

  it('TLS 1.3: a certificate refusal 60 ms away (each way) — transport, nothing reached the application', async () => {
    const proxy = await startTcpProxy(server.port, { delayMs: 60 });
    try {
      const err = await attempt({ ...as2Config('rogue'), url: `https://127.0.0.1:${proxy.port}/as2` });
      expect(server.seen).toHaveLength(0);
      expect((err as IcsrGatewayTransmitError).stage).toBe('transport');
      expect((err as Error).message).toMatch(/NOT transmitted/);
    } finally {
      await proxy.close();
    }
  });
});

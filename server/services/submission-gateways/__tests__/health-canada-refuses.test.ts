/**
 * Health Canada — nothing goes on the wire over a channel nobody sourced
 * (FILING_SPINE F19b; WORKFLOW_DECISION_2026-10-08 §5).
 *
 * health-canada-gateway.ts described a REST + mTLS + HMAC-SHA256 protocol at
 * cesg.hc-sc.gc.ca/submission/v1 written from no Health Canada source, and with
 * five HC_CESG_* variables set it POSTed an eCTD package there, recorded the
 * transmittal 'received' and polled /receipts/{id} as the agency's answer.
 *
 * Pinned here, with every one of those variables set and every socket answered
 * as a success that names a receipt (so the old code is seen succeeding):
 *  - transmit refuses with the typed pre-wire UnverifiedTransportError, before
 *    any transmittal row and before any socket, and says why in the market
 *    statement's own words (market-support.ts HEALTH_CANADA_NO_TRANSPORT; not
 *    ADAPTER_UNSOURCED, which says the adapter posts somewhere);
 *  - refusedBeforeWire releases the caller's transmit claim on that error;
 *  - isConfigured is false whatever is set;
 *  - checkStatus never polls: it returns the stored row as source 'stored'.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import os from 'os';
import path from 'path';

const { wireCalls, dbCalls } = vi.hoisted(() => ({
  wireCalls: [] as unknown[],
  dbCalls: [] as string[],
}));

vi.mock('../../../db', () => ({
  db: {},
  pool: {
    query: async (text: string) => {
      dbCalls.push(text.replace(/\s+/g, ' ').trim());
      if (/INSERT INTO submission_transmittals/.test(text)) return { rowCount: 1, rows: [{ id: 77 }] };
      if (/SELECT transmission_id, status, ack_received_at/.test(text)) {
        return {
          rowCount: 1,
          rows: [{ transmission_id: 'HC-R-1', status: 'received', ack_received_at: new Date('2026-09-01T00:00:00Z'), metadata: { environment: 'production' } }],
        };
      }
      return { rowCount: 1, rows: [] };
    },
  },
}));

vi.mock('node:https', () => ({
  request: (opts: unknown, cb: (res: unknown) => void) => {
    wireCalls.push(opts);
    const data: Array<(c: Buffer) => void> = [];
    const end: Array<() => void> = [];
    const res = {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      on: (evt: string, h: (...a: never[]) => void) => {
        if (evt === 'data') data.push(h as (c: Buffer) => void);
        if (evt === 'end') end.push(h as () => void);
      },
    };
    void Promise.resolve().then(() => {
      cb(res);
      for (const h of data) h(Buffer.from(JSON.stringify({ receiptId: 'HC-R-1', status: 'accepted' }), 'utf8'));
      for (const h of end) h();
    });
    return { on: () => undefined, write: () => undefined, end: () => undefined, destroy: () => undefined };
  },
}));

import { refusedBeforeWire } from '../index';
import { HealthCanadaGateway } from '../health-canada-gateway';
import { UnverifiedTransportError } from '../types';

let dir = '';
const KEYS = ['HC_CESG_URL', 'HC_CESG_COMPANY_ID', 'HC_CESG_CERT_PATH', 'HC_CESG_KEY_PATH', 'HC_CESG_HMAC_SECRET'];

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hc-refuses-'));
  await fs.writeFile(path.join(dir, 'cert.pem'), 'CERT');
  await fs.writeFile(path.join(dir, 'key.pem'), 'KEY');
  await fs.writeFile(path.join(dir, 'bundle.zip'), 'PK');
  process.env.HC_CESG_URL = 'https://cesg.hc-sc.gc.ca';
  process.env.HC_CESG_COMPANY_ID = 'C-1';
  process.env.HC_CESG_CERT_PATH = path.join(dir, 'cert.pem');
  process.env.HC_CESG_KEY_PATH = path.join(dir, 'key.pem');
  process.env.HC_CESG_HMAC_SECRET = 's3cret';
});
afterAll(async () => {
  for (const k of KEYS) delete process.env[k];
  await fs.rm(dir, { recursive: true, force: true });
});
beforeEach(() => {
  wireCalls.length = 0;
  dbCalls.length = 0;
});

function caRequest() {
  return {
    organizationId: 7,
    userId: 11,
    programId: null,
    packageId: 99,
    // A bundle that passes the integrity check, so the old code is seen going
    // all the way to the wire rather than stopping at a hash mismatch.
    bundle: { path: path.join(dir, 'bundle.zip'), sha256: createHash('sha256').update('PK').digest('hex'), sizeBytes: 2, format: 'ectd' as const },
    environment: 'production' as const,
    submissionType: 'initial',
    metadata: { applicationId: 'CA-DOSSIER-1', sequence: '0000', environment: 'production' },
    authorization: {
      kind: 'governed-http' as const,
      actorUserId: 1,
      reason: 'health canada refusal suite',
      reauthVerifiedAt: new Date(),
    },
  };
}

describe('Health Canada refuses to transmit', () => {
  it('refuses before the wire, with the reason, and records no transmittal', async () => {
    const gw = new HealthCanadaGateway();
    let caught: unknown = null;
    try {
      await gw.transmit(caRequest() as never);
    } catch (err) {
      caught = err;
    }
    expect(caught, 'a transmit with every HC_CESG_* variable set must not succeed').toBeInstanceOf(UnverifiedTransportError);
    expect((caught as UnverifiedTransportError).transmitted).toBe(false);
    expect(String((caught as Error).message)).toMatch(/No Health Canada channel: no transport taken from a Health Canada source exists here, so nothing is sent to Health Canada\. Submit through Health Canada's own channel\./);
    expect(String((caught as Error).message)).not.toMatch(/posts to an endpoint/);
    expect(refusedBeforeWire(caught)).toBe(true);
    expect(wireCalls).toHaveLength(0);
    expect(dbCalls.some((q) => /submission_transmittals/.test(q))).toBe(false);
  });

  it('is never configured, whatever variables are set', async () => {
    await expect(new HealthCanadaGateway().isConfigured(7, 'production')).resolves.toBe(false);
  });

  it('never polls Health Canada for status: the stored row comes back, saying why', async () => {
    const status = await new HealthCanadaGateway().checkStatus(5);
    expect(wireCalls).toHaveLength(0);
    expect(status.source).toBe('stored');
    expect(status.pollError).toMatch(/^Not polled: /);
  });
});

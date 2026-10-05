/**
 * PMDA — nothing goes on the wire over a protocol nobody sourced.
 *
 * 2026-10-05 (D2 record, step g-pmda-transmit-unverified; finding
 * drugs-jp-ectd-v4-only-for-new-applications). pmda-gateway.ts described a
 * REST + mTLS + HMAC-SHA256 protocol at gateway.pmda.go.jp/submission/v1 with
 * no regulator source, and with five environment variables set it POSTed an
 * eCTD package to that endpoint and polled /receipts/{id}. PMDA's real channel
 * is 申請電子データシステム (the "gateway system", esg.pmda.go.jp): a personal
 * electronic certificate, user registration, and a 提出予告 that yields the
 * eCTD reception number — none of which the invented protocol models.
 *
 * Pinned here:
 *  - transmit with credentials set refuses with the typed pre-wire
 *    UnverifiedTransportError, before any transmittal row and before any
 *    socket; refusedBeforeWire releases the caller's claim on it;
 *  - checkStatus never polls the invented endpoint: it hands back the stored
 *    row as source=stored, saying why;
 *  - isConfigured is false whatever variables are set — there is no sourced
 *    transport to configure;
 *  - the market registry no longer says Japan devices/IVDs can be transmitted;
 *  - the unsourced 1 GB PMDA size figure warns instead of blocking.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import JSZip from 'jszip';
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
      if (/INSERT INTO submission_transmittals/.test(text)) return { rowCount: 1, rows: [{ id: 41 }] };
      if (/SELECT transmission_id, status, ack_received_at, metadata FROM submission_transmittals/.test(text)) {
        return {
          rowCount: 1,
          rows: [{ transmission_id: 'PMDA-R-1', status: 'received', ack_received_at: new Date('2026-09-01T00:00:00Z'), metadata: { environment: 'staging' } }],
        };
      }
      return { rowCount: 1, rows: [] };
    },
  },
}));

// Any request the gateway opens is recorded and answered as a success that
// names a receipt — so on the old code a transmit "succeeds" and a status poll
// reads as the agency's answer, and both are visible here.
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
      for (const h of data) h(Buffer.from(JSON.stringify({ receiptId: 'PMDA-R-1', status: 'received' }), 'utf8'));
      for (const h of end) h();
    });
    return { on: () => undefined, write: () => undefined, end: () => undefined, destroy: () => undefined };
  },
}));

import { getGateway, getGatewayUnguarded, refusedBeforeWire } from '../index';
import { PmdaGateway } from '../pmda-gateway';
import { evaluatePreTransmit } from '../pre-transmit-check';
import { getGatewaySizeLimit } from '../../ectd/ectd-regional-rules';
import { getMarket } from '../../global-markets/market-registry';
import { UnverifiedTransportError, ValidationError, type GatewayTransmitRequest } from '../types';

const bundle = { path: '', sha256: '', sizeBytes: 0, format: 'pmda_ectd' as const, builtRegion: 'pmda' as const };

beforeAll(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pmda-unverified-'));
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
  const zip = new JSZip();
  zip.file('0000/m2/22-intro/intro.pdf', pdf);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const p = path.join(dir, 'b.zip');
  await fs.writeFile(p, buf);
  Object.assign(bundle, { path: p, sha256: createHash('sha256').update(buf).digest('hex'), sizeBytes: buf.length });
  // Every variable the invented protocol read, set and readable: "with credentials".
  const cert = path.join(dir, 'cert.pem');
  const key = path.join(dir, 'key.pem');
  await fs.writeFile(cert, '-----BEGIN CERTIFICATE-----\n');
  await fs.writeFile(key, '-----BEGIN PRIVATE KEY-----\n');
  Object.assign(process.env, {
    PMDA_STAGING_URL: 'https://gateway-staging.pmda.example.invalid',
    PMDA_STAGING_APPLICANT_ID: 'APPL-0001',
    PMDA_STAGING_CERT_PATH: cert,
    PMDA_STAGING_KEY_PATH: key,
    PMDA_STAGING_HMAC_SECRET: 'shared-secret',
  });
});

beforeEach(() => {
  wireCalls.length = 0;
  dbCalls.length = 0;
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
    metadata: { applicationId: 'JP-2026-0001', sequence: '0001', environment: 'staging' },
    authorization: { kind: 'governed-signature', signatureActionId: 'sig-1', actorUserId: 11 },
    ...overrides,
  } as GatewayTransmitRequest;
}

async function failureOf(p: Promise<unknown>): Promise<unknown> {
  return p.then(() => { throw new Error('expected the transmit to reject'); }, (e) => e);
}

describe('PMDA transmit — refused before the wire until a sourced protocol exists', () => {
  it('with every credential set, refuses with UnverifiedTransportError: no socket, no transmittal row, claim releasable', async () => {
    const err = await failureOf(getGateway('pmda', 'pmda_gateway').transmit(request()));
    expect(err).toBeInstanceOf(UnverifiedTransportError);
    expect((err as UnverifiedTransportError).transmitted).toBe(false);
    expect((err as UnverifiedTransportError).region).toBe('pmda');
    expect(String((err as Error).message)).toMatch(/申請電子データシステム/);
    expect(String((err as Error).message)).toMatch(/esg\.pmda\.go\.jp/);
    expect(wireCalls).toHaveLength(0);
    expect(dbCalls.some((t) => /INSERT INTO submission_transmittals/.test(t))).toBe(false);
    expect(refusedBeforeWire(err)).toBe(true);
  });

  it('the unguarded implementation refuses the same way (no path around the refusal)', async () => {
    const err = await failureOf(getGatewayUnguarded('pmda', 'pmda_gateway').transmit(request()));
    expect(err).toBeInstanceOf(UnverifiedTransportError);
    expect(wireCalls).toHaveLength(0);
  });

  it('a request missing its sequence number is still refused for that first, before any row', async () => {
    const err = await failureOf(new PmdaGateway().transmit(request({ metadata: { applicationId: 'JP-2026-0001' } })));
    expect(err).toBeInstanceOf(ValidationError);
    expect(String((err as Error).message)).toMatch(/sequence number/);
    expect(refusedBeforeWire(err)).toBe(true);
    expect(dbCalls.some((t) => /INSERT INTO submission_transmittals/.test(t))).toBe(false);
    expect(wireCalls).toHaveLength(0);
  });

  it('a request missing its submission type is refused for that first, before any row', async () => {
    const err = await failureOf(new PmdaGateway().transmit(request({ submissionType: undefined })));
    expect(err).toBeInstanceOf(ValidationError);
    expect(String((err as Error).message)).toMatch(/submission type/);
    expect(dbCalls.some((t) => /INSERT INTO submission_transmittals/.test(t))).toBe(false);
    expect(wireCalls).toHaveLength(0);
  });

  it('the source header says the protocol is unverified and names the real system', async () => {
    const src = await fs.readFile(path.resolve(__dirname, '../pmda-gateway.ts'), 'utf8');
    const header = src.slice(0, src.indexOf('*/'));
    expect(header).toMatch(/UNVERIFIED — no regulator source/);
    expect(header).toMatch(/申請電子データシステム/);
    // The invented endpoint and signature scheme are gone from the code (the
    // header may still name what was removed).
    const code = src.slice(src.indexOf('*/'));
    expect(code).not.toMatch(/gateway\.pmda\.go\.jp\/submission/);
    expect(code).not.toMatch(/createHmac/);
    expect(code).not.toMatch(/node:https/);
  });
});

describe('PMDA status and configuration — no poll, no "configured" over an unsourced protocol', () => {
  it('checkStatus never opens a request; it returns the stored row as source=stored with the reason', async () => {
    const result = await new PmdaGateway().checkStatus(777);
    expect(wireCalls).toHaveLength(0);
    expect(result.source).toBe('stored');
    expect(result.status).toBe('received');
    expect(result.pollError).toMatch(/unverified/i);
  });

  it('isConfigured is false even with every variable set', async () => {
    expect(await new PmdaGateway().isConfigured(7, 'staging')).toBe(false);
  });
});

describe('Japan devices/IVDs — not transmittable', () => {
  it("getMarket('jp-pmda').canTransmit is false, with no gateway and an honest note", () => {
    const jp = getMarket('jp-pmda')!;
    expect(jp.canTransmit).toBe(false);
    expect(jp.gatewayRegion).toBeUndefined();
    expect(jp.assembleNote).toMatch(/Japanese device\/IVD applications are not eCTD \(STED\); no PMDA device e-application path is built/);
  });
});

describe('pre-transmit size limit — the unsourced PMDA figure warns, it does not block', () => {
  it('a JP bundle over the recorded 1 GB figure clears with a warning naming the figure as unsourced', () => {
    const limit = getGatewaySizeLimit('JP');
    const r = evaluatePreTransmit({
      region: 'pmda',
      bundle: { ...bundle, sizeBytes: limit + 1 },
      environment: 'production',
      enforceExternal: false,
      env: {},
    });
    expect(r.blockers.filter((b) => /gateway limit|GB/.test(b))).toEqual([]);
    expect(r.warnings.some((w) => /PMDA/.test(w) && /no PMDA source/i.test(w))).toBe(true);
    const size = r.checks.find((c) => c.name === 'gateway-size-limit')!;
    expect(size.detail).toMatch(/not enforced/i);
  });

  it('a sourced limit still blocks (FDA control)', () => {
    const limit = getGatewaySizeLimit('US');
    const r = evaluatePreTransmit({
      region: 'fda',
      bundle: { ...bundle, format: 'ectd', builtRegion: 'fda', sizeBytes: limit + 1 },
      environment: 'production',
      enforceExternal: false,
      env: {},
    });
    expect(r.cleared).toBe(false);
    expect(r.blockers.some((b) => /over the FDA gateway limit/.test(b))).toBe(true);
  });
});

/**
 * PMDA Gateway — a 2xx whose body names no receipt identifier is a refusal,
 * not an accepted submission.
 *
 * Before this the gateway minted `pmda-<timestamp>` as the receipt, recorded
 * the transmittal as 'received' with an acknowledgement time from the platform
 * clock, and told the operator "accepted. Receipt: pmda-…". The agency had
 * acknowledged nothing. Same harness shape as fda-esg-hardening.test.ts:
 * env hoisted, db pool mocked, https mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'pmda-missing-receipt-test-secret-padded-to-32-or-more';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.PMDA_STAGING_URL = 'https://gateway-staging.pmda.example';
  process.env.PMDA_STAGING_APPLICANT_ID = 'APPL-0001';
  process.env.PMDA_STAGING_CERT_PATH = '/tmp/pmda-cert.pem';
  process.env.PMDA_STAGING_KEY_PATH = '/tmp/pmda-key.pem';
  process.env.PMDA_STAGING_HMAC_SECRET = 'shared-secret';
});

type QueryRecord = { sql: string; args: unknown[] };
const { poolQueries, responseBody } = vi.hoisted(() => ({
  poolQueries: [] as QueryRecord[],
  responseBody: { value: '{}' },
}));

vi.mock('../../../db', () => ({
  pool: {
    query: vi.fn(async (sql: string, args: unknown[] = []) => {
      poolQueries.push({ sql, args });
      if (/INSERT INTO submission_transmittals/i.test(sql)) return { rows: [{ id: 777 }], rowCount: 1 };
      if (/SELECT transmission_id, status, ack_received_at, metadata FROM submission_transmittals/i.test(sql)) {
        return { rows: [{ transmission_id: 'PMDA-R-1', status: 'received', ack_received_at: new Date('2026-09-01T00:00:00Z'), metadata: { environment: 'staging' } }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    }),
    connect: vi.fn(),
  },
}));

vi.mock('fs', async (orig) => {
  const actual = await (orig as () => Promise<typeof import('fs')>)();
  const readFile = vi.fn(async (p: unknown) => {
    if (String(p).includes('unreadable')) throw Object.assign(new Error(`ENOENT: no such file, open '${String(p)}'`), { code: 'ENOENT' });
    return '-----BEGIN PEM-----';
  });
  return { ...actual, promises: { ...actual.promises, readFile } };
});

vi.mock('../bundle-integrity', () => ({
  readVerifiedBundle: vi.fn(async () => Buffer.from('zip-bytes')),
}));

vi.mock('node:https', () => ({
  request: (_opts: unknown, cb: (res: unknown) => void) => {
    const dataHandlers: Array<(c: Buffer) => void> = [];
    const endHandlers: Array<() => void> = [];
    const res: any = {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      on: (evt: string, h: any) => {
        if (evt === 'data') dataHandlers.push(h);
        if (evt === 'end') endHandlers.push(h);
      },
    };
    void Promise.resolve().then(() => {
      cb(res);
      for (const h of dataHandlers) h(Buffer.from(responseBody.value, 'utf8'));
      for (const h of endHandlers) h();
    });
    return { on: () => undefined, write: () => undefined, end: () => undefined, destroy: () => undefined };
  },
}));

import { PmdaGateway } from '../pmda-gateway';

const REQUEST = () => ({
  organizationId: 7,
  userId: 11,
  programId: null,
  packageId: 99,
  bundle: { path: '/tmp/bundle.zip', sha256: 'a'.repeat(64), sizeBytes: 1024, format: 'ectd' as const },
  environment: 'staging' as const,
  submissionType: 'original',
  metadata: { applicationId: 'JP-2026-0001', sequence: '0001', environment: 'staging' },
  authorization: {
    kind: 'governed-http' as const,
    actorUserId: 11,
    reason: 'PMDA missing-receipt suite exercises the governed transmit path',
    reauthVerifiedAt: new Date(),
  },
});

const transmittalUpdates = () =>
  poolQueries.filter((q) => /UPDATE submission_transmittals/i.test(q.sql));
const statusesWritten = () =>
  transmittalUpdates().flatMap((q) => q.args.filter((a) => typeof a === 'string')) as string[];

beforeEach(() => {
  poolQueries.length = 0;
  responseBody.value = '{}';
});

describe('PMDA Gateway — 2xx without a receipt identifier', () => {
  it('refuses, records the transmittal rejected, and never writes received', async () => {
    responseBody.value = JSON.stringify({ status: 'accepted' });
    await expect(new PmdaGateway().transmit(REQUEST())).rejects.toThrow(/missing a receipt identifier/);
    const written = statusesWritten();
    expect(written).toContain('rejected');
    expect(written).not.toContain('received');
    expect(written.some((s) => /no receipt identifier/i.test(s))).toBe(true);
    // No platform-minted receipt goes into the row.
    expect(written.some((s) => /^pmda-\d+$/.test(s))).toBe(false);
  });

  it('refuses to transmit without the eCTD sequence number, before any transmittal row exists', async () => {
    // The sequence used to default to '0001' (and the type to 'initial') in
    // the agency metadata, so a follow-up whose caller forgot the metadata
    // was announced to PMDA as an original submission.
    const req = REQUEST();
    req.metadata = { applicationId: 'JP-2026-0001', environment: 'staging' } as any;
    await expect(new PmdaGateway().transmit(req)).rejects.toMatchObject({ errorClass: 'validation', message: /sequence number/ });
    expect(poolQueries.some((q) => /INSERT INTO submission_transmittals/i.test(q.sql))).toBe(false);
  });

  it('refuses to transmit without a submission type', async () => {
    const req = REQUEST();
    (req as any).submissionType = undefined;
    await expect(new PmdaGateway().transmit(req)).rejects.toMatchObject({ errorClass: 'validation', message: /submission type/ });
    expect(poolQueries.some((q) => /INSERT INTO submission_transmittals/i.test(q.sql))).toBe(false);
  });

  it('a 2xx that names a receipt is accepted with that receipt, and nothing else', async () => {
    responseBody.value = JSON.stringify({ receiptId: 'PMDA-R-20260905-0001' });
    const result = await new PmdaGateway().transmit(REQUEST());
    expect(result.status).toBe('received');
    expect(result.transmissionId).toBe('PMDA-R-20260905-0001');
    expect(statusesWritten()).toContain('received');
    expect(statusesWritten()).not.toContain('rejected');
  });
});

describe('PMDA Gateway — isConfigured', () => {
  it('is false when the client certificate cannot be read, not only when a variable is missing', async () => {
    // isConfigured() used to answer true for any failure other than a missing
    // variable, so an unmounted or rotated-away certificate showed the
    // gateway as configured until the transmit itself failed.
    const prior = process.env.PMDA_STAGING_CERT_PATH;
    process.env.PMDA_STAGING_CERT_PATH = '/tmp/unreadable-cert.pem';
    try {
      expect(await new PmdaGateway().isConfigured(7, 'staging')).toBe(false);
    } finally {
      process.env.PMDA_STAGING_CERT_PATH = prior;
    }
    expect(await new PmdaGateway().isConfigured(7, 'staging')).toBe(true);
  });
});

describe('PMDA Gateway — checkStatus says where the status came from', () => {
  it('a poll the agency answers is source=agency', async () => {
    responseBody.value = JSON.stringify({ status: 'received' });
    const result = await new PmdaGateway().checkStatus(777);
    expect(result.source).toBe('agency');
    expect(result.pollError ?? null).toBeNull();
  });

  it('a poll that fails hands back the stored row as source=stored with the reason, not as the agency\'s answer', async () => {
    // Every gateway used to swallow the failure and return the stored row
    // labelled like a live result.
    responseBody.value = '<html>gateway unavailable</html>';
    const result = await new PmdaGateway().checkStatus(777);
    expect(result.source).toBe('stored');
    expect(result.status).toBe('received');
    expect(typeof result.pollError).toBe('string');
    expect(result.pollError).not.toBe('');
  });
});

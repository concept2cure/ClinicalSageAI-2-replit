/**
 * An organisation's own FDA ESG account (D7, founder decision 2026-10-01;
 * evidence docs/evidence/D7/2026-10-01-gateway-account-choice/).
 *
 * A transmit under a client account goes out on the wire under the client's
 * AS2 identity and is signed with the client's key; the platform's certificate
 * and key are never read. FDA's own certificate and endpoint are the same for
 * every sponsor, so they still come from the platform's configuration. With no
 * choice recorded, the transmit goes out under the platform account as before.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'fda-esg-client-account-test-secret-padded-32+';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.FDA_ESG_URL = 'https://esg.fda.gov';
  process.env.FDA_ESG_AS2_FROM = 'SPONSOR-AS2';
  process.env.FDA_ESG_AS2_TO = 'FDA-AS2-ID-TEST';
  process.env.FDA_ESG_CERT_PATH = '/tmp/fda-cert.pem';
  process.env.FDA_ESG_KEY_PATH = '/tmp/fda-key.pem';
  process.env.FDA_ESG_FDA_CERT_PATH = '/tmp/fda-pub.pem';
});

const { sentHeaders, TEST_KEY } = vi.hoisted(() => {
  const { generateKeyPairSync } = require('node:crypto');
  return {
    sentHeaders: [] as Array<Record<string, string>>,
    TEST_KEY: generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    }).privateKey as string,
  };
});

// No organization_gateway_accounts row: the platform account, unless a test passes one.
vi.mock('../../../db', () => ({
  pool: {
    query: vi.fn(async (sql: string) =>
      /INSERT INTO submission_transmittals/i.test(sql) ? { rows: [{ id: 4243 }], rowCount: 1 } : { rows: [], rowCount: 0 },
    ),
    connect: vi.fn(async () => ({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })), release: vi.fn() })),
  },
}));

vi.mock('fs', async (orig) => {
  const actual = await (orig as () => Promise<typeof import('fs')>)();
  return { ...actual, promises: { ...actual.promises, readFile: vi.fn(async () => TEST_KEY) } };
});

vi.mock('../bundle-integrity', () => ({ readVerifiedBundle: vi.fn(async () => Buffer.from('zip-bytes')) }));

vi.mock('node:https', () => ({
  request: (opts: any, cb: (res: unknown) => void) => {
    const headers = { ...(opts?.headers ?? {}) } as Record<string, string>;
    sentHeaders.push(headers);
    const mdn =
      '------=_Part_FDA_MDN\r\nContent-Type: message/disposition-notification\r\n\r\n' +
      `Original-Message-ID: ${headers['Message-ID'] ?? ''}\r\n` +
      'Disposition: automatic-action/MDN-sent-automatically; processed\r\n' +
      'Received-Content-MIC: deadbeef==, sha-256\r\n------=_Part_FDA_MDN--\r\n';
    const handlers: Record<string, Array<(x?: unknown) => void>> = { data: [], end: [] };
    const res = {
      statusCode: 200,
      headers: { 'message-id': '<mdn-msg-id@FDA-CESUB>' },
      on: (evt: string, h: (x?: unknown) => void) => handlers[evt]?.push(h),
    };
    globalThis.setImmediate(() => {
      cb(res);
      for (const h of handlers.data) h(Buffer.from(mdn, 'utf8'));
      for (const h of handlers.end) h();
    });
    return { on: () => undefined, write: () => undefined, end: () => undefined, destroy: () => undefined };
  },
}));

import { FdaEsgGateway } from '../fda-esg';

const REQUEST = () => ({
  organizationId: 7,
  userId: 11,
  programId: null,
  packageId: 99,
  bundle: { path: '/tmp/bundle.zip', sha256: 'a'.repeat(64), sizeBytes: 1024, format: 'ectd' as const },
  environment: 'production' as const,
  submissionType: 'original',
  fda: { applicationType: 'nda' },
  metadata: { applicationId: 'IND123456', sequence: '0001', environment: 'production' },
  authorization: {
    kind: 'governed-http' as const,
    actorUserId: 11,
    reason: 'Client-account suite exercises the governed transmit path',
    reauthVerifiedAt: new Date(),
  },
});

const fromOf = (h: Record<string, string>) => h['AS2-From'] ?? h['as2-from'];

beforeEach(() => {
  sentHeaders.length = 0;
});

describe("an organisation's own FDA ESG account", () => {
  it("goes out under the client's AS2 identity, signed with the client's key, never reading the platform's", async () => {
    const fsMod = await import('fs');
    const readFile = fsMod.promises.readFile as unknown as ReturnType<typeof vi.fn>;
    readFile.mockClear();
    const result = await new FdaEsgGateway().transmit({
      ...REQUEST(),
      account: {
        mode: 'client',
        senderIdentifier: 'CLIENT-OWN-AS2',
        credentials: { clientCertPem: '-----BEGIN CERTIFICATE-----\nMIIBclient\n-----END CERTIFICATE-----', clientKeyPem: TEST_KEY },
      },
    });
    expect(result.status).toBe('received');
    const sent = sentHeaders.at(-1)!;
    expect(fromOf(sent)).toBe('CLIENT-OWN-AS2');
    expect(String(sent['Message-ID'])).toMatch(/@CLIENT-OWN-AS2>$/);
    const pathsRead = readFile.mock.calls.map((c) => String(c[0]));
    expect(pathsRead).not.toContain('/tmp/fda-cert.pem');
    expect(pathsRead).not.toContain('/tmp/fda-key.pem');
    expect(pathsRead).toContain('/tmp/fda-pub.pem'); // FDA's own certificate is the same for every sponsor
  });

  it('with no account choice recorded, it goes out under the platform account, as before', async () => {
    await new FdaEsgGateway().transmit(REQUEST());
    expect(fromOf(sentHeaders.at(-1)!)).toBe('SPONSOR-AS2');
  });
});

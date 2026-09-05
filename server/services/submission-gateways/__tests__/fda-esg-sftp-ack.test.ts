/**
 * FDA ESG SFTP transmit — honest post-upload state.
 *
 * Regression lock: an SFTP PUT only deposits the bundle in FDA's /incoming/
 * directory. FDA picks it up and emits ack1/ack2/ack3 over /outgoing/ later,
 * asynchronously. The transmit result must NOT fabricate an FDA acknowledgment
 * at upload time — it must report `in_transit` with a null ack timestamp, never
 * `received` with `ackReceivedAt = now`. (A fabricated ACK on a regulated
 * submission is exactly the #1 platform-audit risk.)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set env BEFORE the gateway (and its transitive db/config chain) is imported.
vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'fda-esg-sftp-test-secret-padded-to-32-or-more';
  process.env.SKIP_DB_STARTUP_TEST = 'true';

  // FDA ESG production credentials, incl. SFTP transport.
  process.env.FDA_ESG_URL = 'https://esg.fda.gov';
  process.env.FDA_ESG_AS2_FROM = 'SPONSOR-AS2';
  process.env.FDA_ESG_CERT_PATH = '/tmp/fda-cert.pem';
  process.env.FDA_ESG_KEY_PATH = '/tmp/fda-key.pem';
  process.env.FDA_ESG_FDA_CERT_PATH = '/tmp/fda-pub.pem';
  process.env.FDA_ESG_SFTP_HOST = 'esg-sftp.fda.gov';
  process.env.FDA_ESG_SFTP_USER = 'sponsor';
  process.env.FDA_ESG_SFTP_KEY_PATH = '/tmp/fda-sftp-key.pem';
});

// Capture every pool.query so we can assert what was written to the
// transmittal row. INSERT ... RETURNING id yields a row id; everything else
// (the UPDATE patches) resolves empty.
const { poolQueries } = vi.hoisted(() => ({ poolQueries: [] as Array<{ sql: string; args: unknown[] }> }));

vi.mock('../../../db', () => ({
  pool: {
    query: vi.fn(async (sql: string, args: unknown[]) => {
      poolQueries.push({ sql, args });
      if (/INSERT INTO submission_transmittals/i.test(sql)) {
        return { rows: [{ id: 4242 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  },
}));

// fs.readFile is only used for credential PEMs here; return dummy bytes.
vi.mock('fs', async (orig) => {
  const actual = await (orig as () => Promise<typeof import('fs')>)();
  return {
    ...actual,
    promises: { ...actual.promises, readFile: vi.fn(async () => 'PEM') },
  };
});

// The integrity gate reads + hashes the on-disk bundle. Bypass real IO; the
// gate itself is covered by bundle-integrity tests.
vi.mock('../bundle-integrity', () => ({
  readVerifiedBundle: vi.fn(async () => Buffer.from('zip-bytes')),
}));

// Stub the dynamic `ssh2-sftp-client` import so a "successful upload" returns
// without touching the network. The PUT resolving = bytes delivered to
// /incoming/, NOT an FDA acknowledgment.
const { putSpy, endSpy } = vi.hoisted(() => ({ putSpy: vi.fn(async () => undefined), endSpy: vi.fn(async () => undefined) }));
vi.mock('ssh2-sftp-client', () => ({
  default: class {
    connect = vi.fn(async () => undefined);
    put = putSpy;
    end = endSpy;
  },
}));

import { FdaEsgGateway } from '../fda-esg';

const ONE_GB = 1_073_741_824;

function sftpSizedRequest() {
  return {
    organizationId: 7,
    userId: 11,
    programId: null,
    packageId: 99,
    bundle: {
      // > 1 GB forces the SFTP transport path.
      path: '/tmp/bundle.zip',
      sha256: 'a'.repeat(64),
      sizeBytes: ONE_GB + 1,
      format: 'ectd' as const,
    },
    environment: 'production' as const,
    submissionType: 'original',
    fda: { applicationType: 'nda' }, // a package must declare what it is; this used to default to NDA silently
    metadata: { applicationId: 'IND123456', sequence: '0001', environment: 'production' },
      authorization: {
        kind: 'governed-http' as const,
        actorUserId: 1,
        reason: 'gateway suite exercises the governed transmit path',
        reauthVerifiedAt: new Date(),
      },
  };
}

describe('FdaEsgGateway SFTP transmit — no fabricated ACK', () => {
  beforeEach(() => {
    poolQueries.length = 0;
    putSpy.mockClear();
  });

  it('reports in_transit (not received) and a null ack after a bare SFTP upload', async () => {
    const gw = new FdaEsgGateway();
    const result = await gw.transmit(sftpSizedRequest());

    // The upload happened…
    expect(putSpy).toHaveBeenCalledTimes(1);
    expect(result.transport).toBe('sftp');
    expect(result.transmissionId).toMatch(/^sftp-IND123456-0001-/);

    // …but FDA has acknowledged nothing yet.
    expect(result.status).toBe('in_transit');
    expect(result.status).not.toBe('received');
    expect(result.ackReceivedAt).toBeNull();
  });

  it('does not stamp an ack_received_at on the transmittal row at upload time', async () => {
    const gw = new FdaEsgGateway();
    await gw.transmit(sftpSizedRequest());

    // Find the UPDATE that carries the post-upload status. The patch builder
    // emits "status = $n" with the value in args; assert it set in_transit and
    // never wrote received / an ack timestamp.
    const updates = poolQueries.filter((q) => /UPDATE submission_transmittals/i.test(q.sql));
    const flatArgs = updates.flatMap((u) => u.args);

    expect(flatArgs).toContain('in_transit');
    expect(flatArgs).not.toContain('received');
    // ack_received_at is only ever set with a Date value; none should be present.
    const wroteAckColumn = updates.some((u) => /ack_received_at\s*=/i.test(u.sql));
    expect(wroteAckColumn).toBe(false);
  });
});

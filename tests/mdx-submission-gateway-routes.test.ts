/**
 * Integration tests for /api/mdx/gateways (FDA ESG / EMA CESP / EUDAMED /
 * PMDA Gateway). HTTP behavior, envelope, auth gate, credential gate,
 * tenant scoping. The gateway transport modules are mocked at the
 * implementation level so tests don't hit any external server.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const PROGRAM_ID = '11111111-2222-3333-4444-000000000204';

const queryFn = vi.fn();
const connectFn = vi.fn();

vi.mock('../server/db', () => ({
  pool: {
    query:   (...args: unknown[]) => queryFn(...args),
    connect: (...args: unknown[]) => connectFn(...args),
  },
  getPool: () => ({
    query:   (...args: unknown[]) => queryFn(...args),
    connect: (...args: unknown[]) => connectFn(...args),
  }),
  db: {},
}));

// Make the high-risk re-auth gate pass deterministically: a valid password and
// (when present) TOTP. The governed-action ledger write needs a transaction
// client; connectFn returns one whose query resolves and whose release is a noop.
vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn().mockResolvedValue(true) },
  compare: vi.fn().mockResolvedValue(true),
}));
vi.mock('../server/services/mfaService', () => ({
  verifyToken: vi.fn().mockResolvedValue(true),
}));

/** Re-auth body that satisfies verifyReauth in these tests. */
const REAUTH = { reason: 'governed transmit reason', reauth: { password: 'pw-123456' } };

/* Stub the submission-gateway service so the route tests don't run the
   real transport code. vi.mock is hoisted, so the mocks reference vars
   via vi.hoisted to survive the hoist. */
const {
  transmitFn, statusFn, ackFn, isConfigFn, configStatusFn,
} = vi.hoisted(() => ({
  transmitFn:    vi.fn(),
  statusFn:      vi.fn(),
  ackFn:         vi.fn(),
  isConfigFn:    vi.fn(),
  configStatusFn: vi.fn(),
}));

vi.mock('../server/services/submission-gateways', () => {
  class MockCredentialError extends Error {
    name = 'CredentialError';
    errorClass = 'auth' as const;
  }
  class MockGatewayError extends Error {
    name = 'GatewayError';
    errorClass = 'gateway' as const;
    constructor(msg: string, public httpStatus: number | null, public gatewayCode: string | null) {
      super(msg);
    }
  }
  class MockTransportError extends Error {
    name = 'TransportError';
    errorClass = 'transport' as const;
  }
  class MockValidationError extends Error {
    name = 'ValidationError';
    errorClass = 'validation' as const;
    constructor(msg: string, public findings: unknown[]) { super(msg); }
  }
  const fakeGateway = {
    region:    'fda',
    gateway:   'esg',
    transport: 'as2',
    isConfigured: isConfigFn,
    transmit:     transmitFn,
    checkStatus:  statusFn,
    downloadAcknowledgment: ackFn,
  };
  return {
    getGateway: () => fakeGateway,
    listGateways: () => [
      { region: 'fda',  gateway: 'esg',           transport: 'as2' },
      { region: 'ema',  gateway: 'cesp',          transport: 'rest' },
      { region: 'ema',  gateway: 'eudamed',       transport: 'rest' },
      { region: 'pmda', gateway: 'pmda_gateway',  transport: 'rest' },
    ],
    gatewayConfigurationStatus: configStatusFn,
    CredentialError: MockCredentialError,
    GatewayError:    MockGatewayError,
    TransportError:  MockTransportError,
    ValidationError: MockValidationError,
  };
});

import gatewayRouter from '../server/routes/mdx-submission-gateway';

function makeApp(opts: { withAuth?: boolean } = { withAuth: true }) {
  const app = express();
  app.use(express.json());
  if (opts.withAuth) {
    app.use((req, _res, next) => {
      (req as any).user = { id: 777, organizationId: 99 };
      next();
    });
  }
  app.use('/api/mdx', gatewayRouter);
  return app;
}

beforeEach(() => {
  queryFn.mockReset();
  connectFn.mockReset();
  transmitFn.mockReset();
  statusFn.mockReset();
  ackFn.mockReset();
  isConfigFn.mockReset();
  configStatusFn.mockReset();
  // Default: empty result, except the re-auth password lookup which must find a
  // user with a password_hash so verifyReauth can run bcrypt.compare (mocked true).
  queryFn.mockImplementation((sql: string) => {
    if (typeof sql === 'string' && sql.includes('password_hash')) {
      return Promise.resolve({ rows: [{ password_hash: 'hashed' }], rowCount: 1 });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
  // A transaction client for the governed-action ledger write (BEGIN/INSERT/COMMIT).
  connectFn.mockImplementation(() =>
    Promise.resolve({
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: vi.fn(),
    }),
  );
});

/* ─── Auth gate ──────────────────────────────────────────────────── */

describe('submission gateway routes — auth gate', () => {
  it.each([
    ['GET',  '/api/mdx/gateways'],
    ['GET',  '/api/mdx/gateways/transmittals'],
    ['GET',  '/api/mdx/gateways/transmittals/1'],
    ['POST', '/api/mdx/gateways/fda/esg/transmit'],
    ['GET',  '/api/mdx/gateways/transmittals/1/status'],
    ['GET',  '/api/mdx/gateways/transmittals/1/ack'],
    ['POST', '/api/mdx/gateways/transmittals/1/findings'],
    ['PATCH', '/api/mdx/gateways/findings/1/resolve'],
  ])('%s %s returns 403 without org context', async (method, url) => {
    const req = request(makeApp({ withAuth: false }));
    const res = await (method === 'GET' ? req.get(url)
                     : method === 'POST' ? req.post(url).send({})
                     : req.patch(url).send({}));
    expect(res.status).toBe(403);
  });
});

/* ─── Gateways list + config status ──────────────────────────────── */

describe('GET /api/mdx/gateways', () => {
  it('returns one row per gateway with configured flag', async () => {
    configStatusFn.mockResolvedValueOnce([
      { region: 'fda',  gateway: 'esg',          configured: true  },
      { region: 'ema',  gateway: 'cesp',         configured: false },
      { region: 'ema',  gateway: 'eudamed',      configured: false },
      { region: 'pmda', gateway: 'pmda_gateway', configured: false },
    ]);
    const res = await request(makeApp()).get('/api/mdx/gateways?environment=staging');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(4);
    expect(res.body.data.find((g: any) => g.region === 'fda').configured).toBe(true);
  });
});

/* ─── Transmit ───────────────────────────────────────────────────── */

describe('POST /api/mdx/gateways/:region/:gateway/transmit', () => {
  it('rejects unknown region', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/gateways/xx/esg/transmit')
      .send({});
    expect(res.status).toBe(422);
  });

  it('rejects body without bundle hash', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ bundle: { path: '/tmp/foo.zip', sha256: 'short', sizeBytes: 1000, format: 'ectd' } });
    expect(res.status).toBe(422);
  });

  it('returns 201 with transmittal id on success', async () => {
    transmitFn.mockResolvedValueOnce({
      transmittalId:  42,
      transmissionId: 'mdn-12345',
      status:         'received',
      transport:      'as2',
      httpStatus:     200,
      ackReceivedAt:  new Date(),
      message:        'OK',
    });
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({
        environment: 'staging',
        bundle: {
          path:        '/tmp/ectd.zip',
          sha256:      'a'.repeat(64),
          sizeBytes:   123456,
          format:      'ectd',
        },
        application_id: 'IND-12345',
        sequence: '0001',
        ...REAUTH,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.transmittalId).toBe(42);
    expect(res.body.data.transmissionId).toBe('mdn-12345');
  });

  it('loads the stored bundle when only packageId is supplied (no explicit bundle)', async () => {
    const STORED = {
      path: '/tmp/submission-bundles/pkg-abc-0123456789abcdef.zip',
      sha256: 'b'.repeat(64),
      sizeBytes: 654321,
      format: 'ectd',
    };
    // The transmit route runs the re-auth password lookup (default impl) and
    // then a SELECT metadata FROM c2c_submission_packages for the stored bundle.
    queryFn.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('password_hash')) {
        return Promise.resolve({ rows: [{ password_hash: 'hashed' }], rowCount: 1 });
      }
      if (typeof sql === 'string' && sql.includes('FROM c2c_submission_packages')) {
        return Promise.resolve({ rows: [{ metadata: { bundle: STORED } }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    transmitFn.mockResolvedValueOnce({
      transmittalId: 77,
      transmissionId: 'mdn-stored',
      status: 'received',
      transport: 'as2',
      httpStatus: 200,
    });
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, environment: 'staging', ...REAUTH });
    expect(res.status).toBe(201);
    expect(res.body.data.transmittalId).toBe(77);
    // The gateway must have received the stored bundle's path + hash.
    expect(transmitFn).toHaveBeenCalledTimes(1);
    const arg = transmitFn.mock.calls[0][0];
    expect(arg.bundle.path).toBe(STORED.path);
    expect(arg.bundle.sha256).toBe(STORED.sha256);
    expect(arg.bundle.sizeBytes).toBe(STORED.sizeBytes);
  });

  it('hard-blocks transmit (422) when the stored bundle has validation errors', async () => {
    const STORED = {
      path: '/tmp/submission-bundles/pkg-err-0123456789abcdef.zip',
      sha256: 'c'.repeat(64),
      sizeBytes: 42,
      format: 'ectd',
      validation: {
        errorCount: 1,
        warningCount: 0,
        infoCount: 1,
        findings: [
          { severity: 'error', ruleId: 'LEAF-CORRUPT', message: 'bad pdf', filePath: 'm3/cmc.pdf' },
        ],
      },
    };
    queryFn.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('password_hash')) {
        return Promise.resolve({ rows: [{ password_hash: 'hashed' }], rowCount: 1 });
      }
      if (typeof sql === 'string' && sql.includes('FROM c2c_submission_packages')) {
        return Promise.resolve({ rows: [{ metadata: { bundle: STORED } }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 5, environment: 'staging', ...REAUTH });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/structural validation/i);
    expect(res.body.details.findings).toHaveLength(1);
    // The gateway transmit must NOT have been called.
    expect(transmitFn).not.toHaveBeenCalled();
  });

  it('returns 422 when neither an explicit bundle nor a stored bundle exists', async () => {
    // Default queryFn impl returns no rows for the package metadata lookup.
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ packageId: 9999, environment: 'staging', ...REAUTH });
    expect(res.status).toBe(422);
    expect(transmitFn).not.toHaveBeenCalled();
    expect(res.body.error).toMatch(/assemble/i);
  });

  it('returns 422 when neither bundle nor packageId is supplied', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ ...REAUTH });
    expect(res.status).toBe(422);
    expect(transmitFn).not.toHaveBeenCalled();
  });

  it('maps CredentialError to 412', async () => {
    const { CredentialError } = await import('../server/services/submission-gateways');
    transmitFn.mockRejectedValueOnce(new (CredentialError as any)('missing FDA_ESG_URL'));
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({
        bundle: { path: '/tmp/a.zip', sha256: 'a'.repeat(64), sizeBytes: 1, format: 'ectd' },
        ...REAUTH,
      });
    expect(res.status).toBe(412);
  });

  it('maps GatewayError to 502', async () => {
    const { GatewayError } = await import('../server/services/submission-gateways');
    transmitFn.mockRejectedValueOnce(new (GatewayError as any)('AS2 rejected', 401, 'AS2-DECRYPT'));
    const res = await request(makeApp())
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({
        bundle: { path: '/tmp/a.zip', sha256: 'a'.repeat(64), sizeBytes: 1, format: 'ectd' },
        ...REAUTH,
      });
    expect(res.status).toBe(502);
  });
});

/* ─── Transmittals list + detail ─────────────────────────────────── */

describe('transmittals listing + detail', () => {
  it('lists transmittals filtered by region', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{
        id: 1, region: 'fda', gateway: 'esg', status: 'received',
        transmission_id: 'mdn-1', submitted_at: new Date(),
      }],
    });
    const res = await request(makeApp()).get('/api/mdx/gateways/transmittals?region=fda');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('rejects invalid region in query', async () => {
    const res = await request(makeApp()).get('/api/mdx/gateways/transmittals?region=mars');
    expect(res.status).toBe(422);
  });

  it('detail 404 when not in tenant', async () => {
    queryFn.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp()).get('/api/mdx/gateways/transmittals/999');
    expect(res.status).toBe(404);
  });

  it('detail returns transmittal + findings', async () => {
    queryFn
      .mockResolvedValueOnce({ rows: [{ id: 1, region: 'fda', gateway: 'esg', status: 'received' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 10, severity: 'error', message: 'us-regional.xml missing dtd' }],
      });
    const res = await request(makeApp()).get('/api/mdx/gateways/transmittals/1');
    expect(res.status).toBe(200);
    expect(res.body.data.findings).toHaveLength(1);
  });
});

/* ─── Status + ack ───────────────────────────────────────────────── */

describe('status + ack endpoints', () => {
  it('status routes to the correct gateway impl', async () => {
    queryFn.mockResolvedValueOnce({ rows: [{ region: 'fda', gateway: 'esg' }] });
    statusFn.mockResolvedValueOnce({
      transmittalId: 1, transmissionId: 'mdn-1', status: 'ack2_received',
      ackReceivedAt: new Date(),
    });
    const res = await request(makeApp()).get('/api/mdx/gateways/transmittals/1/status');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ack2_received');
  });

  it('ack download returns the ack buffer with correct content-type', async () => {
    queryFn.mockResolvedValueOnce({ rows: [{ region: 'fda', gateway: 'esg' }] });
    ackFn.mockResolvedValueOnce({
      transmittalId: 1, transmissionId: 'mdn-1',
      contentType: 'text/plain',
      buffer: Buffer.from('ACK OK', 'utf8'),
      receivedAt: new Date(),
    });
    const res = await request(makeApp()).get('/api/mdx/gateways/transmittals/1/ack');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('ACK OK');
  });
});

/* ─── Findings ───────────────────────────────────────────────────── */

describe('findings routes', () => {
  it('POST finding 404s when transmittal not in tenant', async () => {
    queryFn.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp())
      .post('/api/mdx/gateways/transmittals/999/findings')
      .send({ validator: 'internal', severity: 'warning', message: 'wat' });
    expect(res.status).toBe(404);
  });

  it('POST finding creates with severity', async () => {
    queryFn
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // own check
      .mockResolvedValueOnce({ rows: [{ id: 99, severity: 'error', message: 'missing leaf' }] });
    const res = await request(makeApp())
      .post('/api/mdx/gateways/transmittals/1/findings')
      .send({ validator: 'fda_evalidator', severity: 'error', message: 'missing leaf' });
    expect(res.status).toBe(201);
    expect(res.body.data.severity).toBe('error');
  });

  it('PATCH resolve marks resolved', async () => {
    queryFn.mockResolvedValueOnce({ rows: [{ id: 99, resolved: true }] });
    const res = await request(makeApp())
      .patch('/api/mdx/gateways/findings/99/resolve')
      .send({ resolutionNote: 'leaf added under m1/us/1-1-1.pdf' });
    expect(res.status).toBe(200);
    expect(res.body.data.resolved).toBe(true);
  });
});

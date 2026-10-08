/**
 * What the gateway routes say — the gateway list, and a transmit that is
 * refused or completes — in the shapes the Gateway transmittals surface reads.
 *
 * 2026-10-08 (W5/D7, sweep HS-2/HS-3/HS-4):
 *   - FDA ESG in REST mode was listed as configured, with the registry's 'as2'
 *     transport, although every transmit through it is refused.
 *   - an UnverifiedTransportError (FDA ESG in REST mode) had no branch and
 *     became a 500 'INTERNAL_ERROR'; its sentence saying nothing was
 *     transmitted never reached the operator. Now 412 TRANSPORT_NOT_VERIFIED.
 *   - the pre-transmit guard's refusal carried bare strings and no source, so
 *     the surface counted "0 findings" and named the structural gate. Now its
 *     findings are itemised and details.code is PRE_TRANSMIT_BLOCKED.
 *   - the checks the guard ran that failed without blocking, and its warnings,
 *     reached the sign record and AnA but not this body. Now
 *     preTransmitFailedChecks / preTransmitWarnings, null when the guard
 *     reported nothing.
 * The error classes are the real ones; only the gateway behind the guard, the
 * database and the re-authentication factors are stand-ins.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { queryFn, transmitFn } = vi.hoisted(() => ({ queryFn: vi.fn(), transmitFn: vi.fn() }));

vi.mock('../../account-standing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../account-standing')>()),
  isAccountActive: async () => true,
}));
vi.mock('../../auth-security-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../auth-security-service')>()),
  isAccountLocked: async () => ({ locked: false }),
  recordFailedLogin: async () => ({ locked: false, remainingAttempts: 5 }),
}));
vi.mock('../../../db', () => {
  const client = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }), release: vi.fn() };
  const pool = { query: (...args: unknown[]) => queryFn(...args), connect: async () => client };
  return { pool, getPool: () => pool, db: {} };
});
vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn().mockResolvedValue(true) },
  compare: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../mfaService', () => ({
  verifyToken: vi.fn().mockResolvedValue(true),
  isMfaEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('../index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../index')>()),
  getGateway: () => ({
    region: 'fda', gateway: 'esg', transport: 'as2',
    isConfigured: vi.fn(), transmit: transmitFn, checkStatus: vi.fn(), downloadAcknowledgment: vi.fn(),
  }),
}));

import gatewayRouter from '../../../routes/mdx-submission-gateway';
import { PreTransmitBlockedError, UnverifiedTransportError, ValidationError } from '../index';
import { FdaEsgGateway } from '../fda-esg';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { id: 777, organizationId: 99, role: 'admin' };
    (req as any).userRole = 'admin';
    next();
  });
  a.use('/api/mdx', gatewayRouter);
  return a;
}

const BODY = {
  environment: 'staging',
  bundle: { path: '/tmp/a.zip', sha256: 'a'.repeat(64), sizeBytes: 1, format: 'ectd' },
  reason: 'governed transmit reason', meaning: 'release', reauth: { password: 'pw-123456' },
};
const transmit = () => request(app()).post('/api/mdx/gateways/fda/esg/transmit').send(BODY);

beforeEach(() => {
  transmitFn.mockReset();
  queryFn.mockReset();
  queryFn.mockImplementation((sql: string) =>
    Promise.resolve(typeof sql === 'string' && sql.includes('password_hash')
      ? { rows: [{ password_hash: 'hashed' }], rowCount: 1 }
      : { rows: [], rowCount: 0 }),
  );
});

describe('transmit refusals name their source and say what was sent', () => {
  it('UnverifiedTransportError is 412 with its own sentence: nothing was transmitted', async () => {
    transmitFn.mockRejectedValueOnce(new UnverifiedTransportError('fda', 'esg', 'rest', 'Use the verified AS2 path.'));
    const res = await transmit();
    expect(res.status, JSON.stringify(res.body)).toBe(412);
    expect(res.body.error).toMatch(/nothing was transmitted/);
    expect(res.body.details).toEqual({ code: 'TRANSPORT_NOT_VERIFIED', transmitted: false });
  });

  // The real FdaEsgGateway in REST mode behind the route. Its sentence reaches
  // the operator as the 412, so it carries no endpoint URL, submitter ID or
  // variable name: a URL with '/api/' in it made the client hide the whole
  // sentence as internal text, and with it "nothing was transmitted".
  // 2026-10-08 (W5/D7, sweep HS-4 review).
  it('a real REST-mode refusal says nothing was transmitted, in words the operator can read', async () => {
    const restEnv = {
      FDA_ESG_STAGING_TRANSPORT: 'rest', FDA_ESG_STAGING_REST_URL: 'https://esg-nextgen.fda.example/api/v1',
      FDA_ESG_STAGING_REST_CLIENT_ID: 'client-1', FDA_ESG_STAGING_REST_CLIENT_SECRET: 'secret-1',
      FDA_ESG_STAGING_REST_SUBMITTER_ID: 'ESG-SUBMITTER-1',
    };
    const before = Object.fromEntries(Object.keys(restEnv).map((k) => [k, process.env[k]]));
    Object.assign(process.env, restEnv);
    try {
      transmitFn.mockImplementationOnce((req) => new FdaEsgGateway().transmit(req));
      const res = await transmit();
      expect(res.status, JSON.stringify(res.body)).toBe(412);
      expect(res.body.details).toEqual({ code: 'TRANSPORT_NOT_VERIFIED', transmitted: false });
      expect(res.body.error).toMatch(/nothing was transmitted/);
      expect(res.body.error).not.toMatch(/https?:\/\/|\/api\//);
      expect(res.body.error).not.toMatch(/FDA_ESG_/);
      expect(res.body.error).not.toContain('ESG-SUBMITTER-1');
    } finally {
      for (const [k, v] of Object.entries(before)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it('the pre-transmit guard refusal is 422 with one error finding per blocker and its code', async () => {
    const blockers = [
      'Package is 4.50 GB, over the FDA gateway limit of 4.00 GB. Submit via the agency’s large-submission channel instead.',
      'Package was assembled for EMA (descriptor); it cannot be transmitted to FDA. Re-assemble the package for FDA.',
    ];
    transmitFn.mockRejectedValueOnce(new PreTransmitBlockedError(`Refusing to transmit to FDA esg: package failed pre-transmit checks. ${blockers.join(' ')}`, blockers));
    const res = await transmit();
    expect(res.status).toBe(422);
    expect(res.body.details).toEqual({
      code: 'PRE_TRANSMIT_BLOCKED',
      findings: blockers.map((message) => ({ severity: 'error', ruleId: 'PRE-TRANSMIT', message })),
    });
  });

  it('a ValidationError from elsewhere keeps its findings and carries no pre-transmit code', async () => {
    transmitFn.mockRejectedValueOnce(new ValidationError('sequence is required', []));
    const res = await transmit();
    expect(res.status).toBe(422);
    expect(res.body.details).toEqual({ findings: [] });
  });
});

describe('GET /api/mdx/gateways — FDA ESG in REST mode', () => {
  const REST_ENV = {
    FDA_ESG_TRANSPORT: 'rest', FDA_ESG_REST_URL: 'https://esg-nextgen.fda.example/api',
    FDA_ESG_REST_CLIENT_ID: 'client-1', FDA_ESG_REST_CLIENT_SECRET: 'secret-1', FDA_ESG_REST_SUBMITTER_ID: 'ESG-SUBMITTER-1',
  };
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of Object.keys(REST_ENV)) saved[k] = process.env[k];
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  // The row carried the registry's default transport ('as2') and configured:
  // true once the REST credentials resolved, while every transmit through it
  // was refused. It is listed with the transport it resolves, and as not able
  // to transmit. The real registry and FdaEsgGateway answer here.
  it('is listed with the REST transport, and not as configured', async () => {
    Object.assign(process.env, REST_ENV);
    const res = await request(app()).get('/api/mdx/gateways?environment=production');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.find((g: { region: string; gateway: string }) => g.region === 'fda' && g.gateway === 'esg'))
      .toEqual({ region: 'fda', gateway: 'esg', transport: 'rest', configured: false, environment: 'production' });
  });
});

describe('a completed transmit carries what the pre-transmit guard found', () => {
  it('the failed checks as {name, detail} and the warnings', async () => {
    transmitFn.mockResolvedValueOnce({
      transmittalId: 43, transmissionId: 'mdn-pre', status: 'received', transport: 'as2', httpStatus: 200,
      preTransmit: {
        checks: [
          { name: 'gateway-size-limit', passed: true, detail: '1 B of 4.00 GB' },
          { name: 'dtd-self-contained', passed: false, detail: 'missing: ich-ectd-3-2.dtd, us-regional-v3-3.dtd' },
        ],
        warnings: ['m1/us/us-regional.xml is NOT an FDA-conformant Module 1 backbone.'],
      },
    });
    const res = await transmit();
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.preTransmitFailedChecks).toEqual([
      { name: 'dtd-self-contained', detail: 'missing: ich-ectd-3-2.dtd, us-regional-v3-3.dtd' },
    ]);
    expect(res.body.data.preTransmitWarnings).toEqual(['m1/us/us-regional.xml is NOT an FDA-conformant Module 1 backbone.']);
  });

  it('null for both when the guard reported nothing — never an empty "all passed" list', async () => {
    transmitFn.mockResolvedValueOnce({ transmittalId: 44, transmissionId: 'mdn-none', status: 'received', transport: 'as2', httpStatus: 200 });
    const res = await transmit();
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('preTransmitFailedChecks', null);
    expect(res.body.data).toHaveProperty('preTransmitWarnings', null);
  });
});

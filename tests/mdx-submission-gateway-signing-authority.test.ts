/**
 * The Gateway's two signs — POST /api/mdx/gateways/:region/:gateway/transmit and
 * POST /api/mdx/gateways/transmittals/:id/technical-rejection — ask the
 * platform's one signing-authority policy (checkSigningAuthority,
 * server/services/part11/signing-authority-gate.ts) before the password.
 *
 * QA 2026-10-08 (j6): a manager reached the transmit's password and was refused
 * only because the package did not exist. Same harness as
 * mdx-submission-gateway-routes.test.ts: the transports are stubbed, the re-auth
 * ceremony runs for real against a stubbed account.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const queryFn = vi.fn();
const connectFn = vi.fn();

vi.mock('../server/services/account-standing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/services/account-standing')>()),
  isAccountActive: async () => true,
}));
vi.mock('../server/services/auth-security-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/services/auth-security-service')>()),
  isAccountLocked: async () => ({ locked: false }),
  recordFailedLogin: async () => ({ locked: false, remainingAttempts: 5 }),
}));
vi.mock('../server/db', () => ({
  pool: { query: (...args: unknown[]) => queryFn(...args), connect: (...args: unknown[]) => connectFn(...args) },
  getPool: () => ({ query: (...args: unknown[]) => queryFn(...args), connect: (...args: unknown[]) => connectFn(...args) }),
  db: {},
}));
vi.mock('bcryptjs', () => ({ default: { compare: vi.fn().mockResolvedValue(true) }, compare: vi.fn().mockResolvedValue(true) }));
vi.mock('../server/services/mfaService', () => ({ verifyToken: vi.fn().mockResolvedValue(true), isMfaEnabled: vi.fn().mockResolvedValue(false) }));

/* §11.10(g): the signer's role is read from the membership row (resolveSignerOrgRole), never the token. */
const { signerRole, transmitFn, configStatusFn } = vi.hoisted(() => ({
  signerRole: vi.fn<(...a: unknown[]) => Promise<string | null>>(),
  transmitFn: vi.fn(),
  configStatusFn: vi.fn(),
}));
vi.mock('../server/services/part11/resolve-signer-role', () => ({ resolveSignerOrgRole: (...a: unknown[]) => signerRole(...a) }));
vi.mock('../server/services/submission-gateways', () => {
  class GatewayError extends Error {}
  const fakeGateway = { region: 'fda', gateway: 'esg', transport: 'as2', isConfigured: vi.fn(), transmit: transmitFn };
  return {
    getGateway: () => fakeGateway,
    listGateways: () => [{ region: 'fda', gateway: 'esg', transport: 'as2' }],
    gatewayConfigurationStatus: configStatusFn,
    acknowledgementFilename: () => 'ack.txt',
    CredentialError: class extends Error {},
    GatewayError,
    TransportError: class extends Error {},
    ValidationError: class extends Error {},
  };
});

import gatewayRouter from '../server/routes/mdx-submission-gateway';

const REAUTH = { reason: 'governed transmit reason', meaning: 'release', reauth: { password: 'pw-123456' } };

function makeApp(opts: { withAuth?: boolean; role?: string } = { withAuth: true }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 777, organizationId: 99, role: opts.role ?? 'admin' };
    (req as any).userRole = opts.role ?? 'admin';
    next();
  });
  app.use('/api/mdx', gatewayRouter);
  return app;
}

beforeEach(() => {
  queryFn.mockReset();
  connectFn.mockReset();
  transmitFn.mockReset();
  configStatusFn.mockReset();
  signerRole.mockReset().mockResolvedValue('admin');
  queryFn.mockImplementation((sql: string) =>
    Promise.resolve(typeof sql === 'string' && sql.includes('password_hash') ? { rows: [{ password_hash: 'hashed' }], rowCount: 1 } : { rows: [], rowCount: 0 }),
  );
  connectFn.mockImplementation(() => Promise.resolve({ query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }), release: vi.fn() }));
});

/**
 * QA 2026-10-08 (j6): raj.patel, a manager, signed a Gateway transmit with the
 * meaning "Release — I authorize submission to the agency", passed
 * re-authentication, and was refused only because package 999001 did not exist.
 * A transmit is an electronic signature, so the platform's one policy applies
 * (P-18: managers do not sign) — as POST /api/c2c/actions/sign and the governed
 * ceremony apply it — and before the password, so the route is not a password
 * oracle for a role that may not sign.
 */
describe('signing authority — the governed signs on this router', () => {
  const SIGNS: Array<[string, string, Record<string, unknown>]> = [
    ['transmit', '/api/mdx/gateways/fda/esg/transmit', { ...REAUTH, environment: 'production', packageId: 999001 }],
    [
      'technical rejection',
      '/api/mdx/gateways/transmittals/1/technical-rejection',
      { ...REAUTH, meaning: 'responsibility', evidenceDocumentId: '11111111-2222-3333-4444-555555555555' },
    ],
  ];

  const passwordLookups = () =>
    queryFn.mock.calls.filter(([sql]) => typeof sql === 'string' && sql.includes('password_hash')).length;

  it.each(
    SIGNS.flatMap(([act, url, body]) => (['manager', 'member'] as const).map((role) => [act, role, url, body] as const)),
  )('%s by a %s is refused 403 ESIGNATURE_NO_AUTHORITY before the password is checked', async (_act, role, url, body) => {
    signerRole.mockResolvedValue(role);
    const res = await request(makeApp({ withAuth: true, role })).post(url).send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.details?.code).toBe('ESIGNATURE_NO_AUTHORITY');
    expect(res.body.error).toMatch(/Your role does not permit applying an electronic signature .*Nothing was signed\./);
    expect(passwordLookups(), 'the password must not be compared for a role that may not sign').toBe(0);
    expect(transmitFn, 'nothing may reach the gateway').not.toHaveBeenCalled();
    expect(connectFn, 'nothing may be written').not.toHaveBeenCalled();
  });

  it('reads the role from the membership row, not the session: a session saying admin over a manager row is refused', async () => {
    signerRole.mockResolvedValue('manager');
    const res = await request(makeApp({ withAuth: true, role: 'admin' }))
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ ...REAUTH, environment: 'production', packageId: 999001 });
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(signerRole).toHaveBeenCalledWith(777, 99);
  });

  it('a role lookup that cannot run refuses 503 and names no cause', async () => {
    signerRole.mockRejectedValue(new Error('organization_users unreadable: secret-detail'));
    const res = await request(makeApp({ withAuth: true, role: 'admin' }))
      .post('/api/mdx/gateways/fda/esg/transmit')
      .send({ ...REAUTH, environment: 'production', packageId: 999001 });
    expect(res.status).toBe(503);
    expect(res.body.details?.code).toBe('SIGNING_AUTHORITY_UNVERIFIED');
    expect(JSON.stringify(res.body)).not.toContain('secret-detail');
    expect(passwordLookups()).toBe(0);
    expect(transmitFn).not.toHaveBeenCalled();
  });

  it('a rollback is not a signature: it keeps the editor gate and re-authentication only', async () => {
    signerRole.mockResolvedValue('manager');
    const res = await request(makeApp({ withAuth: true, role: 'manager' }))
      .post('/api/mdx/gateways/transmittals/1/rollback')
      .send({ reason: 'governed rollback reason', reauth: { password: 'pw-123456' } });
    // The transmittal does not exist in this tenant: the request got past both gates.
    expect(res.status, JSON.stringify(res.body)).toBe(404);
  });

  it('GET /gateways tells the screen whether this person may sign a transmit, from the same check', async () => {
    configStatusFn.mockResolvedValue([{ region: 'fda', gateway: 'esg', configured: false }]);
    signerRole.mockResolvedValueOnce('manager');
    const manager = await request(makeApp({ withAuth: true, role: 'manager' })).get('/api/mdx/gateways');
    expect(manager.status).toBe(200);
    expect(manager.body.meta?.signing).toEqual({ canSign: false });
    signerRole.mockResolvedValueOnce('approver');
    const approver = await request(makeApp({ withAuth: true, role: 'approver' })).get('/api/mdx/gateways');
    expect(approver.body.meta?.signing).toEqual({ canSign: true });
    // Unknown is not "you cannot": the screen offers the form and the server decides.
    signerRole.mockRejectedValueOnce(new Error('down'));
    const unknown = await request(makeApp({ withAuth: true, role: 'approver' })).get('/api/mdx/gateways');
    expect(unknown.status).toBe(200);
    expect(unknown.body.meta?.signing).toEqual({ canSign: null });
  });
});


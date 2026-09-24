/**
 * The `/ana` socket namespace is a THIRD transport beside HTTP and the
 * collaboration socket, and no Express middleware runs for it. Its handshake
 * must therefore be the same gate the main namespace (server/socketServer.ts)
 * and the hocuspocus socket (server/services/hocuspocus-server.ts) apply:
 *
 *   1. an ACCESS token — never the 5-minute `mfa_challenge` token a correct
 *      password yields before the second factor, a partial or a refresh token
 *      (all signed with the same secret);
 *   2. carried in `handshake.auth`, not the query string (query strings land in
 *      proxy and access logs);
 *   3. a LIVE membership of the token's organisation (a socket outlives the
 *      request that opened it);
 *   4. an ACTIVE tenant (a suspended organisation's users connect to nothing).
 *
 * Security audit 2026-09-24, IAM-01 (Critical): before this test the namespace
 * checked only `verifyLiveToken` plus the presence of two claims, so a password
 * alone reached the AnA tool loop with the account's tenant scope. The
 * reproduction is docs/evidence/D6/2026-09-24-security-audit/repro/.
 *
 * `verifyLiveToken` is stood in for by the real `verifyJwtWithRotation`: the
 * real function adds a revocation lookup and an account-standing lookup, both
 * database-backed, and neither reads the token class.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

const membership = vi.hoisted(() => ({ result: 'member' as 'member' | 'revoked' | 'indeterminate' }));
const tenant = vi.hoisted(() => ({ active: true }));

vi.mock('../../token-revocation', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  const { verifyJwtWithRotation } = await import('../../../utils/jwtVerify');
  return { ...mod, verifyLiveToken: async (token: string) => verifyJwtWithRotation(token) };
});
vi.mock('../../../middleware/orgMembership', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return { ...mod, checkOrgMembership: vi.fn(async () => membership.result) };
});
vi.mock('../../tenant/tenant-lifecycle', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return { ...mod, shouldProcessTenantInBackground: vi.fn(async () => tenant.active) };
});

import { registerAnaRealtime } from '../ana-realtime';

const secret = process.env.JWT_SECRET as string;
const claims = { userId: '42', email: 'member@tenant-a.example', organizationId: '7', organizationUuid: null, role: 'user' };
const sign = (type: string) => jwt.sign({ ...claims, type }, secret, { expiresIn: '5m' });

type Mw = (socket: any, next: (err?: Error) => void) => void;

function captureMiddleware(): Mw {
  const uses: Mw[] = [];
  const io = { of: () => ({ use: (fn: Mw) => uses.push(fn), on: () => undefined }) };
  registerAnaRealtime(io as any, (async () => undefined) as any);
  expect(uses).toHaveLength(1);
  return uses[0];
}

async function handshake(handshakeShape: Record<string, unknown>) {
  const socket: any = { handshake: handshakeShape };
  const err = await new Promise<Error | undefined>((resolve) => captureMiddleware()(socket, (e?: Error) => resolve(e)));
  return { err, socket };
}

beforeEach(() => {
  membership.result = 'member';
  tenant.active = true;
});

describe('/ana namespace handshake', () => {
  it('admits an access token of an active member and scopes the socket to the token tenant', async () => {
    const { err, socket } = await handshake({ auth: { token: sign('access') }, query: {} });
    expect(err).toBeUndefined();
    expect(socket.orgId).toBe('7');
    expect(socket.authUserId).toBe('42');
  });

  it.each(['mfa_challenge', 'mfa_partial', 'refresh'])('refuses a %s token (not an access token)', async (type) => {
    const { err, socket } = await handshake({ auth: { token: sign(type) }, query: {} });
    expect(err).toBeInstanceOf(Error);
    expect(socket.orgId).toBeUndefined();
  });

  it('refuses a token that declares no class at all', async () => {
    const untyped = jwt.sign({ ...claims }, secret, { expiresIn: '5m' });
    const { err } = await handshake({ auth: { token: untyped }, query: {} });
    expect(err).toBeInstanceOf(Error);
  });

  it('refuses a token offered only in the query string', async () => {
    const { err } = await handshake({ auth: {}, query: { token: sign('access') } });
    expect(err).toBeInstanceOf(Error);
  });

  it.each(['revoked', 'indeterminate'] as const)('refuses when the membership check answers %s', async (result) => {
    membership.result = result;
    const { err } = await handshake({ auth: { token: sign('access') }, query: {} });
    expect(err).toBeInstanceOf(Error);
  });

  it('refuses when the tenant is not active', async () => {
    tenant.active = false;
    const { err } = await handshake({ auth: { token: sign('access') }, query: {} });
    expect(err).toBeInstanceOf(Error);
  });
});

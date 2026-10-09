/**
 * The main socket.io namespace admits a member and keeps admitting only a
 * member (security audit 2026-09-24 IAM-12, plan P1-9).
 *
 * Handshake: the token comes from `handshake.auth` only, the class check runs,
 * the caller must be a current member of the token's organisation and the
 * organisation must be active. After connect: a timer re-verifies the token
 * (revocation, standing, the password-change rule) and the membership, and a
 * socket that no longer qualifies is told why and disconnected. Until
 * 2026-09-25 the namespace accepted a query-string token, never asked the
 * membership table, and never looked again after connect, so a removed member
 * kept the org room's events for the token's lifetime.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

const membership = vi.hoisted(() => ({ result: 'member' as 'member' | 'revoked' | 'indeterminate' }));
const tenant = vi.hoisted(() => ({ active: true }));
const live = vi.hoisted(() => ({ fail: null as Error | null }));
const fake = vi.hoisted(() => ({
  uses: [] as Array<(socket: any, next: (err?: Error) => void) => void>,
  connection: null as null | ((socket: any) => void),
}));

vi.mock('socket.io', () => {
  class FakeNamespace {
    use(fn: (socket: any, next: (err?: Error) => void) => void) {
      fake.uses.push(fn);
    }
    on(event: string, fn: (socket: any) => void) {
      if (event === 'connection') fake.connection = fn;
    }
    to() {
      return { emit: () => undefined };
    }
    emit() {
      return true;
    }
  }
  class FakeServer extends FakeNamespace {
    of() {
      return new FakeNamespace();
    }
    close() {
      return undefined;
    }
  }
  return { Server: FakeServer };
});
vi.mock('../../services/token-revocation', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  const { verifyJwtWithRotation } = await import('../../utils/jwtVerify');
  return {
    ...mod,
    verifyLiveToken: vi.fn(async (token: string) => {
      if (live.fail) throw live.fail;
      return verifyJwtWithRotation(token);
    }),
  };
});
vi.mock('../../middleware/orgMembership', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return { ...mod, checkOrgMembership: vi.fn(async () => membership.result) };
});
vi.mock('../../services/tenant/tenant-lifecycle', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return { ...mod, shouldProcessTenantInBackground: vi.fn(async () => tenant.active) };
});
vi.mock('../../services/ana/ana-realtime', () => ({ registerAnaRealtime: vi.fn() }));
vi.mock('../../socket/socketAuthz', () => ({
  isDocumentInOrg: vi.fn(async () => true),
  isProjectInOrg: vi.fn(async () => true),
}));

import { initializeSocketServer } from '../../socketServer';
import { checkOrgMembership } from '../../middleware/orgMembership';

const secret = process.env.JWT_SECRET as string;
const claims = { userId: '42', email: 'member@tenant-a.example', organizationId: '7', role: 'user' };
const sign = (type = 'access') => jwt.sign({ ...claims, type }, secret, { expiresIn: '5m' });

function fakeSocket(handshake: Record<string, unknown>) {
  // Every listener per event, in registration order: the server registers more
  // than one 'disconnect' handler (the session re-check's own cleanup and the
  // collaboration cleanup), and a real socket fires them all.
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  const socket: any = {
    id: `s-${Math.random().toString(36).slice(2, 8)}`,
    handshake,
    data: {},
    join: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      (handlers[event] ??= []).push(fn);
    }),
  };
  const fire = (event: string) => (handlers[event] ?? []).forEach(fn => fn());
  return { socket, handlers, fire };
}

async function handshake(shape: Record<string, unknown>) {
  const { socket, fire } = fakeSocket(shape);
  const err = await new Promise<Error | undefined>((resolve) => fake.uses[0](socket, (e?: Error) => resolve(e)));
  return { err, socket, fire };
}

async function connectMember() {
  const { err, socket, fire } = await handshake({ auth: { token: sign() }, query: {} });
  expect(err).toBeUndefined();
  fake.connection!(socket);
  return { socket, fire };
}

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

beforeEach(() => {
  membership.result = 'member';
  tenant.active = true;
  live.fail = null;
  fake.uses.length = 0;
  fake.connection = null;
  vi.mocked(checkOrgMembership).mockClear();
  initializeSocketServer({} as any);
  expect(fake.uses).toHaveLength(1);
  expect(fake.connection).toBeTypeOf('function');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('main namespace handshake', () => {
  it('admits an access token of a current member of an active organisation', async () => {
    const { err, socket } = await handshake({ auth: { token: sign() }, query: {} });
    expect(err).toBeUndefined();
    expect(socket.orgId).toBe('7');
    expect(socket.authUserId).toBe('42');
    expect(checkOrgMembership).toHaveBeenCalledWith(42, 7);
  });

  it('refuses a token carried only in the query string', async () => {
    const { err } = await handshake({ auth: {}, query: { token: sign() } });
    expect(err?.message).toBe('Missing bearer token');
  });

  it('refuses a revoked membership', async () => {
    membership.result = 'revoked';
    const { err } = await handshake({ auth: { token: sign() }, query: {} });
    expect(err?.message).toBe('Organization membership not confirmed');
  });

  it('refuses when the membership cannot be determined (fail closed)', async () => {
    membership.result = 'indeterminate';
    const { err } = await handshake({ auth: { token: sign() }, query: {} });
    expect(err?.message).toBe('Organization membership not confirmed');
  });

  it('still refuses an inactive organisation', async () => {
    tenant.active = false;
    const { err } = await handshake({ auth: { token: sign() }, query: {} });
    expect(err?.message).toBe('Organization is not active');
  });

  it('still refuses a pre-MFA token', async () => {
    const { err } = await handshake({ auth: { token: sign('mfa_challenge') }, query: {} });
    expect(err?.message).toBe('Invalid token claims');
  });
});

describe('after connect, the session is re-checked on a timer', () => {
  it('a member removed from the organisation is told and disconnected within 60 s', async () => {
    vi.useFakeTimers();
    const { socket } = await connectMember();
    membership.result = 'revoked';
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(socket.emit).toHaveBeenCalledWith('session:ended', { reason: 'membership_revoked' });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('a session that has ended (revoked, account out of use, password changed) is disconnected', async () => {
    vi.useFakeTimers();
    const { socket } = await connectMember();
    live.fail = new Error('This session has ended. Sign in again.');
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(socket.emit).toHaveBeenCalledWith('session:ended', { reason: 'session_ended' });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('an organisation that stops being active is disconnected', async () => {
    vi.useFakeTimers();
    const { socket } = await connectMember();
    tenant.active = false;
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(socket.emit).toHaveBeenCalledWith('session:ended', { reason: 'tenant_inactive' });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('a member in good standing is left alone', async () => {
    vi.useFakeTimers();
    const { socket } = await connectMember();
    await vi.advanceTimersByTimeAsync(180_000);
    await flush();
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(vi.mocked(checkOrgMembership).mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('the timer stops when the socket disconnects', async () => {
    vi.useFakeTimers();
    const { fire } = await connectMember();
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    const before = vi.mocked(checkOrgMembership).mock.calls.length;
    fire('disconnect');
    await vi.advanceTimersByTimeAsync(180_000);
    await flush();
    expect(vi.mocked(checkOrgMembership).mock.calls.length).toBe(before);
  });
});

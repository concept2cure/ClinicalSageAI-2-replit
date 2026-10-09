/**
 * The `/ana` socket keeps admitting only a live session of a current member of
 * an active organisation, for as long as it stays open (security audit
 * 2026-09-24 IAM-19, plan P1-33).
 *
 * The handshake has checked token class, liveness, membership and tenant state
 * since IAM-01 (ana-realtime-auth.test.ts), but nothing looked again after
 * connect. The main namespace re-checks on a timer (IAM-12 / P1-9,
 * socket-main-namespace-session.test.ts); this one did not, so a member removed
 * from the organisation, a signed-out or password-changed session, or a
 * suspended tenant kept a live channel into the AnA tool loop — every handler
 * on which can write — for the token's remaining lifetime. The same re-check
 * now runs here, and an ending session also ends any turn in flight.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

const membership = vi.hoisted(() => ({ result: 'member' as 'member' | 'revoked' | 'indeterminate' }));
const tenant = vi.hoisted(() => ({ active: true }));
const live = vi.hoisted(() => ({ fail: null as Error | null }));

vi.mock('../../token-revocation', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  const { verifyJwtWithRotation } = await import('../../../utils/jwtVerify');
  return {
    ...mod,
    verifyLiveToken: vi.fn(async (token: string) => {
      if (live.fail) throw live.fail;
      return verifyJwtWithRotation(token);
    }),
  };
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
import { checkOrgMembership } from '../../../middleware/orgMembership';
import { verifyLiveToken } from '../../token-revocation';

const secret = process.env.JWT_SECRET as string;
const claims = { userId: '42', email: 'member@tenant-a.example', organizationId: '7', organizationUuid: null, role: 'user' };
const token = () => jwt.sign({ ...claims, type: 'access' }, secret, { expiresIn: '5m' });

type Mw = (socket: any, next: (err?: Error) => void) => void;

/** The namespace's middleware and connection handler, and a turn runner that never finishes on its own. */
function capture() {
  const uses: Mw[] = [];
  let connection: ((socket: any) => void) | null = null;
  const io = {
    of: () => ({
      use: (fn: Mw) => uses.push(fn),
      on: (event: string, fn: (socket: any) => void) => {
        if (event === 'connection') connection = fn;
      },
    }),
  };
  const turnSignals: AbortSignal[] = [];
  const runTurn = vi.fn(async (_input: unknown, signal: AbortSignal) => {
    turnSignals.push(signal);
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
  });
  registerAnaRealtime(io as any, runTurn as any);
  return { uses, connection: () => connection!, runTurn, turnSignals };
}

function fakeSocket() {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  const socket: any = {
    id: 's-ana',
    handshake: { auth: { token: token() }, query: {} },
    emit: vi.fn(),
    disconnect: vi.fn(() => (handlers.disconnect ?? []).forEach((fn) => fn())),
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      (handlers[event] ??= []).push(fn);
    }),
  };
  return { socket, fire: (event: string, ...args: unknown[]) => (handlers[event] ?? []).forEach((fn) => fn(...args)) };
}

async function connectMember() {
  const ns = capture();
  const { socket, fire } = fakeSocket();
  const err = await new Promise<Error | undefined>((resolve) => ns.uses[0](socket, (e?: Error) => resolve(e)));
  expect(err).toBeUndefined();
  ns.connection()(socket);
  return { socket, fire, ns };
}

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

beforeEach(() => {
  membership.result = 'member';
  tenant.active = true;
  live.fail = null;
  vi.mocked(checkOrgMembership).mockClear();
  vi.mocked(verifyLiveToken).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('/ana: after connect, the session is re-checked on a timer', () => {
  it.each([
    ['a member removed from the organisation', () => (membership.result = 'revoked'), 'membership_revoked'],
    ['a membership that can no longer be read (fail closed)', () => (membership.result = 'indeterminate'), 'membership_revoked'],
    ['a session that has ended (signed out, password changed, account out of use)', () => (live.fail = new Error('This session has ended.')), 'session_ended'],
    ['an organisation that stops being active', () => (tenant.active = false), 'tenant_inactive'],
  ])('%s is told why and disconnected within 60 s', async (_label, change, reason) => {
    vi.useFakeTimers();
    const { socket } = await connectMember();
    change();
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(socket.emit).toHaveBeenCalledWith('session:ended', { reason });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('re-verifies the handshake token itself, without counting as activity', async () => {
    vi.useFakeTimers();
    const { socket } = await connectMember();
    vi.mocked(verifyLiveToken).mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(verifyLiveToken).toHaveBeenCalledWith(socket.handshake.auth.token, undefined, { activity: false });
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

  it('an ending session also ends the AnA turn in flight', async () => {
    vi.useFakeTimers();
    const { fire, ns } = await connectMember();
    fire('ana:message', { turnId: 't1', message: 'Draft section 2.7.3' });
    await flush();
    expect(ns.runTurn).toHaveBeenCalledTimes(1);
    membership.result = 'revoked';
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(ns.turnSignals.length).toBeGreaterThan(0);
    expect(ns.turnSignals.every((s) => s.aborted)).toBe(true);
  });
});

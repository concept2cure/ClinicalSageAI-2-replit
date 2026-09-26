// @vitest-environment jsdom
/** The server's session-end codes, the remembered reason, and the announcement (P1-1). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SESSION_ENDED_EVENT,
  announceSessionEnded,
  rememberSignOutReason,
  sessionEndReasonOf,
  sessionEndReasonOfResponse,
  takeSignOutReason,
} from '../sessionEnd';

const json401 = (body: unknown) => new Response(JSON.stringify(body), { status: 401, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('sessionEndReasonOf / sessionEndReasonOfResponse', () => {
  it('names the two codes and nothing else', () => {
    expect(sessionEndReasonOf('SESSION_IDLE')).toBe('idle');
    expect(sessionEndReasonOf('SESSION_LIFETIME')).toBe('lifetime');
    expect(sessionEndReasonOf('SESSION_ENDED')).toBeNull();
    expect(sessionEndReasonOf(undefined)).toBeNull();
  });

  it('reads both envelope shapes from a 401 without consuming the body, and nothing from other answers', async () => {
    const nested = json401({ error: { code: 'SESSION_IDLE', message: 'x' } });
    expect(await sessionEndReasonOfResponse(nested)).toBe('idle');
    expect((await nested.json()).error.code).toBe('SESSION_IDLE'); // the caller's body is still there
    expect(await sessionEndReasonOfResponse(json401({ code: 'SESSION_LIFETIME', error: 'text' }))).toBe('lifetime');
    expect(await sessionEndReasonOfResponse(json401({ error: { code: 'AUTH_002' } }))).toBeNull();
    expect(await sessionEndReasonOfResponse(new Response('nope', { status: 401 }))).toBeNull();
    expect(await sessionEndReasonOfResponse(new Response(JSON.stringify({ error: { code: 'SESSION_IDLE' } }), { status: 403 }))).toBeNull();
  });
});

describe('the remembered reason', () => {
  it('is read once', () => {
    rememberSignOutReason('idle');
    expect(takeSignOutReason()).toBe('idle');
    expect(takeSignOutReason()).toBeNull();
  });

  it('ignores a value it did not write', () => {
    sessionStorage.setItem('trialsage_signout_reason', 'other');
    expect(takeSignOutReason()).toBeNull();
  });
});

describe('announceSessionEnded', () => {
  it('remembers the reason and dispatches the window event with it', () => {
    const heard: unknown[] = [];
    window.addEventListener(SESSION_ENDED_EVENT, e => heard.push((e as CustomEvent).detail));
    announceSessionEnded('lifetime');
    expect(heard).toEqual([{ reason: 'lifetime' }]);
    expect(takeSignOutReason()).toBe('lifetime');
  });
});

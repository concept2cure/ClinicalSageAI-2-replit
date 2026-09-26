// @vitest-environment jsdom
/**
 * `apiRequest` announces a session the server ended for inactivity or age
 * (P1-1). It cannot import the auth service (a cycle), so it keeps the reason
 * and raises the window event the auth provider listens for. Any other 401
 * passes through as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_ENDED_EVENT } from '@/utils/sessionEnd';
import { apiRequest } from '../queryClient';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('apiRequest on a 401', () => {
  it('announces SESSION_IDLE / SESSION_LIFETIME and still returns the response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { error: { code: 'SESSION_LIFETIME', message: 'x' } })));
    const heard: unknown[] = [];
    window.addEventListener(SESSION_ENDED_EVENT, e => heard.push((e as CustomEvent).detail));

    const res = await apiRequest('GET', '/api/c2c/projects');

    expect(res.status).toBe(401);
    expect(heard).toEqual([{ reason: 'lifetime' }]);
    expect(sessionStorage.getItem('trialsage_signout_reason')).toBe('lifetime');
    expect((await res.json()).error.code).toBe('SESSION_LIFETIME'); // the body is still the caller's
  });

  it('announces nothing for an ordinary 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { error: { code: 'AUTH_002', message: 'x' } })));
    const heard: unknown[] = [];
    window.addEventListener(SESSION_ENDED_EVENT, e => heard.push((e as CustomEvent).detail));
    const res = await apiRequest('GET', '/api/c2c/projects');
    expect(res.status).toBe(401);
    expect(heard).toEqual([]);
    expect(sessionStorage.getItem('trialsage_signout_reason')).toBeNull();
  });
});

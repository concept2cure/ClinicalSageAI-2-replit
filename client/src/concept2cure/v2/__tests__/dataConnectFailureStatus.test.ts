// @vitest-environment jsdom
/**
 * liveGetOrNull / liveMutateOrNull — a refused request must not read as an
 * unreachable one.
 *
 * `apiRequest` THROWS `ApiRequestError` for every non-OK status except 401, so
 * the `if (!res.ok)` branch inside both helpers is reached ONLY by a 401 and
 * every other failing status arrives in the catch. Both catches used to return
 * `status: 0`, which collapsed three different answers into one:
 *
 *   403  "you are not allowed to do this"
 *   404  "that is gone"
 *   400  "your input was rejected"
 *   0    "no response arrived at all"
 *
 * A surface can only apologise honestly if it can tell those apart — and
 * ApiRequestError's own header says it exists to preserve exactly that
 * distinction "without parsing error strings". The Admin → Setup panel is the
 * first caller that depends on it: a governed PATCH refused by requireOrgAdmin
 * has to say the organization refused the write, not that the network is down.
 *
 * Each test below fails if the status is thrown away again, and the 401 and
 * network cases pin the two paths that must NOT change.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { liveGetOrNull, liveMutateOrNull } from '../dataConnect';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Answer every request with one canned response. */
const reply = (res: Response | (() => Promise<never>)) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => (typeof res === 'function' ? res() : res.clone())),
  );

beforeEach(() => {
  sessionStorage.setItem('trialsage_access_token', 'test-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
});

describe('liveGetOrNull failure status', () => {
  it('reports 403 as 403, with the server’s own message', async () => {
    reply(json(403, { success: false, error: 'Not authorized to access this organization' }));
    const r = await liveGetOrNull('/api/organizations/7/settings');
    expect(r.status).toBe(403);
    expect(r.error).toBe('Not authorized to access this organization');
    expect(r.data).toBeNull();
  });

  it('reports 404 as 404', async () => {
    reply(json(404, { success: false, error: 'Organization not found' }));
    const r = await liveGetOrNull('/api/organizations/7');
    expect(r.status).toBe(404);
  });

  it('keeps 0 for a request that never got a response', async () => {
    reply(() => Promise.reject(new TypeError('Failed to fetch')));
    const r = await liveGetOrNull('/api/organizations/7');
    expect(r.status).toBe(0);
    expect(r.error).toContain('Failed to fetch');
  });

  it('still returns 401 through the response branch apiRequest does not throw on', async () => {
    reply(json(401, { error: 'Unauthorized' }));
    const r = await liveGetOrNull('/api/organizations/7');
    expect(r.status).toBe(401);
  });
});

describe('liveMutateOrNull failure status', () => {
  it('reports a refused governed write as 403, not as a network failure', async () => {
    reply(json(403, { success: false, error: 'Organization admin role required for this action' }));
    const r = await liveMutateOrNull('PATCH', '/api/organizations/7/settings', {
      settings: { translation: {} },
      reason: 'test',
    });
    // The two claims a caller acts on: it was refused (not unreachable), and
    // the refusal has the server's wording rather than an invented one.
    expect(r.status).toBe(403);
    expect(r.error).toBe('Organization admin role required for this action');
  });

  it('reports a rejected body as 400 with the validation message', async () => {
    reply(json(400, { success: false, error: 'A reason (min 3 chars) is required for this action' }));
    const r = await liveMutateOrNull('PATCH', '/api/organizations/7/settings', {});
    expect(r.status).toBe(400);
    expect(r.error).toBe('A reason (min 3 chars) is required for this action');
  });

  it('keeps 0 for a mutation that never reached the server', async () => {
    reply(() => Promise.reject(new TypeError('Failed to fetch')));
    const r = await liveMutateOrNull('PATCH', '/api/organizations/7/profile', { name: 'x' });
    expect(r.status).toBe(0);
  });

  it('reports a 500 as 500 so a retry-able server fault is distinguishable', async () => {
    reply(json(500, { success: false, error: 'Failed to update organization settings' }));
    const r = await liveMutateOrNull('PATCH', '/api/organizations/7/settings', {});
    expect(r.status).toBe(500);
  });
});

describe('failure status is read structurally, not by class identity', () => {
  // These helpers promise never to throw, so they must not depend on
  // `instanceof ApiRequestError`: suites that mock '@/lib/queryClient' with a
  // factory exporting only `apiRequest` bind the class to undefined, and
  // `x instanceof undefined` throws inside the catch itself — the surface then
  // hangs on "loading" rather than rendering its honest error state.
  it('honours a status on an error that is not an ApiRequestError instance', async () => {
    reply(() => Promise.reject(Object.assign(new Error('Forbidden'), { status: 403 })));
    const r = await liveGetOrNull('/api/organizations/7');
    expect(r.status).toBe(403);
    expect(r.error).toBe('Forbidden');
  });

  it('ignores a non-numeric status rather than reporting nonsense', async () => {
    reply(() => Promise.reject(Object.assign(new Error('odd'), { status: 'nope' })));
    const r = await liveGetOrNull('/api/organizations/7');
    expect(r.status).toBe(0);
  });

  it('does not throw when a non-Error value is thrown', async () => {
    reply(() => Promise.reject('a bare string') as Promise<never>);
    const r = await liveGetOrNull('/api/organizations/7');
    expect(r.status).toBe(0);
    expect(r.error).toBe('a bare string');
  });
});

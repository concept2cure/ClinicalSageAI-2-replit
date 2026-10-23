// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { apiCall, apiErrorText } from '@/concept2cure/v2/apiCall';

/**
 * THE BUG THIS GUARDS. `apiRequest` THROWS `ApiRequestError` for every non-OK
 * status except 401 and only returns a Response on success. Every surface that
 * wrote `const res = await apiRequest(...); if (res.ok) {…} else {…}` had a
 * dead else-branch: a 4xx unwound to the caller's catch and read as a generic
 * network error. That silently disabled the 428 that opens the e-signature
 * ceremony and the 409 lock-conflict message.
 *
 * These tests drive the REAL `apiRequest` (only global fetch is stubbed), so
 * they assert against its actual throwing behaviour rather than a simulation
 * of it — if `apiRequest` ever stops throwing, or `apiCall` stops normalizing,
 * this fails.
 */

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h === 'Content-Type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => {
  fetchSpy.mockRestore();
});

describe('apiCall — a thrown status becomes data', () => {
  it('returns the body on success', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, { data: { taskId: 'T-1' } }));
    const res = await apiCall('GET', '/x');
    expect(res).toMatchObject({ ok: true, status: 200, networkError: false });
    expect(res.body).toEqual({ data: { taskId: 'T-1' } });
  });

  it('surfaces a 428 as a readable result — the e-signature trigger', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(428, {
        code: 'ESIGN_REQUIRED',
        error: 'Completing this task requires an electronic signature.',
      }),
    );
    const res = await apiCall<{ code?: string }>('PATCH', '/x');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(428);
    expect(res.networkError).toBe(false);
    // Without this, the board can never open the signing modal.
    expect(res.body?.code).toBe('ESIGN_REQUIRED');
  });

  it('surfaces a 409 conflict with the server’s own message', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(409, { error: 'Section is locked by jo@acme.co' }));
    const res = await apiCall('POST', '/locks');
    expect(res.status).toBe(409);
    expect(apiErrorText(res, 'fallback')).toBe('Section is locked by jo@acme.co');
  });

  it('surfaces a ZodIssue array as readable text, never [object Object]', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(400, {
        error: [{ message: 'title is required' }, { message: 'priority is invalid' }],
      }),
    );
    const res = await apiCall('POST', '/x');
    expect(res.status).toBe(400);
    const text = apiErrorText(res, 'Could not create the task.');
    expect(text).toBe('title is required · priority is invalid');
    expect(text).not.toContain('[object Object]');
  });

  it('distinguishes a transport failure from a server rejection', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
    const res = await apiCall('GET', '/x');
    expect(res).toMatchObject({ ok: false, status: 0, networkError: true });
    expect(apiErrorText(res, "Couldn't load")).toContain("didn't reach the server");
  });

  it('a 401 is reported as a status, not swallowed', async () => {
    // apiRequest RETURNS (rather than throws) on 401; apiCall must still
    // classify it as not-ok so callers never treat it as success.
    fetchSpy.mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' }));
    const res = await apiCall('GET', '/x');
    expect(res).toMatchObject({ ok: false, status: 401, networkError: false });
  });
});

describe('apiErrorText — fallback behaviour', () => {
  it('falls back when the payload carries no usable message', () => {
    const text = apiErrorText(
      { ok: false, status: 500, body: { error: { nested: true } }, networkError: false },
      'Could not save.',
    );
    expect(text).toBe('Could not save.');
    expect(text).not.toContain('[object Object]');
  });
});

describe('apiCall — optional captured owner handoff', () => {
  it('does not dispatch a retired owner and never retries it', async () => {
    expect(await apiCall('PUT', '/x', { value: 1 }, () => false)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not parse a response after its owner retires', async () => {
    let finish!: (response: Response) => void;
    let current = true;
    fetchSpy.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    const pending = apiCall('GET', '/x', undefined, () => current);
    const response = jsonResponse(200, { private: 'old account' });
    const parse = vi.spyOn(response, 'json');
    current = false; finish(response);
    expect(await pending).toBeNull();
    expect(parse).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('discards a parsed body when ownership changes during JSON', async () => {
    let finish!: (body: unknown) => void;
    let current = true;
    const response = jsonResponse(200, null);
    const parse = vi.spyOn(response, 'json').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    fetchSpy.mockResolvedValue(response);
    const pending = apiCall('GET', '/x', undefined, () => current);
    await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(1));
    current = false; finish({ private: 'old account' });
    expect(await pending).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('discards an obsolete rejection without changing current rejection normalization', async () => {
    let reject!: (error: Error) => void;
    let current = true;
    fetchSpy.mockImplementationOnce(() => new Promise<Response>((_resolve, fail) => { reject = fail; }));
    const pending = apiCall('POST', '/x', {}, () => current);
    current = false; reject(new TypeError('Failed to fetch'));
    expect(await pending).toBeNull();
    current = true;
    fetchSpy.mockResolvedValueOnce(jsonResponse(409, { error: 'This version changed.' }));
    expect(await apiCall('POST', '/x', {}, () => current)).toEqual({
      ok: false, status: 409, body: { error: 'This version changed.' }, networkError: false,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps a current guarded success identical to the existing three-argument result', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { data: 'saved' }));
    const existing = await apiCall('PATCH', '/x', {});
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { data: 'saved' }));
    expect(await apiCall('PATCH', '/x', {}, () => true)).toEqual(existing);
  });
});
